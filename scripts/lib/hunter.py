"""
Módulo de integração opcional com a API do Hunter.io (v2).
Permite busca de e-mails corporativos por domínio (Domain Search)
e localização de e-mails para decisores conhecidos (Email Finder).
"""

import os
import logging
from typing import List, Dict, Any, Optional, Tuple
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

HUNTER_DOMAIN_SEARCH_URL = "https://api.hunter.io/v2/domain-search"
HUNTER_EMAIL_FINDER_URL = "https://api.hunter.io/v2/email-finder"

DEFAULT_PRICE_HUNTER_CREDIT = 0.019  # USD por busca/crédito

CARGOS_LIDERANCA_KEYWORDS = [
    "diretor",
    "diretora",
    "coordenador",
    "coordenadora",
    "mantenedor",
    "presidente",
    "administrador",
    "gestor",
    "gestora",
    "secretaria"
]

def eh_cargo_decisao(cargo: Optional[str]) -> bool:
    """Verifica se a posição do Hunter indica cargo de direção/coordenação."""
    if not cargo:
        return False
    cargo_low = cargo.lower()
    return any(kw in cargo_low for kw in CARGOS_LIDERANCA_KEYWORDS)

def hunter_domain_search(
    dominio: str,
    api_key: Optional[str] = None
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Executa busca de e-mails no domínio via Hunter.io Domain Search.
    Filtra pessoas com cargo de direção/coordenação.
    Retorna: (contatos_encontrados, creditos_usados)
    """
    key = api_key or os.getenv("HUNTER_API_KEY")
    if not key or not dominio:
        return [], 0

    params = {
        "domain": dominio.strip().lower(),
        "api_key": key,
        "type": "personal"
    }

    try:
        res = requests.get(HUNTER_DOMAIN_SEARCH_URL, params=params, timeout=15)
        if res.status_code != 200:
            logging.warning(f"Hunter Domain Search retornou status {res.status_code}: {res.text[:150]}")
            return [], 0

        data = res.json().get("data", {})
        emails = data.get("emails", [])
        creditos_usados = 1

        contatos = []
        for item in emails:
            pos = item.get("position")
            first = item.get("first_name") or ""
            last = item.get("last_name") or ""
            nome_completo = f"{first} {last}".strip()

            if eh_cargo_decisao(pos) and nome_completo:
                sources = item.get("sources") or []
                fonte_url = sources[0].get("uri") if sources else None
                score = item.get("confidence") or 50

                contatos.append({
                    "nome": nome_completo.title(),
                    "cargo": pos.strip().title(),
                    "email": item.get("value"),
                    "confianca": int(score),
                    "fonte": "hunter",
                    "fonte_url": fonte_url
                })

        return contatos, creditos_usados

    except Exception as ex:
        logging.warning(f"Erro ao consultar Hunter Domain Search para {dominio}: {ex}")
        return [], 0

def hunter_email_finder(
    nome: str,
    dominio: str,
    api_key: Optional[str] = None,
    score_minimo: int = 80
) -> Tuple[Optional[str], Optional[str], int, int]:
    """
    Executa busca direcionada de e-mail de um decisor via Hunter.io Email Finder.
    Retorna o e-mail apenas se o score for >= 80.
    Retorna: (email, fonte_url, score, creditos_usados)
    """
    key = api_key or os.getenv("HUNTER_API_KEY")
    if not key or not nome or not dominio:
        return None, None, 0, 0

    partes_nome = nome.strip().split()
    if len(partes_nome) < 2:
        return None, None, 0, 0

    first_name = partes_nome[0]
    last_name = partes_nome[-1]

    params = {
        "domain": dominio.strip().lower(),
        "first_name": first_name,
        "last_name": last_name,
        "api_key": key
    }

    try:
        res = requests.get(HUNTER_EMAIL_FINDER_URL, params=params, timeout=15)
        if res.status_code != 200:
            return None, None, 0, 0

        data = res.json().get("data", {})
        email = data.get("email")
        score = int(data.get("score") or 0)
        sources = data.get("sources") or []
        fonte_url = sources[0].get("uri") if sources else None

        if email and score >= score_minimo:
            return email.lower().strip(), fonte_url, score, 1
        return None, fonte_url, score, 1

    except Exception as ex:
        logging.warning(f"Erro no Hunter Email Finder para {nome} em {dominio}: {ex}")
        return None, None, 0, 0
