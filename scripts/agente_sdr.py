#!/usr/bin/env python3
"""
Orquestrador Diário do Agente SDR — CRM Littera
Executa o funil completo para entregar a meta de 20 escolas qualificadas por dia:
1. Cria registro de execução em agente_execucoes e rastreia etapa_atual.
2. Idempotência estrita: se lote de hoje já foi entregue, encerra a não ser que receba --forcar.
3. Laço de abastecimento (enriquecimento CNPJ, descoberta de decisores, verificação de e-mails)
   até atingir META_DIARIA qualificadas, esgotar base ou atingir MAX_CUSTO_DIARIO_USD.
4. Pesquisa de personalização com Claude para os leads entregues (resumo e gancho com fontes validadas).
5. Entrega ordenada por score desc e matrículas desc, gravando entregue_em, entregue_lote_id e lotes_diarios.
6. Alerta de dias restantes de base para prospecção.
7. Finalização resiliente com status 'sucesso' ou 'erro' (sem nunca deixar preso em 'rodando').
"""

import os
import sys
import json
import logging
import argparse
import traceback
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple
import requests

ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import get_supabase_credentials, load_env_local_if_needed

load_env_local_if_needed()

from scripts.enriquecer_cnpj import enriquecer_escolas
from scripts.descobrir_decisores import processar_decisores_escolas
from scripts.verificar_emails import verificar_emails_pendentes
from scripts.lib.personalizador import gerar_pesquisa_personalizacao

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

TIMEZONE_SP = ZoneInfo("America/Sao_Paulo")
DEFAULT_META_DIARIA = int(os.getenv("META_DIARIA", "20"))
DEFAULT_MAX_CUSTO_USD = float(os.getenv("MAX_CUSTO_DIARIO_USD", "5.0"))


def data_hoje_sao_paulo() -> str:
    """Retorna data no fuso de São Paulo (YYYY-MM-DD)."""
    return datetime.now(TIMEZONE_SP).date().isoformat()


def registrar_custo(
    url: str,
    key: str,
    escola_id: str,
    servico: str,
    unidades: float,
    custo_usd: float,
    execucao_id: Optional[str] = None
):
    """Registra custo na tabela custos_agente."""
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
        logging.warning(f"Erro ao registrar custo ({servico}): {ex}")


def criar_agente_execucao(
    url: str,
    key: str,
    gatilho: str,
    etapa_inicial: str = "Iniciando agente SDR"
) -> str:
    """Cria a linha inicial de execução em agente_execucoes."""
    endpoint = f"{url}/rest/v1/agente_execucoes"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    payload = {
        "iniciado_em": datetime.now(timezone.utc).isoformat(),
        "status": "rodando",
        "etapa_atual": etapa_inicial,
        "gatilho": gatilho,
        "leads_encontrados": 0,
        "leads_inseridos": 0,
        "custo_total_usd": 0.0,
        "detalhes": {}
    }
    resp = requests.post(endpoint, headers=headers, json=payload, timeout=15)
    if resp.status_code not in (200, 201) or not resp.json():
        raise RuntimeError(f"Erro ao criar execução em agente_execucoes ({resp.status_code}): {resp.text}")
    return resp.json()[0]["id"]


def atualizar_etapa_execucao(
    url: str,
    key: str,
    execucao_id: str,
    etapa: str,
    detalhes: Optional[Dict[str, Any]] = None
):
    """Atualiza a etapa atual da execução para visibilidade em tempo real."""
    endpoint = f"{url}/rest/v1/agente_execucoes?id=eq.{execucao_id}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload: Dict[str, Any] = {"etapa_atual": etapa}
    if detalhes is not None:
        payload["detalhes"] = detalhes
    try:
        requests.patch(endpoint, headers=headers, json=payload, timeout=10)
    except Exception as ex:
        logging.warning(f"Erro ao atualizar etapa_atual: {ex}")


def obter_custo_acumulado(url: str, key: str, execucao_id: str) -> float:
    """Soma o custo em USD acumulado na tabela custos_agente para a execução atual."""
    endpoint = f"{url}/rest/v1/custos_agente?execucao_id=eq.{execucao_id}&select=custo_estimado_usd"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    try:
        resp = requests.get(endpoint, headers=headers, timeout=10)
        if resp.status_code == 200:
            linhas = resp.json()
            return sum(float(l.get("custo_estimado_usd") or 0.0) for l in linhas)
    except Exception as ex:
        logging.warning(f"Erro ao calcular custos acumulados da execução {execucao_id}: {ex}")
    return 0.0


def consultar_lote_hoje(url: str, key: str, data_str: str) -> Optional[Dict[str, Any]]:
    """Consulta se já existe lote gerado para a data especificada."""
    endpoint = f"{url}/rest/v1/lotes_diarios?data=eq.{data_str}&select=*"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    try:
        resp = requests.get(endpoint, headers=headers, timeout=10)
        if resp.status_code == 200:
            itens = resp.json()
            if itens and len(itens) > 0:
                return itens[0]
    except Exception as ex:
        logging.warning(f"Erro ao consultar lotes_diarios para {data_str}: {ex}")
    return None


def contar_qualificadas_disponiveis(url: str, key: str) -> int:
    """Retorna a contagem de escolas qualificadas, ainda não entregues e com status 'novo'."""
    endpoint = (
        f"{url}/rest/v1/escolas"
        f"?status_qualificacao=eq.qualificado&entregue_em=is.null&status_funil=eq.novo"
        f"&select=count"
    )
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Range-Unit": "items",
        "Prefer": "count=exact"
    }
    try:
        resp = requests.get(endpoint, headers=headers, timeout=10)
        cr = resp.headers.get("content-range")
        if cr and "/" in cr:
            total_str = cr.split("/")[1]
            if total_str.isdigit():
                return int(total_str)
    except Exception as ex:
        logging.warning(f"Erro ao contar qualificadas disponíveis: {ex}")
    return 0


def contar_potencial_restante(url: str, key: str) -> Dict[str, int]:
    """Calcula quantidade de escolas em bruto, enriquecido sem site e qualificadas não entregues."""
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Range-Unit": "items",
        "Prefer": "count=exact"
    }
    res: Dict[str, int] = {
        "bruto": 0,
        "enriquecido_sem_site": 0,
        "qualificadas_nao_entregues": 0
    }

    try:
        r_b = requests.get(f"{url}/rest/v1/escolas?status_qualificacao=eq.bruto&select=count", headers=headers, timeout=10)
        cr_b = r_b.headers.get("content-range")
        if cr_b and "/" in cr_b and cr_b.split("/")[1].isdigit():
            res["bruto"] = int(cr_b.split("/")[1])

        r_e = requests.get(f"{url}/rest/v1/escolas?status_qualificacao=eq.enriquecido&site_verificado_em=is.null&select=count", headers=headers, timeout=10)
        cr_e = r_e.headers.get("content-range")
        if cr_e and "/" in cr_e and cr_e.split("/")[1].isdigit():
            res["enriquecido_sem_site"] = int(cr_e.split("/")[1])

        r_q = requests.get(f"{url}/rest/v1/escolas?status_qualificacao=eq.qualificado&entregue_em=is.null&status_funil=eq.novo&select=count", headers=headers, timeout=10)
        cr_q = r_q.headers.get("content-range")
        if cr_q and "/" in cr_q and cr_q.split("/")[1].isdigit():
            res["qualificadas_nao_entregues"] = int(cr_q.split("/")[1])

    except Exception as ex:
        logging.warning(f"Erro ao calcular potencial restante: {ex}")

    return res


def buscar_melhores_qualificadas(url: str, key: str, limite: int) -> List[Dict[str, Any]]:
    """Busca as melhores escolas qualificadas por score desc e matriculas_em desc."""
    endpoint = (
        f"{url}/rest/v1/escolas"
        f"?status_qualificacao=eq.qualificado&entregue_em=is.null&status_funil=eq.novo"
        f"&order=score.desc.nullslast,matriculas_em.desc.nullslast"
        f"&limit={limite}"
        f"&select=*,contatos(*)"
    )
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json"
    }
    resp = requests.get(endpoint, headers=headers, timeout=20)
    if resp.status_code == 200:
        return resp.json()
    raise RuntimeError(f"Erro ao buscar escolas qualificadas ({resp.status_code}): {resp.text}")


def salvar_lote_diario(
    url: str,
    key: str,
    data_str: str,
    execucao_id: str,
    quantidade: int,
    motivo_incompleto: Optional[str]
) -> str:
    """Insere ou atualiza o registro do lote diário na tabela lotes_diarios."""
    endpoint = f"{url}/rest/v1/lotes_diarios?on_conflict=data"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }
    payload = {
        "data": data_str,
        "execucao_id": execucao_id,
        "quantidade": quantidade,
        "motivo_incompleto": motivo_incompleto
    }
    resp = requests.post(endpoint, headers=headers, json=[payload], timeout=15)
    if resp.status_code in (200, 201) and resp.json():
        return resp.json()[0]["id"]
    raise RuntimeError(f"Erro ao gravar lote diário no Supabase: {resp.text}")


def finalizar_execucao(
    url: str,
    key: str,
    execucao_id: str,
    status: str,
    mensagem: str,
    etapa_atual: str,
    leads_entregues: int,
    custo_total: float,
    detalhes: Dict[str, Any]
):
    """Atualiza o registro em agente_execucoes com status final e custos."""
    endpoint = f"{url}/rest/v1/agente_execucoes?id=eq.{execucao_id}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json"
    }
    payload = {
        "finalizado_em": datetime.now(timezone.utc).isoformat(),
        "status": status,
        "etapa_atual": etapa_atual,
        "leads_encontrados": leads_entregues,
        "leads_inseridos": leads_entregues,
        "mensagem": mensagem,
        "custo_total_usd": round(custo_total, 4),
        "detalhes": detalhes
    }
    try:
        requests.patch(endpoint, headers=headers, json=payload, timeout=15)
    except Exception as ex:
        logging.warning(f"Erro ao finalizar registro de execução: {ex}")


def executar_agente_sdr(
    gatilho: str = "manual",
    forcar: bool = False,
    meta_diaria: Optional[int] = None,
    max_custo_usd: Optional[float] = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    Função principal que orquestra todo o fluxo do Agente SDR Diário.
    """
    meta = meta_diaria or DEFAULT_META_DIARIA
    teto_custo = max_custo_usd or DEFAULT_MAX_CUSTO_USD
    hoje = data_hoje_sao_paulo()
    iniciado_em = datetime.now(timezone.utc)

    url, key = get_supabase_credentials()

    # a) Cria registro inicial na tabela agente_execucoes
    execucao_id = None
    if not dry_run:
        execucao_id = criar_agente_execucao(url, key, gatilho, etapa_inicial="Verificação de Idempotência")

    logging.info(f"=== INICIANDO AGENTE SDR DIÁRIO (Execução ID: {execucao_id}) ===")
    logging.info(f"Data de referência: {hoje} (America/Sao_Paulo) | Gatilho: {gatilho} | Forçar: {forcar} | Meta: {meta} | Teto Custo: ${teto_custo} USD")

    try:
        # b) Idempotência: verifica se o lote de hoje já foi entregue
        lote_existente = consultar_lote_hoje(url, key, hoje)
        if lote_existente and not forcar:
            msg_idempotente = f"Lote de hoje ({hoje}) já entregue ({lote_existente.get('quantidade', 0)} leads)."
            logging.info(msg_idempotente)
            if not dry_run and execucao_id:
                finalizar_execucao(
                    url=url,
                    key=key,
                    execucao_id=execucao_id,
                    status="sucesso",
                    mensagem="Lote de hoje já entregue",
                    etapa_atual="Finalizado (Idempotente)",
                    leads_entregues=lote_existente.get("quantidade", 0),
                    custo_total=0.0,
                    detalhes={"lote_id": lote_existente.get("id"), "idempotente": True}
                )
            return {
                "sucesso": True,
                "execucao_id": execucao_id,
                "mensagem": "Lote de hoje já entregue",
                "leads_entregues": lote_existente.get("quantidade", 0),
                "custo_total_usd": 0.0,
                "escolas_entregues": []
            }

        # c) & d) Laço de abastecimento
        motivo_incompleto: Optional[str] = None
        rodada = 1
        max_rodadas = 6

        while rodada <= max_rodadas:
            qualificadas_atuais = contar_qualificadas_disponiveis(url, key)
            custo_atual = obter_custo_acumulado(url, key, execucao_id) if execucao_id else 0.0

            logging.info(f"[Rodada {rodada}] Qualificadas prontas: {qualificadas_atuais}/{meta} | Custo acumulado: ${custo_atual:.4f}/${teto_custo}")

            if qualificadas_atuais >= meta:
                logging.info(f"Meta de {meta} escolas qualificadas atingida!")
                break

            if custo_atual >= teto_custo:
                motivo_incompleto = "teto_custo"
                logging.warning(f"Teto diário de custo atingido (${custo_atual:.4f} >= ${teto_custo}). Encerrando abastecimento.")
                break

            # 1. Enriquecer próximo bloco de escolas 'bruto'
            atualizar_etapa_execucao(url, key, execucao_id, f"Enriquecimento CNPJ (Rodada {rodada})")
            stats_enriquecer = enriquecer_escolas(
                limite=15,
                dry_run=dry_run,
                reprocessar=False,
                execucao_id=execucao_id,
                registrar_execucao=False
            )

            # Checa teto de custo
            custo_pos_enriq = obter_custo_acumulado(url, key, execucao_id) if execucao_id else 0.0
            if custo_pos_enriq >= teto_custo:
                motivo_incompleto = "teto_custo"
                break

            # 2. Descoberta de decisores para escolas 'enriquecido' sem site_verificado_em
            atualizar_etapa_execucao(url, key, execucao_id, f"Descoberta de Decisores (Rodada {rodada})")
            stats_decisores = processar_decisores_escolas(
                limite=10,
                dry_run=dry_run,
                reprocessar=False,
                execucao_id=execucao_id,
                registrar_execucao=False
            )

            # Checa teto de custo
            custo_pos_dec = obter_custo_acumulado(url, key, execucao_id) if execucao_id else 0.0
            if custo_pos_dec >= teto_custo:
                motivo_incompleto = "teto_custo"
                break

            # 3. Verificação de e-mails novos
            atualizar_etapa_execucao(url, key, execucao_id, f"Verificação de E-mails (Rodada {rodada})")
            stats_emails = verificar_emails_pendentes(
                limite=50,
                dry_run=dry_run,
                reverificar=False,
                execucao_id=execucao_id,
                registrar_execucao=False
            )

            # Verifica se o estoque da base se esgotou sem conseguir mais avanços
            consultadas_cnpj = stats_enriquecer.get("consultadas", 0)
            processadas_dec = stats_decisores.get("escolas_processadas", 0)
            processados_email = stats_emails.get("total_processados", 0)

            if consultadas_cnpj == 0 and processadas_dec == 0 and processados_email == 0:
                logging.info("Não há mais escolas brutas, nem sites a verificar, nem e-mails novos pendentes.")
                qualificadas_atuais = contar_qualificadas_disponiveis(url, key)
                if qualificadas_atuais < meta:
                    motivo_incompleto = "base_esgotada"
                break

            rodada += 1

        # Recontagem final de qualificadas disponíveis
        qualificadas_disponiveis = contar_qualificadas_disponiveis(url, key)
        qtd_entregar = min(meta, qualificadas_disponiveis)

        if qtd_entregar < meta and not motivo_incompleto:
            motivo_incompleto = "base_esgotada"

        logging.info(f"Seleção para entrega: {qtd_entregar} de {meta} solicitadas (Motivo se incompleto: {motivo_incompleto})")

        # Busca as melhores escolas para entrega
        escolas_para_entrega: List[Dict[str, Any]] = []
        if qtd_entregar > 0:
            escolas_para_entrega = buscar_melhores_qualificadas(url, key, qtd_entregar)

        # e) Pesquisa de personalização com Claude para os leads entregues
        atualizar_etapa_execucao(url, key, execucao_id, "Pesquisa de Personalização")
        escolas_entregues_relatorio = []

        # Cria ou atualiza o lote diário
        lote_id = None
        if not dry_run:
            lote_id = salvar_lote_diario(
                url=url,
                key=key,
                data_str=hoje,
                execucao_id=execucao_id,
                quantidade=len(escolas_para_entrega),
                motivo_incompleto=motivo_incompleto
            )

        atualizar_etapa_execucao(url, key, execucao_id, "Entrega do Lote Diário")

        patch_headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json"
        }

        for idx, esc in enumerate(escolas_para_entrega, start=1):
            logging.info(f"Personalizando lead [{idx}/{len(escolas_para_entrega)}]: {esc.get('nome')} (Score: {esc.get('score')})")
            
            # Gera personalização validada
            pers = gerar_pesquisa_personalizacao(esc)
            
            custo_p = pers.get("custo_usd", 0.0)
            if custo_p > 0 and not dry_run:
                tokens_totais = pers.get("tokens_input", 0) + pers.get("tokens_output", 0)
                registrar_custo(url, key, esc["id"], "claude_personalizacao", tokens_totais, custo_p, execucao_id)

            resumo_txt = pers.get("resumo_pesquisa")
            gancho_txt = pers.get("gancho_personalizacao")
            fontes_list = pers.get("fontes_pesquisa") or []

            if not dry_run:
                patch_payload = {
                    "entregue_em": hoje,
                    "entregue_lote_id": lote_id,
                    "resumo_pesquisa": resumo_txt,
                    "gancho_personalizacao": gancho_txt,
                    "fontes_pesquisa": fontes_list
                }
                requests.patch(f"{url}/rest/v1/escolas?id=eq.{esc['id']}", headers=patch_headers, json=patch_payload, timeout=10)

            # Contato principal para relatório
            contatos = esc.get("contatos") or []
            contato_principal = next((c for c in contatos if c.get("principal")), (contatos[0] if contatos else None))

            escolas_entregues_relatorio.append({
                "id": esc.get("id"),
                "nome": esc.get("nome"),
                "score": esc.get("score"),
                "matriculas_em": esc.get("matriculas_em"),
                "contato_nome": contato_principal.get("nome") if contato_principal else "Sem contato",
                "contato_cargo": contato_principal.get("cargo") if contato_principal else "-",
                "contato_email": contato_principal.get("email") if contato_principal else "-",
                "contato_email_status": contato_principal.get("email_status") if contato_principal else "-",
                "gancho": gancho_txt or "Sem gancho específico no site",
                "fontes": fontes_list
            })

        # g) Alerta de base: calcula dias restantes
        potencial = contar_potencial_restante(url, key)
        total_potencial = potencial["bruto"] + potencial["enriquecido_sem_site"] + potencial["qualificadas_nao_entregues"]
        dias_restantes = round(total_potencial / float(meta), 1) if meta > 0 else 0.0

        custo_final_usd = obter_custo_acumulado(url, key, execucao_id) if execucao_id else 0.0

        detalhes_execucao = {
            "lote_id": lote_id,
            "data_lote": hoje,
            "dias_restantes": dias_restantes,
            "potencial_restante": potencial,
            "motivo_incompleto": motivo_incompleto,
            "meta_diaria": meta,
            "leads_entregues": len(escolas_para_entrega),
            "rodadas_executadas": rodada
        }

        msg_sucesso = (
            f"Lote diário concluído: {len(escolas_para_entrega)}/{meta} leads entregues. "
            f"Dias restantes estimados: {dias_restantes} dias. Custo total: ${custo_final_usd:.4f} USD."
        )
        if motivo_incompleto:
            msg_sucesso += f" Motivo incompleto: {motivo_incompleto}."

        logging.info(f"=== SUCESSO: {msg_sucesso} ===")

        # h) Finaliza execução com status sucesso
        if not dry_run and execucao_id:
            finalizar_execucao(
                url=url,
                key=key,
                execucao_id=execucao_id,
                status="sucesso",
                mensagem=msg_sucesso,
                etapa_atual="Concluído",
                leads_entregues=len(escolas_para_entrega),
                custo_total=custo_final_usd,
                detalhes=detalhes_execucao
            )

        return {
            "sucesso": True,
            "execucao_id": execucao_id,
            "mensagem": msg_sucesso,
            "leads_entregues": len(escolas_para_entrega),
            "custo_total_usd": custo_final_usd,
            "dias_restantes": dias_restantes,
            "motivo_incompleto": motivo_incompleto,
            "escolas_entregues": escolas_entregues_relatorio
        }

    except Exception as ex:
        stack = traceback.format_exc()
        err_msg = f"Falha catastrófica no Agente SDR: {ex}"
        logging.error(err_msg)
        logging.error(stack)

        custo_parcial = obter_custo_acumulado(url, key, execucao_id) if execucao_id else 0.0

        if not dry_run and execucao_id:
            finalizar_execucao(
                url=url,
                key=key,
                execucao_id=execucao_id,
                status="erro",
                mensagem=str(ex),
                etapa_atual="Erro",
                leads_entregues=0,
                custo_total=custo_parcial,
                detalhes={"erro": str(ex), "stack": stack[-1000:]}
            )
        raise


def parse_args():
    parser = argparse.ArgumentParser(description="Orquestrador do Agente SDR Diário (20 leads qualificados)")
    parser.add_argument("--gatilho", choices=["agendado", "manual"], default="manual", help="Tipo de gatilho da execução (padrão: manual)")
    parser.add_argument("--forcar", action="store_true", help="Ignora a checagem de lote de hoje já entregue e força nova entrega")
    parser.add_argument("--meta", type=int, default=None, help=f"Meta de leads a entregar (padrão: {DEFAULT_META_DIARIA})")
    parser.add_argument("--max-custo", type=float, default=None, help=f"Teto diário de gastos em USD (padrão: ${DEFAULT_MAX_CUSTO_USD})")
    parser.add_argument("--dry-run", action="store_true", help="Executa sem persistir alterações no Supabase")
    return parser.parse_args()


def main():
    args = parse_args()
    try:
        res = executar_agente_sdr(
            gatilho=args.gatilho,
            forcar=args.forcar,
            meta_diaria=args.meta,
            max_custo_usd=args.max_custo,
            dry_run=args.dry_run
        )
    except Exception as ex:
        logging.error(f"Execução encerrada com erro: {ex}")
        sys.exit(1)

    print("\n" + "=" * 80)
    print("RELATÓRIO DE ENTREGA DO AGENTE SDR DIÁRIO")
    print("=" * 80)
    print(f"Data: {data_hoje_sao_paulo()} | Gatilho: {args.gatilho} | Forçado: {args.forcar}")
    print(f"Leads Entregues: {res.get('leads_entregues', 0)}")
    print(f"Custo Total Estimado: ${res.get('custo_total_usd', 0.0):.4f} USD")
    print(f"Dias Restantes na Base: {res.get('dias_restantes', 'N/D')} dias")
    if res.get("motivo_incompleto"):
        print(f"Motivo Incompleto: {res.get('motivo_incompleto')}")
    print("-" * 80)

    escolas = res.get("escolas_entregues", [])
    if escolas:
        print(f"{'Escola':<32} | {'Score':<5} | {'Contato Principal':<25} | {'E-mail & Status'}")
        print("-" * 95)
        for e in escolas:
            nome_c = (e['nome'][:30] + "..") if len(e['nome']) > 32 else e['nome']
            contato_c = f"{e['contato_nome']} ({e['contato_cargo']})"[:25]
            email_c = f"{e['contato_email']} [{e['contato_email_status']}]"
            print(f"{nome_c:<32} | {e['score']:<5} | {contato_c:<25} | {email_c}")
            if e.get("gancho"):
                print(f"   └─ Gancho: \"{e['gancho']}\"")
                if e.get("fontes"):
                    print(f"      Fonte: {e['fontes'][0]}")
    else:
        print("Nenhuma escola entregue nesta rodada.")

    print("=" * 80 + "\n")


if __name__ == "__main__":
    main()
