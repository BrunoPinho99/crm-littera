"""
Testes unitários e de integração simulada para verificação de e-mails:
1. Tradução de status para ZeroBounce, MillionVerifier e NeverBounce.
2. Cache de 90 dias (reutilização sem nova requisição).
3. MX inexistente marcado como 'invalido' localmente sem chamar o provedor.
4. Falta de créditos interrompe a execução com CreditosEsgotadosError.
5. Regras de pode_enviar respeitando envio.json.
"""

from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
import pytest

from scripts.lib.verificador_email import (
    verificar,
    verificar_zerobounce,
    verificar_millionverifier,
    verificar_neverbounce,
    validar_sintaxe,
    validar_mx,
    eh_descartavel,
    CreditosEsgotadosError
)
from scripts.lib.regras_envio import pode_enviar
from scripts.verificar_emails import consultar_cache_verificacao


# ==============================================================================
# 1. TRADUÇÃO DE STATUS POR PROVEDOR
# ==============================================================================

def test_traducao_status_zerobounce():
    with patch("requests.get") as mock_get:
        # Valid
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"status": "valid", "sub_status": None}
        res_v = verificar_zerobounce("teste@colegio.com.br", "mock_key")
        assert res_v["status"] == "valido"

        # Invalid
        mock_get.return_value.json.return_value = {"status": "invalid", "sub_status": "mailbox_not_found"}
        res_i = verificar_zerobounce("teste@colegio.com.br", "mock_key")
        assert res_i["status"] == "invalido"

        # Catch-all
        mock_get.return_value.json.return_value = {"status": "catch-all", "sub_status": None}
        res_c = verificar_zerobounce("teste@colegio.com.br", "mock_key")
        assert res_c["status"] == "catch_all"

        # Spamtrap / Abuse -> Arriscado
        mock_get.return_value.json.return_value = {"status": "spamtrap", "sub_status": "possible_trap"}
        res_a = verificar_zerobounce("teste@colegio.com.br", "mock_key")
        assert res_a["status"] == "arriscado"

        # Unknown -> Desconhecido
        mock_get.return_value.json.return_value = {"status": "unknown", "sub_status": "timeout"}
        res_u = verificar_zerobounce("teste@colegio.com.br", "mock_key")
        assert res_u["status"] == "desconhecido"


def test_traducao_status_millionverifier():
    with patch("requests.get") as mock_get:
        mock_get.return_value.status_code = 200

        # Code 1 -> Valido
        mock_get.return_value.json.return_value = {"result": "ok", "resultcode": 1, "credits": 500}
        res_v = verificar_millionverifier("teste@colegio.com.br", "mock_key")
        assert res_v["status"] == "valido"

        # Code 2 -> Invalido
        mock_get.return_value.json.return_value = {"result": "bad", "resultcode": 2, "credits": 499}
        res_i = verificar_millionverifier("teste@colegio.com.br", "mock_key")
        assert res_i["status"] == "invalido"

        # Code 3 -> Catch_all
        mock_get.return_value.json.return_value = {"result": "catch_all", "resultcode": 3, "credits": 498}
        res_c = verificar_millionverifier("teste@colegio.com.br", "mock_key")
        assert res_c["status"] == "catch_all"

        # Code 5 (spamtrap) / Code 6 (disposable) -> Arriscado
        mock_get.return_value.json.return_value = {"result": "spamtrap", "resultcode": 5, "credits": 497}
        res_a = verificar_millionverifier("teste@colegio.com.br", "mock_key")
        assert res_a["status"] == "arriscado"

        # Code 4 -> Desconhecido
        mock_get.return_value.json.return_value = {"result": "unknown", "resultcode": 4, "credits": 496}
        res_u = verificar_millionverifier("teste@colegio.com.br", "mock_key")
        assert res_u["status"] == "desconhecido"


def test_traducao_status_neverbounce():
    with patch("requests.get") as mock_get:
        mock_get.return_value.status_code = 200

        # Valid
        mock_get.return_value.json.return_value = {"status": "success", "result": "valid"}
        assert verificar_neverbounce("teste@colegio.com.br", "mock_key")["status"] == "valido"

        # Invalid
        mock_get.return_value.json.return_value = {"status": "success", "result": "invalid"}
        assert verificar_neverbounce("teste@colegio.com.br", "mock_key")["status"] == "invalido"

        # Catchall
        mock_get.return_value.json.return_value = {"status": "success", "result": "catchall"}
        assert verificar_neverbounce("teste@colegio.com.br", "mock_key")["status"] == "catch_all"

        # Disposable
        mock_get.return_value.json.return_value = {"status": "success", "result": "disposable"}
        assert verificar_neverbounce("teste@colegio.com.br", "mock_key")["status"] == "arriscado"


# ==============================================================================
# 2. CHECAGEM LOCAL MX (SEM GASTAR PROVEDOR)
# ==============================================================================

def test_mx_inexistente_sem_chamar_provedor():
    with patch("scripts.lib.verificador_email.validar_mx", return_value=False):
        with patch("requests.get") as mock_req:
            res = verificar("diretor@dominio-sem-servidor-mx.com.br", provedor_override="zerobounce", api_key_override="chave123")
            assert res["status"] == "invalido"
            assert res["sub_status"] == "sem_mx"
            assert res["provedor"] == "local"
            assert res["custo_usd"] == 0.0
            # Nenhuma chamada de API externa foi realizada
            assert mock_req.call_count == 0


def test_sintaxe_invalida_sem_chamar_provedor():
    with patch("requests.get") as mock_req:
        res = verificar("email_invalido_sem_arroba.com")
        assert res["status"] == "invalido"
        assert res["sub_status"] == "sintaxe_invalida"
        assert res["provedor"] == "local"
        assert mock_req.call_count == 0


def test_descartavel_sem_chamar_provedor():
    with patch("requests.get") as mock_req:
        res = verificar("coordenador@mailinator.com")
        assert res["status"] == "invalido"
        assert res["sub_status"] == "descartavel"
        assert res["provedor"] == "local"
        assert mock_req.call_count == 0


# ==============================================================================
# 3. INTERRUPÇÃO POR FALTA DE CRÉDITO
# ==============================================================================

def test_falta_credito_zerobounce():
    with patch("requests.get") as mock_get:
        # ZeroBounce retorna 402 ou mensagem com erro de créditos
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"error": "No credits left to validate emails"}
        with pytest.raises(CreditosEsgotadosError):
            verificar_zerobounce("contato@escola.com.br", "mock_key")


def test_falta_credito_millionverifier():
    with patch("requests.get") as mock_get:
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = {"result": "credit_error", "credits": 0}
        with pytest.raises(CreditosEsgotadosError):
            verificar_millionverifier("contato@escola.com.br", "mock_key")


# ==============================================================================
# 4. CACHE DE 90 DIAS
# ==============================================================================

def test_cache_90_dias():
    with patch("requests.get") as mock_get:
        # 1. Simula retorno do cache para e-mail verificado há 10 dias
        data_recente = (datetime.now(timezone.utc) - timedelta(days=10)).isoformat()
        mock_get.return_value.status_code = 200
        mock_get.return_value.json.return_value = [{
            "email": "contato@escola.com.br",
            "status": "valido",
            "sub_status": None,
            "provedor": "zerobounce",
            "verificado_em": data_recente
        }]

        resultado_cache = consultar_cache_verificacao(
            "https://mock.supabase.co", "mock_key", "contato@escola.com.br", dias_validade=90
        )
        assert resultado_cache is not None
        assert resultado_cache["status"] == "valido"

        # 2. Simula retorno vazio para cache expirado (> 90 dias)
        mock_get.return_value.json.return_value = []
        resultado_expirado = consultar_cache_verificacao(
            "https://mock.supabase.co", "mock_key", "contato@escola.com.br", dias_validade=90
        )
        assert resultado_expirado is None


# ==============================================================================
# 5. REGRAS DE PODE_ENVIAR (ENVIO.JSON)
# ==============================================================================

def test_pode_enviar_regras_padrao():
    # Padrão: aceitar_status = ['valido'], arriscado = False, catch_all = False
    cfg_padrao = {
        "aceitar_status": ["valido"],
        "aceitar_catch_all": False,
        "aceitar_arriscado": False
    }

    assert pode_enviar("valido", cfg_padrao) is True
    assert pode_enviar("invalido", cfg_padrao) is False
    assert pode_enviar("arriscado", cfg_padrao) is False
    assert pode_enviar("catch_all", cfg_padrao) is False
    assert pode_enviar("nao_verificado", cfg_padrao) is False
    assert pode_enviar("desconhecido", cfg_padrao) is False
    assert pode_enviar(None, cfg_padrao) is False


def test_pode_enviar_regras_personalizadas():
    # Permite catch_all e arriscado
    cfg_permissiva = {
        "aceitar_status": ["valido", "catch_all"],
        "aceitar_catch_all": True,
        "aceitar_arriscado": True
    }

    assert pode_enviar("valido", cfg_permissiva) is True
    assert pode_enviar("catch_all", cfg_permissiva) is True
    assert pode_enviar("arriscado", cfg_permissiva) is True
    assert pode_enviar("invalido", cfg_permissiva) is False
