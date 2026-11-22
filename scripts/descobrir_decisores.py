#!/usr/bin/env python3
"""
Orquestrador de Descoberta de Decisores no Site Oficial (com Claude e Google Places).
Processa escolas com status_qualificacao = 'enriquecido' sem site_verificado_em:
1. Google Places API (New) para descobrir site e nota da escola.
2. Crawler respeitoso de páginas internas da escola.
3. Extrator Claude via Tool Use e validação estrita anti-alucinação.
4. Hunter.io opcional (se chave configurada) para Domain Search e Email Finder.
5. Deduplicação e seleção de contato principal por prioridade pedagógica.
6. Gravação de evidências literais e rastreamento de custos por serviço em custos_agente.
"""

import os
import sys
import json
import logging
import argparse
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import get_supabase_credentials
from scripts.lib.google_places import buscar_escola_places, extrair_dominio
from scripts.lib.site_crawler import crawl_escola_site
from scripts.lib.extrator_claude import extrair_decisores_com_claude
from scripts.lib.hunter import hunter_domain_search, hunter_email_finder, DEFAULT_PRICE_HUNTER_CREDIT

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Prioridade estrita para seleção do contato principal
PRIORIDADE_TIPOS = {
    "coordenador_em": 1,
    "diretor_pedagogico": 2,
    "diretor_geral": 3,
    "mantenedor": 4,
    "secretaria": 5,
    "outro": 6
}

def normalizar_nome(nome: Any) -> str:
    """Normaliza nome de pessoa para agrupamento e deduplicação."""
    if not nome:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(nome))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    return " ".join(ascii_str.split())

def registrar_custo(
    url: str,
    key: str,
    escola_id: str,
    servico: str,
    unidades: float,
    custo_usd: float,
    execucao_id: Optional[str] = None
):
    """Registra uma linha de custo na tabela custos_agente."""
    endpoint = f"{url}/rest/v1/custos_agente"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "execucao_id": execucao_id,
        "escola_id": escola_id,
        "servico": servico,
        "unidades": unidades,
        "custo_estimado_usd": round(custo_usd, 6),
        "criado_em": datetime.now(timezone.utc).isoformat()
    }
    try:
        requests.post(endpoint, headers=headers, json=payload, timeout=10)
    except Exception as ex:
        logging.warning(f"Erro ao registrar custo do serviço {servico}: {ex}")

def registrar_agente_execucao(
    url: str,
    key: str,
    status: str,
    leads_encontrados: int,
    leads_inseridos: int,
    mensagem: str,
    iniciado_em: datetime
) -> Optional[str]:
    """Registra a execução em agente_execucoes e retorna seu id."""
    endpoint = f"{url}/rest/v1/agente_execucoes"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
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
        res = requests.post(endpoint, headers=headers, json=payload, timeout=15)
        if res.status_code in (200, 201) and res.json():
            return res.json()[0].get("id")
    except Exception as ex:
        logging.warning(f"Erro ao registrar execução em agente_execucoes: {ex}")
    return None

def selecionar_contato_principal(contatos: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Define principal = True exatamente para o contato de maior prioridade:
    coordenador_em > diretor_pedagogico > diretor_geral > mantenedor > outros,
    com desempate favorecendo quem tem e-mail.
    """
    if not contatos:
        return []

    def chave_ordenacao(c: Dict[str, Any]):
        tipo = c.get("tipo") or "outro"
        rank_tipo = PRIORIDADE_TIPOS.get(tipo, 99)
        tem_email = 0 if c.get("email") else 1  # 0 vem antes de 1 (tem e-mail ganha)
        confianca = -(c.get("confianca") or 0)
        return (tem_email, rank_tipo, confianca)

    contatos_ordenados = sorted(contatos, key=chave_ordenacao)

    # Marca o primeiro como principal
    for i, c in enumerate(contatos_ordenados):
        c["principal"] = (i == 0)

    return contatos_ordenados

def consolidar_contatos(
    existentes: List[Dict[str, Any]],
    novos: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Junta contatos duplicados da mesma escola (mesmo nome normalizado):
    mantém um registro, somando fontes e ficando com o e-mail de maior confiança.
    """
    grupos: Dict[str, List[Dict[str, Any]]] = {}

    for c in existentes + novos:
        chave = normalizar_nome(c.get("nome"))
        if not chave:
            continue
        grupos.setdefault(chave, []).append(c)

    consolidados: List[Dict[str, Any]] = []
    for chave, lista in grupos.items():
        # Escolhe registro base (prioriza quem já tem id ou maior confiança)
        base = dict(lista[0])
        fontes = set()
        melhor_email = None
        melhor_confianca_email = -1

        for item in lista:
            if item.get("fonte"):
                fontes.add(item["fonte"])
            if item.get("email"):
                conf = item.get("confianca") or 50
                if conf > melhor_confianca_email:
                    melhor_email = item["email"]
                    melhor_confianca_email = conf

            # Preenche cargo se vazio
            if not base.get("cargo") and item.get("cargo"):
                base["cargo"] = item["cargo"]
            if (not base.get("tipo") or base.get("tipo") == "outro") and item.get("tipo") and item.get("tipo") != "outro":
                base["tipo"] = item["tipo"]
            if not base.get("evidencia") and item.get("evidencia"):
                base["evidencia"] = item["evidencia"]
            if not base.get("fonte_url") and item.get("fonte_url"):
                base["fonte_url"] = item["fonte_url"]

        if melhor_email:
            base["email"] = melhor_email
        base["fonte_consolidada"] = ", ".join(sorted(list(fontes)))
        consolidados.append(base)

    return consolidados

def processar_decisores_escolas(
    limite: int = 40,
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

    status_filter = "site_verificado_em=is.null" if not reprocessar else "site_verificado_em=not.is.null"
    query_url = (
        f"{url}/rest/v1/escolas"
        f"?status_qualificacao=eq.enriquecido&{status_filter}"
        f"&order=matriculas_em.desc.nullslast"
        f"&limit={limite}"
    )

    logging.info(f"Buscando até {limite} escolas enriquecidas ({status_filter})...")
    res = requests.get(query_url, headers=headers, timeout=20)
    if res.status_code != 200:
        raise RuntimeError(f"Erro ao consultar escolas no Supabase: {res.text}")

    escolas = res.json()
    logging.info(f"Encontradas {len(escolas)} escolas para descoberta de decisores.")

    if not dry_run and registrar_execucao and not execucao_id:
        execucao_id = registrar_agente_execucao(
            url, key, "rodando", len(escolas), 0, "Iniciando descoberta de decisores via site", iniciado_em
        )

    resumo = {
        "escolas_processadas": len(escolas),
        "com_site_encontrado": 0,
        "paginas_rastreadas": 0,
        "contatos_identificados": 0,
        "contatos_com_email": 0,
        "custo_total_usd": 0.0,
        "linhas_tabela": []
    }

    for idx, esc in enumerate(escolas, start=1):
        nome_escola = esc.get("nome") or ""
        cidade = esc.get("cidade") or ""
        uf = esc.get("uf") or ""
        bairro = esc.get("bairro")
        site_atual = esc.get("site")
        dominio_atual = esc.get("dominio")

        logging.info(f"\n[{idx}/{len(escolas)}] Processando: {nome_escola} ({cidade}/{uf})...")
        custo_escola_usd = 0.0
        patch_escola: Dict[str, Any] = {}

        # 1. Google Places (se ainda não tiver site ou place_id)
        if not site_atual or not esc.get("google_place_id"):
            place = buscar_escola_places(nome_escola, cidade, uf, bairro)
            if place:
                custo_places = 0.032  # Preço base Text Search
                custo_escola_usd += custo_places
                if not dry_run:
                    registrar_custo(url, key, esc["id"], "google_places", 1, custo_places, execucao_id)

                if place.get("site") and not site_atual:
                    site_atual = place["site"]
                    patch_escola["site"] = site_atual
                if place.get("dominio") and not dominio_atual:
                    dominio_atual = place["dominio"]
                    patch_escola["dominio"] = dominio_atual
                if place.get("google_place_id"):
                    patch_escola["google_place_id"] = place["google_place_id"]
                if place.get("google_rating") is not None:
                    patch_escola["google_rating"] = place["google_rating"]
                if place.get("google_avaliacoes") is not None:
                    patch_escola["google_avaliacoes"] = place["google_avaliacoes"]
                if not esc.get("telefone") and place.get("telefone"):
                    patch_escola["telefone"] = place["telefone"]

        if site_atual:
            resumo["com_site_encontrado"] += 1
            logging.info(f"  -> Site Oficial: {site_atual} (Domínio: {dominio_atual})")

        # 2. Crawler do Site
        paginas: List[Dict[str, Any]] = []
        if site_atual:
            paginas = crawl_escola_site(site_atual, max_paginas=8)
            resumo["paginas_rastreadas"] += len(paginas)

        novos_contatos: List[Dict[str, Any]] = []

        # 3. Extração com Claude
        if paginas:
            resultado_claude, meta_custo = extrair_decisores_com_claude(
                nome_escola=nome_escola,
                dominio=dominio_atual,
                paginas=paginas
            )
            custo_claude = meta_custo.get("custo_usd", 0.0)
            custo_escola_usd += custo_claude
            if not dry_run and custo_claude > 0:
                registrar_custo(
                    url, key, esc["id"], f"claude_{meta_custo.get('modelo', 'haiku')}",
                    meta_custo.get("input_tokens", 0) + meta_custo.get("output_tokens", 0),
                    custo_claude, execucao_id
                )

            # Verifica menção expressa a não ter ensino médio
            if resultado_claude.get("oferece_ensino_medio_no_site") is False:
                trecho_em = resultado_claude.get("trecho_ensino_medio") or "Site informa não ofertar Ensino Médio"
                patch_escola["precisa_revisao"] = True
                patch_escola["observacao_revisao"] = f"Site afirma não ter Ensino Médio: {trecho_em}"
                logging.warning(f"  [ALERTA ENSINO MÉDIO] Escola marcada para revisão: {trecho_em}")

            # E-mails institucionais
            inst_emails = resultado_claude.get("emails_institucionais", [])
            if inst_emails:
                sd = esc.get("score_detalhes") or {}
                sd["emails_institucionais"] = [e["email"] for e in inst_emails]
                patch_escola["score_detalhes"] = sd

                if not esc.get("email_geral"):
                    prioritarios = [e for e in inst_emails if e.get("funcao_indicada") in ("direcao", "coordenacao", "geral")]
                    if prioritarios:
                        patch_escola["email_geral"] = prioritarios[0]["email"]
                    else:
                        patch_escola["email_geral"] = inst_emails[0]["email"]

            # Contatos identificados
            for p in resultado_claude.get("pessoas", []):
                novos_contatos.append({
                    "escola_id": esc["id"],
                    "nome": p["nome"],
                    "cargo": p["cargo_como_escrito"],
                    "tipo": p["tipo"],
                    "email": p.get("email"),
                    "email_status": "nao_verificado" if p.get("email") else "nao_verificado",
                    "telefone": p.get("telefone"),
                    "fonte": "site",
                    "fonte_url": p.get("url_fonte"),
                    "evidencia": p.get("trecho_literal"),
                    "confianca": 85 if p.get("email") else 75
                })

        # 4. Hunter.io Opcional (se API key configurada)
        if dominio_atual:
            contatos_hunter, creditos_ds = hunter_domain_search(dominio_atual)
            if creditos_ds > 0:
                custo_h = creditos_ds * DEFAULT_PRICE_HUNTER_CREDIT
                custo_escola_usd += custo_h
                if not dry_run:
                    registrar_custo(url, key, esc["id"], "hunter_domain_search", creditos_ds, custo_h, execucao_id)

                for ch in contatos_hunter:
                    novos_contatos.append({
                        "escola_id": esc["id"],
                        "nome": ch["nome"],
                        "cargo": ch["cargo"],
                        "tipo": "diretor_pedagogico" if "pedag" in ch["cargo"].lower() else "diretor_geral",
                        "email": ch.get("email"),
                        "email_status": "nao_verificado",
                        "fonte": "hunter",
                        "fonte_url": ch.get("fonte_url"),
                        "confianca": ch.get("confianca", 70)
                    })

        # 5. Busca contatos existentes da escola para consolidar e evitar duplicações
        res_contatos_existentes = requests.get(
            f"{url}/rest/v1/contatos?escola_id=eq.{esc['id']}", headers=headers, timeout=15
        )
        contatos_existentes = res_contatos_existentes.json() if res_contatos_existentes.status_code == 200 else []

        # Hunter Email Finder para contatos existentes sem e-mail
        for ce in contatos_existentes:
            if not ce.get("email") and ce.get("nome") and dominio_atual:
                cargo_c = (ce.get("cargo") or "").lower()
                tipo_c = (ce.get("tipo") or "").lower()
                if any(x in cargo_c or x in tipo_c for x in ["diretor", "mantenedor", "coordenador"]):
                    found_email, h_url, score, creditos_ef = hunter_email_finder(ce["nome"], dominio_atual)
                    if creditos_ef > 0:
                        custo_ef = creditos_ef * DEFAULT_PRICE_HUNTER_CREDIT
                        custo_escola_usd += custo_ef
                        if not dry_run:
                            registrar_custo(url, key, esc["id"], "hunter_email_finder", creditos_ef, custo_ef, execucao_id)
                        if found_email:
                            ce["email"] = found_email
                            ce["fonte"] = "hunter"
                            ce["confianca"] = score

        # Consolida e deduplica contatos
        contatos_consolidados = consolidar_contatos(contatos_existentes, novos_contatos)
        # Seleciona o contato principal baseado na prioridade pedagógica
        contatos_finais = selecionar_contato_principal(contatos_consolidados)

        # 6. Gravações no Supabase
        patch_escola["site_verificado_em"] = datetime.now(timezone.utc).isoformat()
        if not dry_run:
            # Atualiza escola
            patch_url = f"{url}/rest/v1/escolas?id=eq.{esc['id']}"
            patch_headers = {
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json"
            }
            requests.patch(patch_url, headers=patch_headers, json=patch_escola, timeout=15)

            # Para contatos com ID já existente: PATCH
            # Para novos contatos sem ID: POST
            for c in contatos_finais:
                c_payload = {
                    "escola_id": esc["id"],
                    "nome": c.get("nome"),
                    "cargo": c.get("cargo"),
                    "tipo": c.get("tipo"),
                    "email": c.get("email"),
                    "email_status": c.get("email_status", "nao_verificado"),
                    "telefone": c.get("telefone"),
                    "fonte": c.get("fonte", "site"),
                    "fonte_url": c.get("fonte_url"),
                    "evidencia": c.get("evidencia"),
                    "confianca": c.get("confianca"),
                    "principal": c.get("principal", False)
                }

                if c.get("id"):
                    # Atualiza existente
                    requests.patch(
                        f"{url}/rest/v1/contatos?id=eq.{c['id']}",
                        headers=patch_headers, json=c_payload, timeout=10
                    )
                else:
                    # Insere novo
                    requests.post(
                        f"{url}/rest/v1/contatos",
                        headers=patch_headers, json=c_payload, timeout=10
                    )

        # Atualiza métricas
        contatos_com_email_esc = sum(1 for c in contatos_finais if c.get("email"))
        resumo["contatos_identificados"] += len(contatos_finais)
        resumo["contatos_com_email"] += contatos_com_email_esc
        resumo["custo_total_usd"] += custo_escola_usd

        resumo["linhas_tabela"].append({
            "escola": nome_escola,
            "site": site_atual or "Não encontrado",
            "contatos": [
                {
                    "nome": c.get("nome"),
                    "cargo": c.get("cargo"),
                    "fonte": c.get("fonte"),
                    "tem_email": bool(c.get("email")),
                    "principal": c.get("principal", False)
                }
                for c in contatos_finais
            ],
            "custo_usd": custo_escola_usd
        })

    # Finaliza registro da execução
    msg_final = (
        f"Descoberta de decisores finalizada: {len(escolas)} escolas processadas, "
        f"{resumo['com_site_encontrado']} com site, {resumo['contatos_identificados']} contatos totais, "
        f"{resumo['contatos_com_email']} com e-mail. Custo total estimado: ${resumo['custo_total_usd']:.4f} USD."
    )
    logging.info(f"=== RESUMO: {msg_final} ===")

    if not dry_run and execucao_id and registrar_execucao:
        patch_exec = {
            "finalizado_em": datetime.now(timezone.utc).isoformat(),
            "status": "sucesso",
            "leads_encontrados": resumo["com_site_encontrado"],
            "leads_inseridos": resumo["contatos_identificados"],
            "mensagem": msg_final
        }
        patch_headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }
        requests.patch(f"{url}/rest/v1/agente_execucoes?id=eq.{execucao_id}", headers=patch_headers, json=patch_exec, timeout=10)

    return resumo

def main():
    parser = argparse.ArgumentParser(description="Descoberta de Decisores no Site Oficial com Claude")
    parser.add_argument("--limite", type=int, default=40, help="Quantidade de escolas a processar (padrão: 40)")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem gravar no Supabase")
    parser.add_argument("--reprocessar", action="store_true", help="Reprocessa escolas mesmo se site_verificado_em já estiver preenchido")
    args = parser.parse_args()

    resumo = processar_decisores_escolas(limite=args.limite, dry_run=args.dry_run, reprocessar=args.reprocessar)

    print("\n" + "="*80)
    print("TABELA DE RESULTADOS — DESCOBERTA DE DECISORES")
    print("="*80)
    print(f"{'Escola':<32} | {'Site':<25} | {'Contatos Achados':<25} | {'Custo (USD)'}")
    print("-" * 95)
    for linha in resumo["linhas_tabela"]:
        esc_str = (linha["escola"][:30] + "..") if len(linha["escola"]) > 32 else linha["escola"]
        site_str = (linha["site"][:23] + "..") if len(linha["site"]) > 25 else linha["site"]
        
        contatos_desc = []
        for c in linha["contatos"]:
            p_flag = " [PRINCIPAL]" if c.get("principal") else ""
            contatos_desc.append(f"{c['nome']} ({c['cargo']} | {c['fonte']}{p_flag} | Email: {c['tem_email']})")
        
        c_str = "; ".join(contatos_desc) if contatos_desc else "Nenhum"
        print(f"{esc_str:<32} | {site_str:<25} | {c_str:<45} | ${linha['custo_usd']:.4f}")

    print("="*80)
    print(f"Total de Escolas: {resumo['escolas_processadas']}")
    print(f"Com Site Encontrado: {resumo['com_site_encontrado']}")
    print(f"Páginas Rastreadas: {resumo['paginas_rastreadas']}")
    print(f"Contatos Totais: {resumo['contatos_identificados']}")
    print(f"Contatos com E-mail: {resumo['contatos_com_email']}")
    print(f"Custo Total Estimado: ${resumo['custo_total_usd']:.4f} USD")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
