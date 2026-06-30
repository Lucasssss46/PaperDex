import os
from beanie import init_beanie
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from app.models import AddedArticle, User, Project, Article, Filter, Invite, Research

# Carica le variabili dal file .env
load_dotenv()
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
            document_models=[User, Project, Article, Filter, Invite, Research, AddedArticle]
        )

    except Exception as e:
        print(f"Errore durante la ocnnessione al database: {e}")

        # TODO: Chiusura della connessione
        raise e

