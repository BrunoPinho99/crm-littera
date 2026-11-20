"""
Módulo de integração com a Google Places API (New) — Text Search.
Busca o site oficial, telefone, Place ID, nota e avaliações de escolas particulares.
"""

import os
import re
import logging
import unicodedata
from urllib.parse import urlparse
from typing import Dict, Any, Optional
import requests
from rapidfuzz import fuzz

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

PLACES_API_ENDPOINT = "https://places.googleapis.com/v1/places:searchText"
FIELD_MASK = (
    "places.id,places.displayName,places.formattedAddress,"
    "places.websiteUri,places.nationalPhoneNumber,places.rating,places.userRatingCount"
)

def normalizar_texto(texto: Any) -> str:
    """Remove acentuação e caracteres especiais para comparação flexível."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"[^a-z0-9\s]", " ", ascii_str)

def extrair_dominio(url: str) -> Optional[str]:
    """Extrai o domínio limpo da URL, sem protocolo, porta, barra ou prefixo www."""
    if not url:
        return None
    try:
        parsed = urlparse(url.strip())
        netloc = parsed.netloc or parsed.path.split("/")[0]
        netloc = netloc.split(":")[0].lower().strip()
        if netloc.startswith("www."):
            netloc = netloc[4:]
        return netloc if netloc else None
    except Exception:
        return None

def buscar_escola_places(
    nome: str,
    cidade: str,
    uf: str,
    bairro: Optional[str] = None,
    api_key: Optional[str] = None,
    similaridade_minima: float = 0.80
) -> Optional[Dict[str, Any]]:
    """
    Executa busca no Google Places API (New) com Text Search e FieldMask restrito.
    Aceita o resultado apenas se:
      1. Similaridade do nome >= 0.80 (rapidfuzz token_sort_ratio)
      2. O endereço formatado contiver a cidade da escola.
    """
    key = api_key or os.getenv("GOOGLE_PLACES_API_KEY")
    if not key:
        logging.warning("GOOGLE_PLACES_API_KEY não configurada. Busca no Google Places ignorada.")
        return None

    partes_query = [nome]
    if bairro:
        partes_query.append(bairro)
    partes_query.extend([cidade, uf])
    query = " ".join([p.strip() for p in partes_query if p and p.strip()])

    headers = {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELD_MASK
    }
    payload = {
        "textQuery": query
    }

    try:
        res = requests.post(PLACES_API_ENDPOINT, headers=headers, json=payload, timeout=15)
        if res.status_code != 200:
            logging.warning(f"Google Places API retornou erro ({res.status_code}): {res.text[:200]}")
            return None

        data = res.json()
        places = data.get("places", [])
        if not places:
            logging.info(f"Nenhum local retornado no Google Places para a busca: '{query}'")
            return None

        # Avalia os candidatos retornados
        norm_nome_alvo = normalizar_texto(nome)
        norm_cidade_alvo = normalizar_texto(cidade)

        for place in places:
            display_name = place.get("displayName", {}).get("text", "")
            formatted_address = place.get("formattedAddress", "")

            norm_display = normalizar_texto(display_name)
            norm_addr = normalizar_texto(formatted_address)

            # 1. Checa similaridade do nome
            sim = fuzz.token_sort_ratio(norm_nome_alvo, norm_display) / 100.0
            # 2. Checa se o endereço contém a cidade
            cidade_no_endereco = (norm_cidade_alvo in norm_addr)

            if sim >= similaridade_minima and cidade_no_endereco:
                website_uri = place.get("websiteUri")
                dominio = extrair_dominio(website_uri) if website_uri else None

                return {
                    "google_place_id": place.get("id"),
                    "displayName": display_name,
                    "formattedAddress": formatted_address,
                    "site": website_uri,
                    "dominio": dominio,
                    "google_rating": place.get("rating"),
                    "google_avaliacoes": place.get("userRatingCount"),
                    "telefone": place.get("nationalPhoneNumber"),
                    "similaridade": sim
                }
            else:
                logging.info(
                    f"Candidato Places rejeitado para '{nome}': '{display_name}' "
                    f"(Similaridade: {sim:.2f}, Cidade bateu: {cidade_no_endereco})"
                )

    except Exception as ex:
        logging.error(f"Erro ao consultar Google Places para '{query}': {ex}")

    return None
