"""
Módulo de rastreamento e extração de conteúdo de websites de escolas (Crawler Respeitoso).
Atende aos requisitos:
- Respeito ao robots.txt
- User-Agent identificado com e-mail de contato
- Rate limit de 1 req/s por domínio
- Timeout de 15s e máximo de 8 páginas internas relevantes por escola
- Extração de texto limpo, telefones, links mailto:, redes sociais e e-mails (inclusive [arroba])
- Cache local em .cache/sites (30 dias)
"""

import os
import re
import time
import json
import hashlib
import logging
import unicodedata
from urllib.parse import urlparse, urljoin
from urllib.robotparser import RobotFileParser
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional, Set
import requests
from bs4 import BeautifulSoup

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
CACHE_DIR = ROOT_DIR / ".cache" / "sites"

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

_domain_last_request: Dict[str, float] = {}

PALAVRAS_CHAVE_PAGINAS = [
    "equipe",
    "direcao",
    "diretoria",
    "coordenacao",
    "gestao",
    "quem somos",
    "sobre",
    "institucional",
    "nossa escola",
    "contato",
    "fale conosco",
    "ensino medio",
    "corpo docente",
    "administracao"
]

def normalizar_texto_ascii(texto: Any) -> str:
    """Remove acentuação e converte para minúsculas."""
    if not texto:
        return ""
    nfkd = unicodedata.normalize("NFKD", str(texto))
    ascii_str = "".join(c for c in nfkd if not unicodedata.combining(c)).lower().strip()
    return re.sub(r"[^a-z0-9\s]", " ", ascii_str)

def get_user_agent() -> str:
    contato = os.getenv("LITTERA_CONTATO", "contato@littera.com.br")
    return f"LitteraBot/1.0 (+contato: {contato})"

def wait_domain_rate_limit(domain: str, min_interval: float = 1.0):
    """Garante intervalo de no mínimo 1 segundo por domínio."""
    agora = time.time()
    ultimo = _domain_last_request.get(domain, 0.0)
    espera = min_interval - (agora - ultimo)
    if espera > 0:
        time.sleep(espera)
    _domain_last_request[domain] = time.time()

def checar_robots_txt(url: str, user_agent: str) -> bool:
    """
    Verifica se a URL é permitida pelo robots.txt do domínio.
    Retorna True se permitido (ou se robots.txt não existir / der erro), False se bloqueado.
    """
    try:
        parsed = urlparse(url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        rp = RobotFileParser()
        rp.set_url(robots_url)
        
        # Faz requisição com timeout curto
        res = requests.get(robots_url, headers={"User-Agent": user_agent}, timeout=8)
        if res.status_code == 200:
            rp.parse(res.text.splitlines())
            return rp.can_fetch(user_agent, url)
        elif res.status_code in (401, 403):
            # Proibido expressamente
            return False
        return True
    except Exception as ex:
        logging.debug(f"Não foi possível checar robots.txt para {url}: {ex}. Permitindo por padrão.")
        return True

def get_cache_path(url: str) -> Path:
    """Retorna caminho no disco para o cache da URL (.cache/sites/<hash>.json)."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    url_hash = hashlib.sha256(url.strip().lower().encode("utf-8")).hexdigest()
    return CACHE_DIR / f"{url_hash}.json"

def ler_cache(url: str) -> Optional[Dict[str, Any]]:
    """Lê página do cache local se tiver menos de 30 dias."""
    path = get_cache_path(url)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        fetched_at_str = data.get("fetched_at")
        if fetched_at_str:
            dt = datetime.fromisoformat(fetched_at_str.replace("Z", "+00:00"))
            if datetime.now(timezone.utc) - dt < timedelta(days=30):
                return data
    except Exception as ex:
        logging.warning(f"Erro ao ler cache local do crawler para {url}: {ex}")
    return None

def salvar_cache(url: str, payload: Dict[str, Any]):
    """Grava página no cache local (.cache/sites/)."""
    path = get_cache_path(url)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(payload, f, ensure_ascii=False, indent=2)
    except Exception as ex:
        logging.warning(f"Erro ao salvar cache local do crawler para {url}: {ex}")

def extrair_emails(html: str, soup: BeautifulSoup) -> List[str]:
    """
    Extrai e-mails de links mailto: e do texto HTML, incluindo variações:
    - user@domain.com
    - user [arroba] domain.com
    - user @ domain.com
    """
    emails_encontrados: Set[str] = set()

    # 1. Links mailto:
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if href.lower().startswith("mailto:"):
            email_part = href[7:].split("?")[0].strip().lower()
            if email_part and "@" in email_part:
                emails_encontrados.add(email_part)

    text = soup.get_text(separator=" ")

    # 2. Padrão padrão
    padrao_padrao = re.findall(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", text)
    for e in padrao_padrao:
        emails_encontrados.add(e.lower().strip())

    # 3. Padrão com [arroba], (arroba), [at], (at)
    padrao_ofuscado = re.findall(
        r"([a-zA-Z0-9._%+-]+)\s*(?:\[arroba\]|\(arroba\)|\[at\]|\(at\))\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        text,
        re.IGNORECASE
    )
    for u, d in padrao_ofuscado:
        emails_encontrados.add(f"{u.lower().strip()}@{d.lower().strip()}")

    # 4. Padrão com espaços ao redor do @: 'nome @ dominio.com.br'
    padrao_espacado = re.findall(
        r"([a-zA-Z0-9._%+-]+)\s*@\s*([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})",
        text
    )
    for u, d in padrao_espacado:
        emails_encontrados.add(f"{u.lower().strip()}@{d.lower().strip()}")

    # Filtra falsos positivos óbvios de extensões de imagem etc.
    validos = []
    for em in emails_encontrados:
        em_clean = em.strip(".,;:()[]{}<>\"'")
        if not re.search(r"\.(png|jpg|jpeg|gif|webp|svg|css|js)$", em_clean, re.IGNORECASE):
            validos.append(em_clean)

    return sorted(list(set(validos)))

def extrair_telefones(text: str) -> List[str]:
    """Extrai números de telefone no formato brasileiro com DDD."""
    padrao = re.findall(r"(?:\(?0?([1-9]{2})\)?\s*)?(?:(9\s*\d{4})|(\d{4}))[-\s.]?(\d{4})", text)
    tels = set()
    for match in padrao:
        ddd, p1_9, p1_8, p2 = match
        p1 = p1_9 or p1_8
        if p1 and p2:
            num = f"{p1}{p2}".replace(" ", "").replace("-", "")
            if ddd:
                if len(num) == 8:
                    tels.add(f"({ddd}) {num[:4]}-{num[4:]}")
                elif len(num) == 9:
                    tels.add(f"({ddd}) {num[:5]}-{num[5:]}")
    return sorted(list(tels))

def extrair_links_sociais(soup: BeautifulSoup) -> Dict[str, List[str]]:
    """Extrai links de perfis no LinkedIn e Instagram."""
    linkedin = set()
    instagram = set()

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if "linkedin.com/in/" in href or "linkedin.com/company/" in href:
            linkedin.add(href.split("?")[0])
        elif "instagram.com/" in href and not any(x in href for x in ["/p/", "/explore/", "/reel/"]):
            instagram.add(href.split("?")[0])

    return {
        "linkedin": sorted(list(linkedin)),
        "instagram": sorted(list(instagram))
    }

def processar_pagina(html: str, url: str) -> Dict[str, Any]:
    """Limpa a página e extrai o texto principal e metadados."""
    soup = BeautifulSoup(html, "html.parser")

    # Remove elementos não textuais e repetitivos
    for tag in soup(["script", "style", "noscript", "svg", "iframe", "nav", "footer", "header"]):
        tag.decompose()

    clean_text = soup.get_text(separator="\n", strip=True)
    emails = extrair_emails(html, soup)
    telefones = extrair_telefones(clean_text)
    sociais = extrair_links_sociais(soup)

    return {
        "url": url,
        "clean_text": clean_text,
        "emails": emails,
        "telefones": telefones,
        "linkedin_links": sociais["linkedin"],
        "instagram_links": sociais["instagram"]
    }

def link_eh_relevante(texto: str, href: str) -> bool:
    """Verifica se o texto do link ou URL possui palavras-chave de decisores e sobre."""
    texto_norm = normalizar_texto_ascii(texto)
    href_norm = normalizar_texto_ascii(href)

    for kw in PALAVRAS_CHAVE_PAGINAS:
        if kw in texto_norm or kw in href_norm:
            return True
    return False

def crawl_escola_site(site_url: str, max_paginas: int = 8) -> List[Dict[str, Any]]:
    """
    Rastreia o site da escola começando pela página inicial e seguindo até
    max_paginas internas que casem com palavras-chave de decisores.
    """
    if not site_url or not site_url.strip():
        return []

    parsed_root = urlparse(site_url.strip())
    if not parsed_root.scheme:
        site_url = f"https://{site_url.strip()}"
        parsed_root = urlparse(site_url)

    root_domain = parsed_root.netloc.lower()
    user_agent = get_user_agent()

    # 1. Verifica robots.txt da raiz
    if not checar_robots_txt(site_url, user_agent):
        logging.warning(f"Rastreamento bloqueado por robots.txt: {site_url}")
        return []

    visitadas: Set[str] = set()
    fila: List[str] = [site_url]
    resultados: List[Dict[str, Any]] = []

    while fila and len(resultados) < max_paginas:
        url_atual = fila.pop(0)
        norm_url = url_atual.split("#")[0].rstrip("/")
        if norm_url in visitadas:
            continue

        visitadas.add(norm_url)

        # Checa robots.txt específico para esta URL
        if not checar_robots_txt(url_atual, user_agent):
            logging.info(f"Página ignorada por robots.txt: {url_atual}")
            continue

        # Verifica cache local
        cached = ler_cache(url_atual)
        if cached:
            logging.info(f"  [CACHE CRAWLER] {url_atual}")
            resultados.append(cached)
            # Extrai links adicionais do HTML em cache
            soup = BeautifulSoup(cached.get("html", ""), "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                full_url = urljoin(url_atual, href)
                parsed_dest = urlparse(full_url)
                if parsed_dest.netloc.lower() == root_domain:
                    link_text = a.get_text()
                    if link_eh_relevante(link_text, href):
                        dest_clean = full_url.split("#")[0].rstrip("/")
                        if dest_clean not in visitadas and dest_clean not in fila:
                            fila.append(full_url)
            continue

        # Requisição HTTP respeitando rate limit de 1s
        wait_domain_rate_limit(root_domain, min_interval=1.0)
        try:
            logging.info(f"  [GET CRAWLER] {url_atual}")
            headers = {"User-Agent": user_agent, "Accept": "text/html,application/xhtml+xml"}
            res = requests.get(url_atual, headers=headers, timeout=15)
            if res.status_code != 200:
                logging.info(f"Status {res.status_code} ao buscar {url_atual}")
                continue

            content_type = res.headers.get("Content-Type", "")
            if "text/html" not in content_type and "application/xhtml" not in content_type:
                continue

            html = res.text
            parsed_data = processar_pagina(html, url_atual)
            cache_entry = {
                **parsed_data,
                "html": html,
                "status_code": res.status_code,
                "fetched_at": datetime.now(timezone.utc).isoformat()
            }
            salvar_cache(url_atual, cache_entry)
            resultados.append(cache_entry)

            # Extrai links internos relevantes da página
            soup = BeautifulSoup(html, "html.parser")
            for a in soup.find_all("a", href=True):
                href = a["href"].strip()
                full_url = urljoin(url_atual, href)
                parsed_dest = urlparse(full_url)
                if parsed_dest.netloc.lower() == root_domain:
                    link_text = a.get_text()
                    if link_eh_relevante(link_text, href):
                        dest_clean = full_url.split("#")[0].rstrip("/")
                        if dest_clean not in visitadas and dest_clean not in fila:
                            fila.append(full_url)

        except Exception as ex:
            logging.warning(f"Erro ao rastrear {url_atual}: {ex}")

    logging.info(f"Crawler finalizado para {site_url}: {len(resultados)} páginas coletadas.")
    return resultados
