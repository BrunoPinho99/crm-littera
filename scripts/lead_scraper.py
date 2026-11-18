import os
import re
import time

import requests

try:
    from duckduckgo_search import DDGS
except ImportError:
    from ddgs import DDGS


SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_KEY = os.environ["SUPABASE_KEY"]
TARGET_LEADS = 80

QUERIES = (
    "escolas particulares Brasília contato",
    "colégios Brasília telefone email",
    "escolas ensino fundamental Brasília",
    "escolas ensino médio Brasília",
)

EMAIL_PATTERN = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
PHONE_PATTERN = re.compile(r"(?:\+55\s*)?(?:\(?61\)?[\s.-]*)?(?:9?\d{4}[\s.-]*\d{4})")


def extract_lead(result: dict) -> dict | None:
    title = (result.get("title") or "").strip()
    snippet = (result.get("body") or "").strip()
    href = (result.get("href") or "").strip()
    text = f"{title}\n{snippet}\n{href}"

    if not title:
        return None

    email_match = EMAIL_PATTERN.search(text)
    phone_match = PHONE_PATTERN.search(text)

    return {
        "nome_escola": title,
        "cidade": "Brasília",
        "telefone_escola": phone_match.group(0) if phone_match else None,
        "email_escola": email_match.group(0).lower() if email_match else None,
        "nome_decisor": None,
        "email_decisor": None,
        "status": "novo",
    }


def search_leads() -> list[dict]:
    leads: list[dict] = []
    seen_names = set()

    with DDGS() as ddgs:
        for query in QUERIES:
            if len(leads) >= TARGET_LEADS:
                break

            results = ddgs.text(query, region="br-pt", safesearch="moderate", max_results=30)
            for result in results:
                lead = extract_lead(result)
                if not lead:
                    continue

                name_key = lead["nome_escola"].lower()
                if name_key in seen_names:
                    continue

                seen_names.add(name_key)
                leads.append(lead)
                if len(leads) >= TARGET_LEADS:
                    break
            time.sleep(1)

    return leads


def save_leads(leads: list[dict]) -> None:
    if not leads:
        print("Nenhum lead encontrado.")
        return

    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
    }

    with_email = [lead for lead in leads if lead["email_escola"]]
    without_email = [lead for lead in leads if not lead["email_escola"]]

    if with_email:
        upsert_headers = {
            **headers,
            "Prefer": "resolution=merge-duplicates",
        }
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/leads_escolares",
            headers=upsert_headers,
            params={"on_conflict": "email_escola"},
            json=with_email,
            timeout=30,
        )
        response.raise_for_status()

    if without_email:
        response = requests.post(
            f"{SUPABASE_URL}/rest/v1/leads_escolares",
            headers=headers,
            json=without_email,
            timeout=30,
        )
        response.raise_for_status()

    print(f"{len(leads)} leads processados no Supabase.")


if __name__ == "__main__":
    save_leads(search_leads())
