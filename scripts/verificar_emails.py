#!/usr/bin/env python3
"""
Orquestrador de Verificação de E-mails com Cache de 90 Dias e Provedores Trocáveis.
Processa:
1. contatos.email com status 'nao_verificado' ou verificado há mais de 90 dias
2. escolas.email_geral com status 'nao_verificado' ou verificado há mais de 90 dias

Utiliza a tabela verificacoes_email como cache durável para não gastar créditos à toa.
Registra custos de API em custos_agente.
"""

import os
import sys
import logging
import argparse
import urllib.parse
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import get_supabase_credentials
from scripts.lib.verificador_email import verificar, CreditosEsgotadosError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


def parse_args():
    parser = argparse.ArgumentParser(description="Verificador de e-mails de contatos e escolas.")
    parser.add_argument("--limite", type=int, default=200, help="Limite máximo de e-mails a processar nesta rodada (padrão 200).")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem persistir alterações no banco de dados.")
    parser.add_argument("--reverificar", action="store_true", help="Ignora a janela de 90 dias e força verificação.")
    return parser.parse_args()


def consultar_cache_verificacao(url: str, key: str, email: str, dias_validade: int = 90) -> Optional[Dict[str, Any]]:
    """Consulta o cache na tabela verificacoes_email. Retorna se verificado nos últimos dias_validade."""
    endpoint = f"{url}/rest/v1/verificacoes_email"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    limite_dt = (datetime.now(timezone.utc) - timedelta(days=dias_validade)).strftime("%Y-%m-%dT%H:%M:%SZ")
    params = {
        "email": f"eq.{email.lower().strip()}",
        "verificado_em": f"gte.{limite_dt}",
        "select": "email,status,sub_status,provedor,resposta,verificado_em"
    }
    try:
        resp = requests.get(endpoint, headers=headers, params=params, timeout=10)
        if resp.status_code == 200 and resp.json():
            return resp.json()[0]
    except Exception as ex:
        logging.warning(f"Erro ao consultar cache de verificação de {email}: {ex}")
    return None


def salvar_cache_verificacao(
    url: str,
    key: str,
    email: str,
    status: str,
    sub_status: Optional[str],
    provedor: str,
    resposta: Optional[Dict[str, Any]],
    verificado_em: Optional[datetime] = None
) -> bool:
    """Salva ou atualiza o resultado no cache verificacoes_email."""
    endpoint = f"{url}/rest/v1/verificacoes_email"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    payload = {
        "email": email.lower().strip(),
        "status": status,
        "sub_status": sub_status,
        "provedor": provedor,
        "resposta": resposta or {},
        "verificado_em": (verificado_em or datetime.now(timezone.utc)).isoformat()
    }
    try:
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=10)
        return resp.status_code in (200, 201)
    except Exception as ex:
        logging.warning(f"Erro ao salvar cache de verificação para {email}: {ex}")
        return False


def registrar_custo(
    url: str,
    key: str,
    escola_id: Optional[str],
    servico: str,
    unidades: int,
    custo_usd: float,
    execucao_id: Optional[str] = None
) -> None:
    """Registra custo unitário na tabela custos_agente."""
    if custo_usd <= 0:
        return
    endpoint = f"{url}/rest/v1/custos_agente"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "escola_id": escola_id,
        "execucao_id": execucao_id,
        "servico": servico,
        "unidades": unidades,
        "custo_estimado_usd": custo_usd
    }
    try:
        requests.post(endpoint, headers=headers, json=payload, timeout=10)
    except Exception as ex:
        logging.warning(f"Erro ao registrar custo de verificação em custos_agente: {ex}")


def registrar_agente_execucao(
    url: str,
    key: str,
    status: str,
    leads_encontrados: int,
    leads_inseridos: int,
    mensagem: str,
    iniciado_em: datetime
) -> Optional[str]:
    """Registra execução em agente_execucoes."""
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
        logging.warning(f"Erro ao registrar agente_execucoes: {ex}")
    return None


def buscar_emails_pendentes(
    url: str,
    key: str,
    limite: int,
    reverificar: bool = False
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Busca e-mails que necessitam de verificação:
    1. contatos (email não nulo, status 'nao_verificado' ou verificado_em < 90 dias)
    2. escolas (email_geral não nulo, status 'nao_verificado' ou verificado_em < 90 dias)
    """
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    limite_90d = urllib.parse.quote((datetime.now(timezone.utc) - timedelta(days=90)).strftime("%Y-%m-%dT%H:%M:%SZ"))

    # Contatos
    if reverificar:
        query_contatos = f"{url}/rest/v1/contatos?email=not.is.null&limit={limite}"
    else:
        query_contatos = (
            f"{url}/rest/v1/contatos"
            f"?email=not.is.null"
            f"&or=(email_status.eq.nao_verificado,email_verificado_em.is.null,email_verificado_em.lt.{limite_90d})"
            f"&limit={limite}"
        )
    resp_c = requests.get(query_contatos, headers=headers, timeout=20)
    contatos = resp_c.json() if resp_c.status_code == 200 else []

    # Escolas
    limite_restante = max(1, limite - len(contatos))
    if reverificar:
        query_escolas = f"{url}/rest/v1/escolas?email_geral=not.is.null&limit={limite_restante}"
    else:
        query_escolas = (
            f"{url}/rest/v1/escolas"
            f"?email_geral=not.is.null"
            f"&or=(email_geral_status.eq.nao_verificado,email_geral_verificado_em.is.null,email_geral_verificado_em.lt.{limite_90d})"
            f"&limit={limite_restante}"
        )
    resp_e = requests.get(query_escolas, headers=headers, timeout=20)
    escolas = resp_e.json() if resp_e.status_code == 200 else []

    return contatos, escolas


def verificar_emails_pendentes(
    limite: int = 200,
    dry_run: bool = False,
    reverificar: bool = False,
    execucao_id: Optional[str] = None,
    registrar_execucao: bool = True
) -> Dict[str, Any]:
    iniciado_em = datetime.now(timezone.utc)
    url, key = get_supabase_credentials()
    logging.info(f"Iniciando verificação de e-mails (limite={limite}, dry_run={dry_run})...")

    contatos, escolas = buscar_emails_pendentes(url, key, limite, reverificar=reverificar)
    total_pendentes = len(contatos) + len(escolas)
    logging.info(f"Encontrados: {len(contatos)} contatos e {len(escolas)} escolas com e-mail pendente de verificação.")

    stats = {
        "valido": 0,
        "invalido": 0,
        "arriscado": 0,
        "catch_all": 0,
        "desconhecido": 0,
        "cache": 0,
        "novas_verificacoes": 0,
        "custo_total_usd": 0.0,
        "total_processados": total_pendentes
    }

    rotina_exec_id = None
    if not dry_run and registrar_execucao:
        try:
            headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json", "Prefer": "return=representation"}
            r_resp = requests.post(f"{url}/rest/v1/rotinas_execucoes", headers=headers, json={
                "rotina": "verificacao_email",
                "status": "rodando",
                "iniciado_em": iniciado_em.isoformat(),
                "resumo": {"limite": limite, "pendentes": total_pendentes}
            }, timeout=10)
            if r_resp.status_code in (200, 201) and r_resp.json():
                rotina_exec_id = r_resp.json()[0]["id"]
        except Exception as ex_rot:
            logging.warning(f"Erro ao registrar início de verificacao_email em rotinas_execucoes: {ex_rot}")

    if total_pendentes == 0:
        logging.info("Nenhum e-mail pendente de verificação. Tudo atualizado nos últimos 90 dias.")
        return stats

    if not dry_run and registrar_execucao and not execucao_id:
        execucao_id = registrar_agente_execucao(
            url, key, "rodando", total_pendentes, 0, "Iniciando verificação de e-mails", iniciado_em
        )

    headers_patch = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }

    try:
        # 1. Processar Contatos
        for idx, c in enumerate(contatos, start=1):
            email = c["email"].strip().lower()
            escola_id = c.get("escola_id")
            logging.info(f"[{idx}/{total_pendentes}] (Contato) Verificando: {email}...")

            cached = None if reverificar else consultar_cache_verificacao(url, key, email, dias_validade=90)
            if cached:
                status = cached["status"]
                sub_status = cached.get("sub_status")
                custo = 0.0
                stats["cache"] += 1
                logging.info(f"  -> Cache hit ({cached.get('provedor', 'cache')}): status={status}")
            else:
                res = verificar(email)
                status = res["status"]
                sub_status = res.get("sub_status")
                custo = res.get("custo_usd", 0.0)
                stats["novas_verificacoes"] += 1
                stats["custo_total_usd"] += custo

                if not dry_run:
                    salvar_cache_verificacao(url, key, email, status, sub_status, res.get("provedor", "desconhecido"), res.get("bruto"))
                    if custo > 0:
                        registrar_custo(url, key, escola_id, f"verificacao_{res.get('provedor')}", 1, custo, execucao_id)

                logging.info(f"  -> Verificado ({res.get('provedor')}): status={status} (sub={sub_status}) custo=${custo:.4f}")

            stats[status] = stats.get(status, 0) + 1

            if not dry_run:
                patch_url = f"{url}/rest/v1/contatos?id=eq.{c['id']}"
                patch_payload = {
                    "email_status": status,
                    "email_verificado_em": datetime.now(timezone.utc).isoformat()
                }
                requests.patch(patch_url, headers=headers_patch, json=patch_payload, timeout=10)

        # 2. Processar Escolas (email_geral)
        offset = len(contatos)
        for idx, e in enumerate(escolas, start=offset + 1):
            email = e["email_geral"].strip().lower()
            escola_id = e["id"]
            logging.info(f"[{idx}/{total_pendentes}] (Escola) Verificando email_geral: {email}...")

            cached = None if reverificar else consultar_cache_verificacao(url, key, email, dias_validade=90)
            if cached:
                status = cached["status"]
                sub_status = cached.get("sub_status")
                custo = 0.0
                stats["cache"] += 1
                logging.info(f"  -> Cache hit ({cached.get('provedor', 'cache')}): status={status}")
            else:
                res = verificar(email)
                status = res["status"]
                sub_status = res.get("sub_status")
                custo = res.get("custo_usd", 0.0)
                stats["novas_verificacoes"] += 1
                stats["custo_total_usd"] += custo

                if not dry_run:
                    salvar_cache_verificacao(url, key, email, status, sub_status, res.get("provedor", "desconhecido"), res.get("bruto"))
                    if custo > 0:
                        registrar_custo(url, key, escola_id, f"verificacao_{res.get('provedor')}", 1, custo, execucao_id)

                logging.info(f"  -> Verificado ({res.get('provedor')}): status={status} (sub={sub_status}) custo=${custo:.4f}")

            stats[status] = stats.get(status, 0) + 1

            if not dry_run:
                patch_url = f"{url}/rest/v1/escolas?id=eq.{e['id']}"
                patch_payload = {
                    "email_geral_status": status,
                    "email_geral_verificado_em": datetime.now(timezone.utc).isoformat()
                }
                requests.patch(patch_url, headers=headers_patch, json=patch_payload, timeout=10)

        msg_sucesso = (
            f"Verificação concluída: {total_pendentes} processados "
            f"({stats['cache']} cache, {stats['novas_verificacoes']} novas). "
            f"Status: {stats['valido']} validos, {stats['invalido']} invalidos, "
            f"{stats['arriscado']} arriscados, {stats['catch_all']} catch_all, "
            f"{stats['desconhecido']} desconhecidos. Custo: ${stats['custo_total_usd']:.4f} USD."
        )
        logging.info(msg_sucesso)

        if not dry_run and execucao_id and registrar_execucao:
            registrar_agente_execucao(
                url, key, "sucesso", total_pendentes, total_pendentes, msg_sucesso, iniciado_em
            )

        if not dry_run and rotina_exec_id:
            try:
                headers = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}
                requests.patch(f"{url}/rest/v1/rotinas_execucoes?id=eq.{rotina_exec_id}", headers=headers, json={
                    "finalizado_em": datetime.now(timezone.utc).isoformat(),
                    "status": "sucesso",
                    "resumo": stats
                }, timeout=10)
            except Exception as ex_patch:
                logging.warning(f"Erro ao finalizar rotinas_execucoes: {ex_patch}")

        return stats

    except CreditosEsgotadosError as ex:
        err_msg = f"INTERRUPÇÃO CRÍTICA: {ex}"
        logging.error(err_msg)
        if not dry_run and execucao_id and registrar_execucao:
            registrar_agente_execucao(
                url, key, "erro", total_pendentes, 0, err_msg, iniciado_em
            )
        raise
    except Exception as ex:
        err_msg = f"Erro inesperado durante verificação de e-mails: {ex}"
        logging.error(err_msg)
        if not dry_run and execucao_id and registrar_execucao:
            registrar_agente_execucao(
                url, key, "erro", total_pendentes, 0, err_msg, iniciado_em
            )
        raise


def main():
    args = parse_args()
    try:
        stats = verificar_emails_pendentes(
            limite=args.limite,
            dry_run=args.dry_run,
            reverificar=args.reverificar
        )
    except Exception as ex:
        logging.error(f"Falha na execução: {ex}")
        sys.exit(1)

    print("\n" + "=" * 65)
    print("RESUMO DA VERIFICAÇÃO DE E-MAILS")
    print("=" * 65)
    print(f"Total de E-mails Analisados: {stats.get('total_processados', 0)}")
    print(f"  - Reutilizados do Cache (<= 90 dias): {stats['cache']}")
    print(f"  - Novas Consultas Realizadas:        {stats['novas_verificacoes']}")
    print("-" * 65)
    print("DISTRIBUIÇÃO DE STATUS:")
    print(f"  - Válidos:      {stats['valido']:>4}")
    print(f"  - Inválidos:    {stats['invalido']:>4}")
    print(f"  - Arriscados:   {stats['arriscado']:>4}")
    print(f"  - Catch-all:    {stats['catch_all']:>4}")
    print(f"  - Desconhecidos:{stats['desconhecido']:>4}")
    print("-" * 65)
    print(f"Custo Total Estimado: ${stats['custo_total_usd']:.4f} USD")
    print("=" * 65 + "\n")

    print("\n" + "=" * 65)
    print("RESUMO DA VERIFICAÇÃO DE E-MAILS")
    print("=" * 65)
    print(f"Total de E-mails Analisados: {total_pendentes}")
    print(f"  - Reutilizados do Cache (<= 90 dias): {stats['cache']}")
    print(f"  - Novas Consultas Realizadas:        {stats['novas_verificacoes']}")
    print("-" * 65)
    print("DISTRIBUIÇÃO DE STATUS:")
    print(f"  - Válidos:      {stats['valido']:>4}")
    print(f"  - Inválidos:    {stats['invalido']:>4}")
    print(f"  - Arriscados:   {stats['arriscado']:>4}")
    print(f"  - Catch-all:    {stats['catch_all']:>4}")
    print(f"  - Desconhecidos:{stats['desconhecido']:>4}")
    print("-" * 65)
    print(f"Custo Total Estimado: ${stats['custo_total_usd']:.4f} USD")
    print("=" * 65 + "\n")


if __name__ == "__main__":
    main()
