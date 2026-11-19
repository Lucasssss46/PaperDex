"""Cifratura delle chiavi API degli utenti nel database (voce 130)."""
from datetime import date

import mongomock_motor
import pytest
from beanie import init_beanie
from cryptography.fernet import Fernet

from backend.app.routes.ricerca import resolve_api_keys
from backend.app.schemas.models import Participation, Research, User
from backend.app.services.utils import cifratura


@pytest.fixture(autouse=True)
async def users_db():
    client = mongomock_motor.AsyncMongoMockClient()
    await init_beanie(database=client.db_name, document_models=[User, Research, Participation])


@pytest.fixture(autouse=True)
def encryption_key(monkeypatch):
    monkeypatch.setenv(cifratura.ENV_VAR, Fernet.generate_key().decode())
    monkeypatch.setattr(cifratura, "load_dotenv", lambda *a, **k: None)
    cifratura._fernet.cache_clear()
    yield
    cifratura._fernet.cache_clear()


def _user(**fields) -> User:
    return User(email="mario@example.com", password="x", **fields)


def test_round_trip_and_ciphertext_hides_the_key():
    stored = cifratura.encrypt("sk-segreta-123")
    assert stored.startswith(cifratura.PREFIX)
    assert "sk-segreta-123" not in stored
    assert cifratura.decrypt(stored) == "sk-segreta-123"


def test_same_key_gives_different_ciphertexts():
    # Fernet usa un vettore casuale: due utenti con la stessa chiave non
    # risultano uguali nel database.
    assert cifratura.encrypt("uguale") != cifratura.encrypt("uguale")


def test_value_saved_before_encryption_is_returned_as_is():
    assert cifratura.decrypt("chiave-in-chiaro") == "chiave-in-chiaro"


def test_value_encrypted_with_another_key_is_ignored(monkeypatch):
    stored = cifratura.encrypt("sk-1")
    monkeypatch.setenv(cifratura.ENV_VAR, Fernet.generate_key().decode())
    cifratura._fernet.cache_clear()

    assert cifratura.decrypt(stored) is None
    assert _user(api_keys={"openalex": stored}).decrypted_api_keys() == {}


def test_missing_server_key_is_a_clear_error(monkeypatch):
    monkeypatch.delenv(cifratura.ENV_VAR)
    cifratura._fernet.cache_clear()
    with pytest.raises(RuntimeError, match=cifratura.ENV_VAR):
        cifratura.encrypt("sk-1")


def test_user_stores_api_keys_encrypted():
    user = _user()
    user.set_api_key("openalex", "oa-123")
    user.set_llm_api_key("llm-456")

    assert user.api_keys["openalex"] != "oa-123"
    assert user.llm_api_key != "llm-456"
    assert user.decrypted_api_keys() == {"openalex": "oa-123"}
    assert user.get_llm_api_key() == "llm-456"

    user.set_api_key("openalex", None)
    user.set_llm_api_key(None)
    assert user.api_keys == {}
    assert user.llm_api_key is None
    assert user.get_llm_api_key() is None


@pytest.mark.asyncio
async def test_shared_teammate_key_is_decrypted_for_the_search():
    owner = _user()
    owner.set_api_key("openalex", "chiave-del-proprietario")
    await owner.insert()
    member = User(email="luisa@example.com", password="x")
    await member.insert()

    research = Research(name="R", description="", creation_date=date.today(), owner=owner)
    await research.insert()
    owner.api_key_shared_with = {"openalex": [str(research.id)]}
    await owner.save()
    await Participation(user=member, research=research, date=date.today()).insert()

    keys = await resolve_api_keys(member, str(research.id))

    assert keys == {"openalex": "chiave-del-proprietario"}
    saved = await User.get(owner.id)
    assert "chiave-del-proprietario" not in saved.api_keys["openalex"]
