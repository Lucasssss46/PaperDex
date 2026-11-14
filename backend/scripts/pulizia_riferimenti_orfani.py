"""Pulizia dei riferimenti orfani nel database (voce 126 del registro).

Cerca i documenti che puntano a qualcosa che non esiste più:

    participations    con user o research inesistenti
    added_articles    con participation inesistente (o rimossa al passo sopra)
    queries           con research inesistente
    invites           con research inesistente
    duplicate_groups  con research o added_article inesistenti
    users             con id di Ricerche inesistenti in api_key_shared_with

Gli AddedArticle senza partecipazione non si possono ricollegare: la
partecipazione cancellata era l'unico legame con la Ricerca e con l'utente.

Uso (dalla root del progetto, con il venv attivo):

    python -m backend.scripts.pulizia_riferimenti_orfani           # solo anteprima
    python -m backend.scripts.pulizia_riferimenti_orfani --apply   # esegue

Con --apply salva prima una copia JSON dei documenti coinvolti in
backend/scripts/backup_migrazione/. Rieseguirlo dopo la pulizia non trova
più nulla.
"""

import argparse
import os
import sys
from datetime import datetime
from pathlib import Path

from bson import json_util
from dotenv import load_dotenv
from pymongo import MongoClient

DB_NAME = "PaperDex"


def ref_id(value):
    """Id contenuto in un DBRef di Beanie (o None se il campo manca)."""
    return getattr(value, "id", None)


def ids(db, collection) -> set:
    return {doc["_id"] for doc in db[collection].find({}, {"_id": 1})}


def find_orphans(db) -> dict:
    users = ids(db, "users")
    researches = ids(db, "researches")

    participations = list(db.participations.find())
    bad_participations = [
        p for p in participations if ref_id(p.get("user")) not in users or ref_id(p.get("research")) not in researches
    ]
    bad_participation_ids = {p["_id"] for p in bad_participations}
    valid_participations = {p["_id"] for p in participations} - bad_participation_ids

    added = list(db.added_articles.find())
    bad_added = [a for a in added if ref_id(a.get("participation")) not in valid_participations]
    valid_added = {a["_id"] for a in added} - {a["_id"] for a in bad_added}

    bad_queries = [q for q in db.queries.find() if ref_id(q.get("research")) not in researches]
    bad_invites = [i for i in db.invites.find() if ref_id(i.get("research")) not in researches]
    bad_groups = [
        g
        for g in db.duplicate_groups.find()
        if ref_id(g.get("research")) not in researches or ref_id(g.get("added_article")) not in valid_added
    ]

    research_strs = {str(r) for r in researches}
    bad_users = [
        u
        for u in db.users.find({"api_key_shared_with": {"$exists": True}})
        if any(i not in research_strs for lst in (u.get("api_key_shared_with") or {}).values() for i in lst)
    ]

    return {
        "participations": bad_participations,
        "added_articles": bad_added,
        "queries": bad_queries,
        "invites": bad_invites,
        "duplicate_groups": bad_groups,
        "users": bad_users,
    }


def backup(orphans: dict, folder: Path) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"backup_orfani_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    path.write_text(json_util.dumps(orphans, indent=2), encoding="utf-8")
    return path


def clean(db, orphans: dict) -> None:
    for collection in ["participations", "added_articles", "queries", "invites", "duplicate_groups"]:
        doc_ids = [d["_id"] for d in orphans[collection]]
        if doc_ids:
            db[collection].delete_many({"_id": {"$in": doc_ids}})
    research_strs = {str(r) for r in ids(db, "researches")}
    for user in orphans["users"]:
        shared = {
            source: [i for i in lst if i in research_strs]
            for source, lst in (user.get("api_key_shared_with") or {}).items()
        }
        db.users.update_one({"_id": user["_id"]}, {"$set": {"api_key_shared_with": shared}})


def report(orphans: dict) -> None:
    labels = {
        "participations": "partecipazioni con utente o Ricerca inesistenti",
        "added_articles": "articoli aggiunti senza partecipazione",
        "queries": "query di Ricerche inesistenti",
        "invites": "inviti a Ricerche inesistenti",
        "duplicate_groups": "gruppi di duplicati orfani",
        "users": "utenti con chiavi condivise verso Ricerche inesistenti",
    }
    for key, label in labels.items():
        print(f"  {label}: {len(orphans[key])}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="esegue la pulizia (senza: solo anteprima)")
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    url = os.getenv("MONGODB_URL")
    if not url:
        sys.exit("MONGODB_URL non trovato in backend/.env")
    db = MongoClient(url)[DB_NAME]

    orphans = find_orphans(db)
    print("Riferimenti orfani trovati:")
    report(orphans)

    if not args.apply:
        print("ANTEPRIMA: nessuna modifica. Rilancia con --apply per eseguire.")
        return
    if not any(orphans.values()):
        print("Niente da pulire.")
        return
    path = backup(orphans, Path(__file__).resolve().parent / "backup_migrazione")
    print(f"Backup salvato in {path}")
    clean(db, orphans)
    print("Fatto.")


if __name__ == "__main__":
    main()
