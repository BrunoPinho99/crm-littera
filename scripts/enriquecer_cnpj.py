#!/usr/bin/env python3
"""
Enriquecedor de Escolas por CNPJ (Receita Federal / QSA).
Consulta dados cadastrais oficiais e Quadro de Sócios e Administradores (QSA)
via BrasilAPI (principal) e OpenCNPJ (reserva), com cache persistente de 30 dias.
"""

import os
import sys
import json
import logging
import argparse
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import get_supabase_credentials, sanitize_row
from scripts.lib.cnpj import (
    valida_cnpj,
    limpar_cnpj,
    consulta_brasilapi,
    consulta_opencnpj,
    normaliza,
    is_qualificacao_comando,
    formatar_nome_proprio
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DOMINIOS_GENERICOS = {
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com.br",
    "yahoo.com",
    "bol.com.br",
    "uol.com.br",
    "live.com",
    "icloud.com"
}

def consultar_cache(cnpj: str, url: str, key: str) -> Optional[Tuple[Dict[str, Any], str]]:
    """Verifica se existe resposta em cache válida (menos de 30 dias)."""
    endpoint = f"{url}/rest/v1/cache_cnpj?cnpj=eq.{cnpj}&select=payload,fonte,consultado_em"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    try:
        res = requests.get(endpoint, headers=headers, timeout=10)
        if res.status_code == 200:
            rows = res.json()
            if rows and isinstance(rows, list) and len(rows) > 0:
                item = rows[0]
                consultado_em_str = item.get("consultado_em")
                if consultado_em_str:
                    # Parse timestamp ISO
                    try:
                        dt = datetime.fromisoformat(consultado_em_str.replace("Z", "+00:00"))
                        dias = (datetime.now(timezone.utc) - dt).days
                        if dias < 30:
                            return item.get("payload"), item.get("fonte")
                    except Exception as ex:
                        logging.warning(f"Erro ao parsear timestamp de cache para CNPJ {cnpj}: {ex}")
    except Exception as ex:
        logging.warning(f"Erro ao verificar cache_cnpj no Supabase: {ex}")
    return None

def salvar_cache(cnpj: str, fonte: str, payload: Dict[str, Any], url: str, key: str):
    """Grava ou atualiza o resultado no cache_cnpj."""
    endpoint = f"{url}/rest/v1/cache_cnpj?on_conflict=cnpj"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    row = {
        "cnpj": cnpj,
        "fonte": fonte,
        "payload": payload,
        "consultado_em": datetime.now(timezone.utc).isoformat()
    }
    try:
        requests.post(endpoint, headers=headers, json=[row], timeout=15)
    except Exception as ex:
        logging.warning(f"Erro ao gravar no cache_cnpj: {ex}")

def registrar_agente_execucao(
    status: str,
    leads_encontrados: int,
    leads_inseridos: int,
    mensagem: str,
    iniciado_em: datetime,
    url: str,
    key: str
):
    """Registra histórico de execução real na tabela agente_execucoes."""
    endpoint = f"{url}/rest/v1/agente_execucoes"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "iniciado_em": iniciado_em.isoformat(),
        "finalizado_em": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "leads_encontrados": leads_encontrados,
        "leads_inseridos": leads_inseridos,
        "mensagem": mensagem
    }
    try:
        requests.post(endpoint, headers=headers, json=payload, timeout=15)
    except Exception as ex:
        logging.warning(f"Erro ao registrar execução em agente_execucoes: {ex}")

def atualizar_redes(url: str, key: str):
    """
    Identifica redes escolares pelo CNPJ raiz (8 primeiros dígitos).
    Se o CNPJ raiz aparecer em mais de uma escola, grava score_detalhes.rede em todas elas.
    """
    logging.info("Verificando identificação de redes escolares (CNPJ raiz)...")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    endpoint = f"{url}/rest/v1/escolas?cnpj=not.is.null&select=id,cnpj,score_detalhes"
    try:
        res = requests.get(endpoint, headers=headers, timeout=30)
        if res.status_code != 200:
            logging.warning(f"Falha ao buscar escolas para identificação de redes: {res.text}")
            return

        escolas = res.json()
        grupos_raiz: Dict[str, List[Dict[str, Any]]] = {}
        for esc in escolas:
            c = limpar_cnpj(esc.get("cnpj"))
            if c:
                raiz = c[:8]
                grupos_raiz.setdefault(raiz, []).append(esc)

        redes_atualizadas = 0
        for raiz, esc_list in grupos_raiz.items():
            qtd = len(esc_list)
            if qtd > 1:
                for esc in esc_list:
                    sd = esc.get("score_detalhes") or {}
                    rede_atual = sd.get("rede", {})
                    if rede_atual.get("cnpj_raiz") != raiz or rede_atual.get("quantidade_escolas") != qtd:
                        sd["rede"] = {
                            "cnpj_raiz": raiz,
                            "quantidade_escolas": qtd
                        }
                        patch_url = f"{url}/rest/v1/escolas?id=eq.{esc['id']}"
                        patch_headers = {
                            "apikey": key,
                            "Authorization": f"Bearer {key}",
                            "Content-Type": "application/json"
                        }
                        requests.patch(patch_url, headers=patch_headers, json={"score_detalhes": sd}, timeout=10)
                        redes_atualizadas += 1

        if redes_atualizadas > 0:
            logging.info(f"Redes identificadas: {redes_atualizadas} escolas atualizadas com metadados de rede.")
    except Exception as ex:
        logging.warning(f"Erro ao processar identificação de redes: {ex}")

def enriquecer_escolas(
    limite: int = 100,
    dry_run: bool = False,
    reprocessar: bool = False,
    execucao_id: Optional[str] = None,
    registrar_execucao: bool = True
) -> Dict[str, Any]:
    iniciado_em = datetime.now(timezone.utc)
    url, key = get_supabase_credentials()

    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }

    # Busca escolas para enriquecimento
    status_filter = "status_qualificacao=in.(bruto,enriquecido)" if reprocessar else "status_qualificacao=eq.bruto"
    query_url = (
        f"{url}/rest/v1/escolas"
        f"?{status_filter}&cnpj=not.is.null"
        f"&order=matriculas_em.desc.nullslast"
        f"&limit={limite}"
    )

    logging.info(f"Buscando até {limite} escolas ({status_filter}) com CNPJ não nulo...")
    resp = requests.get(query_url, headers=headers, timeout=20)
    if resp.status_code != 200:
        raise RuntimeError(f"Erro ao consultar escolas no Supabase ({resp.status_code}): {resp.text}")

    escolas = resp.json()
    total_encontradas = len(escolas)
    logging.info(f"Encontradas {total_encontradas} escolas para enriquecimento.")

    stats = {
        "consultadas": 0,
        "do_cache": 0,
        "descartadas": 0,
        "enriquecidas": 0,
        "contatos_criados": 0,
        "falhas": 0,
        "detalhes": []
    }

    for idx, esc in enumerate(escolas, start=1):
        nome_escola = esc.get("nome") or "Sem Nome"
        cnpj_raw = esc.get("cnpj")
        cnpj = limpar_cnpj(cnpj_raw)

        if not cnpj or not valida_cnpj(cnpj):
            logging.warning(f"[{idx}/{total_encontradas}] CNPJ inválido ignorado: '{cnpj_raw}' ({nome_escola})")
            stats["falhas"] += 1
            continue

        stats["consultadas"] += 1
        logging.info(f"[{idx}/{total_encontradas}] Processando CNPJ {cnpj} — {nome_escola}...")

        norm: Optional[Dict[str, Any]] = None
        fonte_usada: str = ""
        do_cache: bool = False

        # 1. Consulta Cache
        cache_hit = consultar_cache(cnpj, url, key)
        if cache_hit:
            norm, fonte_usada = cache_hit
            do_cache = True
            stats["do_cache"] += 1
            logging.info(f"  -> Cache HIT ({fonte_usada}) para CNPJ {cnpj}")
        else:
            # 2. Consulta BrasilAPI
            raw_b = consulta_brasilapi(cnpj)
            if raw_b:
                norm = normaliza(raw_b, "brasilapi")
                fonte_usada = "brasilapi"
                logging.info(f"  -> BrasilAPI Sucesso para CNPJ {cnpj}")
            else:
                # 3. Consulta OpenCNPJ (reserva)
                logging.info(f"  -> BrasilAPI falhou, tentando OpenCNPJ para CNPJ {cnpj}...")
                raw_o = consulta_opencnpj(cnpj)
                if raw_o:
                    norm = normaliza(raw_o, "opencnpj")
                    fonte_usada = "opencnpj"
                    logging.info(f"  -> OpenCNPJ Sucesso para CNPJ {cnpj}")

            # Salva no cache se obteve resposta
            if norm and not dry_run:
                salvar_cache(cnpj, fonte_usada, norm, url, key)

        if not norm:
            logging.error(f"  -> Falha em todas as fontes para CNPJ {cnpj} ({nome_escola})")
            stats["falhas"] += 1
            continue

        situacao = (norm.get("situacao") or "").upper().strip()
        fonte_url = (
            f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
            if fonte_usada == "brasilapi"
            else f"https://kitana.opencnpj.com/cnpj/{cnpj}"
        )

        patch_data: Dict[str, Any] = {}
        contatos_gerados: List[Dict[str, Any]] = []

        # b) Se a situação não for ATIVA: descarta
        if situacao != "ATIVA":
            logging.warning(f"  -> Situação cadastral {situacao} (Não Ativa). Marcando como descartado.")
            stats["descartadas"] += 1
            patch_data = {
                "status_qualificacao": "descartado",
                "motivo_descarte": f"CNPJ {situacao} na Receita",
                "situacao_cadastral": situacao
            }
        else:
            # c) Situação ATIVA: preenche dados sem sobrescrever o que já existe
            stats["enriquecidas"] += 1
            patch_data["status_qualificacao"] = "enriquecido"
            patch_data["situacao_cadastral"] = situacao

            if not esc.get("razao_social") and norm.get("razao_social"):
                patch_data["razao_social"] = norm["razao_social"]

            if not esc.get("nome_fantasia") and norm.get("nome_fantasia"):
                patch_data["nome_fantasia"] = norm["nome_fantasia"]

            if not esc.get("porte_receita") and norm.get("porte"):
                patch_data["porte_receita"] = norm["porte"]

            if esc.get("capital_social") is None and norm.get("capital_social") is not None:
                patch_data["capital_social"] = norm["capital_social"]

            if not esc.get("telefone") and norm.get("telefones"):
                patch_data["telefone"] = norm["telefones"][0]

            if not esc.get("email_geral") and norm.get("email"):
                patch_data["email_geral"] = norm["email"]

            # Extração de domínio se vazio e e-mail não for genérico
            email_candidato = esc.get("email_geral") or norm.get("email")
            if not esc.get("dominio") and email_candidato and "@" in email_candidato:
                dom = email_candidato.split("@")[-1].lower().strip()
                if dom not in DOMINIOS_GENERICOS:
                    patch_data["dominio"] = dom

            # d) QSA: Sócios PF com qualificação de comando viram contatos
            score_detalhes = esc.get("score_detalhes") or {}
            qsa_pj_list = []

            for socio in norm.get("socios", []):
                tipo = socio.get("tipo")
                nome_socio = socio.get("nome")
                qualif = socio.get("qualificacao_descricao") or ""

                if tipo == "PJ":
                    qsa_pj_list.append({
                        "nome": nome_socio,
                        "qualificacao": qualif
                    })
                elif tipo == "PF":
                    if is_qualificacao_comando(qualif):
                        cargo_formatado = qualif.strip().title() if qualif else "Sócio"
                        contatos_gerados.append({
                            "escola_id": esc["id"],
                            "nome": nome_socio,
                            "cargo": cargo_formatado,
                            "tipo": "mantenedor",
                            "fonte": "qsa",
                            "fonte_url": fonte_url,
                            "confianca": 70,
                            "email": None
                        })

            if qsa_pj_list:
                score_detalhes["qsa_pj"] = qsa_pj_list
                patch_data["score_detalhes"] = score_detalhes

        # Salva alterações na escola
        if not dry_run and patch_data:
            patch_url = f"{url}/rest/v1/escolas?id=eq.{esc['id']}"
            patch_headers = {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            }
            res_patch = requests.patch(patch_url, headers=patch_headers, json=patch_data, timeout=15)
            if res_patch.status_code not in (200, 204):
                logging.warning(f"Erro ao atualizar escola {esc['id']}: {res_patch.text}")

        # Salva contatos criados (evita duplicar pelo nome para a mesma escola)
        contatos_salvos = 0
        if not dry_run and contatos_gerados:
            # Busca nomes já cadastrados para esta escola
            c_url = f"{url}/rest/v1/contatos?escola_id=eq.{esc['id']}&select=nome"
            res_c = requests.get(c_url, headers=headers, timeout=15)
            existentes = set()
            if res_c.status_code == 200:
                for c in res_c.json():
                    if c.get("nome"):
                        existentes.add(c["nome"].strip().lower())

            novos_contatos = [c for c in contatos_gerados if c["nome"].strip().lower() not in existentes]
            if novos_contatos:
                post_c_url = f"{url}/rest/v1/contatos"
                post_c_headers = {
                    "apikey": key,
                    "Authorization": f"Bearer {key}",
                    "Content-Type": "application/json"
                }
                res_post_c = requests.post(post_c_url, headers=post_c_headers, json=novos_contatos, timeout=15)
                if res_post_c.status_code in (200, 201):
                    contatos_salvos = len(novos_contatos)
                    stats["contatos_criados"] += contatos_salvos
                else:
                    logging.warning(f"Erro ao inserir contatos QSA: {res_post_c.text}")
        elif dry_run:
            contatos_salvos = len(contatos_gerados)
            stats["contatos_criados"] += contatos_salvos

        stats["detalhes"].append({
            "escola": nome_escola,
            "cnpj": cnpj,
            "situacao": situacao,
            "fonte": fonte_usada,
            "do_cache": do_cache,
            "contatos": [(c["nome"], c["cargo"]) for c in contatos_gerados]
        })

    # e) Identifica redes escolares
    if not dry_run:
        atualizar_redes(url, key)

    # g) Registra histórico de execução
    msg_exec = (
        f"Enriquecimento CNPJ: {stats['consultadas']} consultadas, "
        f"{stats['do_cache']} do cache, {stats['descartadas']} descartadas, "
        f"{stats['enriquecidas']} enriquecidas, {stats['contatos_criados']} contatos criados, "
        f"{stats['falhas']} falhas."
    )
    logging.info(f"=== RESUMO: {msg_exec} ===")

    if not dry_run and registrar_execucao:
        registrar_agente_execucao(
            status="sucesso",
            leads_encontrados=stats["consultadas"],
            leads_inseridos=stats["enriquecidas"],
            mensagem=msg_exec,
            iniciado_em=iniciado_em,
            url=url,
            key=key
        )

    return stats

def main():
    parser = argparse.ArgumentParser(description="Enriquecimento de escolas por CNPJ via BrasilAPI/OpenCNPJ")
    parser.add_argument("--limite", type=int, default=100, help="Limite de escolas a processar (padrão: 100)")
    parser.add_argument("--reprocessar", action="store_true", help="Inclui escolas já enriquecidas para validação de cache")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem gravar no Supabase")
    args = parser.parse_args()

    stats = enriquecer_escolas(limite=args.limite, dry_run=args.dry_run, reprocessar=args.reprocessar)
    print("\n" + "="*70)
    print("RELATÓRIO DE ENRIQUECIMENTO DE CNPJ E QSA")
    print("="*70)
    print(f"Total consultadas: {stats['consultadas']}")
    print(f"Obtidas do cache: {stats['do_cache']}")
    print(f"Enriquecidas (ativas): {stats['enriquecidas']}")
    print(f"Descartadas (inativas): {stats['descartadas']}")
    print(f"Contatos QSA criados: {stats['contatos_criados']}")
    print(f"Falhas: {stats['falhas']}")
    print("\nEscolas processadas e contatos identificados:")
    for d in stats["detalhes"]:
        cache_str = "[CACHE]" if d["do_cache"] else f"[{d['fonte'].upper()}]"
        print(f"\n• {d['escola']} ({d['cnpj']}) - {d['situacao']} {cache_str}")
        if d["contatos"]:
            for nome, cargo in d["contatos"]:
                print(f"   └─ Contato: {nome} | Cargo: {cargo}")
        else:
            print("   └─ (Nenhum sócio PF com cargo de comando identificado)")
    print("="*70 + "\n")

if __name__ == "__main__":
    main()
