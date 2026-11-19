"""
Script de importação e enriquecimento de leads via OpenCNPJ para o CRM Littera.
Permite importar via lista no código, arquivo txt/csv ou argumentos de linha de comando.
"""

import os
import re
import sys
import time
import logging
from typing import List, Dict, Optional
import requests
from opencnpj import OpenCNPJ

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Carrega variáveis locais de ambiente se existirem
if os.path.exists(".env.local"):
    with open(".env.local", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

SUPABASE_URL = os.getenv("SUPABASE_URL", os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")).rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", ""))

def format_phone(ddd: str, phone: str) -> Optional[str]:
    if not phone:
        return None
    digits = re.sub(r'\D', '', f"{ddd or ''}{phone}")
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    elif len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    elif len(digits) == 8:
        return f"(61) {digits[:4]}-{digits[4:]}"
    elif len(digits) == 9:
        return f"(61) {digits[:5]}-{digits[5:]}"
    return phone

def fetch_lead_by_cnpj(client: OpenCNPJ, cnpj_raw: str) -> Optional[Dict]:
    """Consulta CNPJ usando OpenCNPJ e converte para o formato de LeadEscolar do CRM."""
    cnpj_clean = re.sub(r'\D', '', cnpj_raw)
    if len(cnpj_clean) != 14:
        logging.warning(f"CNPJ inválido ignorado: '{cnpj_raw}'")
        return None

    try:
        data = client.find_by_cnpj(cnpj_clean)
    except Exception as e:
        logging.error(f"Erro ao consultar CNPJ {cnpj_clean}: {e}")
        return None

    # Nome da Empresa / Escola (Prefere Nome Fantasia, senão Razão Social)
    nome = (data.nome_fantasia or data.razao_social or "").strip()
    if not nome:
        return None

    cidade = (data.municipio or "Brasília").strip().title()
    uf = (data.uf or "").strip().upper()
    cidade_display = f"{cidade}/{uf}" if uf else cidade

    # Telefone (pega o primeiro telefone disponível que não seja fax)
    telefone_str = None
    if data.telefones:
        for t in data.telefones:
            if not getattr(t, 'is_fax', False):
                telefone_str = format_phone(getattr(t, 'ddd', ''), getattr(t, 'numero', ''))
                if telefone_str:
                    break
        if not telefone_str and len(data.telefones) > 0:
            first = data.telefones[0]
            telefone_str = format_phone(getattr(first, 'ddd', ''), getattr(first, 'numero', ''))

    # E-mail
    email_escola = data.email.strip().lower() if data.email else None

    # Decisor via QSA (Sócios / Administradores)
    nome_decisor = None
    if data.qsa and len(data.qsa) > 0:
        primeiro_socio = data.qsa[0]
        socio_nome = getattr(primeiro_socio, 'nome_socio', None) or ""
        qualificacao = getattr(primeiro_socio, 'qualificacao_socio', None) or ""
        
        if socio_nome:
            socio_nome = socio_nome.strip().title()
            if qualificacao:
                nome_decisor = f"{socio_nome} ({qualificacao.strip().title()})"
            else:
                nome_decisor = socio_nome

    if not nome_decisor:
        nome_decisor = "Diretoria / Responsável"

    return {
        "nome_escola": nome.title(),
        "cidade": cidade_display,
        "telefone_escola": telefone_str,
        "email_escola": email_escola,
        "nome_decisor": nome_decisor,
        "email_decisor": email_escola,
        "status": "novo",
        "ultima_interacao": None
    }

def save_to_supabase(leads: List[Dict]):
    if not leads:
        logging.info("Nenhum lead para salvar.")
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
            logging.error(f"Erro ao enviar lote para o Supabase: {ex}")

    logging.info(f"Sucesso! {saved} leads salvos no CRM Littera.")

def load_cnpjs_from_file_or_args() -> List[str]:
    # 1. Se passou um arquivo como argumento (ex: python script.py cnpjs.txt)
    if len(sys.argv) > 1:
        arg = sys.argv[1]
        if os.path.isfile(arg):
            logging.info(f"Carregando CNPJs do arquivo: {arg}")
            with open(arg, "r", encoding="utf-8") as f:
                return [line.strip() for line in f if line.strip() and not line.startswith("#")]
        else:
            # Passou CNPJs separados por espaço na linha de comando
            return sys.argv[1:]

    # 2. Se existe o arquivo padrão data/cnpjs.txt
    default_file = "scripts/cnpjs.txt"
    if os.path.exists(default_file):
        logging.info(f"Carregando do arquivo padrão: {default_file}")
        with open(default_file, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip() and not line.startswith("#")]

    # 3. Lista de exemplo de fallback
    logging.info("Nenhum arquivo informado. Usando lista de exemplo interna...")
    return [
        # Exemplos de teste (substitua pelos seus CNPJs alvos)
        "00.000.000/0001-91", # Banco do Brasil (Exemplo teste)
    ]

def main():
    cnpjs = load_cnpjs_from_file_or_args()
    logging.info(f"Total de {len(cnpjs)} CNPJ(s) para consultar...")

    client = OpenCNPJ()
    crm_leads = []

    for idx, raw_cnpj in enumerate(cnpjs, 1):
        logging.info(f"[{idx}/{len(cnpjs)}] Consultando {raw_cnpj}...")
        lead = fetch_lead_by_cnpj(client, raw_cnpj)
        if lead:
            crm_leads.append(lead)
            logging.info(f"  -> Sucesso: {lead['nome_escola']} | Decisor: {lead['nome_decisor']} | Tel: {lead['telefone_escola']}")
        
        # Pequeno delay para respeitar o rate-limit da API pública OpenCNPJ
        if idx < len(cnpjs):
            time.sleep(0.5)

    logging.info(f"Finalizadas {len(crm_leads)} empresas enriquecidas com sucesso.")
    save_to_supabase(crm_leads)

if __name__ == "__main__":
    main()
