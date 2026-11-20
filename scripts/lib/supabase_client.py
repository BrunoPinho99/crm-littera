import os
import logging
from typing import List, Dict, Any
import requests

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

def load_env_local_if_needed():
    if not os.getenv("SUPABASE_URL"):
        from pathlib import Path
        env_path = Path(__file__).resolve().parent.parent.parent / ".env.local"
        if env_path.exists():
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())

def get_supabase_credentials():
    load_env_local_if_needed()
    url = os.getenv("SUPABASE_URL", "").rstrip("/")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url:
        raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_URL")
    if not key:
        raise ValueError("Variável de ambiente obrigatória não configurada: SUPABASE_SERVICE_ROLE_KEY")
    return url, key

def sanitize_row(row: Dict[str, Any]) -> Dict[str, Any]:
    """
    Remove chaves com valor None para que o upsert nunca sobrescreva
    com null dados que já existem no banco.
    """
    return {k: v for k, v in row.items() if v is not None}

def upsert(tabela: str, linhas: List[Dict[str, Any]], on_conflict: str) -> Dict[str, int]:
    """
    Realiza upsert em lote via REST PostgREST no Supabase.
    Se um lote falhar (HTTP >= 400 ou exceção de rede), refaz linha a linha,
    registrando no log qual linha falhou e o motivo, e continua sem descartar o lote.
    Retorna contagem de inseridos, atualizados e falhas.
    """
    if not linhas:
        return {"inseridos": 0, "atualizados": 0, "falhas": 0}

    url, key = get_supabase_credentials()
    endpoint = f"{url}/rest/v1/{tabela}?on_conflict={on_conflict}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation"
    }

    sanitized_linhas = [sanitize_row(l) for l in linhas]
    stats = {"inseridos": 0, "atualizados": 0, "falhas": 0}
    batch_size = 20

    for i in range(0, len(sanitized_linhas), batch_size):
        batch = sanitized_linhas[i:i + batch_size]
        batch_failed = False
        batch_resp = None

        try:
            resp = requests.post(endpoint, headers=headers, json=batch, timeout=30)
            if resp.status_code in (200, 201):
                batch_resp = resp
            else:
                logging.warning(
                    f"Falha no lote de {len(batch)} itens (Status {resp.status_code}: {resp.text}). "
                    "Ativando fallback linha a linha..."
                )
                batch_failed = True
        except Exception as ex:
            logging.warning(f"Exceção de rede no lote: {ex}. Ativando fallback linha a linha...")
            batch_failed = True

        if not batch_failed and batch_resp is not None:
            # Lote executado com sucesso
            try:
                data = batch_resp.json() if batch_resp.text else []
            except Exception:
                data = []

            if isinstance(data, list) and len(data) > 0:
                for item in data:
                    if isinstance(item, dict):
                        criado = item.get("criado_em") or item.get("created_at")
                        atualizado = item.get("atualizado_em") or item.get("updated_at")
                        if (atualizado and criado and atualizado != criado) or item.get("_is_update") is True:
                            stats["atualizados"] += 1
                        else:
                            stats["inseridos"] += 1
                    else:
                        stats["inseridos"] += 1
            else:
                # Se não retornou lista detalhada
                if batch_resp.status_code == 201:
                    stats["inseridos"] += len(batch)
                else:
                    stats["atualizados"] += len(batch)
        else:
            # Execução de contingência: linha por linha
            logging.info(f"Processando contingência linha a linha para {len(batch)} registros...")
            for row in batch:
                try:
                    single_resp = requests.post(endpoint, headers=headers, json=[row], timeout=15)
                    if single_resp.status_code in (200, 201):
                        data = single_resp.json() if single_resp.text else []
                        is_update = False
                        if isinstance(data, list) and len(data) > 0 and isinstance(data[0], dict):
                            item = data[0]
                            criado = item.get("criado_em") or item.get("created_at")
                            atualizado = item.get("atualizado_em") or item.get("updated_at")
                            if (atualizado and criado and atualizado != criado) or item.get("_is_update") is True or single_resp.status_code == 200:
                                is_update = True
                        elif single_resp.status_code == 200:
                            is_update = True

                        if is_update:
                            stats["atualizados"] += 1
                        else:
                            stats["inseridos"] += 1
                    else:
                        stats["falhas"] += 1
                        logging.error(
                            f"Falha no upsert individual da linha: {row}. "
                            f"Status: {single_resp.status_code} - Resposta: {single_resp.text}"
                        )
                except Exception as ex:
                    stats["falhas"] += 1
                    logging.error(f"Exceção no upsert individual da linha: {row}. Motivo: {ex}")

    return stats
