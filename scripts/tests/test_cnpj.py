"""
Testes unitários para o módulo de CNPJ, normalização e integração Apify.
Cobre: validação de CNPJ, normalização de respostas, filtro de qualificações de comando,
tratamento de CNPJ inativo, formatação de telefone sem duplicação de DDD,
casamento por CEP e similaridade de nome, e tratamento de casos ambíguos.
"""

import json
from pathlib import Path
import pytest

from scripts.lib.cnpj import (
    valida_cnpj,
    limpar_cnpj,
    normaliza,
    format_phone,
    is_qualificacao_comando,
    formatar_nome_proprio
)
from scripts.achar_cnpj_apify import casar_escolas_com_apify

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

def carregar_fixture(nome_arquivo: str):
    caminho = FIXTURES_DIR / nome_arquivo
    with open(caminho, "r", encoding="utf-8") as f:
        return json.load(f)

def test_validacao_cnpj():
    """Valida CNPJs corretos, incorretos, sequências idênticas e tamanhos errados."""
    # Válidos (com e sem formatação)
    assert valida_cnpj("00.000.000/0001-91") is True
    assert valida_cnpj("00000000000191") is True
    assert valida_cnpj("33.000.167/0001-01") is True
    assert valida_cnpj("33000167000101") is True

    # Dígitos verificadores incorretos
    assert valida_cnpj("00.000.000/0001-92") is False
    assert valida_cnpj("33.000.167/0001-00") is False
    assert valida_cnpj("12.345.678/0001-99") is False

    # Sequências de dígitos repetidos idênticos
    assert valida_cnpj("00000000000000") is False
    assert valida_cnpj("11111111111111") is False
    assert valida_cnpj("99999999999999") is False

    # Tamanhos inválidos ou nulos
    assert valida_cnpj("12345") is False
    assert valida_cnpj("") is False
    assert valida_cnpj(None) is False

def test_normalizacao_brasilapi():
    """Testa normalização da resposta da BrasilAPI com QSA e telefones."""
    dados_brutos = carregar_fixture("brasilapi_ativa.json")
    res = normaliza(dados_brutos, "brasilapi")

    assert res["razao_social"] == "COLÉGIO EXCELÊNCIA DE BRASÍLIA LTDA"
    assert res["nome_fantasia"] == "COLÉGIO EXCELÊNCIA"
    assert res["situacao"] == "ATIVA"
    assert res["porte"] == "DEMAIS"
    assert res["capital_social"] == 1500000.0
    assert res["cnae_principal"] == "8520100"
    assert res["email"] == "secretaria@colegioexcelencia.com.br"
    assert res["natureza_juridica"] == "Sociedade Empresária Limitada"

    # Telefones formatados
    assert "(61) 3201-4000" in res["telefones"]
    assert "(61) 99988-7766" in res["telefones"]

    # Sócios: PF vs PJ
    socios = res["socios"]
    assert len(socios) == 3

    socio_pf1 = socios[0]
    assert socio_pf1["nome"] == "Carlos Eduardo de Almeida"
    assert socio_pf1["qualificacao_descricao"] == "Sócio-Administrador"
    assert socio_pf1["tipo"] == "PF"

    socio_pf2 = socios[1]
    assert socio_pf2["nome"] == "Beatriz Mendonca Lima"
    assert socio_pf2["qualificacao_descricao"] == "Diretora"
    assert socio_pf2["tipo"] == "PF"

    socio_pj = socios[2]
    assert socio_pj["tipo"] == "PJ"

def test_normalizacao_opencnpj():
    """Testa normalização da resposta do OpenCNPJ."""
    dados_brutos = carregar_fixture("opencnpj_ativa.json")
    res = normaliza(dados_brutos, "opencnpj")

    assert res["razao_social"] == "INSTITUTO EDUCACIONAL PROGRESSO LTDA"
    assert res["nome_fantasia"] == "COLEGIO PROGRESSO"
    assert res["situacao"] == "ATIVA"
    assert res["porte"] == "Empresa de Pequeno Porte"
    assert res["capital_social"] == 500000.0
    assert res["cnae_principal"] == "8520100"
    assert res["email"] == "diretoria@colegioprogresso.com.br"
    assert "(61) 3344-9988" in res["telefones"]

    assert len(res["socios"]) == 1
    assert res["socios"][0]["nome"] == "Fernando Henrique Souza"
    assert res["socios"][0]["qualificacao_descricao"] == "Administrador"
    assert res["socios"][0]["tipo"] == "PF"

def test_filtro_qualificacoes_comando():
    """Testa identificação estrita de qualificações com poder de decisão."""
    # Qualificações aceitas
    assert is_qualificacao_comando("Sócio-Administrador") is True
    assert is_qualificacao_comando("Socio Administrador") is True
    assert is_qualificacao_comando("Administrador") is True
    assert is_qualificacao_comando("Diretor") is True
    assert is_qualificacao_comando("Diretora") is True
    assert is_qualificacao_comando("Presidente") is True
    assert is_qualificacao_comando("Titular Pessoa Física") is True
    assert is_qualificacao_comando("Superintendente") is True
    assert is_qualificacao_comando("Sócio Gerente") is True
    assert is_qualificacao_comando("Sócio de Responsabilidade Limitada") is True
    assert is_qualificacao_comando("Procurador") is True

    # Cargos ou qualificações que não são de comando
    assert is_qualificacao_comando("Acionista Sem Cargo") is False
    assert is_qualificacao_comando("Sócio Menor Assistido") is False
    assert is_qualificacao_comando("Não informada") is False
    assert is_qualificacao_comando("") is False
    assert is_qualificacao_comando(None) is False

def test_cnpj_inativo_descartado():
    """Testa tratamento de CNPJ baixado/inativo na normalização."""
    dados_brutos = carregar_fixture("brasilapi_baixada.json")
    res = normaliza(dados_brutos, "brasilapi")

    assert res["situacao"] == "BAIXADA"
    assert res["situacao"] != "ATIVA"

def test_telefone_sem_ddd_duplicado():
    """Garante que a formatação não concatena DDD em duplicidade."""
    # Entrada com DDD junto aos dígitos
    assert format_phone("6132014000") == "(61) 3201-4000"
    assert format_phone("61999887766") == "(61) 99988-7766"

    # Entrada já pré-formatada
    assert format_phone("(61) 3493-9002") == "(61) 3493-9002"
    assert format_phone("(61) 98888-7777") == "(61) 98888-7777"

    # Não deve gerar duplicatas de DDD como (61) 6132...
    res = format_phone("6132014000")
    assert res.startswith("(61) ")
    assert not res.startswith("(61) 61")

def test_casamento_apify_nome_e_cep():
    """Testa matching determinístico de escolas sem CNPJ com dataset Apify."""
    items_apify = carregar_fixture("apify_dataset.json")

    escolas_sem_cnpj = [
        {
            "id": "esc-1",
            "nome": "Colégio Horizonte",
            "cidade": "Brasília",
            "cep": "70830010"
        }
    ]

    resultado = casar_escolas_com_apify(escolas_sem_cnpj, items_apify, similaridade_minima=0.85)

    assert len(resultado["casados"]) == 1
    assert resultado["casados"][0]["cnpj_encontrado"] == "33000167000101"
    assert resultado["casados"][0]["escola_id"] == "esc-1"
    assert len(resultado["ambiguos"]) == 0

def test_casamento_apify_caso_ambiguo():
    """Testa quando múltiplos CNPJs candidatos no mesmo município correspondem à mesma escola."""
    items_apify = carregar_fixture("apify_dataset.json")

    # Ambiguidade: Em Valparaíso de Goiás existem duas unidades "COLEGIO INTEGRADO" no dataset
    escola_ambigua = [
        {
            "id": "esc-ambigua",
            "nome": "Colégio Integrado",
            "cidade": "Valparaíso de Goiás",
            "cep": None
        }
    ]

    resultado = casar_escolas_com_apify(escola_ambigua, items_apify, similaridade_minima=0.85)

    assert len(resultado["casados"]) == 0
    assert len(resultado["ambiguos"]) == 1
    assert resultado["ambiguos"][0]["escola_id"] == "esc-ambigua"
    candidatos_cnpjs = [c["cnpj"] for c in resultado["ambiguos"][0]["candidatos"]]
    assert "44555666000181" in candidatos_cnpjs
    assert "55666777000181" in candidatos_cnpjs
