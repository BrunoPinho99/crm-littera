"""
Regras de elegibilidade de e-mail para sequências de prospecção.
Baseado em scripts/config/envio.json.
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "config" / "envio.json"

def carregar_config_envio(config_path: Optional[Path] = None) -> Dict[str, Any]:
    path = config_path or DEFAULT_CONFIG_PATH
    if path.exists():
        try:
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "aceitar_status": ["valido"],
        "aceitar_catch_all": False,
        "aceitar_arriscado": False
    }

def pode_enviar(email_status: Optional[str], config: Optional[Dict[str, Any]] = None) -> bool:
    """
    Determina se um status de e-mail pode receber sequências de envio.
    - 'valido': aceito se estiver em aceitar_status.
    - 'catch_all': aceito apenas se aceitar_catch_all = True ou presente em aceitar_status.
    - 'arriscado': aceito apenas se aceitar_arriscado = True ou presente em aceitar_status.
    - 'invalido', 'nao_verificado', 'desconhecido': sempre rejeitados.
    """
    if not email_status:
        return False

    cfg = config if config is not None else carregar_config_envio()
    status = email_status.strip().lower()

    if status == "valido":
        return "valido" in cfg.get("aceitar_status", ["valido"])
    elif status == "catch_all":
        return bool(cfg.get("aceitar_catch_all", False) or "catch_all" in cfg.get("aceitar_status", []))
    elif status == "arriscado":
        return bool(cfg.get("aceitar_arriscado", False) or "arriscado" in cfg.get("aceitar_status", []))

    return False
