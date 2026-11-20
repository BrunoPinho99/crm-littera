import io
import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Configurações de ambiente para mock
os.environ["SUPABASE_URL"] = "https://mock-project.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-service-role-key"

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT_DIR))

from scripts.importar_censo import (
    validar_e_limpar_cnpj,
    clean_school_name,
    format_phone,
    processar_csv_censo,
    gerar_chave_dedup,
)

# CNPJ válido de teste (Receita Federal / Banco do Brasil / Fundação)
VALID_CNPJ_1 = "00000000000191"  # 00.000.000/0001-91 (Válido)
VALID_CNPJ_2 = "33683111000107"  # Válido


def test_validador_cnpj():
    # Válidos
    assert validar_e_limpar_cnpj("00.000.000/0001-91") == "00000000000191"
    assert validar_e_limpar_cnpj("33.683.111/0001-07") == "33683111000107"

    # Inválidos: tamanho errado
    assert validar_e_limpar_cnpj("12345") is None

    # Inválidos: sequências repetidas
    assert validar_e_limpar_cnpj("11.111.111/1111-11") is None
    assert validar_e_limpar_cnpj("00000000000000") is None

    # Inválidos: dígitos verificadores incorretos
    assert validar_e_limpar_cnpj("00.000.000/0001-99") is None
    assert validar_e_limpar_cnpj(None) is None


def test_clean_school_name():
    # Preserva siglas e corrige capitalização
    assert clean_school_name("COLEGIO SIGMA ASA SUL DF") == "Colegio Sigma Asa Sul DF"
    assert clean_school_name("COLÉGIO SIGMA ASA SUL DF") == "Colégio Sigma Asa Sul DF"
    assert clean_school_name("CENTRO EDUCACIONAL JK") == "Centro Educacional JK"
    assert clean_school_name("escola parque de brasilia") == "Escola Parque de Brasilia"
    assert clean_school_name("INSTITUTO EDUCACIONAL CEM II") == "Instituto Educacional CEM II"


def test_processar_amostra_10_cenarios():
    """
    Testa o processamento de um CSV de amostra com 10 linhas cobrindo:
    1. Privada com EM no DF (> 40 alunos) -> Qualificada
    2. Pública no DF -> Filtrada
    3. Privada sem EM no DF (IN_MED=0, QT_MAT_MED=0) -> Filtrada
    4. Privada paralisada (TP_SITUACAO=2) -> Filtrada
    5. Município fora da região alvo (Goiânia/GO) -> Filtrada
    6. Município do Entorno (Valparaíso de Goiás/GO) -> Qualificada
    7. Privada no DF com CNPJ inválido -> Válida, mas cnpj = None
    8. Privada abaixo do porte mínimo (20 matrículas < 40) -> Descartada
    9. Privada com CNPJ escola vazio mas mantenedora válido -> Usa CNPJ mantenedora
    10. Privada existente no legado -> Vincula preservando o ID existente
    """
    header = (
        "CO_ENTIDADE;NO_ENTIDADE;TP_DEPENDENCIA;TP_SITUACAO_FUNCIONAMENTO;SG_UF;"
        "NO_MUNICIPIO;CO_MUNICIPIO;NO_BAIRRO;DS_ENDERECO;NU_ENDERECO;CO_CEP;"
        "NU_DDD;NU_TELEFONE;IN_MED;QT_MAT_MED;QT_MAT_BAS;NU_CNPJ_ESCOLA_PRIVADA;"
        "NU_CNPJ_MANTENEDORA;TP_CATEGORIA_ESCOLA_PRIVADA\n"
    )

    rows = [
        # 1. Privada válida com EM no DF (> 40 matrículas)
        f"53000001;COLEGIO ALPHA DF;4;1;DF;Brasília;5300108;Asa Sul;SGS;100;70000000;61;33451122;1;120;300;{VALID_CNPJ_1};;1\n",
        # 2. Pública no DF (TP_DEPENDENCIA = 2) -> deve ser descartada
        "53000002;ESCOLA PUBLICA CEM 01;2;1;DF;Brasília;5300108;Taguatinga;QSA;1;72000000;61;33550000;1;400;400;;;1\n",
        # 3. Privada sem Ensino Médio (IN_MED = 0, QT_MAT_MED = 0) -> descartada
        f"53000003;CRECHE PEQUENOS BRASILIA;4;1;DF;Brasília;5300108;Asa Norte;CLN;2;70700000;61;33221100;0;0;50;{VALID_CNPJ_1};;1\n",
        # 4. Privada paralisada (TP_SITUACAO = 2) -> descartada
        f"53000004;COLEGIO FECHADO DF;4;2;DF;Brasília;5300108;Guara;QE;3;71000000;61;33880000;1;80;80;{VALID_CNPJ_1};;1\n",
        # 5. Município fora da região alvo (Goiânia/GO) -> descartada
        f"52000005;COLEGIO GOIANIA CENTRO;4;1;GO;Goiânia;5208707;Setor Bueno;Av T;10;74000000;62;32001100;1;150;400;{VALID_CNPJ_1};;1\n",
        # 6. Município do Entorno (Valparaíso de Goiás/GO) -> qualificada
        f"52000006;COLEGIO VALPARAISO EXCELENCIA;4;1;GO;Valparaíso de Goiás;5221858;Centro;Rua 1;20;72870000;61;36270000;1;95;210;{VALID_CNPJ_2};;1\n",
        # 7. Privada no DF com CNPJ inválido (11111111111111) -> entra, mas cnpj vira None
        "53000007;COLEGIO BETA DF;4;1;DF;Brasília;5300108;Lago Sul;QI;5;71600000;61;33661122;1;60;150;11111111111111;;1\n",
        # 8. Privada abaixo do porte mínimo (20 matrículas < 40) -> entra como 'descartado'
        f"53000008;COLEGIO PEQUENO PORTE DF;4;1;DF;Brasília;5300108;Sudoeste;CCSW;1;70680000;61;33440000;1;20;60;{VALID_CNPJ_1};;1\n",
        # 9. Privada com CNPJ escola vazio mas mantenedora preenchido -> usa mantenedora
        f"53000009;COLEGIO GAMA MANTENEDORA;4;1;DF;Brasília;5300108;Gama;Setor Central;8;72400000;61;34840000;1;70;180;;{VALID_CNPJ_2};1\n",
        # 10. Privada existente no legado -> deve herdar id_legado_existente
        f"53000010;COLEGIO LEGADO EXISTENTE DF;4;1;DF;Brasília;5300108;Plano Piloto;W3;99;70300000;61;32223344;1;110;250;{VALID_CNPJ_1};;1\n",
    ]

    csv_data = header + "".join(rows)
    csv_file = io.StringIO(csv_data)

    regioes_config = [
        {"uf": "DF", "municipios": []},
        {
            "uf": "GO",
            "municipios": ["Valparaíso de Goiás", "Luziânia", "Formosa", "Novo Gama"]
        }
    ]

    chave_escola_10 = gerar_chave_dedup("COLEGIO LEGADO EXISTENTE DF", "Brasília", "DF")
    escolas_legado = {
        chave_escola_10: "uuid-legado-12345"
    }

    mock_upsert_result = {"inseridos": 5, "atualizados": 1, "falhas": 0}

    with patch("scripts.importar_censo.upsert", return_value=mock_upsert_result) as mock_upsert:
        res = processar_csv_censo(
            csv_file,
            ano=2024,
            regioes_config=regioes_config,
            min_matriculas_em=40,
            escolas_legado=escolas_legado,
            dry_run=False
        )

        # 10 linhas lidas
        assert res["total_lido"] == 10

        # Das 10 linhas, apenas 6 pertencem ao ICP da região (linhas 1, 6, 7, 8, 9, 10):
        # As linhas 2 (pública), 3 (sem EM), 4 (paralisada) e 5 (Goiânia fora da região) são filtradas.
        assert res["filtrados_regiao"] == 6

        # Das 6 na região: 5 têm >= 40 matrículas e 1 (linha 8) tem 20 matrículas (< 40)
        assert res["acima_porte"] == 5
        assert res["abaixo_porte"] == 1

        # Prova que o upsert foi chamado com as 6 escolas
        assert mock_upsert.call_count == 1
        lote_enviado = mock_upsert.call_args[0][1]
        assert len(lote_enviado) == 6

        # Prova mapeamento correto dos campos:
        # Linha 1 (Colégio Alpha DF)
        alpha = next(e for e in lote_enviado if e["codigo_inep"] == "53000001")
        assert alpha["nome"] == "Colegio Alpha DF"
        assert alpha["cidade"] == "Brasília"
        assert alpha["uf"] == "DF"
        assert alpha["matriculas_em"] == 120
        assert alpha["matriculas_total"] == 300
        assert alpha["cnpj"] == VALID_CNPJ_1
        assert alpha["status_qualificacao"] == "bruto"
        assert alpha["motivo_descarte"] is None

        # Linha 6 (Valparaíso de Goiás)
        valparaiso = next(e for e in lote_enviado if e["codigo_inep"] == "52000006")
        assert valparaiso["cidade"] == "Valparaíso de Goiás"
        assert valparaiso["uf"] == "GO"
        assert valparaiso["status_qualificacao"] == "bruto"

        # Linha 7 (CNPJ inválido deve virar None)
        beta = next(e for e in lote_enviado if e["codigo_inep"] == "53000007")
        assert beta["cnpj"] is None

        # Linha 8 (Abaixo do porte mínimo)
        pequena = next(e for e in lote_enviado if e["codigo_inep"] == "53000008")
        assert pequena["status_qualificacao"] == "descartado"
        assert "abaixo do porte mínimo (20 matrículas no EM)" in pequena["motivo_descarte"]

        # Linha 9 (Fallback do CNPJ para mantenedora)
        gama = next(e for e in lote_enviado if e["codigo_inep"] == "53000009")
        assert gama["cnpj"] == VALID_CNPJ_2

        # Linha 10 (Vínculo com escola legado via chave_dedup)
        legado = next(e for e in lote_enviado if e["codigo_inep"] == "5300010" or e["codigo_inep"] == "53000010")
        assert legado["id"] == "uuid-legado-12345"


def test_idempotencia_importacao():
    """
    Testa a idempotência: rodar a importação duas vezes seguidas não duplica
    registros e realiza apenas atualizações na 2ª execução com on_conflict='codigo_inep'.
    """
    header = (
        "CO_ENTIDADE;NO_ENTIDADE;TP_DEPENDENCIA;TP_SITUACAO_FUNCIONAMENTO;SG_UF;"
        "NO_MUNICIPIO;CO_MUNICIPIO;NO_BAIRRO;DS_ENDERECO;NU_ENDERECO;CO_CEP;"
        "NU_DDD;NU_TELEFONE;IN_MED;QT_MAT_MED;QT_MAT_BAS;NU_CNPJ_ESCOLA_PRIVADA;"
        "NU_CNPJ_MANTENEDORA;TP_CATEGORIA_ESCOLA_PRIVADA\n"
    )
    row = f"53000001;COLEGIO ALPHA DF;4;1;DF;Brasília;5300108;Asa Sul;SGS;100;70000000;61;33451122;1;120;300;{VALID_CNPJ_1};;1\n"
    csv_data = header + row

    regioes_config = [{"uf": "DF", "municipios": []}]

    # Simula estado do banco de dados em memória
    banco_remoto = {}

    def fake_upsert(tabela, rows, on_conflict="codigo_inep"):
        inseridos = 0
        atualizados = 0
        for r in rows:
            chave = r.get(on_conflict)
            if chave in banco_remoto:
                atualizados += 1
                banco_remoto[chave].update(r)
            else:
                inseridos += 1
                banco_remoto[chave] = dict(r)
        return {"inseridos": inseridos, "atualizados": atualizados, "falhas": 0}

    with patch("scripts.importar_censo.upsert", side_effect=fake_upsert):
        # 1ª execução: deve inserir
        res1 = processar_csv_censo(
            io.StringIO(csv_data),
            ano=2024,
            regioes_config=regioes_config,
            min_matriculas_em=40,
            dry_run=False
        )
        assert res1["stats"]["inseridos"] == 1
        assert res1["stats"]["atualizados"] == 0
        assert len(banco_remoto) == 1

        # 2ª execução com exatamente os mesmos dados: deve atualizar, sem duplicar
        res2 = processar_csv_censo(
            io.StringIO(csv_data),
            ano=2024,
            regioes_config=regioes_config,
            min_matriculas_em=40,
            dry_run=False
        )
        assert res2["stats"]["inseridos"] == 0
        assert res2["stats"]["atualizados"] == 1
        assert len(banco_remoto) == 1

