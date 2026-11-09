from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient
from backend.app.schemas.models import Article

async def init_test_db():
    """Inizializza Beanie con un database mock in-memory per gli script e i test."""
    client = AsyncMongoMockClient()
    await init_beanie(
        database=client.get_database("db_evaluation"), 
        document_models=[Article]
    )