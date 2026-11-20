"""
Testes unitários para o módulo de descoberta de decisores, crawler e validação Claude.
Cobre:
(a) pessoa inventada pelo modelo (nome ausente do HTML) é descartada;
(b) e-mail ausente do HTML é descartado;
(c) e-mail '[arroba]' é reconhecido;
(d) institucional não vira pessoa;
(e) escolha do contato principal segue a prioridade pedagógica;
(f) robots.txt que bloqueia impede o download.
"""

from pathlib import Path
from unittest.mock import patch, MagicMock
import pytest
from bs4 import BeautifulSoup

from scripts.lib.site_crawler import (
    processar_pagina,
    extrair_emails,
    checar_robots_txt
)
from scripts.lib.extrator_claude import validar_extracao
from scripts.descobrir_decisores import (
    selecionar_contato_principal,
    consolidar_contatos
)

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures"

def carregar_html_fixture():
    caminho = FIXTURES_DIR / "pagina_escola.html"
    with open(caminho, "r", encoding="utf-8") as f:
        return f.read()

def test_pessoa_inventada_descartada():
    """(a) Garante que pessoa alucinada pelo modelo cujo nome não esteja no HTML é descartada."""
    html = carregar_html_fixture()
    url = "https://escolateste.com.br/equipe"
    dados_pagina = processar_pagina(html, url)

    # Simulação de resposta do Claude contendo uma pessoa real e uma pessoa inventada
    extracao_simulada = {
        "pessoas": [
            {
                "nome": "Maria Eduarda Santos",
                "cargo_como_escrito": "Diretora Pedagógica",
                "tipo": "diretor_pedagogico",
                "email": None,
                "url_fonte": url,
                "trecho_literal": "Maria Eduarda Santos Diretora Pedagógica"
            },
            {
                "nome": "Carlos Fantasma Inventado",
                "cargo_como_escrito": "Diretor Financeiro",
                "tipo": "diretor_geral",
                "email": "carlos@escola.com",
                "url_fonte": url,
                "trecho_literal": "Trecho que não existe"
            }
        ],
        "emails_institucionais": []
    }

    resultado = validar_extracao(extracao_simulada, [dados_pagina])
    pessoas_finais = resultado["pessoas"]

    assert len(pessoas_finais) == 1
    assert pessoas_finais[0]["nome"] == "Maria Eduarda Santos"
    # A pessoa inventada foi eliminada
    assert not any(p["nome"] == "Carlos Fantasma Inventado" for p in pessoas_finais)

def test_email_ausente_do_html_descartado():
    """(b) Garante que e-mail adivinhado/deduzido para uma pessoa real é descartado."""
    html = carregar_html_fixture()
    url = "https://escolateste.com.br/equipe"
    dados_pagina = processar_pagina(html, url)

    # O HTML não possui o e-mail 'maria.santos@gmail.com'
    extracao_simulada = {
        "pessoas": [
            {
                "nome": "Maria Eduarda Santos",
                "cargo_como_escrito": "Diretora Pedagógica",
                "tipo": "diretor_pedagogico",
                "email": "maria.santos@gmail.com",
                "url_fonte": url,
                "trecho_literal": "Maria Eduarda Santos Diretora Pedagógica"
            }
        ],
        "emails_institucionais": []
    }

    resultado = validar_extracao(extracao_simulada, [dados_pagina])
    pessoas_finais = resultado["pessoas"]

    assert len(pessoas_finais) == 1
    assert pessoas_finais[0]["nome"] == "Maria Eduarda Santos"
    # O e-mail inexistente foi anulado
    assert pessoas_finais[0]["email"] is None

def test_email_arroba_reconhecido():
    """(c) Garante que formas como 'nome [arroba] dominio.com' e '(arroba)' são reconhecidas."""
    html = carregar_html_fixture()
    soup = BeautifulSoup(html, "html.parser")
    emails = extrair_emails(html, soup)

    # Verifica os e-mails extraídos
    assert "secretariageral@escolateste.com.br" in emails
    assert "direcao@escolateste.com.br" in emails
    assert "contato@escolateste.com.br" in emails
    assert "ouvidoria@escolateste.com.br" in emails
    assert "lucas.silveira@escolateste.com.br" in emails

def test_institucional_nao_vira_pessoa():
    """(d) Garante que e-mails gerais/institucionais não são cadastrados como contatos de pessoa."""
    html = carregar_html_fixture()
    url = "https://escolateste.com.br/equipe"
    dados_pagina = processar_pagina(html, url)

    extracao_simulada = {
        "pessoas": [],
        "emails_institucionais": [
            {
                "email": "contato@escolateste.com.br",
                "funcao_indicada": "geral",
                "url_fonte": url
            },
            {
                "email": "secretariageral@escolateste.com.br",
                "funcao_indicada": "secretaria",
                "url_fonte": url
            }
        ]
    }

    resultado = validar_extracao(extracao_simulada, [dados_pagina])
    assert len(resultado["pessoas"]) == 0
    assert len(resultado["emails_institucionais"]) == 2

def test_escolha_contato_principal_segue_prioridade():
    """
    (e) Garante a hierarquia de contato principal:
    coordenador_em > diretor_pedagogico > diretor_geral > mantenedor > outros,
    com desempate favorecendo quem tem e-mail.
    """
    contatos = [
        {"nome": "Fulano Mantenedor", "tipo": "mantenedor", "email": None, "confianca": 80},
        {"nome": "Ciclana Diretora Geral", "tipo": "diretor_geral", "email": "dir@escola.com", "confianca": 70},
        {"nome": "Beltrano Diretor Pedagógico", "tipo": "diretor_pedagogico", "email": None, "confianca": 70},
        {"nome": "Prof. Lucas Coordenador", "tipo": "coordenador_em", "email": "lucas@escola.com", "confianca": 85},
    ]

    ordenados = selecionar_contato_principal(contatos)

    # Coordenador de Ensino Médio tem prioridade máxima
    assert ordenados[0]["nome"] == "Prof. Lucas Coordenador"
    assert ordenados[0]["principal"] is True

    # Demais devem ter principal = False
    for c in ordenados[1:]:
        assert c["principal"] is False

    # Teste de desempate por e-mail no mesmo cargo
    dois_coordenadores = [
        {"nome": "Coord Sem Email", "tipo": "coordenador_em", "email": None, "confianca": 80},
        {"nome": "Coord Com Email", "tipo": "coordenador_em", "email": "coord@escola.com", "confianca": 80},
    ]
    ordenados_coord = selecionar_contato_principal(dois_coordenadores)
    assert ordenados_coord[0]["nome"] == "Coord Com Email"
    assert ordenados_coord[0]["principal"] is True

def test_robots_txt_bloqueia_download():
    """(f) Garante que robots.txt com restrição impede o rastreamento da URL."""
    robots_content = "User-agent: *\nDisallow: /"

    with patch("requests.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = robots_content
        mock_get.return_value = mock_resp

        permitido = checar_robots_txt("https://escola-bloqueada.com.br/equipe", "LitteraBot/1.0")
        assert permitido is False
