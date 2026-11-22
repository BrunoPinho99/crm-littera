"""
Testes unitários e de integração simulada para o Agente SDR Diário (scripts/agente_sdr.py).
Cobre:
1. Idempotência estrita: encerramento sem duplicação se lote de hoje já existe.
2. Bypass de idempotência com parâmetro forcar=True.
3. Parada imediata ao atingir o teto de custo diário (MAX_CUSTO_DIARIO_USD).
4. Entrega parcial com motivo_incompleto = 'base_esgotada' quando o estoque acaba.
5. Ordenação e seleção prioritária por score DESC e matriculas_em DESC.
6. Resiliência a falhas: exceções não tratadas finalizam execução como 'erro' com stack trace.
"""

import pytest
from unittest.mock import patch, MagicMock
from scripts.agente_sdr import (
    executar_agente_sdr,
    data_hoje_sao_paulo,
    buscar_melhores_qualificadas
)


@pytest.fixture
def mock_supabase_credentials():
    with patch("scripts.agente_sdr.get_supabase_credentials") as mock_cred:
        mock_cred.return_value = ("https://mock.supabase.co", "mock-service-key")
        yield mock_cred


def test_idempotencia_sem_forcar(mock_supabase_credentials):
    """
    Se já existe lote gerado para a data de hoje e forcar=False,
    o agente encerra imediatamente com status 'sucesso' e mensagem informativa,
    sem rodar o abastecimento.
    """
    hoje = data_hoje_sao_paulo()
    lote_fake = {
        "id": "lote-uuid-123",
        "data": hoje,
        "quantidade": 20,
        "motivo_incompleto": None
    }

    with patch("scripts.agente_sdr.criar_agente_execucao") as mock_criar, \
         patch("scripts.agente_sdr.consultar_lote_hoje", return_value=lote_fake) as mock_consultar, \
         patch("scripts.agente_sdr.finalizar_execucao") as mock_finalizar, \
         patch("scripts.agente_sdr.enriquecer_escolas") as mock_enriq:

        mock_criar.return_value = "exec-uuid-999"

        resultado = executar_agente_sdr(gatilho="manual", forcar=False, meta_diaria=20)

        assert resultado["sucesso"] is True
        assert resultado["mensagem"] == "Lote de hoje já entregue"
        assert resultado["leads_entregues"] == 20
        assert resultado["custo_total_usd"] == 0.0
        assert resultado["escolas_entregues"] == []

        # Verifica se finalizou com status sucesso e etapa idempotente
        mock_finalizar.assert_called_once()
        _, kwargs = mock_finalizar.call_args
        assert kwargs["status"] == "sucesso"
        assert "Idempotente" in kwargs["etapa_atual"]

        # Abastecimento não pode ter sido executado
        mock_enriq.assert_not_called()


def test_idempotencia_com_forcar(mock_supabase_credentials):
    """
    Se já existe lote de hoje mas forcar=True,
    o agente ignora a restrição e prossegue com a execução do funil.
    """
    hoje = data_hoje_sao_paulo()
    lote_fake = {"id": "lote-uuid-123", "data": hoje, "quantidade": 20}

    escolas_qualificadas_fake = [
        {
            "id": f"esc-{i}",
            "nome": f"Escola Modelo {i}",
            "score": 90 - i,
            "matriculas_em": 300,
            "site": f"https://escola{i}.com.br",
            "contatos": [{"nome": "Diretor", "cargo": "Diretor", "email": "dir@escola.com", "email_status": "valido", "principal": True}]
        }
        for i in range(20)
    ]

    with patch("scripts.agente_sdr.criar_agente_execucao", return_value="exec-uuid-force"), \
         patch("scripts.agente_sdr.consultar_lote_hoje", return_value=lote_fake), \
         patch("scripts.agente_sdr.contar_qualificadas_disponiveis", side_effect=[20, 20]), \
         patch("scripts.agente_sdr.obter_custo_acumulado", return_value=0.5), \
         patch("scripts.agente_sdr.buscar_melhores_qualificadas", return_value=escolas_qualificadas_fake), \
         patch("scripts.agente_sdr.salvar_lote_diario", return_value="lote-novo-uuid"), \
         patch("scripts.agente_sdr.gerar_pesquisa_personalizacao", return_value={
             "resumo_pesquisa": "Escola com ensino médio de excelência.",
             "gancho_personalizacao": "Notamos o foco no vestibular no site oficial.",
             "fontes_pesquisa": ["https://escola.com.br"],
             "custo_usd": 0.005,
             "tokens_input": 500,
             "tokens_output": 100
         }), \
         patch("scripts.agente_sdr.requests.patch") as mock_patch, \
         patch("scripts.agente_sdr.finalizar_execucao") as mock_finalizar:

        mock_patch.return_value.status_code = 200

        resultado = executar_agente_sdr(gatilho="manual", forcar=True, meta_diaria=20)

        assert resultado["sucesso"] is True
        assert resultado["leads_entregues"] == 20
        assert len(resultado["escolas_entregues"]) == 20
        mock_finalizar.assert_called_once()
        assert mock_finalizar.call_args[1]["status"] == "sucesso"


def test_parada_no_teto_de_custo(mock_supabase_credentials):
    """
    Quando o custo acumulado em custos_agente atinge ou supera MAX_CUSTO_DIARIO_USD,
    o laço de abastecimento é interrompido imediatamente com motivo_incompleto = 'teto_custo'.
    """
    with patch("scripts.agente_sdr.criar_agente_execucao", return_value="exec-teto"), \
         patch("scripts.agente_sdr.consultar_lote_hoje", return_value=None), \
         patch("scripts.agente_sdr.contar_qualificadas_disponiveis", return_value=5), \
         patch("scripts.agente_sdr.obter_custo_acumulado", return_value=5.50), \
         patch("scripts.agente_sdr.buscar_melhores_qualificadas", return_value=[]), \
         patch("scripts.agente_sdr.salvar_lote_diario", return_value="lote-teto"), \
         patch("scripts.agente_sdr.finalizar_execucao") as mock_finalizar:

        # Teto definido para 5.0, custo acumulado é 5.50
        resultado = executar_agente_sdr(gatilho="agendado", forcar=False, meta_diaria=20, max_custo_usd=5.0)

        assert resultado["sucesso"] is True
        assert resultado["motivo_incompleto"] == "teto_custo"
        mock_finalizar.assert_called_once()
        detalhes = mock_finalizar.call_args[1]["detalhes"]
        assert detalhes["motivo_incompleto"] == "teto_custo"


def test_entrega_parcial_base_esgotada(mock_supabase_credentials):
    """
    Quando os módulos de abastecimento não encontram mais dados (estoque de escolas ou decisores vazio)
    e não há 20 qualificadas prontas (ex: apenas 8), entrega as 8 disponíveis e registra motivo_incompleto = 'base_esgotada'.
    """
    escolas_parciais = [
        {
            "id": f"esc-parcial-{i}",
            "nome": f"Colégio {i}",
            "score": 85 - i,
            "matriculas_em": 150,
            "site": f"https://colegio{i}.com.br",
            "contatos": []
        }
        for i in range(8)
    ]

    with patch("scripts.agente_sdr.criar_agente_execucao", return_value="exec-parcial"), \
         patch("scripts.agente_sdr.consultar_lote_hoje", return_value=None), \
         patch("scripts.agente_sdr.contar_qualificadas_disponiveis", return_value=8), \
         patch("scripts.agente_sdr.contar_potencial_restante", return_value={"bruto": 0, "enriquecido_sem_site": 0, "qualificadas_nao_entregues": 8}), \
         patch("scripts.agente_sdr.obter_custo_acumulado", return_value=0.10), \
         patch("scripts.agente_sdr.enriquecer_escolas", return_value={"consultadas": 0}), \
         patch("scripts.agente_sdr.processar_decisores_escolas", return_value={"escolas_processadas": 0}), \
         patch("scripts.agente_sdr.verificar_emails_pendentes", return_value={"total_processados": 0}), \
         patch("scripts.agente_sdr.buscar_melhores_qualificadas", return_value=escolas_parciais), \
         patch("scripts.agente_sdr.salvar_lote_diario", return_value="lote-parcial"), \
         patch("scripts.agente_sdr.gerar_pesquisa_personalizacao", return_value={"resumo_pesquisa": None, "gancho_personalizacao": None, "custo_usd": 0.0}), \
         patch("scripts.agente_sdr.requests.patch") as mock_patch, \
         patch("scripts.agente_sdr.finalizar_execucao") as mock_finalizar:

        mock_patch.return_value.status_code = 200

        resultado = executar_agente_sdr(gatilho="manual", forcar=False, meta_diaria=20)

        assert resultado["sucesso"] is True
        assert resultado["leads_entregues"] == 8
        assert resultado["motivo_incompleto"] == "base_esgotada"
        assert len(resultado["escolas_entregues"]) == 8

        mock_finalizar.assert_called_once()
        assert mock_finalizar.call_args[1]["detalhes"]["motivo_incompleto"] == "base_esgotada"


def test_selecao_ordenada_por_score_e_matriculas(mock_supabase_credentials):
    """
    Testa se a consulta de melhores qualificadas envia order=score.desc.nullslast,matriculas_em.desc.nullslast
    e respeita o limite informado.
    """
    with patch("scripts.agente_sdr.requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {"id": "esc-1", "score": 95, "matriculas_em": 500},
            {"id": "esc-2", "score": 95, "matriculas_em": 200},
            {"id": "esc-3", "score": 80, "matriculas_em": 400}
        ]
        mock_get.return_value = mock_resp

        escolas = buscar_melhores_qualificadas("https://mock.supabase.co", "key", 3)

        assert len(escolas) == 3
        # Verifica URL chamada
        url_chamada = mock_get.call_args[0][0]
        assert "order=score.desc.nullslast,matriculas_em.desc.nullslast" in url_chamada
        assert "limit=3" in url_chamada
        assert "status_qualificacao=eq.qualificado" in url_chamada


def test_falha_catastrofica_marca_status_erro(mock_supabase_credentials):
    """
    Qualquer exceção não tratada durante o ciclo de execução deve ser capturada,
    marcando o registro em agente_execucoes com status 'erro', mensagem clara e stack trace.
    A execução NUNCA pode ficar presa com status 'rodando'.
    """
    with patch("scripts.agente_sdr.criar_agente_execucao", return_value="exec-fail-123"), \
         patch("scripts.agente_sdr.consultar_lote_hoje", side_effect=RuntimeError("Queda súbita de conexão")), \
         patch("scripts.agente_sdr.obter_custo_acumulado", return_value=0.0), \
         patch("scripts.agente_sdr.finalizar_execucao") as mock_finalizar:

        with pytest.raises(RuntimeError, match="Queda súbita de conexão"):
            executar_agente_sdr(gatilho="manual", forcar=False)

        mock_finalizar.assert_called_once()
        _, kwargs = mock_finalizar.call_args
        assert kwargs["status"] == "erro"
        assert kwargs["etapa_atual"] == "Erro"
        assert "stack" in kwargs["detalhes"]
        assert "Queda súbita de conexão" in kwargs["detalhes"]["stack"]
