import os
import re
import json
import logging
import html
import unicodedata
import sys
from pathlib import Path

# Adiciona raiz do projeto ao path para importar lib.supabase_client
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib.supabase_client import upsert
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import requests
from opencnpj import OpenCNPJ

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Carrega variáveis de ambiente se disponíveis localmente
if os.path.exists(".env.local"):
    with open(".env.local", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL:
    raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_URL")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_SERVICE_ROLE_KEY")

TARGET_COUNT = 80  # Meta diária: 80 empresas

# Cliente OpenCNPJ para enriquecimento cadastral
opencnpj_client = OpenCNPJ()

def normalize_text(text: str) -> str:
    return unicodedata.normalize('NFKD', text).encode('ascii', 'ignore').decode('utf-8').lower()

def format_phone(raw: str) -> str:
    digits = re.sub(r'\D', '', raw)
    if digits.startswith('55') and len(digits) in (12, 13):
        digits = digits[2:]
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    elif len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    elif len(digits) == 8:
        return f"(61) {digits[:4]}-{digits[4:]}"
    elif len(digits) == 9:
        return f"(61) {digits[:5]}-{digits[5:]}"
    return raw

def clean_school_name(raw_name: str) -> str:
    clean = html.unescape(raw_name).strip()
    words = clean.split()
    formatted = []
    lowercase_words = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com'}
    uppercase_words = {'ce', 'cei', 'cem', 'caas', 'df', 'jk', 'cmdp', 'cmdpii', 'sesi', 'senai', 'sesc', 'unb'}
    
    for w in words:
        lw = w.lower().strip('.,-')
        if lw in uppercase_words:
            formatted.append(lw.upper())
        elif lw in lowercase_words:
            formatted.append(lw)
        else:
            formatted.append(w.capitalize())
            
    return ' '.join(formatted)

def extract_bairro(addr: str) -> str:
    if '•' in addr:
        part = addr.split('•')[0]
        if '-' in part:
            return part.split('-')[-1].strip()
    return 'Brasília'

def search_cnpj_by_name(name: str, city: str = "Brasília") -> str | None:
    """Procura automaticamente o CNPJ correspondente ao nome da escola no DF."""
    query = f"{name} {city} CNPJ"
    data = urllib.parse.urlencode({'q': query}).encode('utf-8')
    req = urllib.request.Request(
        'https://lite.duckduckgo.com/lite/',
        data=data,
        headers={
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
            'Content-Type': 'application/x-www-form-urlencoded'
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            html_text = resp.read().decode('utf-8', errors='ignore')
            cnpjs = re.findall(r'\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}', html_text)
            if cnpjs:
                return re.sub(r'\D', '', cnpjs[0])
    except Exception:
        pass
    return None

def enrich_lead_with_opencnpj(item: dict) -> dict:
    """
    Usa o OpenCNPJ para obter os dados oficiais da Receita Federal:
    - CNPJ
    - Decisor real via QSA (Sócio/Administrador/Presidente)
    - Porte da Empresa (ME, EPP, Demais/Grande Porte)
    - Telefones e E-mails oficiais
    """
    school_name = item.get("nome_escola", "")
    city = item.get("cidade", "Brasília")
    
    cnpj = search_cnpj_by_name(school_name, city)
    if not cnpj:
        return item

    try:
        empresa = opencnpj_client.find_by_cnpj(cnpj)
        
        # 1. Porte da Empresa
        porte = getattr(empresa, 'porte_empresa', None) or "Empresa"
        
        # 2. Decisor no QSA
        if empresa.qsa and len(empresa.qsa) > 0:
            primeiro_socio = empresa.qsa[0]
            nome_socio = (getattr(primeiro_socio, 'nome_socio', None) or "").strip().title()
            cargo = (getattr(primeiro_socio, 'qualificacao_socio', None) or "").strip().title()
            
            if nome_socio:
                item["nome_decisor"] = f"{nome_socio} ({cargo} - {porte})"
            else:
                item["nome_decisor"] = f"{item['nome_decisor']} ({porte})"
        else:
            item["nome_decisor"] = f"{item['nome_decisor']} ({porte})"

        # 3. Telefone Oficial
        if empresa.telefones:
            for t in empresa.telefones:
                if not getattr(t, 'is_fax', False):
                    ddd = getattr(t, 'ddd', '')
                    num = getattr(t, 'numero', '')
                    if ddd and num:
                        item["telefone_escola"] = format_phone(f"{ddd}{num}")
                        break

        # 4. E-mail Oficial
        if getattr(empresa, 'email', None):
            item["email_escola"] = empresa.email.strip().lower()
            if not item.get("email_decisor"):
                item["email_decisor"] = empresa.email.strip().lower()

        logging.info(f"   ✓ Lead qualificado com OpenCNPJ: {school_name} -> Porte: {porte} | Decisor: {item['nome_decisor']}")
    except Exception as e:
        logging.warning(f"Falha ao enriquecer {school_name} via OpenCNPJ: {e}")

    return item

def fetch_school_detail(item: dict) -> dict:
    url = item.get("detail_url")
    if url:
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
            with urllib.request.urlopen(req, timeout=5) as r:
                h = r.read().decode('utf-8', errors='ignore')
                tels = set(re.findall(r'href=[\"\']tel:([^\"\']+)[\"\']', h))
                tel_61 = [t for t in tels if t.startswith('61')]
                selected_tel = tel_61[0] if tel_61 else (list(tels)[0] if tels else None)
                if selected_tel:
                    item["telefone_escola"] = format_phone(selected_tel)
                    
                emails = re.findall(r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+', h)
                valid_emails = [e for e in emails if not any(x in e for x in ['sentry', 'google', 'example', 'w3.org'])]
                if valid_emails:
                    item["email_escola"] = valid_emails[0].lower()
        except Exception:
            pass

    # Enriquecimento com OpenCNPJ (CNPJ, Decisor QSA, Porte)
    item = enrich_lead_with_opencnpj(item)
    return item

def scrape_schools_df(target_count: int = TARGET_COUNT) -> list[dict]:
    logging.info(f"==> Iniciando extração do Agente SDR: meta {target_count} empresas com decisores e porte...")
    base_url = "https://qualotelefone.com/df/brasilia/escolas-particulares"
    current_url = base_url
    
    candidates = []
    seen_names = set()
    
    for page in range(1, 15):
        if len(candidates) >= target_count:
            break
            
        logging.info(f"Página {page}: {current_url}")
        try:
            req = urllib.request.Request(current_url, headers={'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                raw_html = resp.read().decode('utf-8', errors='ignore')
                cards = re.findall(r'<a[^>]+href=[\"\'](https://qualotelefone\.com/df/brasilia/escolas-particulares/[^\"\']+)[\"\'][^>]*>([\s\S]*?)</a>', raw_html)
                
                for href, inner in cards:
                    name_m = re.search(r'<h3[^>]*>(.*?)</h3>', inner)
                    if not name_m:
                        continue
                    raw_name = name_m.group(1).strip()
                    if any(bad in raw_name.lower() for bad in ['transporte', 'condominio', 'condomínio', 'autoescola', 'auto escola', 'estacionamento']):
                        continue
                        
                    clean_name = clean_school_name(raw_name)
                    norm_key = normalize_text(clean_name)
                    if norm_key in seen_names or len(clean_name) < 4:
                        continue
                    seen_names.add(norm_key)
                    
                    addr_m = re.search(r'<span>(.*?)</span>', inner)
                    addr = html.unescape(addr_m.group(1)).strip() if addr_m else 'Brasília, DF'
                    bairro = extract_bairro(addr)
                    decisor, email_decisor, email_geral = None, None, None
                    
                    candidates.append({
                        "nome_escola": clean_name,
                        "cidade": "Brasília",
                        "telefone_escola": None,
                        "email_escola": email_geral,
                        "nome_decisor": decisor,
                        "email_decisor": email_decisor,
                        "status": "novo",
                        "ultima_interacao": None,
                        "detail_url": href
                    })
                    
                    if len(candidates) >= target_count:
                        break
                        
                cursor_m = re.findall(r'after=([0-9]+)', raw_html)
                if cursor_m:
                    current_url = f"{base_url}?after={cursor_m[-1]}"
                else:
                    break
        except Exception as e:
            logging.error(f"Erro ao buscar listagem: {e}")
            break

    logging.info(f"Enriquecendo dados via OpenCNPJ (Decisores no QSA, Porte e Telefones) para {len(candidates)} empresas...")
    with ThreadPoolExecutor(max_workers=5) as executor:
        enriched_leads = list(executor.map(fetch_school_detail, candidates))
        
    for lead in enriched_leads:
        lead.pop("detail_url", None)
        
    logging.info(f"Total de {len(enriched_leads)} empresas qualificadas com Decisor, Porte e Contato.")
    return enriched_leads

def save_to_supabase(leads: list[dict]):
    if not leads:
        logging.info("Nenhum lead para salvar.")
        return {"inseridos": 0, "atualizados": 0, "falhas": 0}

    # Transforma leads legados no formato da tabela escolas
    escolas_to_upsert = []
    for lead in leads:
        cidade = lead.get("cidade") or "Brasília"
        uf = "GO" if cidade in ("Luziânia", "Formosa", "Valparaíso de Goiás", "Novo Gama") else "DF"
        escolas_to_upsert.append({
            "nome": lead.get("nome_escola") or lead.get("nome"),
            "cidade": cidade,
            "uf": uf,
            "telefone": lead.get("telefone_escola") or lead.get("telefone"),
            "email_geral": lead.get("email_escola") or lead.get("email_geral"),
            "fonte": "legado_qualotelefone",
            "status_funil": "novo",
            "status_qualificacao": "bruto",
        })

    logging.info(f"Executando upsert de {len(escolas_to_upsert)} escolas via lib.supabase_client...")
    stats = upsert("escolas", escolas_to_upsert, on_conflict="chave_dedup")
    logging.info(
        f"Resultado do Upsert: {stats['inseridos']} inseridos, "
        f"{stats['atualizados']} atualizados, {stats['falhas']} falhas."
    )
    return stats

if __name__ == "__main__":
    leads = scrape_schools_df(target_count=TARGET_COUNT)
    save_to_supabase(leads)
