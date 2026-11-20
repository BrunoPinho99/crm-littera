"""
Módulo de extração estruturada de decisores escolares utilizando Anthropic Claude SDK.
Atende aos requisitos:
- Modelo configurável por ANTHROPIC_MODEL (padrão claude-3-5-haiku-latest, suporta claude-3-5-sonnet-latest)
- Tool Use com JSON Schema restrito
- Prompt de sistema estrito exigindo evidência literal sem alucinação
- Validação pós-resposta de fidelidade aos fatos (descarte de nomes, e-mails e trechos não presentes na página)
- Cálculo e rastreamento de custos por tokens de entrada e saída
"""

import os
import re
import json
import logging
import unicodedata
from typing import List, Dict, Any, Optional, Tuple
import anthropic

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Tabela de preços padrão (USD por Milhão de Tokens)
# Claude 3.5 Haiku: Input $0.80 / 1M, Output $4.00 / 1M
DEFAULT_PRICE_INPUT_PER_M = 0.80
DEFAULT_PRICE_OUTPUT_PER_M = 4.00

SCHEMA_EXTRACAO = {
    "name": "extrair_decisores_escola",
    "description": "Extrai decisores, e-mails institucionais e oferta de ensino médio a partir do texto do site da escola.",
    "input_schema": {
        "type": "object",
        "properties": {
            "pessoas": {
                "type": "array",
                "description": "Lista de pessoas físicas identificadas com seus respectivos cargos e trecho de comprovação.",
                "items": {
                    "type": "object",
                    "properties": {
                        "nome": {
                            "type": "string",
                            "description": "Nome completo da pessoa, exatamente como escrito na página."
                        },
                        "cargo_como_escrito": {
                            "type": "string",
                            "description": "Cargo ou função exatamente como descrito no texto."
                        },
                        "tipo": {
                            "type": "string",
                            "enum": [
                                "mantenedor",
                                "diretor_geral",
                                "diretor_pedagogico",
                                "coordenador_em",
                                "secretaria",
                                "outro"
                            ],
                            "description": "Classificação padronizada do cargo para o CRM."
                        },
                        "email": {
                            "type": ["string", "null"],
                            "description": "E-mail pessoal ou direto da pessoa, SOMENTE se explicitamente vinculado a ela na página."
                        },
                        "telefone": {
                            "type": ["string", "null"],
                            "description": "Telefone ou ramal direto da pessoa se informado."
                        },
                        "url_fonte": {
                            "type": "string",
                            "description": "URL exata da página onde a informação foi encontrada."
                        },
                        "trecho_literal": {
                            "type": "string",
                            "maxLength": 300,
                            "description": "Trecho literal copiado da página (até 300 caracteres) comprovando a existência da pessoa e seu cargo."
                        }
                    },
                    "required": ["nome", "cargo_como_escrito", "tipo", "url_fonte", "trecho_literal"]
                }
            },
            "emails_institucionais": {
                "type": "array",
                "description": "E-mails gerais ou departamentais da escola encontrados nas páginas.",
                "items": {
                    "type": "object",
                    "properties": {
                        "email": {
                            "type": "string",
                            "description": "Endereço de e-mail institucional."
                        },
                        "funcao_indicada": {
                            "type": "string",
                            "enum": ["direcao", "coordenacao", "secretaria", "comercial", "geral"],
                            "description": "Finalidade do e-mail indicada pelo contexto."
                        },
                        "url_fonte": {
                            "type": "string",
                            "description": "URL onde o e-mail foi encontrado."
                        }
                    },
                    "required": ["email", "funcao_indicada", "url_fonte"]
                }
            },
            "oferece_ensino_medio_no_site": {
                "type": ["boolean", "null"],
                "description": "True se o site menciona explicitamente oferta de Ensino Médio, False se afirma explicitamente que não tem, null se não especificado."
            },
            "trecho_ensino_medio": {
                "type": ["string", "null"],
                "description": "Trecho literal da página citando o Ensino Médio."
            }
        },
        "required": ["pessoas", "emails_institucionais"]
    }
}

SYSTEM_PROMPT = """Você é um assistente de extração factual para um CRM de escolas privadas.
Sua regra absoluta: extraia apenas o que estiver explicitamente escrito no texto fornecido.
- NUNCA deduza ou adivinhe e-mails. Se não houver e-mail expressamente associado ao nome da pessoa, retorne email: null.
- Não complete nomes que estejam abreviados ou incompletos no texto.
- O campo 'trecho_literal' deve ser uma CÓPIA EXATA e literal do texto da página (máximo 300 caracteres).
- Se não houver pessoas ou e-mails no texto, devolva listas vazias.
- Não invente cargos. O campo 'cargo_como_escrito' deve refletir a nomenclatura exata da página.
- Preste atenção especial a: Diretor(a), Vice-Diretor(a), Coordenador(a) do Ensino Médio e Mantenedores."""

def normalizar_texto_ascii(texto: Any) -> str:
    """Remove acentuação e converte para minúsculas."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"[^a-z0-9\s]", " ", ascii_str)

def validar_extracao(
    extracao: Dict[str, Any],
    paginas: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Validação estrita pós-resposta do LLM:
    - Descarta pessoas cujo nome não apareça no texto da página fonte.
    - Descarta e-mails de pessoas que não apareçam no HTML/texto da página.
    - Descarta trechos literais que não estejam na página.
    - Descarta e-mails institucionais que não constem na página fonte.
    """
    paginas_por_url = {p["url"].rstrip("/"): p for p in paginas}

    pessoas_validadas: List[Dict[str, Any]] = []
    for pessoa in extracao.get("pessoas", []):
        nome = pessoa.get("nome", "").strip()
        url_fonte = (pessoa.get("url_fonte") or "").rstrip("/")
        trecho = pessoa.get("trecho_literal", "").strip()
        email = pessoa.get("email")

        pag = paginas_por_url.get(url_fonte)
        if not pag:
            # Tenta encontrar por matching parcial da URL
            for u, p_item in paginas_por_url.items():
                if u in url_fonte or url_fonte in u:
                    pag = p_item
                    break

        if not pag:
            logging.warning(f"[VALIDAÇÃO DESCARTE] Pessoa '{nome}' descartada: url_fonte '{url_fonte}' desconhecida.")
            continue

        texto_pag = pag.get("clean_text", "")
        norm_texto_pag = normalizar_texto_ascii(texto_pag)
        norm_nome = normalizar_texto_ascii(nome)

        # 1. Nome deve aparecer na página
        if norm_nome not in norm_texto_pag:
            logging.warning(
                f"[VALIDAÇÃO DESCARTE] Pessoa '{nome}' descartada: nome não encontrado no texto de {url_fonte}."
            )
            continue

        # 2. Trecho literal deve estar contido na página
        if trecho:
            norm_trecho = normalizar_texto_ascii(trecho)
            # Confere se ao menos 70% das palavras do trecho estão na página
            palavras_trecho = [w for w in norm_trecho.split() if len(w) > 3]
            if palavras_trecho:
                encontradas = sum(1 for w in palavras_trecho if w in norm_texto_pag)
                if (encontradas / len(palavras_trecho)) < 0.70:
                    logging.warning(
                        f"[VALIDAÇÃO DESCARTE] Trecho da pessoa '{nome}' não localizado com precisão em {url_fonte}."
                    )
                    pessoa["trecho_literal"] = None

        # 3. Se houver e-mail, deve constar na página
        if email:
            email_clean = email.strip().lower()
            emails_pag = [e.lower() for e in pag.get("emails", [])]
            if email_clean not in emails_pag and email_clean not in texto_pag.lower():
                logging.warning(
                    f"[VALIDAÇÃO DESCARTE] E-mail '{email}' de '{nome}' descartado: e-mail ausente da página {url_fonte}."
                )
                pessoa["email"] = None

        pessoas_validadas.append(pessoa)

    # Valida e-mails institucionais
    institucionais_validados: List[Dict[str, Any]] = []
    for inst in extracao.get("emails_institucionais", []):
        em = inst.get("email", "").strip().lower()
        url_f = (inst.get("url_fonte") or "").rstrip("/")
        pag = paginas_por_url.get(url_f)
        if not pag:
            for u, p_item in paginas_por_url.items():
                if u in url_f or url_f in u:
                    pag = p_item
                    break

        if pag:
            texto_pag = pag.get("clean_text", "").lower()
            emails_pag = [e.lower() for e in pag.get("emails", [])]
            if em in emails_pag or em in texto_pag:
                institucionais_validados.append(inst)
            else:
                logging.warning(f"[VALIDAÇÃO DESCARTE] E-mail institucional '{em}' descartado: ausente de {url_f}.")
        else:
            logging.warning(f"[VALIDAÇÃO DESCARTE] E-mail institucional '{em}' descartado: URL desconhecida {url_f}.")

    return {
        "pessoas": pessoas_validadas,
        "emails_institucionais": institucionais_validados,
        "oferece_ensino_medio_no_site": extracao.get("oferece_ensino_medio_no_site"),
        "trecho_ensino_medio": extracao.get("trecho_ensino_medio")
    }

def extrair_decisores_com_claude(
    nome_escola: str,
    dominio: Optional[str],
    paginas: List[Dict[str, Any]],
    api_key: Optional[str] = None,
    modelo: Optional[str] = None
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Envia o conteúdo rastreado das páginas para o modelo Claude via Tool Use
    e aplica validação estrita anti-alucinação.
    Retorna: (resultado_validado, metadados_custo)
    """
    key = api_key or os.getenv("ANTHROPIC_API_KEY")
    # Padrão: claude-3-5-haiku-latest (ou claude-3-5-sonnet-latest se configurado)
    model_name = modelo or os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest")

    if not key:
        logging.warning("ANTHROPIC_API_KEY não configurada. Extração via Claude ignorada.")
        return {"pessoas": [], "emails_institucionais": []}, {"input_tokens": 0, "output_tokens": 0, "custo_usd": 0.0}

    client = anthropic.Anthropic(api_key=key)

    # Constrói o texto de entrada agregando as páginas
    conteudo_paginas = []
    for idx, p in enumerate(paginas, start=1):
        # Trunca páginas muito longas para economizar tokens mantendo o topo (onde ficam contatos e equipe)
        texto = p.get("clean_text", "")[:4000]
        conteudo_paginas.append(
            f"=== PÁGINA {idx} (URL: {p['url']}) ===\n"
            f"E-mails detectados: {', '.join(p.get('emails', []))}\n"
            f"Telefones detectados: {', '.join(p.get('telefones', []))}\n"
            f"Texto:\n{texto}\n"
        )

    user_prompt = (
        f"Escola: {nome_escola}\n"
        f"Domínio Oficial: {dominio or 'não informado'}\n\n"
        f"Abaixo estão os textos coletados das páginas do site da escola:\n\n"
        + "\n".join(conteudo_paginas)
        + "\n\nExtraia todas as pessoas da liderança (direção, coordenação de ensino médio, mantenedores, secretaria) "
        "com seus respectivos trechos literais de comprovação utilizando a ferramenta extrair_decisores_escola."
    )

    try:
        response = client.messages.create(
            model=model_name,
            max_tokens=2048,
            temperature=0.0,
            system=SYSTEM_PROMPT,
            tools=[SCHEMA_EXTRACAO],
            tool_choice={"type": "tool", "name": "extrair_decisores_escola"},
            messages=[{"role": "user", "content": user_prompt}]
        )

        # Extrai os dados retornados no tool_use
        raw_output: Dict[str, Any] = {"pessoas": [], "emails_institucionais": []}
        for block in response.content:
            if block.type == "tool_use" and block.name == "extrair_decisores_escola":
                raw_output = block.input
                break

        # Coleta contagem de tokens e calcula custo
        in_tokens = response.usage.input_tokens
        out_tokens = response.usage.output_tokens

        price_in = float(os.getenv("PRICE_INPUT_PER_M", DEFAULT_PRICE_INPUT_PER_M))
        price_out = float(os.getenv("PRICE_OUTPUT_PER_M", DEFAULT_PRICE_OUTPUT_PER_M))
        custo_usd = (in_tokens * price_in / 1_000_000.0) + (out_tokens * price_out / 1_000_000.0)

        meta_custo = {
            "modelo": model_name,
            "input_tokens": in_tokens,
            "output_tokens": out_tokens,
            "custo_usd": round(custo_usd, 6)
        }

        # Aplica validação de fidelidade contra o HTML/texto das páginas
        resultado_validado = validar_extracao(raw_output, paginas)
        return resultado_validado, meta_custo

    except Exception as ex:
        logging.error(f"Erro ao chamar Anthropic API para {nome_escola}: {ex}")
        return {"pessoas": [], "emails_institucionais": []}, {"input_tokens": 0, "output_tokens": 0, "custo_usd": 0.0}
