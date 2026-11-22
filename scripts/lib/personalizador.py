"""
Módulo de pesquisa e personalização de abordagem SDR com Claude.
Gera resumo da proposta pedagógica e gancho de personalização baseado estritamente
em fatos reais extraídos do site oficial da escola e dados do Censo.
Aplica validação anti-alucinação: todo fato precisa estar comprovado no texto da fonte.
"""

import os
import re
import json
import logging
import unicodedata
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

import anthropic

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

from scripts.lib.site_crawler import crawl_escola_site, ler_cache
from scripts.lib.supabase_client import load_env_local_if_needed

load_env_local_if_needed()

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

DEFAULT_PRICE_INPUT_PER_M = float(os.getenv("PRICE_INPUT_PER_M", "0.80"))
DEFAULT_PRICE_OUTPUT_PER_M = float(os.getenv("PRICE_OUTPUT_PER_M", "4.00"))

SCHEMA_PERSONALIZACAO = {
    "name": "gerar_personalizacao_escola",
    "description": "Gera resumo da proposta e gancho de personalização baseado estritamente no texto fornecido.",
    "input_schema": {
        "type": "object",
        "properties": {
            "resumo_pesquisa": {
                "type": ["string", "null"],
                "description": "Até 3 frases sobre proposta da escola, diferenciais e segmento. Baseado apenas no texto e censo. Se sem fonte, null."
            },
            "gancho_personalizacao": {
                "type": ["string", "null"],
                "description": "Exatamente 1 frase concreta para abrir um e-mail comercial, citando um fato específico do site (projeto, metodologia, premiação, bilinguismo, etc.). Sem elogios genéricos. Se sem fato concreto, null."
            },
            "fato_literal_citado": {
                "type": ["string", "null"],
                "description": "Trecho literal contínuo (de 4 a 15 palavras) presente no texto da página que comprova o fato citado no gancho."
            },
            "url_fonte": {
                "type": ["string", "null"],
                "description": "URL exata da página onde o fato literal foi encontrado."
            }
        },
        "required": ["resumo_pesquisa", "gancho_personalizacao", "fato_literal_citado", "url_fonte"]
    }
}


def normalizar_texto(texto: Optional[str]) -> str:
    """Normaliza texto para conferência de presença literal ignorando acentos, maiúsculas e espaçamento."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower()
    return " ".join(ascii_str.split())


def obter_paginas_escola(escola: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Obtém as páginas do site da escola a partir do cache local ou crawler respeitoso."""
    site = escola.get("site")
    if not site or not site.strip():
        return []

    try:
        paginas = crawl_escola_site(site.strip(), max_paginas=4)
        return paginas
    except Exception as ex:
        logging.warning(f"Erro ao obter páginas da escola {escola.get('nome')}: {ex}")
        return []


def gerar_pesquisa_personalizacao(
    escola: Dict[str, Any],
    paginas: Optional[List[Dict[str, Any]]] = None,
    api_key: Optional[str] = None,
    modelo: Optional[str] = None
) -> Dict[str, Any]:
    """
    Gera resumo de pesquisa e gancho de personalização para a escola.
    Valida estritamente se o fato citado está presente no texto da fonte.
    Retorna: {
        "resumo_pesquisa": Optional[str],
        "gancho_personalizacao": Optional[str],
        "fontes_pesquisa": List[str],
        "custo_usd": float,
        "tokens_input": int,
        "tokens_output": int
    }
    """
    resultado_padrao = {
        "resumo_pesquisa": None,
        "gancho_personalizacao": None,
        "fontes_pesquisa": [],
        "custo_usd": 0.0,
        "tokens_input": 0,
        "tokens_output": 0
    }

    if paginas is None:
        paginas = obter_paginas_escola(escola)

    # Coleta textos e mapeia por URL
    textos_por_url: Dict[str, str] = {}
    for p in paginas:
        u = p.get("url", "")
        t = p.get("clean_text") or p.get("texto") or ""
        if u and t.strip():
            textos_por_url[u] = t.strip()

    if not textos_por_url:
        logging.info(f"Sem textos do site para personalização da escola: {escola.get('nome')}")
        return resultado_padrao

    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    if not key:
        logging.warning("ANTHROPIC_API_KEY não configurada. Não é possível gerar personalização com Claude.")
        return resultado_padrao

    model_name = modelo or os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")
    client = anthropic.Anthropic(api_key=key)

    # Constrói o contexto da escola para o prompt
    nome = escola.get("nome", "Escola")
    cidade = escola.get("cidade", "")
    uf = escola.get("uf", "")
    mat_em = escola.get("matriculas_em")
    mat_tot = escola.get("matriculas_total")

    censo_info = f"Nome: {nome}\nLocalização: {cidade}/{uf}\nMatrículas Ensino Médio (Censo): {mat_em or 'N/D'}\nTotal Matrículas: {mat_tot or 'N/D'}"

    # Prepara blocos de texto limitados a 12.000 caracteres no total
    blocos_texto = []
    tamanho_acumulado = 0
    for u, txt in textos_por_url.items():
        trecho = txt[:4000]
        blocos_texto.append(f"--- PÁGINA: {u} ---\n{trecho}")
        tamanho_acumulado += len(trecho)
        if tamanho_acumulado >= 12000:
            break

    texto_completo_site = "\n\n".join(blocos_texto)

    system_prompt = (
        "Você é um pesquisador e SDR sênior especializado em prospecção B2B para colégios particulares no Brasil. "
        "Seu objetivo é analisar os dados do Censo e o texto real do site da escola para produzir uma personalização autêntica.\n\n"
        "DIRETRIZES E REGRAS ESTRITAS:\n"
        "1. resumo_pesquisa: Até 3 frases concisas destacando a proposta pedagógica, principais diferenciais e segmento/público atendido. "
        "Baseie-se exclusivamente nos dados reais do site e do Censo fornecidos. Se não houver substância suficiente, deixe null.\n"
        "2. gancho_personalizacao: Exatamente 1 frase concreta e contextualizada para iniciar um e-mail de prospecção, mencionando um fato real e específico "
        "encontrado no site (ex: projeto pedagógico com nome próprio, olimpíada científica, programa bilíngue específico, feira cultural, clube de robótica, "
        "itinerário do novo ensino médio, metodologia específica).\n"
        "3. PROIBIDO ELOGIOS GENÉRICOS: NUNCA use frases vazias como 'Parabéns pelo belo trabalho', 'Notei a excelência do seu colégio' ou 'Parabéns pela tradição'. "
        "O gancho deve apenas citar o fato diretamente (Ex: 'Vi que o colégio implementou recentemente o laboratório de robótica Maker no Ensino Médio.').\n"
        "4. REGRA DE OURO ANTI-ALUCINAÇÃO: Em 'fato_literal_citado', forneça um trecho contínuo de 4 a 15 palavras idêntico ao texto da página que comprova o fato. "
        "Em 'url_fonte', indique a URL da página onde o trecho está. Se nenhum fato específico estiver presente no texto, retorne gancho_personalizacao=null.\n"
        "5. Chame a ferramenta gerar_personalizacao_escola com os dados extraídos."
    )

    user_prompt = (
        f"Analise a escola abaixo e gere a personalização conforme as instruções:\n\n"
        f"DADOS DO CENSO ESCOLAR:\n{censo_info}\n\n"
        f"CONTEÚDO DAS PÁGINAS DO SITE OFICIAL:\n{texto_completo_site}"
    )

    try:
        response = client.messages.create(
            model=model_name,
            max_tokens=600,
            temperature=0.1,
            system=system_prompt,
            tools=[SCHEMA_PERSONALIZACAO],
            tool_choice={"type": "tool", "name": "gerar_personalizacao_escola"},
            messages=[{"role": "user", "content": user_prompt}]
        )

        in_tokens = response.usage.input_tokens
        out_tokens = response.usage.output_tokens
        custo_usd = (in_tokens / 1_000_000.0) * DEFAULT_PRICE_INPUT_PER_M + (out_tokens / 1_000_000.0) * DEFAULT_PRICE_OUTPUT_PER_M

        tool_call = next((b for b in response.content if b.type == "tool_use"), None)
        if not tool_call or not isinstance(tool_call.input, dict):
            logging.warning(f"Claude não retornou chamada de ferramenta para escola {nome}")
            resultado_padrao["custo_usd"] = custo_usd
            resultado_padrao["tokens_input"] = in_tokens
            resultado_padrao["tokens_output"] = out_tokens
            return resultado_padrao

        dados = tool_call.input
        resumo = dados.get("resumo_pesquisa")
        gancho = dados.get("gancho_personalizacao")
        fato_literal = dados.get("fato_literal_citado")
        url_fonte = dados.get("url_fonte")

        fontes: List[str] = []
        gancho_validado = None

        # Validação estrita anti-alucinação
        if gancho and fato_literal and url_fonte:
            url_match = None
            for u in textos_por_url.keys():
                if u.lower().strip() == url_fonte.lower().strip():
                    url_match = u
                    break

            if not url_match and len(textos_por_url) == 1:
                url_match = list(textos_por_url.keys())[0]

            if url_match:
                texto_pagina = normalizar_texto(textos_por_url[url_match])
                fato_norm = normalizar_texto(fato_literal)

                # Confere se as palavras do fato aparecem na página
                if fato_norm and (fato_norm in texto_pagina or any(p in texto_pagina for p in fato_norm.split("  "))):
                    gancho_validado = gancho.strip()
                    fontes.append(url_match)
                else:
                    logging.warning(f"Fato literal '{fato_literal}' não encontrado no texto de {url_match}. Descartando gancho.")
            else:
                logging.warning(f"URL da fonte '{url_fonte}' não pertence às páginas crawleadas.")

        # Se resumo foi gerado e temos urls válidas
        if resumo and not fontes and textos_por_url:
            fontes.append(list(textos_por_url.keys())[0])

        return {
            "resumo_pesquisa": resumo.strip() if resumo else None,
            "gancho_personalizacao": gancho_validado,
            "fontes_pesquisa": list(dict.fromkeys(fontes)),
            "custo_usd": round(custo_usd, 6),
            "tokens_input": in_tokens,
            "tokens_output": out_tokens
        }

    except Exception as ex:
        logging.error(f"Erro ao chamar Claude para personalização da escola {nome}: {ex}")
        return resultado_padrao
