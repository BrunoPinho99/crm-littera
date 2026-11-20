import os
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Configura variáveis de ambiente mock para teste
os.environ["SUPABASE_URL"] = "https://mock-project.supabase.co"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "mock-service-role-key"

# Adiciona raiz ao path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from scripts.lib.supabase_client import upsert, sanitize_row


def test_sanitize_row_removes_none():
    row = {
        "nome": "Colégio Modelo",
        "cidade": "Brasília",
        "uf": "DF",
        "telefone": None,
        "email_geral": "contato@colegiomodelo.com.br",
        "site": None,
    }
    sanitized = sanitize_row(row)
    assert "telefone" not in sanitized
    assert "site" not in sanitized
    assert sanitized["nome"] == "Colégio Modelo"
    assert sanitized["email_geral"] == "contato@colegiomodelo.com.br"


def test_batch_upsert_19_new_and_1_duplicate():
    """
    Testa envio em lote onde 19 registros são novos e 1 é duplicado (atualizado).
    O mock simula retorno da representação com 19 registros recém-criados e 1 atualizado.
    """
    lote = [
        {"nome": f"Escola {i}", "cidade": "Brasília", "uf": "DF", "telefone": None}
        for i in range(20)
    ]

    # Simula resposta do PostgREST em lote com representação
    # 19 novos (criado_em == atualizado_em) e 1 duplicado/atualizado (atualizado_em > criado_em)
    mock_response_data = []
    for i in range(19):
        mock_response_data.append({
            "id": f"uuid-{i}",
            "nome": f"Escola {i}",
            "criado_em": "2026-11-20T10:00:00Z",
            "atualizado_em": "2026-11-20T10:00:00Z",
        })
    # O 20º é um registro existente que foi atualizado
    mock_response_data.append({
        "id": "uuid-19",
        "nome": "Escola 19",
        "criado_em": "2026-11-19T08:00:00Z",
        "atualizado_em": "2026-11-20T10:00:00Z",
    })

    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.text = "ok"
    mock_resp.json.return_value = mock_response_data

    with patch("requests.post", return_value=mock_resp) as mock_post:
        stats = upsert("escolas", lote, on_conflict="chave_dedup")

        assert mock_post.call_count == 1
        # Verifica se 'telefone' (None) foi removido do payload enviado
        sent_payload = mock_post.call_args[1]["json"]
        assert len(sent_payload) == 20
        assert "telefone" not in sent_payload[0]

        # 19 novos inseridos e 1 duplicado atualizado
        assert stats["inseridos"] == 19
        assert stats["atualizados"] == 1
        assert stats["falhas"] == 0


def test_fallback_to_line_by_line_on_batch_failure():
    """
    Simula uma falha no lote (ex: erro 409 Conflict ou 400 Bad Request)
    e prova que o cliente cai automaticamente para o modo linha a linha,
    gravando as 19 novas e atualizando a duplicada sem abortar.
    """
    lote = [
        {"nome": f"Escola {i}", "cidade": "Brasília", "uf": "DF"}
        for i in range(20)
    ]

    # Mock do lote com falha (ex: PostgREST 409 Conflict)
    batch_fail_resp = MagicMock()
    batch_fail_resp.status_code = 409
    batch_fail_resp.text = '{"message": "conflict on expression"}'

    # Mocks para cada linha individual:
    # 19 novas respondem 201 Created
    # 1 duplicada responde 200 OK
    individual_responses = []
    for i in range(19):
        r = MagicMock()
        r.status_code = 201
        r.text = "ok"
        r.json.return_value = [{
            "id": f"uuid-{i}",
            "nome": f"Escola {i}",
            "criado_em": "2026-11-20T10:00:00Z",
            "atualizado_em": "2026-11-20T10:00:00Z"
        }]
        individual_responses.append(r)

    # Linha duplicada responde 200 OK
    dup_r = MagicMock()
    dup_r.status_code = 200
    dup_r.text = "ok"
    dup_r.json.return_value = [{
        "id": "uuid-19",
        "nome": "Escola 19",
        "criado_em": "2026-11-19T08:00:00Z",
        "atualizado_em": "2026-11-20T10:00:00Z"
    }]
    individual_responses.append(dup_r)

    # Primeira chamada é o lote (falha), seguidas de 20 chamadas individuais
    all_responses = [batch_fail_resp] + individual_responses

    with patch("requests.post", side_effect=all_responses) as mock_post:
        stats = upsert("escolas", lote, on_conflict="chave_dedup")

        # Prova que caiu para o modo linha a linha:
        # 1 chamada em lote + 20 individuais = 21 chamadas
        assert mock_post.call_count == 21
        assert stats["inseridos"] == 19
        assert stats["atualizados"] == 1
        assert stats["falhas"] == 0


def test_fallback_handles_individual_errors_without_aborting():
    """
    Testa se uma falha persistente em uma linha individual durante o fallback
    é contabilizada como falha e registrada no log sem descartar o restante.
    """
    lote = [
        {"nome": f"Escola {i}", "cidade": "Brasília", "uf": "DF"}
        for i in range(5)
    ]

    batch_fail = MagicMock()
    batch_fail.status_code = 500
    batch_fail.text = "Internal Server Error"

    line_responses = []
    # 4 linhas com sucesso (201)
    for i in range(4):
        r = MagicMock()
        r.status_code = 201
        r.text = "ok"
        r.json.return_value = [{"id": f"uuid-{i}", "criado_em": "2026", "atualizado_em": "2026"}]
        line_responses.append(r)

    # 1 linha com erro permanente (ex: campo inválido)
    err_r = MagicMock()
    err_r.status_code = 422
    err_r.text = '{"message": "violates check constraint"}'
    line_responses.append(err_r)

    with patch("requests.post", side_effect=[batch_fail] + line_responses):
        stats = upsert("escolas", lote, on_conflict="chave_dedup")

        assert stats["inseridos"] == 4
        assert stats["atualizados"] == 0
        assert stats["falhas"] == 1
