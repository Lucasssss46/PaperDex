"""Cifratura delle chiavi API degli utenti salvate nel database (voce 130).

Le chiavi personali (User.api_keys, User.llm_api_key) servono in chiaro solo
nel momento in cui si interroga la sorgente o il provider LLM: nel database
restano cifrate, così chi leggesse la collezione users non le otterrebbe.
Si usa Fernet della libreria cryptography (AES in modalità CBC con HMAC),
con la chiave in API_KEYS_ENCRYPTION_KEY nel backend/.env.

Un valore cifrato inizia con PREFIX; uno senza prefisso è stato salvato prima
della cifratura e viene restituito così com'è, finché lo script
backend/scripts/cifratura_chiavi_api.py non lo cifra.
"""

import logging
import os
from functools import lru_cache
from pathlib import Path
from typing import Optional

from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

ENV_VAR = "API_KEYS_ENCRYPTION_KEY"
PREFIX = "fernet:"


@lru_cache(maxsize=1)
def _fernet() -> Fernet:
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    key = os.getenv(ENV_VAR)
    if not key:
        raise RuntimeError(
            f"{ENV_VAR} non impostata in backend/.env: serve per cifrare le chiavi API "
            "degli utenti (generala con backend/scripts/cifratura_chiavi_api.py --genera-chiave)."
        )
    return Fernet(key)


def is_encrypted(value: str) -> bool:
    return value.startswith(PREFIX)


def encrypt(value: str) -> str:
    return PREFIX + _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt(value: str) -> Optional[str]:
    """Valore in chiaro, oppure None se non si può decifrare (chiave del
    server cambiata o dato corrotto): in quel caso la chiave dell'utente è
    trattata come assente, e l'utente può reinserirla, invece di far fallire
    la richiesta."""
    if not is_encrypted(value):
        return value
    try:
        return _fernet().decrypt(value[len(PREFIX):].encode("ascii")).decode("utf-8")
    except InvalidToken:
        logging.warning("Chiave API non decifrabile con la chiave attuale: ignorata.")
        return None
