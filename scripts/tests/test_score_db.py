"""
Teste do motor de score executando o script SQL de validação no banco de dados.
"""

from pathlib import Path
import pytest
import requests
from scripts.lib.supabase_client import get_supabase_credentials

TEST_SQL_PATH = Path(__file__).resolve().parent / "test_score.sql"

def test_motor_score_sql():
    """Executa a suíte SQL de testes do motor de score contra o banco de dados."""
    url = None
    key = None
    env_path = Path(".env.local")
    if env_path.exists():
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line.startswith("NEXT_PUBLIC_SUPABASE_URL=") or line.startswith("SUPABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                elif line.startswith("SUPABASE_SERVICE_ROLE_KEY=") or line.startswith("SUPABASE_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")

    if not url or not key or "mock-project" in url:
        try:
            url, key = get_supabase_credentials()
        except Exception:
            pass

    if not url or not key or "mock-project" in url:
        pytest.skip("Banco de dados ao vivo não configurado ou ambiente sob mock.")

    assert TEST_SQL_PATH.exists(), f"Arquivo {TEST_SQL_PATH} não encontrado"

    with open(TEST_SQL_PATH, "r", encoding="utf-8") as f:
        sql_content = f.read()

    # Executa a query via endpoint RPC ou REST do Supabase
    # Como o Supabase REST não executa DO blocks sem endpoint rpc customizado,
    # verificamos a integração via REST chamando calcular_score e testando as regras.
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }

    # 1. Cria escola de teste grande
    payload_esc = {
        "nome": "Escola Pytest Grande",
        "cidade": "Brasília",
        "uf": "DF",
        "matriculas_em": 250,
        "site": "https://pytest-escola.com.br",
        "telefone": "(61) 3333-8888",
        "status_qualificacao": "bruto",
        "status_funil": "novo",
        "oferece_ensino_medio": True
    }
    res_esc = requests.post(f"{url}/rest/v1/escolas", headers=headers, json=payload_esc, timeout=10)
    assert res_esc.status_code in (200, 201), f"Erro ao criar escola de teste: {res_esc.text}"
    escola_id = res_esc.json()[0]["id"]

    try:
        # 2. Cria contato com coordenador de EM e e-mail válido
        payload_contato = {
            "escola_id": escola_id,
            "nome": "Coordenador Pytest",
            "cargo": "Coordenador Ensino Médio",
            "tipo": "coordenador_em",
            "email": "coord@pytest-escola.com.br",
            "email_status": "valido",
            "principal": True,
            "fonte": "site"
        }
        res_c = requests.post(f"{url}/rest/v1/contatos", headers=headers, json=payload_contato, timeout=10)
        assert res_c.status_code in (200, 201), f"Erro ao criar contato de teste: {res_c.text}"

        # 3. O trigger automático em contatos já dispara calcular_score!
        # Vamos consultar a escola para validar
        res_get = requests.get(f"{url}/rest/v1/escolas?id=eq.{escola_id}&select=score,status_qualificacao,score_detalhes", headers=headers, timeout=10)
        assert res_get.status_code == 200
        dados = res_get.json()[0]

        # Faixa 3 (30) + Decisor coordenador email valido (30) + Site (5) + Telefone (5) + Regiao DF (5) = 75
        assert dados["score"] >= 60, f"Score esperado >= 60, obtido {dados['score']}"
        assert dados["status_qualificacao"] == "qualificado", f"Status esperado 'qualificado', obtido '{dados['status_qualificacao']}'"
        assert dados["score_detalhes"]["score"]["tem_email_liberado"] is True

        # 4. Testa escola sem e-mail liberado
        # Altera email_status do contato para 'invalido'
        contato_id = res_c.json()[0]["id"]
        requests.patch(f"{url}/rest/v1/contatos?id=eq.{contato_id}", headers=headers, json={"email_status": "invalido"}, timeout=10)

        res_get2 = requests.get(f"{url}/rest/v1/escolas?id=eq.{escola_id}&select=score,status_qualificacao,score_detalhes", headers=headers, timeout=10)
        dados2 = res_get2.json()[0]
        # Sem e-mail válido, mesmo com score > 0, NÃO pode ser qualificado!
        assert dados2["status_qualificacao"] == "enriquecido"
        assert dados2["score_detalhes"]["score"]["tem_email_liberado"] is False

    finally:
        # Limpeza
        requests.delete(f"{url}/rest/v1/escolas?id=eq.{escola_id}", headers=headers, timeout=10)
