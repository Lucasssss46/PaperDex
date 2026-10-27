import pytest
import mongomock_motor
from beanie import init_beanie
from backend.app.schemas.models import Article # Importa i tuoi modelli

@pytest.fixture(autouse=True)
async def setup_db():
    # Crea un database mock in memoria
    client = mongomock_motor.AsyncMongoMockClient()
    
    await init_beanie(
        database=client.db_name,
        document_models=[Article]
    )
    yield