import os
from pathlib import Path

from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from backend.app.schemas.models import AddedArticle, DuplicateGroup, User, Project, Article, Query, Invite, Research

# Ancorato alla posizione del file, non alla working directory del processo:
# `load_dotenv()` senza argomenti cerca risalendo da `os.getcwd()`, che con
# `uvicorn --reload` (worker in un subprocesso separato) non trova più
# `backend/.env` — la connessione ripiega silenziosamente su localhost:27017.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")
MONGODB_URL = os.getenv("MONGODB_URL")

async def init_db():
    # Inizializza il client
    try:
        client = AsyncIOMotorClient(MONGODB_URL)

        # Verifica la connessione al database
        await client.admin.command('ping')
        print("Connessione al database avvenuta con successo!")

        # Inizializza Beanie
        await init_beanie(
            database=client.PaperDex,
            document_models=[User, Project, Article, Query, Invite, Research, AddedArticle, DuplicateGroup]
        )

    except Exception as e:
        print(f"Errore durante la connessione al database: {e}")

        # TODO: Chiusura della connessione
        raise e

