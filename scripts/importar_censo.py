#!/usr/bin/env python3
"""
Importador de Escolas do Censo Escolar da Educação Básica (INEP).
Garante que apenas escolas privadas, em atividade, com oferta de Ensino Médio
e dentro das regiões configuradas entrem no CRM Littera como base do ICP.
"""

import os
import re
import sys
import json
import logging
import argparse
import tempfile
import zipfile
import unicodedata
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

# Adiciona raiz ao sys.path para importar scripts.lib
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.lib.supabase_client import upsert, sanitize_row, get_supabase_credentials
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

CONFIG_DIR = Path(__file__).resolve().parent / "config"

def normalizar_texto(texto: str) -> str:
    """Remove acentos e converte para minúsculas."""
    if not texto:
        return ""
    return unicodedata.normalize('NFKD', texto).encode('ascii', 'ignore').decode('utf-8').lower().strip()

def gerar_chave_dedup(nome: str, cidade: str, uf: str) -> str:
    """Gera a mesma chave de deduplicação calculada pela coluna STORED do Postgres."""
    n = re.sub(r'[^a-zA-Z0-9]', '', normalizar_texto(nome))
    c = re.sub(r'[^a-zA-Z0-9]', '', normalizar_texto(cidade))
    u = uf.lower().strip()
    return f"{n}_{c}_{u}"

def validar_e_limpar_cnpj(raw_cnpj: Any) -> Optional[str]:
    """
    Valida CNPJ de 14 dígitos com cálculo estrito dos dígitos verificadores.
    Retorna a string com 14 dígitos numéricos se válido, senão None.
    """
    if not raw_cnpj:
        return None

    digits = re.sub(r'\D', '', str(raw_cnpj).strip())
    if len(digits) != 14:
        return None

    # Rejeita sequências de dígitos iguais
    if len(set(digits)) == 1:
        return None

    # Cálculo do 1º Dígito Verificador
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma1 = sum(int(d) * w for d, w in zip(digits[:12], pesos1))
    resto1 = soma1 % 11
    dv1 = 0 if resto1 < 2 else 11 - resto1
    if int(digits[12]) != dv1:
        return None

    # Cálculo do 2º Dígito Verificador
    pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma2 = sum(int(d) * w for d, w in zip(digits[:13], pesos2))
    resto2 = soma2 % 11
    dv2 = 0 if resto2 < 2 else 11 - resto2
    if int(digits[13]) != dv2:
        return None

    return digits

def clean_school_name(raw_name: str) -> str:
    """Formata o nome da escola com capitalização corrigida, preservando siglas."""
    if not raw_name:
        return ""

    clean = raw_name.strip()
    words = clean.split()
    formatted = []

    lowercase_words = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'para', 'com'}
    uppercase_words = {
        'df', 'go', 'sp', 'rj', 'mg', 'jk', 'ce', 'cei', 'cem', 'caas', 'sesi', 
        'senai', 'sesc', 'unb', 'cmdp', 'cmdpii', 'eja', 'i', 'ii', 'iii', 'iv', 
        'v', 'vi', 'vii', 'viii', 'ix', 'x'
    }

    for w in words:
        lw = w.lower().strip('.,-()')
        if lw in uppercase_words:
            formatted.append(lw.upper())
        elif lw in lowercase_words:
            formatted.append(lw)
        else:
            formatted.append(w.capitalize())

    return ' '.join(formatted)

def format_phone(ddd: Any, phone: Any) -> Optional[str]:
    """Formata telefone (DDD) XXXXX-XXXX ou (DDD) XXXX-XXXX."""
    ddd_str = re.sub(r'\D', '', str(ddd or ''))
    phone_str = re.sub(r'\D', '', str(phone or ''))

    if not phone_str:
        return None

    if len(ddd_str) == 2:
        if len(phone_str) == 8:
            return f"({ddd_str}) {phone_str[:4]}-{phone_str[4:]}"
        elif len(phone_str) == 9:
            return f"({ddd_str}) {phone_str[:5]}-{phone_str[5:]}"
    elif len(phone_str) in (10, 11):
        d = phone_str[:2]
        num = phone_str[2:]
        if len(num) == 8:
            return f"({d}) {num[:4]}-{num[4:]}"
        else:
            return f"({d}) {num[:5]}-{num[5:]}"

    return f"({ddd_str}) {phone_str}" if ddd_str else phone_str

def carregar_configuracoes() -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
    """Carrega censo.json e regioes.json."""
    censo_file = CONFIG_DIR / "censo.json"
    regioes_file = CONFIG_DIR / "regioes.json"

    with open(censo_file, "r", encoding="utf-8") as f:
        censo_config = json.load(f)

    with open(regioes_file, "r", encoding="utf-8") as f:
        regioes_config = json.load(f)

    return censo_config, regioes_config

def pertence_regioes_alvo(uf: str, municipio: str, regioes_config: List[Dict[str, Any]]) -> bool:
    """Verifica se o município e UF estão contidos em REGIOES_ALVO."""
    uf_clean = uf.upper().strip()
    mun_norm = normalizar_texto(municipio)

    for regiao in regioes_config:
        if regiao.get("uf", "").upper().strip() == uf_clean:
            municipios_alvo = regiao.get("municipios", [])
            # Se a lista de municípios estiver vazia, aceita todos os municípios da UF
            if not municipios_alvo:
                return True
            for m in municipios_alvo:
                if normalizar_texto(m) == mun_norm:
                    return True
    return False

def buscar_escolas_legado_sem_inep() -> Dict[str, str]:
    """
    Busca no Supabase as escolas já existentes que ainda não têm codigo_inep,
    indexadas pela chave_dedup. Permite vincular os dados do Censo sem duplicar.
    """
    try:
        url, key = get_supabase_credentials()
        endpoint = f"{url}/rest/v1/escolas?select=id,chave_dedup&codigo_inep=is.null"
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
        }
        resp = requests.get(endpoint, headers=headers, timeout=15)
        if resp.status_code == 200:
            items = resp.json()
            return {item["chave_dedup"]: item["id"] for item in items if item.get("chave_dedup")}
    except Exception as ex:
        logging.warning(f"Não foi possível consultar escolas legadas para vínculo prévio: {ex}")
    return {}

def registrar_agente_execucao(
    status: str,
    leads_encontrados: int,
    leads_inseridos: int,
    mensagem: str,
    iniciado_em: str
):
    """Grava o resumo da execução na tabela agente_execucoes."""
    try:
        url, key = get_supabase_credentials()
        endpoint = f"{url}/rest/v1/agente_execucoes"
        headers = {
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal"
        }
        payload = {
            "iniciado_em": iniciado_em,
            "finalizado_em": datetime.now(timezone.utc).isoformat(),
            "status": status,
            "leads_encontrados": leads_encontrados,
            "leads_inseridos": leads_inseridos,
            "mensagem": mensagem
        }
        requests.post(endpoint, headers=headers, json=payload, timeout=15)
    except Exception as ex:
        logging.warning(f"Erro ao registrar execução do agente no Supabase: {ex}")

def processar_csv_censo(
    file_obj,
    ano: int,
    regioes_config: List[Dict[str, Any]],
    min_matriculas_em: int,
    escolas_legado: Optional[Dict[str, str]] = None,
    dry_run: bool = False
) -> Dict[str, Any]:
    """Lê o CSV em streaming com separador ';' e aplica todos os filtros do ICP."""
    if escolas_legado is None:
        escolas_legado = {}
    header_line = file_obj.readline()
    if isinstance(header_line, bytes):
        header_line = header_line.decode('latin-1', errors='ignore')

    header = [c.strip() for c in header_line.strip().split(';')]

    # Localiza índices das colunas
    col_map = {
        col: header.index(col)
        for col in [
            'CO_ENTIDADE', 'NO_ENTIDADE', 'TP_DEPENDENCIA', 'TP_SITUACAO_FUNCIONAMENTO',
            'SG_UF', 'NO_MUNICIPIO', 'CO_MUNICIPIO', 'NO_BAIRRO', 'DS_ENDERECO', 'NU_ENDERECO',
            'CO_CEP', 'NU_DDD', 'NU_TELEFONE', 'IN_MED', 'QT_MAT_MED', 'QT_MAT_BAS',
            'NU_CNPJ_ESCOLA_PRIVADA', 'NU_CNPJ_MANTENEDORA', 'TP_CATEGORIA_ESCOLA_PRIVADA'
        ]
        if col in header
    }

    obrigatorias = ['CO_ENTIDADE', 'NO_ENTIDADE', 'TP_DEPENDENCIA', 'TP_SITUACAO_FUNCIONAMENTO', 'SG_UF', 'NO_MUNICIPIO']
    for ob in obrigatorias:
        if ob not in col_map:
            raise ValueError(f"Coluna obrigatória do Censo ausente no CSV: {ob}")

    total_lido = 0
    filtrados_regiao = 0
    por_municipio = {}
    escolas_para_salvar = []
    acima_porte_count = 0
    abaixo_porte_count = 0

    for line in file_obj:
        if isinstance(line, bytes):
            line = line.decode('latin-1', errors='ignore')

        total_lido += 1
        parts = [p.strip() for p in line.strip().split(';')]
        if len(parts) <= col_map['NO_MUNICIPIO']:
            continue

        uf = parts[col_map['SG_UF']]
        municipio = parts[col_map['NO_MUNICIPIO']]

        # 1. Filtro de Dependência: Privada (4)
        tp_dep = parts[col_map['TP_DEPENDENCIA']]
        if tp_dep != '4':
            continue

        # 2. Filtro de Situação de Funcionamento: Em Atividade (1)
        tp_sit = parts[col_map['TP_SITUACAO_FUNCIONAMENTO']]
        if tp_sit != '1':
            continue

        # 3. Filtro de Ensino Médio: IN_MED == 1 ou QT_MAT_MED > 0
        in_med = parts[col_map['IN_MED']] if 'IN_MED' in col_map else '0'
        mat_med_str = parts[col_map['QT_MAT_MED']] if 'QT_MAT_MED' in col_map else '0'
        try:
            mat_med = int(float(mat_med_str or 0))
        except ValueError:
            mat_med = 0

        if in_med != '1' and mat_med <= 0:
            continue

        # 4. Filtro de Região Alvo (DF + Entorno configurados)
        if not pertence_regioes_alvo(uf, municipio, regioes_config):
            continue

        filtrados_regiao += 1
        mun_key = f"{municipio}/{uf}"
        por_municipio[mun_key] = por_municipio.get(mun_key, 0) + 1

        # Extração de campos
        co_entidade = parts[col_map['CO_ENTIDADE']]
        no_entidade = clean_school_name(parts[col_map['NO_ENTIDADE']])
        bairro = parts[col_map['NO_BAIRRO']] if 'NO_BAIRRO' in col_map and parts[col_map['NO_BAIRRO']] else None
        
        logradouro = parts[col_map['DS_ENDERECO']] if 'DS_ENDERECO' in col_map else ''
        numero = parts[col_map['NU_ENDERECO']] if 'NU_ENDERECO' in col_map else ''
        endereco_completo = f"{logradouro}, {numero}".strip(' ,') or None

        cep = parts[col_map['CO_CEP']] if 'CO_CEP' in col_map and parts[col_map['CO_CEP']] else None
        ddd = parts[col_map['NU_DDD']] if 'NU_DDD' in col_map else None
        tel = parts[col_map['NU_TELEFONE']] if 'NU_TELEFONE' in col_map else None
        telefone_formatado = format_phone(ddd, tel)

        mat_bas_str = parts[col_map['QT_MAT_BAS']] if 'QT_MAT_BAS' in col_map else '0'
        try:
            mat_total = int(float(mat_bas_str or 0))
        except ValueError:
            mat_total = None

        # Validação de CNPJ (prioriza CNPJ da escola, depois da mantenedora)
        cnpj_escola = parts[col_map['NU_CNPJ_ESCOLA_PRIVADA']] if 'NU_CNPJ_ESCOLA_PRIVADA' in col_map else None
        cnpj_mantenedora = parts[col_map['NU_CNPJ_MANTENEDORA']] if 'NU_CNPJ_MANTENEDORA' in col_map else None

        cnpj_valido = validar_e_limpar_cnpj(cnpj_escola)
        if not cnpj_valido:
            cnpj_valido = validar_e_limpar_cnpj(cnpj_mantenedora)

        cnpj_mantenedora_limpo = validar_e_limpar_cnpj(cnpj_mantenedora)

        tp_categoria = parts[col_map['TP_CATEGORIA_ESCOLA_PRIVADA']] if 'TP_CATEGORIA_ESCOLA_PRIVADA' in col_map else None
        co_mun = parts[col_map['CO_MUNICIPIO']] if 'CO_MUNICIPIO' in col_map else None

        score_detalhes = {
            "censo": {
                "ano": ano,
                "categoria_escola_privada": tp_categoria,
                "cnpj_mantenedora": cnpj_mantenedora_limpo,
                "co_municipio": co_mun,
            }
        }

        # 5. Aplica Porte Mínimo
        if mat_med < min_matriculas_em:
            abaixo_porte_count += 1
            status_qualificacao = 'descartado'
            motivo_descarte = f"abaixo do porte mínimo ({mat_med} matrículas no EM)"
        else:
            acima_porte_count += 1
            status_qualificacao = 'bruto'
            motivo_descarte = None

        chave_dedup = gerar_chave_dedup(no_entidade, municipio, uf)

        escola_data = {
            "codigo_inep": str(co_entidade).strip(),
            "nome": no_entidade,
            "cidade": municipio,
            "uf": uf,
            "bairro": bairro,
            "endereco": endereco_completo,
            "cep": cep,
            "telefone": telefone_formatado,
            "matriculas_em": mat_med,
            "matriculas_total": mat_total,
            "oferece_ensino_medio": True,
            "cnpj": cnpj_valido,
            "score_detalhes": score_detalhes,
            "status_qualificacao": status_qualificacao,
            "motivo_descarte": motivo_descarte,
            "fonte": f"inep_censo_{ano}",
        }

        # Se já existe no banco com dados legados na mesma chave, preserva o ID para vincular
        if chave_dedup in escolas_legado:
            escola_data["id"] = escolas_legado[chave_dedup]

        escolas_para_salvar.append(escola_data)

    stats = {"inseridos": 0, "atualizados": 0, "falhas": 0}
    if not dry_run and escolas_para_salvar:
        logging.info(f"Gravando {len(escolas_para_salvar)} escolas via upsert (on_conflict='codigo_inep')...")
        stats = upsert("escolas", escolas_para_salvar, on_conflict="codigo_inep")
    elif dry_run:
        logging.info("[DRY-RUN] Nenhuma gravação efetuada no banco de dados.")
        stats = {"inseridos": acima_porte_count, "atualizados": 0, "falhas": 0}

    dias_leads = round(acima_porte_count / 20.0, 1) if acima_porte_count > 0 else 0

    return {
        "total_lido": total_lido,
        "filtrados_regiao": filtrados_regiao,
        "por_municipio": por_municipio,
        "acima_porte": acima_porte_count,
        "abaixo_porte": abaixo_porte_count,
        "dias_leads": dias_leads,
        "stats": stats,
    }

def main():
    parser = argparse.ArgumentParser(description="Importador de Escolas do Censo Escolar INEP")
    parser.add_argument("--ano", type=int, help="Ano do Censo Escolar a importar (ex: 2024)")
    parser.add_argument("--arquivo", type=str, help="Caminho para arquivo .zip ou .csv local")
    parser.add_argument("--dry-run", action="store_true", help="Executa o processamento sem gravar no Supabase")
    args = parser.parse_args()

    iniciado_em = datetime.now(timezone.utc).isoformat()
    censo_config, regioes_config = carregar_configuracoes()

    ano = args.ano or censo_config.get("ano_mais_recente", 2024)
    min_matriculas = int(os.getenv("MIN_MATRICULAS_EM", "40"))

    logging.info(f"=== INICIANDO IMPORTADOR DO CENSO ESCOLAR {ano} ===")
    logging.info(f"Regiões configuradas: {[r['uf'] for r in regioes_config]}")
    logging.info(f"Porte mínimo de matrículas EM: {min_matriculas}")

    # Pré-carrega escolas legadas sem inep para vincular
    escolas_legado = {}
    if not args.dry_run:
        escolas_legado = buscar_escolas_legado_sem_inep()
        logging.info(f"Escolas legadas elegíveis para enriquecimento e vínculo: {len(escolas_legado)}")

    # 1. Determina a fonte do arquivo (Local ou Download)
    zip_path = None
    temp_dir = None

    try:
        if args.arquivo:
            source_path = Path(args.arquivo)
            if not source_path.exists():
                raise FileNotFoundError(f"Arquivo especificado não existe: {source_path}")
            if source_path.suffix.lower() == '.csv':
                logging.info(f"Processando arquivo CSV direto: {source_path}")
                with open(source_path, 'r', encoding='latin-1', errors='ignore') as f:
                    res = processar_csv_censo(
                        f, ano, regioes_config, min_matriculas, escolas_legado, dry_run=args.dry_run
                    )
            else:
                zip_path = source_path
        else:
            # Verifica se já está em cache em /tmp
            cached_tmp = Path(f"/tmp/microdados_censo_escolar_{ano}.zip")
            if cached_tmp.exists():
                logging.info(f"Utilizando arquivo de cache local: {cached_tmp}")
                zip_path = cached_tmp
            else:
                url = censo_config.get("urls", {}).get(str(ano))
                if not url:
                    raise ValueError(f"URL de download para o ano {ano} não encontrada em scripts/config/censo.json")

                temp_dir = tempfile.TemporaryDirectory()
                zip_path = Path(temp_dir.name) / f"censo_{ano}.zip"
                logging.info(f"Baixando microdados do Censo {ano} de: {url}...")
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'})
                with urllib.request.urlopen(req, timeout=180) as r, open(zip_path, 'wb') as f:
                    f.write(r.read())
                logging.info(f"Download concluído: {zip_path.stat().st_size / (1024*1024):.1f} MB.")

        if zip_path:
            logging.info(f"Abrindo arquivo zip: {zip_path}...")
            with zipfile.ZipFile(zip_path, 'r') as zf:
                csv_candidates = [n for n in zf.namelist() if n.lower().endswith('.csv') and 'microdados_ed_basica' in n.lower()]
                if not csv_candidates:
                    # Fallback para qualquer csv de dados
                    csv_candidates = [n for n in zf.namelist() if n.lower().endswith('.csv') and 'dados' in n.lower()]
                if not csv_candidates:
                    raise ValueError("Nenhum arquivo CSV de escolas encontrado dentro do ZIP do Censo.")

                csv_internal_name = csv_candidates[0]
                logging.info(f"Lendo CSV interno: {csv_internal_name}...")
                with zf.open(csv_internal_name) as csv_file:
                    res = processar_csv_censo(
                        csv_file, ano, regioes_config, min_matriculas, escolas_legado, dry_run=args.dry_run
                    )

        # 2. Exibição e gravação do relatório
        print("\n" + "="*70)
        print(f"RELATÓRIO DO CENSO ESCOLAR {ano} — BASE DO ICP LITTERA")
        print("="*70)
        print(f"Total de registros lidos no Brasil: {res['total_lido']:,}")
        print(f"Total de escolas privadas ativas com EM na região alvo: {res['filtrados_regiao']}")
        print(f" - Qualificadas (>= {min_matriculas} matrículas EM): {res['acima_porte']}")
        print(f" - Descartadas (< {min_matriculas} matrículas EM): {res['abaixo_porte']}")
        print("\nDistribuição por Município (Privadas com Ensino Médio):")
        for mun, qtd in sorted(res['por_municipio'].items(), key=lambda x: -x[1]):
            print(f"  • {mun}: {qtd} escolas")

        print("\nCapacidade da Base de Prospecção:")
        print(f"  • {res['acima_porte']} escolas qualificadas ÷ 20 leads/dia = {res['dias_leads']} dias úteis de prospecção garantida.")
        
        if not args.dry_run:
            print(f"\nResultado da gravação no Supabase:")
            print(f"  • Inseridas: {res['stats']['inseridos']}")
            print(f"  • Atualizadas: {res['stats']['atualizados']}")
            print(f"  • Falhas: {res['stats']['falhas']}")
        print("="*70 + "\n")

        # 3. Registra execução em agente_execucoes
        msg_exec = (
            f"Censo {ano} importado com sucesso: {res['filtrados_regiao']} escolas na região, "
            f"{res['acima_porte']} qualificadas (>={min_matriculas} alunos EM) = {res['dias_leads']} dias de leads. "
            f"Gravação: {res['stats']['inseridos']} novas, {res['stats']['atualizados']} atualizadas."
        )

        if not args.dry_run:
            registrar_agente_execucao(
                status="sucesso",
                leads_encontrados=res['acima_porte'],
                leads_inseridos=res['stats']['inseridos'],
                mensagem=msg_exec,
                iniciado_em=iniciado_em
            )

    except Exception as ex:
        logging.error(f"Erro fatal na importação do Censo: {ex}", exc_info=True)
        if not args.dry_run:
            registrar_agente_execucao(
                status="erro",
                leads_encontrados=0,
                leads_inseridos=0,
                mensagem=f"Falha na importação do Censo {ano}: {ex}",
                iniciado_em=iniciado_em
            )
        sys.exit(1)
    finally:
        if temp_dir:
            temp_dir.cleanup()

if __name__ == "__main__":
    main()
