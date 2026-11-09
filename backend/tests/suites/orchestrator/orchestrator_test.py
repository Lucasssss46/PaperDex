import pytest
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import PARTIAL_RESULTS_MESSAGE, UNREACHABLE_MESSAGE, SourceUnavailableError
from backend.app.services.utils import orchestrator

# OpenAlex richiede una chiave API: senza viene saltata prima del fetch.
OPENALEX_KEY = {"openalex": "test-key"}


@pytest.fixture(autouse=True)
async def setup_mock_db():
    client = AsyncMongoMockClient()
    await init_beanie(database=client.get_database("db_test"), document_models=[Article])


def _article(id_: str, title: str) -> Article:
    return Article(id=id_, title=title)


@pytest.mark.asyncio
async def test_merges_results_from_selected_sources(monkeypatch):
    request = SearchRequest(keyword_include=[["AI"]])

    async def fake_paginated_fetch(adapter, search_request):
        return {
            "ArXivAdapter": [_article("a1", "Article A")],
            "OpenAlexAdapter": [_article("o1", "Article O")],
        }.get(adapter.__class__.__name__, [])

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv", "OpenAlex"], api_keys=OPENALEX_KEY)

    assert {a.title for a in results} == {"Article A", "Article O"}
    assert warnings == []


@pytest.mark.asyncio
async def test_defaults_to_all_five_sources(monkeypatch):
    request = SearchRequest(keyword_include=[["AI"]])
    called = []

    async def fake_paginated_fetch(adapter, search_request):
        called.append(adapter.__class__.__name__)
        return []

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    await orchestrator.search_all_sources(request, api_keys=OPENALEX_KEY)

    assert set(called) == {
        "ArXivAdapter", "CrossrefAdapter", "DBLPAdapter", "OpenAlexAdapter", "SemanticScholarAdapter"
    }


@pytest.mark.asyncio
async def test_one_source_failing_does_not_block_others(monkeypatch):
    request = SearchRequest(keyword_include=[["AI"]])

    async def fake_paginated_fetch(adapter, search_request):
        if adapter.__class__.__name__ == "ArXivAdapter":
            raise RuntimeError("boom")
        return [_article("o1", "Article O")]

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv", "OpenAlex"], api_keys=OPENALEX_KEY)

    assert [a.title for a in results] == ["Article O"]
    assert warnings == [{"source": "ArXiv", "message": UNREACHABLE_MESSAGE}]


@pytest.mark.asyncio
async def test_partial_results_are_kept_with_warning(monkeypatch):
    from backend.app.services.utils.pagination import PartialResultsError

    request = SearchRequest(keyword_include=[["AI"]])

    async def fake_paginated_fetch(adapter, search_request):
        raise PartialResultsError([_article("a1", "Article A")], RuntimeError("pagina 2"))

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv"])

    assert [a.title for a in results] == ["Article A"]
    assert warnings == [{"source": "ArXiv", "message": PARTIAL_RESULTS_MESSAGE}]


@pytest.mark.asyncio
async def test_duplicates_across_sources_are_not_removed(monkeypatch):
    # L'orchestratore non rimuove i duplicati: li raggruppa dopo la rotta di
    # ricerca, con annotate_with_group_key (services/utils/dedup.py).
    request = SearchRequest(keyword_include=[["AI"]])

    async def fake_paginated_fetch(adapter, search_request):
        return [_article("dup", "Same Article")]

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv", "OpenAlex"], api_keys=OPENALEX_KEY)

    assert len(results) == 2


@pytest.mark.asyncio
async def test_openalex_without_key_is_skipped_with_warning(monkeypatch):
    request = SearchRequest(keyword_include=[["AI"]])
    called = []

    async def fake_paginated_fetch(adapter, search_request):
        called.append(adapter.__class__.__name__)
        return [_article("a1", "Article A")]

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv", "OpenAlex"])

    assert called == ["ArXivAdapter"]
    assert [a.title for a in results] == ["Article A"]
    assert [w["source"] for w in warnings] == ["OpenAlex"]


@pytest.mark.asyncio
async def test_source_unavailable_becomes_warning(monkeypatch):
    request = SearchRequest(keyword_include=[["AI"]])

    async def fake_paginated_fetch(adapter, search_request):
        if adapter.__class__.__name__ == "OpenAlexAdapter":
            raise SourceUnavailableError("Chiave rifiutata")
        return [_article("a1", "Article A")]

    monkeypatch.setattr(orchestrator, "paginated_fetch", fake_paginated_fetch)

    results, warnings = await orchestrator.search_all_sources(request, sources=["ArXiv", "OpenAlex"], api_keys=OPENALEX_KEY)

    assert [a.title for a in results] == ["Article A"]
    assert warnings == [{"source": "OpenAlex", "message": "Chiave rifiutata"}]


def test_unknown_source_name_raises():
    with pytest.raises(ValueError):
        orchestrator.resolve_adapters(["NotARealSource"])


def test_no_sources_given_resolves_to_all_five():
    adapters = orchestrator.resolve_adapters(None)
    assert len(adapters) == 5
