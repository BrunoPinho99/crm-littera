#!/usr/bin/env python3
"""
Localizador de CNPJs para escolas sem CNPJ via Apify (Actor brasildados~cnpj-lead-scraper-search).
Realiza cruzamento determinístico (mesmo município E [mesmo CEP OU similaridade de nome >= 0.85]).
Se casar 1 candidato: preenche cnpj e mantém status_qualificacao = 'bruto'.
Se ambíguo (mais de 1 candidato): não grava CNPJ e marca precisa_revisao = True.
"""

import os
import re
import sys
import json
import logging
import argparse
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests
from rapidfuzz import fuzz

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import get_supabase_credentials
from scripts.lib.cnpj import valida_cnpj, limpar_cnpj, format_phone

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

CONFIG_REGIOES = ROOT_DIR / "scripts" / "config" / "regioes.json"

def normalizar_texto(texto: Any) -> str:
    """Remove acentuação, caracteres especiais e converte para minúsculas."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"[^a-z0-9\s]", " ", ascii_str)

def carregar_ufs_config() -> List[str]:
    """Lê UFs configuradas em scripts/config/regioes.json."""
    if CONFIG_REGIOES.exists():
        with open(CONFIG_REGIOES, "r", encoding="utf-8") as f:
            data = json.load(f)
            return [item["uf"].upper().strip() for item in data if "uf" in item]
    return ["DF", "GO"]

def fetch_apify_leads(
    token: str,
    cnaes: Optional[List[str]] = None,
    ufs: Optional[List[str]] = None,
    max_results: int = 500
) -> List[Dict[str, Any]]:
    """Consulta o dataset do actor brasildados~cnpj-lead-scraper-search no Apify."""
    if not token:
        raise ValueError("APIFY_TOKEN obrigatório para executar consulta no Apify.")

    cnaes = cnaes or ["8520100", "8513900"]  # Ensino Médio e Fundamental
    ufs = ufs or carregar_ufs_config()

    url = "https://api.apify.com/v2/actors/brasildados~cnpj-lead-scraper-search/run-sync-get-dataset-items"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "cnaes": cnaes,
        "uf": ufs,
        "porte": [],
        "situacaoCadastral": "02",  # Ativa
        "maxResults": max_results
    }

    logging.info(f"Disparando busca no Apify ({len(cnaes)} CNAEs: {cnaes}, UFs: {ufs}, Max: {max_results})...")
    res = requests.post(url, headers=headers, json=payload, timeout=180)

    if res.status_code not in (200, 201):
        raise RuntimeError(f"Erro na chamada do Apify ({res.status_code}): {res.text}")

    items = res.json()
    logging.info(f"Retornados {len(items)} registros brutos do Apify.")
    return items

def casar_escolas_com_apify(
    escolas_sem_cnpj: List[Dict[str, Any]],
    items_apify: List[Dict[str, Any]],
    similaridade_minima: float = 0.85
) -> Dict[str, Any]:
    """
    Realiza o casamento entre escolas sem CNPJ e registros do Apify:
    Critério: mesmo município E (mesmo CEP OU similaridade de nome >= 0.85).
    """
    casados: List[Dict[str, Any]] = []
    ambiguos: List[Dict[str, Any]] = []
    sem_candidato = 0

    for esc in escolas_sem_cnpj:
        nome_esc = esc.get("nome") or ""
        norm_nome_esc = normalizar_texto(nome_esc)
        cidade_esc = normalizar_texto(esc.get("cidade") or "")
        cep_esc = re.sub(r"\D", "", str(esc.get("cep") or ""))

        candidatos = []
        for item in items_apify:
            mun_item = normalizar_texto(item.get("municipioNome") or item.get("municipio") or "")
            if not mun_item or mun_item != cidade_esc:
                continue

            # Verifica CEP
            cep_item = re.sub(r"\D", "", str(item.get("cep") or ""))
            cep_igual = bool(cep_esc and cep_item and cep_esc == cep_item)

            # Verifica Similaridade de Nome (Nome Fantasia ou Razão Social)
            nome_fan = normalizar_texto(item.get("nomeFantasia") or "")
            razao_soc = normalizar_texto(item.get("razaoSocial") or "")

            sim_fan = (fuzz.token_sort_ratio(norm_nome_esc, nome_fan) / 100.0) if nome_fan else 0.0
            sim_raz = (fuzz.token_sort_ratio(norm_nome_esc, razao_soc) / 100.0) if razao_soc else 0.0
            max_sim = max(sim_fan, sim_raz)

            if cep_igual or (max_sim >= similaridade_minima):
                c_cnpj = limpar_cnpj(item.get("cnpj"))
                if c_cnpj and valida_cnpj(c_cnpj):
                    candidatos.append({
                        "cnpj": c_cnpj,
                        "nomeFantasia": item.get("nomeFantasia"),
                        "razaoSocial": item.get("razaoSocial"),
                        "cep": item.get("cep"),
                        "similaridade": max_sim,
                        "cep_igual": cep_igual
                    })

        # Desduplica candidatos pelo CNPJ
        candidatos_unicos = {c["cnpj"]: c for c in candidatos}.values()
        candidatos_unicos = list(candidatos_unicos)

        if len(candidatos_unicos) == 1:
            cand = candidatos_unicos[0]
            casados.append({
                "escola_id": esc["id"],
                "nome_escola": nome_esc,
                "cidade": esc.get("cidade"),
                "cnpj_encontrado": cand["cnpj"],
                "detalhes_candidato": cand
            })
        elif len(candidatos_unicos) > 1:
            ambiguos.append({
                "escola_id": esc["id"],
                "nome_escola": nome_esc,
                "cidade": esc.get("cidade"),
                "candidatos": candidatos_unicos
            })
        else:
            sem_candidato += 1

    return {
        "casados": casados,
        "ambiguos": ambiguos,
        "sem_candidato": sem_candidato
    }

def main():
    parser = argparse.ArgumentParser(description="Localizador de CNPJ para escolas via Apify")
    parser.add_argument("--max-results", type=int, default=500, help="Máximo de itens no run da Apify (padrão: 500)")
    parser.add_argument("--dry-run", action="store_true", help="Executa o casamento sem gravar no Supabase")
    args = parser.parse_args()

    apify_token = os.getenv("APIFY_TOKEN")
    if not apify_token:
        print("[ERRO] APIFY_TOKEN não configurado no ambiente.")
        sys.exit(1)

    url, key = get_supabase_credentials()
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }

    # Busca escolas sem CNPJ
    query_url = f"{url}/rest/v1/escolas?cnpj=is.null&status_qualificacao=eq.bruto&select=id,nome,cidade,uf,cep"
    res_esc = requests.get(query_url, headers=headers, timeout=20)
    if res_esc.status_code != 200:
        logging.error(f"Erro ao buscar escolas no Supabase: {res_esc.text}")
        sys.exit(1)

    escolas_sem_cnpj = res_esc.json()
    logging.info(f"Escolas no CRM sem CNPJ com status 'bruto': {len(escolas_sem_cnpj)}")

    if not escolas_sem_cnpj:
        print("Nenhuma escola sem CNPJ para processar.")
        return

    # Consulta Apify
    items_apify = fetch_apify_leads(token=apify_token, max_results=args.max_results)
    resultado = casar_escolas_com_apify(escolas_sem_cnpj, items_apify)

    print("\n" + "="*70)
    print("RELATÓRIO DO CASAMENTO COM DADOS DA APIFY")
    print("="*70)
    print(f"Itens retornados da Apify: {len(items_apify)}")
    print(f"Custo estimado do run: {len(items_apify)} itens processados")
    print(f"Escolas casadas com CNPJ único: {len(resultado['casados'])}")
    print(f"Escolas com candidatos ambíguos: {len(resultado['ambiguos'])}")
    print(f"Escolas sem candidatos correspondentes: {resultado['sem_candidato']}")

    # Aplica atualizações no Supabase
    if not args.dry_run:
        patch_headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }

        # 1. Grava CNPJ para os casos com casamento único
        for c in resultado["casados"]:
            patch_url = f"{url}/rest/v1/escolas?id=eq.{c['escola_id']}"
            patch_body = {
                "cnpj": c["cnpj_encontrado"],
                "status_qualificacao": "bruto"
            }
            requests.patch(patch_url, headers=patch_headers, json=patch_body, timeout=10)

        # 2. Marca revisão para os casos ambíguos
        for a in resultado["ambiguos"]:
            patch_url = f"{url}/rest/v1/escolas?id=eq.{a['escola_id']}"
            lista_cands = [f"{c['cnpj']} ({c.get('nomeFantasia') or c.get('razaoSocial')})" for c in a["candidatos"]]
            obs = f"Múltiplos CNPJs candidatos no Apify: {', '.join(lista_cands)}"
            patch_body = {
                "precisa_revisao": True,
                "observacao_revisao": obs
            }
            requests.patch(patch_url, headers=patch_headers, json=patch_body, timeout=10)

    print("="*70 + "\n")

if __name__ == "__main__":
    main()
