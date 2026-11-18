import os
import re
import json
import logging
from datetime import datetime, timezone
import requests
from duckduckgo_search import DDGS

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    logging.warning("SUPABASE_URL ou SUPABASE_KEY não configuradas no ambiente!")

# Expressões regulares para extrair email e telefone dos snippets
EMAIL_REGEX = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
PHONE_REGEX = r'(?:\(?\b\d{2}\)?\s*)?(?:9\s*)?\d{4,5}[-\s]?\d{4}\b'

# Consultas focadas em escolas de Brasília / DF
SEARCH_QUERIES = [
    'escola particular brasilia df contato email telefone',
    'colegio particular asa sul asa norte brasilia contato',
    'escola infantil brasilia df secretaria telefone email',
    'colegio aguas claras taguatinga df contato secretaria',
    'escolas particulares lago sul lago norte df contato',
    'escolas privadas guara sobradinho brasilia telefone email'
]

def clean_school_name(title: str) -> str:
    """Limpa o título retornado pelo mecanismo de busca para isolar o nome da escola."""
    cleaned = re.split(r'[-–|:—•]', title)[0]
    cleaned = re.sub(r'(?i)(contato|home|início|secretaria|fale conosco|matrículas|portal).*', '', cleaned)
    return cleaned.strip()

def search_schools(target_count: int = 80) -> list[dict]:
    leads = []
    seen_names = set()

    logging.info(f"Iniciando busca DuckDuckGo com meta de {target_count} leads...")
    
    with DDGS() as ddgs:
        for query in SEARCH_QUERIES:
            if len(leads) >= target_count:
                break
                
            logging.info(f"Executando busca: '{query}'...")
            try:
                # busca texto
                results = ddgs.text(query, max_results=35)
                for item in results:
                    title = item.get("title", "")
                    snippet = item.get("body", "")
                    text_blob = f"{title} {snippet}"

                    school_name = clean_school_name(title)
                    if len(school_name) < 4:
                        continue

                    key = school_name.lower()
                    if key in seen_names:
                        continue

                    # Extrai email se houver no snippet
                    emails_found = re.findall(EMAIL_REGEX, text_blob)
                    email = emails_found[0] if emails_found else None

                    # Extrai telefone se houver
                    phones_found = re.findall(PHONE_REGEX, text_blob)
                    phone = phones_found[0].strip() if phones_found else None

                    lead = {
                        "nome_escola": school_name,
                        "cidade": "Brasília",
                        "telefone_escola": phone,
                        "email_escola": email,
                        "nome_decisor": None,
                        "email_decisor": None,
                        "status": "novo",
                        "ultima_interacao": None
                    }

                    leads.append(lead)
                    seen_names.add(key)

                    if len(leads) >= target_count:
                        break
            except Exception as e:
                logging.error(f"Erro ao processar consulta '{query}': {e}")

    logging.info(f"Total de leads encontrados: {len(leads)}")
    return leads

def save_to_supabase(leads: list[dict]):
    if not leads:
        logging.info("Nenhum lead para salvar.")
        return

    if not SUPABASE_URL or not SUPABASE_KEY:
        logging.error("Supabase URL/Key ausentes. Salvando em leads_backup.json localmente.")
        with open("leads_backup.json", "w", encoding="utf-8") as f:
            json.dump(leads, f, ensure_ascii=False, indent=2)
        return

    endpoint = f"{SUPABASE_URL}/rest/v1/leads_escolares"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates"  # ignora duplicadas se índice UNIQUE existir
    }

    logging.info(f"Enviando {len(leads)} leads para o Supabase via REST API...")
    
    # Envio em lotes de 20 para evitar limites de payload
    batch_size = 20
    for i in range(0, len(leads), batch_size):
        batch = leads[i:i + batch_size]
        try:
            resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
            if resp.status_code in (200, 201):
                logging.info(f"Lote {i // batch_size + 1} salvo com sucesso! ({len(batch)} registros)")
            else:
                logging.warning(f"Resposta com status {resp.status_code}: {resp.text}")
        except Exception as ex:
            logging.error(f"Falha ao enviar lote {i // batch_size + 1}: {ex}")

if __name__ == "__main__":
    leads = search_schools(target_count=80)
    save_to_supabase(leads)
    logging.info("Processo de extração diária finalizado.")
