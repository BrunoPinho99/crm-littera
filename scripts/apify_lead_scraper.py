import os
import re
import sys
import logging
from pathlib import Path
from typing import List, Dict
import requests

# Adiciona raiz do projeto ao path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from scripts.lib.supabase_client import upsert

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Carrega variáveis locais se existirem
if os.path.exists(".env.local"):
    with open(".env.local", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

# Configurações do Supabase e Apify
SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

if not SUPABASE_URL:
    raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_URL")
if not SUPABASE_SERVICE_ROLE_KEY:
    raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_SERVICE_ROLE_KEY")
APIFY_TOKEN = os.getenv("APIFY_TOKEN", "")

# Exemplo padrão: CNAEs de Educação / Escolas
DEFAULT_CNAES = [
    "8511200",  # Educação infantil - creche
    "8512100",  # Educação infantil - pré-escola
    "8513900",  # Ensino fundamental
    "8520100",  # Ensino médio
]

def format_phone(ddd: str, phone: str) -> str:
    if not phone:
        return ""
    digits = re.sub(r'\D', '', f"{ddd or ''}{phone}")
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    elif len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return phone

def fetch_apify_cnpj_leads(cnaes=None, ufs=None, max_results=80) -> List[Dict]:
    """Consulta a API BrasilDados na Apify para buscar empresas/escolas."""
    if not APIFY_TOKEN:
        logging.error("APIFY_TOKEN não configurado! Defina APIFY_TOKEN no seu .env.local")
        return []

    cnaes = cnaes or DEFAULT_CNAES
    ufs = ufs or ["DF", "SP"]
    
    url = "https://api.apify.com/v2/actors/brasildados~cnpj-lead-scraper-search/run-sync-get-dataset-items"
    headers = {
        "Authorization": f"Bearer {APIFY_TOKEN}",
        "Content-Type": "application/json"
    }
    payload = {
        "cnaes": cnaes,
        "uf": ufs,
        "porte": [],
        "situacaoCadastral": "02",  # 02 = Ativa
        "maxResults": max_results
    }

    logging.info(f"Disparando busca no Apify ({len(cnaes)} CNAEs, UFs: {ufs}, Max: {max_results})...")
    res = requests.post(url, headers=headers, json=payload, timeout=120)
    
    if res.status_code not in (200, 201):
        logging.error(f"Erro na Apify ({res.status_code}): {res.text}")
        return []
        
    items = res.json()
    logging.info(f"Retornados {len(items)} registros brutos da Apify.")
    return items

def transform_to_crm_leads(items: List[Dict]) -> List[Dict]:
    """Transforma o payload de CNPJ para o formato da tabela leads_escolares."""
    leads = []
    
    for item in items:
        # Nome da escola (Prefere nome fantasia se houver, senão razão social)
        nome = item.get("nomeFantasia") or item.get("razaoSocial") or item.get("nome", "")
        if not nome:
            continue

        cidade = item.get("municipio") or item.get("cidade") or "Brasília"
        
        # Telefone
        ddd = str(item.get("ddd1") or item.get("ddd") or "")
        tel = str(item.get("telefone1") or item.get("telefone") or "")
        telefone_escola = format_phone(ddd, tel) if tel else None
        
        # E-mail
        email_escola = item.get("email") or item.get("correioEletronico") or None
        if email_escola:
            email_escola = email_escola.lower().strip()
            
        # Decisor (Sócios / Administradores do QSA)
        socios = item.get("qsa") or item.get("socios") or []
        nome_decisor = None
        
        if isinstance(socios, list) and len(socios) > 0:
            primeiro_socio = socios[0]
            if isinstance(primeiro_socio, dict):
                nome_decisor = primeiro_socio.get("nomeSocio") or primeiro_socio.get("nome")
                qualificacao = primeiro_socio.get("qualificacaoSocio") or primeiro_socio.get("qualificacao")
                if qualificacao and nome_decisor:
                    nome_decisor = f"{nome_decisor} ({qualificacao})"
            elif isinstance(primeiro_socio, str):
                nome_decisor = primeiro_socio
                
        leads.append({
            "nome_escola": str(nome).strip().title(),
            "cidade": str(cidade).strip().title(),
            "telefone_escola": telefone_escola,
            "email_escola": email_escola,
            "nome_decisor": str(nome_decisor).strip().title() if nome_decisor else None,
            "email_decisor": email_escola,
            "status": "novo",
            "ultima_interacao": None
        })
        
    return leads

def save_to_supabase(leads: List[Dict]):
    if not leads:
        logging.info("Nenhum lead processado para salvar.")
        return {"inseridos": 0, "atualizados": 0, "falhas": 0}

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
            "fonte": "apify_cnpj",
            "status_funil": "novo",
            "status_qualificacao": "bruto",
        })

    logging.info(f"Salvando {len(escolas_to_upsert)} escolas via lib.supabase_client...")
    stats = upsert("escolas", escolas_to_upsert, on_conflict="chave_dedup")
    logging.info(
        f"Concluído! {stats['inseridos']} inseridos, "
        f"{stats['atualizados']} atualizados, {stats['falhas']} falhas."
    )
    return stats

if __name__ == "__main__":
    raw_data = fetch_apify_cnpj_leads(max_results=80)
    if raw_data:
        crm_leads = transform_to_crm_leads(raw_data)
        save_to_supabase(crm_leads)
