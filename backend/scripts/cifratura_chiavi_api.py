"""Cifratura delle chiavi API già salvate in chiaro (voce 130 del registro).

Dalla voce 130 le chiavi API personali degli utenti (api_keys e llm_api_key)
vengono salvate cifrate. Questo script cifra quelle salvate prima.

Uso (dalla root del progetto, con il venv attivo):

    python -m backend.scripts.cifratura_chiavi_api --genera-chiave   # una volta sola
    python -m backend.scripts.cifratura_chiavi_api                   # solo anteprima
    python -m backend.scripts.cifratura_chiavi_api --apply           # esegue

--genera-chiave aggiunge API_KEYS_ENCRYPTION_KEY a backend/.env senza
stamparla, e non fa nulla se c'è già. Senza quella chiave le chiavi cifrate
non si possono più leggere: va conservata come le altre variabili del .env,
ed è la stessa da usare in produzione.

Non viene salvato un backup: sarebbe una copia in chiaro delle chiavi, cioè
proprio quello che la cifratura vuole evitare. Prima di scrivere, ogni valore
cifrato viene decifrato di nuovo e confrontato con l'originale. Rieseguirlo
dopo la cifratura non trova più nulla.
"""

import argparse
import os
import sys
from pathlib import Path

from cryptography.fernet import Fernet
from dotenv import load_dotenv
from pymongo import MongoClient

from backend.app.services.utils import cifratura

DB_NAME = "PaperDex"
ENV_FILE = Path(__file__).resolve().parent.parent / ".env"


def genera_chiave() -> None:
    load_dotenv(ENV_FILE)
    if os.getenv(cifratura.ENV_VAR):
        print(f"{cifratura.ENV_VAR} è già impostata: nessuna modifica.")
        return
    key = Fernet.generate_key().decode("ascii")
    text = ENV_FILE.read_text(encoding="utf-8") if ENV_FILE.exists() else ""
    separator = "" if not text or text.endswith("\n") else "\n"
    with open(ENV_FILE, "a", encoding="utf-8") as f:
        f.write(f"{separator}{cifratura.ENV_VAR}={key}\n")
    print(f"{cifratura.ENV_VAR} aggiunta a {ENV_FILE}.")


def plaintext_fields(user: dict) -> dict:
    """Campi da cifrare di un utente: {"api_keys.<sorgente>" o "llm_api_key": valore}."""
    fields = {}
    for source_id, value in (user.get("api_keys") or {}).items():
        if value and not cifratura.is_encrypted(value):
            fields[f"api_keys.{source_id}"] = value
    llm_key = user.get("llm_api_key")
    if llm_key and not cifratura.is_encrypted(llm_key):
        fields["llm_api_key"] = llm_key
    return fields


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="cifra le chiavi (senza: solo anteprima)")
    parser.add_argument("--genera-chiave", action="store_true", help=f"aggiunge {cifratura.ENV_VAR} a backend/.env")
    args = parser.parse_args()

    if args.genera_chiave:
        genera_chiave()
        return

    load_dotenv(ENV_FILE)
    url = os.getenv("MONGODB_URL")
    if not url:
        sys.exit("MONGODB_URL non trovato in backend/.env")
    if not os.getenv(cifratura.ENV_VAR):
        sys.exit(f"{cifratura.ENV_VAR} non trovata in backend/.env: lancia prima --genera-chiave")
    db = MongoClient(url)[DB_NAME]

    todo = []
    for user in db.users.find({}, {"api_keys": 1, "llm_api_key": 1}):
        fields = plaintext_fields(user)
        if fields:
            todo.append((user["_id"], fields))

    n_keys = sum(len(fields) for _, fields in todo)
    print(f"Utenti con chiavi in chiaro: {len(todo)} (chiavi da cifrare: {n_keys})")

    if not args.apply:
        print("ANTEPRIMA: nessuna modifica. Rilancia con --apply per eseguire.")
        return
    if not todo:
        print("Niente da cifrare.")
        return

    for user_id, fields in todo:
        encrypted = {}
        for name, value in fields.items():
            token = cifratura.encrypt(value)
            if cifratura.decrypt(token) != value:
                sys.exit(f"Verifica fallita per l'utente {user_id}: nessuna modifica a questo utente.")
            encrypted[name] = token
        db.users.update_one({"_id": user_id}, {"$set": encrypted})
    print("Fatto.")


if __name__ == "__main__":
    main()
