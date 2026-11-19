import os
import re
import requests
import logging
from typing import List, Dict

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
SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))
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
                
        if not nome_decisor:
            nome_decisor = "Diretoria / Responsável"

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
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        logging.error("Supabase URL ou Key não definidos.")
        return

    endpoint = f"{SUPABASE_URL}/rest/v1/leads_escolares"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates"
    }

    logging.info(f"Salvando {len(leads)} leads no Supabase...")
    batch_size = 20
    saved = 0
    for i in range(0, len(leads), batch_size):
        batch = leads[i:i + batch_size]
        try:
            res = requests.post(endpoint, headers=headers, json=batch, timeout=30)
            if res.status_code in (200, 201):
                saved += len(batch)
            else:
                logging.warning(f"Erro no lote {i}: {res.status_code} - {res.text}")
        except Exception as ex:
            logging.error(f"Exceção ao enviar lote: {ex}")

    logging.info(f"Concluído! {saved} leads salvos no CRM.")

if __name__ == "__main__":
    raw_data = fetch_apify_cnpj_leads(max_results=80)
    if raw_data:
        crm_leads = transform_to_crm_leads(raw_data)
        save_to_supabase(crm_leads)
