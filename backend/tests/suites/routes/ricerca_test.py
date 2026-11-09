import pytest
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient
from fastapi import HTTPException

from backend.app.schemas.models import Article
from backend.app.routes import ricerca
from backend.app.routes.ricerca import search, SearchRequestIn


@pytest.fixture(autouse=True)
async def setup_mock_db():
    client = AsyncMongoMockClient()
    await init_beanie(database=client.get_database("db_test"), document_models=[Article])


def _article(id_: str, title: str) -> Article:
    return Article(id=id_, title=title)


@pytest.mark.asyncio
async def test_search_returns_results_from_orchestrator(monkeypatch):
    # search_all_sources restituisce (risultati, warnings) dalla voce 64
    # (avvisi di fallback su chiave API non valida) — il doppio prima
    # restituiva solo la lista.
    async def fake_search_all_sources(search_request, sources=None, api_keys=None):
        return [_article("a1", "Article A")], []

    monkeypatch.setattr(ricerca, "search_all_sources", fake_search_all_sources)

    payload = SearchRequestIn(keyword_include=[["AI"]])
    # current_user esplicito: chiamando la funzione della rotta direttamente
    # (bypassando l'injection di FastAPI) il parametro non riceve None da
    # solo, riceverebbe l'oggetto Depends(...) stesso.
    response = await search(payload, current_user=None)

    assert response["count"] == 1
    assert response["results"][0]["title"] == "Article A"


@pytest.mark.asyncio
async def test_search_forwards_sources_to_orchestrator(monkeypatch):
    received = {}

    async def fake_search_all_sources(search_request, sources=None, api_keys=None):
        received["sources"] = sources
        return [], []

    monkeypatch.setattr(ricerca, "search_all_sources", fake_search_all_sources)

    payload = SearchRequestIn(keyword_include=[["AI"]], sources=["ArXiv", "OpenAlex"])
    await search(payload, current_user=None)

    assert received["sources"] == ["ArXiv", "OpenAlex"]


@pytest.mark.asyncio
async def test_empty_search_request_returns_422():
    # Nessuna keyword/autore/venue: il minimo obbligatorio di SearchRequest non e' rispettato.
    payload = SearchRequestIn()

    with pytest.raises(HTTPException) as exc_info:
        await search(payload, current_user=None)

    assert exc_info.value.status_code == 422


@pytest.mark.asyncio
async def test_unknown_source_returns_422():
    payload = SearchRequestIn(keyword_include=[["AI"]], sources=["NotARealSource"])

    with pytest.raises(HTTPException) as exc_info:
        await search(payload, current_user=None)

    assert exc_info.value.status_code == 422
