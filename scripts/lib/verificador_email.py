"""
Módulo de Verificação de E-mails com Provedores Trocáveis e Checagens Locais Gratuitas.

Suporta:
- ZeroBounce (padrão)
- MillionVerifier
- NeverBounce

Tabela de Tradução de Status:
+-------------------+---------------+------------------+-------------------+
| Status Unificado  | ZeroBounce    | MillionVerifier  | NeverBounce       |
+-------------------+---------------+------------------+-------------------+
| valido            | valid         | ok (code 1)      | valid             |
| invalido          | invalid       | bad (code 2)     | invalid           |
| catch_all         | catch-all     | catch_all (code3)| catchall          |
| arriscado         | spamtrap,     | disposable (6),  | disposable        |
|                   | abuse,        | spamtrap (5)     |                   |
|                   | do_not_mail   |                  |                   |
| desconhecido      | unknown       | unknown (code 4) | unknown           |
+-------------------+---------------+------------------+-------------------+

Checagens locais gratuitas (sem custo de API):
1. Sintaxe RFC 5322 básica
2. Domínio com registro MX ativo (via dnspython)
3. Domínio não é descartável (lista embutida)
4. Sinalização de e-mail genérico (gmail, hotmail, etc.) para score
"""

import os
import re
import logging
from typing import Dict, Any, Optional
import requests
import dns.resolver

logger = logging.getLogger(__name__)

# Preços estimados unitários em USD
CUSTOS_PROVEDORES = {
    "zerobounce": 0.0075,
    "millionverifier": 0.0035,
    "neverbounce": 0.0080,
    "local": 0.0000
}

# Domínios descartáveis comuns
DOMINIOS_DESCARTAVEIS = {
    "mailinator.com", "tempmail.com", "guerrillamail.com", "10minutemail.com",
    "throwawaymail.com", "yopmail.com", "trashmail.com", "fakeinbox.com",
    "sharklasers.com", "dispostable.com", "burnermail.io", "getairmail.com",
    "mohmal.com", "crazymailing.com", "temp-mail.org", "nada.ltd"
}

# Provedores de e-mail gratuitos/genéricos
DOMINIOS_GENERICOS = {
    "gmail.com", "hotmail.com", "outlook.com", "yahoo.com", "yahoo.com.br",
    "bol.com.br", "uol.com.br", "icloud.com", "live.com", "proton.me",
    "protonmail.com", "terra.com.br", "ig.com.br"
}

# Regex estrito para sintaxe de e-mail
REGEX_EMAIL = re.compile(
    r"^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$"
)


class CreditosEsgotadosError(Exception):
    """Lançada quando a API do provedor de e-mails relata falta de créditos."""
    pass


def validar_sintaxe(email: str) -> bool:
    """Valida sintaxe básica RFC 5322 e limites de tamanho."""
    if not email or len(email) > 254:
        return False
    parts = email.split("@")
    if len(parts) != 2:
        return False
    local_part, domain_part = parts
    if not local_part or len(local_part) > 64:
        return False
    if ".." in email:
        return False
    return bool(REGEX_EMAIL.match(email))


def validar_mx(domain: str, timeout: float = 4.0) -> bool:
    """Verifica se o domínio possui registro MX ativo via dnspython."""
    try:
        resolver = dns.resolver.Resolver()
        resolver.lifetime = timeout
        answers = resolver.resolve(domain, "MX")
        return len(answers) > 0
    except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer, dns.resolver.NoNameservers, dns.exception.Timeout):
        return False
    except Exception as e:
        logger.debug(f"Erro ao consultar MX para {domain}: {e}")
        return False


def eh_descartavel(domain: str) -> bool:
    """Verifica se o domínio é conhecido como descartável."""
    return domain.lower() in DOMINIOS_DESCARTAVEIS


def eh_generico(domain: str) -> bool:
    """Identifica se o e-mail pertence a um provedor genérico/gratuito."""
    return domain.lower() in DOMINIOS_GENERICOS


# ==============================================================================
# CLIENTES DE PROVEDORES
# ==============================================================================

def verificar_zerobounce(email: str, api_key: str) -> Dict[str, Any]:
    """
    Verifica e-mail via ZeroBounce API v2.
    Docs: https://www.zerobounce.net/docs/email-validation-api-quickstart/
    """
    url = "https://api.zerobounce.net/v2/validate"
    params = {
        "api_key": api_key,
        "email": email,
        "ip_address": ""
    }
    resp = requests.get(url, params=params, timeout=12)
    if resp.status_code in (401, 402):
        raise CreditosEsgotadosError("ZeroBounce: Chave inválida ou créditos esgotados.")

    data = resp.json()
    if "error" in data:
        err_msg = str(data["error"]).lower()
        if "credit" in err_msg or "balance" in err_msg:
            raise CreditosEsgotadosError(f"ZeroBounce: Créditos esgotados ({data['error']})")
        raise RuntimeError(f"ZeroBounce erro: {data['error']}")

    zb_status = (data.get("status") or "").lower()
    sub_status = data.get("sub_status")

    # Mapeamento
    if zb_status == "valid":
        status = "valido"
    elif zb_status == "invalid":
        status = "invalido"
    elif zb_status == "catch-all":
        status = "catch_all"
    elif zb_status in ("spamtrap", "abuse", "do_not_mail"):
        status = "arriscado"
    else:
        status = "desconhecido"

    return {
        "status": status,
        "sub_status": sub_status,
        "bruto": data,
        "provedor": "zerobounce",
        "custo_usd": CUSTOS_PROVEDORES["zerobounce"]
    }


def verificar_millionverifier(email: str, api_key: str) -> Dict[str, Any]:
    """
    Verifica e-mail via MillionVerifier API v3.
    Docs: https://millionverifier.com/single-api
    Result codes: 1=ok, 2=bad, 3=catch_all, 4=unknown, 5=spamtrap, 6=disposable
    """
    url = "https://api.millionverifier.com/api/v3/"
    params = {
        "api": api_key,
        "email": email,
        "timeout": 10
    }
    resp = requests.get(url, params=params, timeout=12)
    if resp.status_code in (401, 402):
        raise CreditosEsgotadosError("MillionVerifier: Chave inválida ou créditos esgotados.")

    data = resp.json()
    if data.get("error"):
        err = str(data["error"]).lower()
        if "credit" in err:
            raise CreditosEsgotadosError(f"MillionVerifier: Créditos esgotados ({data['error']})")
        raise RuntimeError(f"MillionVerifier erro: {data['error']}")

    if data.get("result") == "credit_error" or data.get("credits") == 0:
        raise CreditosEsgotadosError("MillionVerifier: Créditos de verificação zerados.")

    res_code = data.get("resultcode")
    res_str = (data.get("result") or "").lower()
    sub_status = data.get("subresult")

    if res_code == 1 or res_str == "ok":
        status = "valido"
    elif res_code == 2 or res_str == "bad":
        status = "invalido"
    elif res_code == 3 or res_str == "catch_all":
        status = "catch_all"
    elif res_code in (5, 6) or res_str in ("spamtrap", "disposable"):
        status = "arriscado"
    else:
        status = "desconhecido"

    return {
        "status": status,
        "sub_status": sub_status,
        "bruto": data,
        "provedor": "millionverifier",
        "custo_usd": CUSTOS_PROVEDORES["millionverifier"]
    }


def verificar_neverbounce(email: str, api_key: str) -> Dict[str, Any]:
    """
    Verifica e-mail via NeverBounce API v4.
    Docs: https://developers.neverbounce.com/reference/single-check
    """
    url = "https://api.neverbounce.com/v4/single/check"
    params = {
        "key": api_key,
        "email": email
    }
    resp = requests.get(url, params=params, timeout=12)
    data = resp.json()

    if data.get("status") == "auth_failure" or "credit" in str(data.get("message", "")).lower():
        raise CreditosEsgotadosError(f"NeverBounce: Falha de autenticação ou créditos ({data.get('message')})")

    nb_result = (data.get("result") or "").lower()
    if nb_result == "valid":
        status = "valido"
    elif nb_result == "invalid":
        status = "invalido"
    elif nb_result == "catchall":
        status = "catch_all"
    elif nb_result == "disposable":
        status = "arriscado"
    else:
        status = "desconhecido"

    return {
        "status": status,
        "sub_status": nb_result,
        "bruto": data,
        "provedor": "neverbounce",
        "custo_usd": CUSTOS_PROVEDORES["neverbounce"]
    }


# ==============================================================================
# INTERFACE PRINCIPAL ÚNICA
# ==============================================================================

def verificar(
    email: str,
    provedor_override: Optional[str] = None,
    api_key_override: Optional[str] = None
) -> Dict[str, Any]:
    """
    Interface única para verificação completa de e-mail.
    Retorna dicionário padronizado:
    {
        "status": "valido" | "invalido" | "arriscado" | "catch_all" | "desconhecido",
        "sub_status": Optional[str],
        "bruto": Dict[str, Any],
        "provedor": str,
        "custo_usd": float,
        "email_generico": bool
    }
    """
    email_limpo = (email or "").strip().lower()

    # 1. Checagem Sintática RFC Básica
    if not validar_sintaxe(email_limpo):
        return {
            "status": "invalido",
            "sub_status": "sintaxe_invalida",
            "bruto": {"motivo": "Formato de e-mail em desacordo com RFC 5322"},
            "provedor": "local",
            "custo_usd": 0.0,
            "email_generico": False
        }

    domain = email_limpo.split("@")[1].strip()
    generico = eh_generico(domain)

    # 2. Checagem de Domínio Descartável
    if eh_descartavel(domain):
        return {
            "status": "invalido",
            "sub_status": "descartavel",
            "bruto": {"motivo": "Domínio temporário/descartável proibido", "dominio": domain},
            "provedor": "local",
            "custo_usd": 0.0,
            "email_generico": generico
        }

    # 3. Checagem de Registro MX
    if not validar_mx(domain):
        return {
            "status": "invalido",
            "sub_status": "sem_mx",
            "bruto": {"motivo": "Domínio não possui servidores MX de recebimento", "dominio": domain},
            "provedor": "local",
            "custo_usd": 0.0,
            "email_generico": generico
        }

    # Determina o provedor configurado
    provedor = (provedor_override or os.environ.get("EMAIL_VERIFIER", "zerobounce")).strip().lower()
    api_key = api_key_override or os.environ.get("EMAIL_VERIFIER_API_KEY", "").strip()

    if not api_key:
        logger.info(f"EMAIL_VERIFIER_API_KEY não configurada. E-mail {email_limpo} validado via sintaxe RFC e MX ativo.")
        return {
            "status": "valido",
            "sub_status": "mx_dns_valido",
            "bruto": {"aviso": "Verificado localmente via sintaxe RFC e servidores DNS MX ativos"},
            "provedor": "local",
            "custo_usd": 0.0,
            "email_generico": generico
        }

    # 4. Chamada ao Provedor Escolhido
    if provedor == "zerobounce":
        resultado = verificar_zerobounce(email_limpo, api_key)
    elif provedor == "millionverifier":
        resultado = verificar_millionverifier(email_limpo, api_key)
    elif provedor == "neverbounce":
        resultado = verificar_neverbounce(email_limpo, api_key)
    else:
        raise ValueError(f"Provedor de verificação não suportado: {provedor}")

    resultado["email_generico"] = generico
    return resultado
