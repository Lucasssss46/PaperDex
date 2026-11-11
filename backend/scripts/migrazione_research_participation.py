"""Migrazione del database per la rinomina dei modelli (voce 125 del registro).

    Project  -> Research       (collezione projects   -> researches)
    Research -> Participation  (collezione researches -> participations)

e dei campi che li referenziano:

    participations.project       -> participations.research
    added_articles.research      -> added_articles.participation
    queries.project              -> queries.research
    invites.project              -> invites.research
    duplicate_groups.project     -> duplicate_groups.research

I Link di Beanie sono salvati come DBRef, che contengono anche il nome della
collezione: vanno aggiornati insieme al nome del campo.

Uso (dalla root del progetto, con il venv attivo):

    python -m backend.scripts.migrazione_research_participation           # solo anteprima
    python -m backend.scripts.migrazione_research_participation --apply   # esegue

Prima di modificare qualcosa, --apply salva una copia JSON delle collezioni
coinvolte in backend/scripts/backup_migrazione/. Lo script è idempotente: se la
migrazione è già stata fatta, non modifica nulla.
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

from bson import DBRef, json_util
from dotenv import load_dotenv
from pymongo import MongoClient

DB_NAME = "PaperDex"

# (collezione, campo vecchio, campo nuovo, collezione referenziata dopo la migrazione)
FIELD_RENAMES = [
    ("participations", "project", "research", "researches"),
    ("added_articles", "research", "participation", "participations"),
    ("queries", "project", "research", "researches"),
    ("invites", "project", "research", "researches"),
    ("duplicate_groups", "project", "research", "researches"),
]

BACKUP_COLLECTIONS = ["projects", "researches", "participations", "added_articles", "queries", "invites", "duplicate_groups"]


def detect_state(db) -> str:
    names = set(db.list_collection_names())
    # 'projects' per primo: se il nuovo codice è già partito una volta, può
    # aver creato una collezione 'participations' vuota.
    if "projects" in names:
        return "da-migrare"
    if "participations" in names:
        return "collezioni-gia-rinominate"
    return "sconosciuto"


def backup(db, folder: Path) -> Path:
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    names = set(db.list_collection_names())
    dump = {name: list(db[name].find()) for name in BACKUP_COLLECTIONS if name in names}
    path.write_text(json_util.dumps(dump, indent=2), encoding="utf-8")
    return path


def rename_collections(db, apply: bool) -> None:
    state = detect_state(db)
    print(f"Stato delle collezioni: {state}")
    if state == "collezioni-gia-rinominate":
        print("  collezioni già rinominate, salto questo passo")
        return
    if state != "da-migrare":
        sys.exit("Collezione 'projects' non trovata e 'participations' assente: database inatteso, mi fermo.")
    names = set(db.list_collection_names())
    if "participations" in names:
        if db.participations.count_documents({}) > 0:
            sys.exit("Esistono sia 'projects' sia una 'participations' non vuota: stato misto, mi fermo.")
        print("  rimuovo la collezione 'participations' vuota creata dal nuovo codice")
        if apply:
            db.participations.drop()
    # Ordine obbligato: 'researches' va liberato prima di poter rinominare 'projects'.
    if "researches" in names:
        print(f"  researches -> participations ({db.researches.count_documents({})} documenti)")
        if apply:
            db.researches.rename("participations")
    print(f"  projects -> researches ({db.projects.count_documents({})} documenti)")
    if apply:
        db.projects.rename("researches")


def rename_fields(db, apply: bool, simulated_collections: dict) -> None:
    for coll, old, new, target in FIELD_RENAMES:
        # In anteprima le collezioni non sono ancora state rinominate.
        source_coll = simulated_collections.get(coll, coll)
        docs = list(db[source_coll].find({old: {"$exists": True}}))
        print(f"  {coll}.{old} -> {coll}.{new}: {len(docs)} documenti")
        if not apply:
            continue
        for doc in docs:
            value = doc[old]
            ref_id = value.id if isinstance(value, DBRef) else value
            db[coll].update_one(
                {"_id": doc["_id"]},
                {"$set": {new: DBRef(target, ref_id)}, "$unset": {old: ""}},
            )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="esegue la migrazione (senza: solo anteprima)")
    args = parser.parse_args()

    load_dotenv(Path(__file__).resolve().parent.parent / ".env")
    url = os.getenv("MONGODB_URL")
    if not url:
        sys.exit("MONGODB_URL non trovato in backend/.env")

    client = MongoClient(url)
    db = client[DB_NAME]

    if args.apply:
        path = backup(db, Path(__file__).resolve().parent / "backup_migrazione")
        print(f"Backup salvato in {path}")
    else:
        print("ANTEPRIMA: nessuna modifica. Rilancia con --apply per eseguire.")

    simulated = {}
    if not args.apply and detect_state(db) == "da-migrare":
        simulated = {"participations": "researches"}

    rename_collections(db, args.apply)
    print("Campi:")
    rename_fields(db, args.apply, simulated)
    print("Fatto." if args.apply else "Fine anteprima.")


if __name__ == "__main__":
    main()
