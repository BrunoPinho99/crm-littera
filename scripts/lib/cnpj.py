"""
Módulo de integração e normalização de dados de CNPJ via BrasilAPI e OpenCNPJ (HTTP).
Atende aos requisitos de consulta com cache, fallbacks, limites de requisição e parsing de QSA.

Mapeamento confirmado BrasilAPI (GET https://brasilapi.com.br/api/cnpj/v1/{cnpj}):
- razao_social: str
- nome_fantasia: str
- descricao_situacao_cadastral: str (ex: 'ATIVA', 'BAIXADA')
- porte: str (ex: 'DEMAIS', 'MICRO EMPRESA', 'EMPRESA DE PEQUENO PORTE')
- capital_social: numeric (int/float)
- ddd_telefone_1: str (ex: '6133334444' ou '2121660000')
- ddd_telefone_2: str
- email: str (ex: 'contato@escola.com.br')
- cnae_fiscal: int/str (ex: 8520100)
- natureza_juridica: str
- qsa: lista de dicts com 'nome_socio', 'qualificacao_socio', 'identificador_de_socio' (1=PJ, 2=PF, 3=Estrangeiro)

Mapeamento confirmado OpenCNPJ (GET https://kitana.opencnpj.com/cnpj/{cnpj}):
- data.razaoSocial: str
- data.nomeFantasia: str
- data.situacaoCadastral: str (ex: 'Ativa')
- data.porte: str
- data.capitalSocial: numeric
- data.telefone: str (ex: '(61) 3493-9002')
- data.email: str
- data.cnaes: lista de dicts [{'cnae': '...', 'descricao': '...'}]
- data.naturezaJuridica: str
- data.socios: lista de dicts com 'nomeSocio', 'descricao' (qualificacao), 'identificadorSocio' (1=PJ, 2=PF)
"""

import re
import time
import logging
import unicodedata
from typing import Dict, Any, List, Optional, Tuple
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# Controle de taxa para chamadas à BrasilAPI
_last_brasilapi_request_time: float = 0.0

# Qualificações de comando aceitas no QSA para criação de contatos
QUALIFICACOES_COMANDO_PALAVRAS_CHAVE = [
    "socio-administrador",
    "socio administrador",
    "administrador",
    "presidente",
    "diretor",
    "diretora",
    "titular",
    "gerente",
    "socio-gerente",
    "socio gerente",
    "superintendente",
    "fundador",
    "instituidor",
    "socio ostensivo",
    "socio de responsabilidade limitada",
    "procurador",
    "conselheiro",
]

TERMOS_NAO_COMANDO = [
    "menor",
    "incapaz",
    "sem cargo",
    "assistido",
    "representado",
    "nao informada",
]

def normalizar_texto_ascii(texto: str) -> str:
    """Remove acentos e pontuação, convertendo para minúsculas."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()

def is_qualificacao_comando(qualificacao: str) -> bool:
    """Verifica se a qualificação do sócio representa um cargo de decisão/comando."""
    if not qualificacao:
        return False
    norm = normalizar_texto_ascii(qualificacao)

    # Rejeita termos explicitamente não decisórios
    for termo in TERMOS_NAO_COMANDO:
        if termo in norm:
            return False

    for kw in QUALIFICACOES_COMANDO_PALAVRAS_CHAVE:
        if kw in norm:
            return True
    return False

def formatar_nome_proprio(nome: str) -> str:
    """Formata nomes próprios preservando preposições brasileiras em minúsculas."""
    if not nome:
        return ""
    preposicoes = {"de", "da", "do", "das", "dos", "e", "em"}
    partes = nome.strip().split()
    formatadas = []
    for i, p in enumerate(partes):
        p_lower = p.lower()
        if i > 0 and p_lower in preposicoes:
            formatadas.append(p_lower)
        else:
            formatadas.append(p.capitalize())
    return " ".join(formatadas)

def limpar_cnpj(raw_cnpj: Any) -> Optional[str]:
    """Extrai somente os dígitos do CNPJ, retornando string de 14 dígitos ou None."""
    if not raw_cnpj:
        return None
    digits = re.sub(r"\D", "", str(raw_cnpj).strip())
    return digits if len(digits) == 14 else None

def valida_cnpj(raw_cnpj: Any) -> bool:
    """
    Confere se o CNPJ possui 14 dígitos e se os dígitos verificadores (DVs) são matematicamente válidos.
    Rejeita sequências de dígitos idênticos.
    """
    digits = limpar_cnpj(raw_cnpj)
    if not digits:
        return False

    # Rejeita dígitos iguais repetidos
    if len(set(digits)) == 1:
        return False

    # 1º Dígito Verificador
    pesos1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma1 = sum(int(d) * w for d, w in zip(digits[:12], pesos1))
    resto1 = soma1 % 11
    dv1 = 0 if resto1 < 2 else 11 - resto1
    if int(digits[12]) != dv1:
        return False

    # 2º Dígito Verificador
    pesos2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    soma2 = sum(int(d) * w for d, w in zip(digits[:13], pesos2))
    resto2 = soma2 % 11
    dv2 = 0 if resto2 < 2 else 11 - resto2
    if int(digits[13]) != dv2:
        return False

    return True

def format_phone(phone_str: str) -> Optional[str]:
    """Formata número de telefone brasileiro com DDD no formato (XX) XXXX-XXXX ou (XX) XXXXX-XXXX."""
    if not phone_str:
        return None
    digits = re.sub(r"\D", "", phone_str)
    if len(digits) == 10:
        return f"({digits[:2]}) {digits[2:6]}-{digits[6:]}"
    elif len(digits) == 11:
        return f"({digits[:2]}) {digits[2:7]}-{digits[7:]}"
    return phone_str.strip() if phone_str.strip() else None

def consulta_brasilapi(
    cnpj: str,
    min_interval: float = 1.5,
    max_tentativas: int = 3
) -> Optional[Dict[str, Any]]:
    """
    Consulta o CNPJ na BrasilAPI respeitando intervalo mínimo entre chamadas (padrão 1,5s)
    e realizando até 3 tentativas com espera exponencial em caso de 429 ou 5xx.
    """
    global _last_brasilapi_request_time

    clean = limpar_cnpj(cnpj)
    if not clean or not valida_cnpj(clean):
        logging.warning(f"CNPJ inválido para consulta BrasilAPI: {cnpj}")
        return None

    url = f"https://brasilapi.com.br/api/cnpj/v1/{clean}"
    headers = {
        "User-Agent": "Mozilla/5.0 (CRM-Littera; CNPJ-Enricher)",
        "Accept": "application/json"
    }

    wait_backoff = 2.0
    for tentativa in range(1, max_tentativas + 1):
        # Respeita o intervalo mínimo desde a última requisição
        elapsed = time.time() - _last_brasilapi_request_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        try:
            _last_brasilapi_request_time = time.time()
            res = requests.get(url, headers=headers, timeout=20)
            
            if res.status_code == 200:
                return res.json()

            if res.status_code == 404:
                logging.info(f"BrasilAPI: CNPJ {clean} não encontrado (404).")
                return None

            if res.status_code == 429 or res.status_code >= 500:
                logging.warning(
                    f"BrasilAPI retornou {res.status_code} para CNPJ {clean} (tentativa {tentativa}/{max_tentativas}). "
                    f"Aguardando {wait_backoff:.1f}s..."
                )
                time.sleep(wait_backoff)
                wait_backoff *= 2.0
                continue
            else:
                logging.warning(f"BrasilAPI retornou código inesperado {res.status_code}: {res.text[:150]}")
                return None

        except (requests.Timeout, requests.RequestException) as ex:
            logging.warning(f"Erro de rede BrasilAPI tentativa {tentativa}/{max_tentativas}: {ex}")
            if tentativa < max_tentativas:
                time.sleep(wait_backoff)
                wait_backoff *= 2.0

    return None

def consulta_opencnpj(cnpj: str, timeout: int = 20) -> Optional[Dict[str, Any]]:
    """
    Consulta o CNPJ na API REST pública do OpenCNPJ (https://kitana.opencnpj.com/cnpj/{cnpj})
    como reserva gratuita caso a BrasilAPI falhe.
    """
    clean = limpar_cnpj(cnpj)
    if not clean or not valida_cnpj(clean):
        logging.warning(f"CNPJ inválido para consulta OpenCNPJ: {cnpj}")
        return None

    url = f"https://kitana.opencnpj.com/cnpj/{clean}"
    headers = {
        "User-Agent": "Mozilla/5.0 (CRM-Littera; CNPJ-Enricher)",
        "Accept": "application/json"
    }

    try:
        res = requests.get(url, headers=headers, timeout=timeout)
        if res.status_code == 200:
            body = res.json()
            if isinstance(body, dict):
                # O endpoint kitana.opencnpj.com encapsula em 'data'
                return body.get("data") or body
        elif res.status_code == 404:
            logging.info(f"OpenCNPJ: CNPJ {clean} não encontrado (404).")
            return None
        else:
            logging.warning(f"OpenCNPJ retornou status {res.status_code}: {res.text[:150]}")
    except Exception as ex:
        logging.warning(f"Erro ao consultar OpenCNPJ para CNPJ {clean}: {ex}")

    return None

def normaliza(resposta: Dict[str, Any], fonte: str) -> Dict[str, Any]:
    """
    Converte os dados brutos de qualquer fonte ('brasilapi' ou 'opencnpj')
    em um dicionário unificado e consistente com a estrutura do CRM Littera:
    - razao_social
    - nome_fantasia
    - situacao ('ATIVA', 'BAIXADA', 'INAPTA', 'SUSPENSA', etc.)
    - porte
    - capital_social
    - telefones (lista de strings formatadas)
    - email
    - cnae_principal
    - natureza_juridica
    - socios (lista de dicts: nome, qualificacao_descricao, tipo)
    """
    if not resposta:
        return {}

    fonte_norm = fonte.lower().strip()
    telefones: List[str] = []
    socios: List[Dict[str, Any]] = []

    if fonte_norm == "brasilapi":
        razao_social = resposta.get("razao_social")
        nome_fantasia = resposta.get("nome_fantasia")
        situacao = str(resposta.get("descricao_situacao_cadastral") or "").upper().strip()
        porte = resposta.get("porte") or resposta.get("codigo_porte")
        capital_social = resposta.get("capital_social")
        try:
            capital_social = float(capital_social) if capital_social is not None else None
        except (ValueError, TypeError):
            capital_social = None

        # Telefones da BrasilAPI
        for tel_key in ["ddd_telefone_1", "ddd_telefone_2"]:
            raw_t = resposta.get(tel_key)
            if raw_t:
                formatted = format_phone(str(raw_t))
                if formatted and formatted not in telefones:
                    telefones.append(formatted)

        email = resposta.get("email")
        if email:
            email = email.lower().strip()

        cnae_fiscal = resposta.get("cnae_fiscal")
        cnae_principal = str(cnae_fiscal).zfill(7) if cnae_fiscal else None
        natureza_juridica = resposta.get("natureza_juridica")

        # QSA BrasilAPI
        raw_qsa = resposta.get("qsa") or []
        for s in raw_qsa:
            if not isinstance(s, dict):
                continue
            nome_raw = s.get("nome_socio")
            if not nome_raw:
                continue
            
            # Identificador: 1=PJ, 2=PF, 3=Estrangeiro
            id_socio = s.get("identificador_de_socio")
            if id_socio == 2:
                tipo = "PF"
            elif id_socio == 1:
                tipo = "PJ"
            else:
                tipo = "estrangeiro"

            qualificacao = s.get("qualificacao_socio") or ""
            socios.append({
                "nome": formatar_nome_proprio(nome_raw),
                "qualificacao_descricao": qualificacao.strip(),
                "tipo": tipo
            })

    elif fonte_norm == "opencnpj":
        razao_social = resposta.get("razaoSocial") or resposta.get("razao_social")
        nome_fantasia = resposta.get("nomeFantasia") or resposta.get("nome_fantasia")
        situacao = str(resposta.get("situacaoCadastral") or resposta.get("situacao_cadastral") or "").upper().strip()
        porte = resposta.get("porte")
        capital_social = resposta.get("capitalSocial") or resposta.get("capital_social")
        try:
            capital_social = float(capital_social) if capital_social is not None else None
        except (ValueError, TypeError):
            capital_social = None

        # Telefone OpenCNPJ
        raw_tel = resposta.get("telefone") or resposta.get("telefones")
        if isinstance(raw_tel, str):
            formatted = format_phone(raw_tel)
            if formatted:
                telefones.append(formatted)
        elif isinstance(raw_tel, list):
            for t in raw_tel:
                if isinstance(t, str):
                    formatted = format_phone(t)
                    if formatted and formatted not in telefones:
                        telefones.append(formatted)
                elif isinstance(t, dict):
                    formatted = format_phone(str(t.get("numero") or ""))
                    if formatted and formatted not in telefones:
                        telefones.append(formatted)

        email = resposta.get("email")
        if email:
            email = email.lower().strip()

        # CNAE OpenCNPJ
        cnaes = resposta.get("cnaes") or []
        cnae_principal = None
        if isinstance(cnaes, list) and len(cnaes) > 0:
            primeiro_cnae = cnaes[0]
            if isinstance(primeiro_cnae, dict):
                cnae_principal = str(primeiro_cnae.get("cnae") or "")
            elif isinstance(primeiro_cnae, str):
                cnae_principal = primeiro_cnae

        natureza_juridica = resposta.get("naturezaJuridica") or resposta.get("natureza_juridica")

        # QSA OpenCNPJ
        raw_socios = resposta.get("socios") or []
        for s in raw_socios:
            if not isinstance(s, dict):
                continue
            nome_raw = s.get("nomeSocio") or s.get("nome")
            if not nome_raw:
                continue

            id_socio = s.get("identificadorSocio")
            if id_socio == 2:
                tipo = "PF"
            elif id_socio == 1:
                tipo = "PJ"
            else:
                tipo = "estrangeiro"

            qualificacao = s.get("descricao") or s.get("qualificacao") or ""
            socios.append({
                "nome": formatar_nome_proprio(nome_raw),
                "qualificacao_descricao": qualificacao.strip(),
                "tipo": tipo
            })

    else:
        raise ValueError(f"Fonte desconhecida para normalização: {fonte}")

    return {
        "razao_social": razao_social.strip() if razao_social else None,
        "nome_fantasia": nome_fantasia.strip() if nome_fantasia else None,
        "situacao": situacao,
        "porte": str(porte).strip() if porte else None,
        "capital_social": capital_social,
        "telefones": telefones,
        "email": email,
        "cnae_principal": cnae_principal,
        "natureza_juridica": natureza_juridica.strip() if natureza_juridica else None,
        "socios": socios
    }
