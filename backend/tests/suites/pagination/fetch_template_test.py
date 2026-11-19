"""Fetch comune di BaseAdapter (pattern Template Method): i casi che prima
ogni adapter gestiva nel proprio fetch."""
import asyncio

import pytest
import respx
from httpx import Response

from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import TOO_MANY_REQUESTS_MESSAGE, SourceUnavailableError
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.adapters.openAlex import (
    INVALID_KEY_MESSAGE,
    RATE_LIMITED_MESSAGE,
    OpenAlexAdapter,
)
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter

REQUEST = SearchRequest(keyword_include=[["AI"]])


@pytest.fixture
def waits(monkeypatch):
    recorded = []

    async def fake_sleep(seconds):
        recorded.append(seconds)

    monkeypatch.setattr(asyncio, "sleep", fake_sleep)
    return recorded


@pytest.mark.asyncio
async def test_crossref_retries_after_503_ignoring_retry_after(waits):
    # Crossref non usa Retry-After: si aspetta 5 secondi anche se il server
    # chiede altro.
    with respx.mock() as respx_mock:
        respx_mock.get(host="api.crossref.org").mock(side_effect=[
            Response(503, headers={"Retry-After": "30"}),
            Response(200, json={"message": {"items": []}}),
        ])
        results = await CrossrefAdapter().fetch(REQUEST)

    assert results == []
    assert waits == [5.0]


@pytest.mark.asyncio
async def test_crossref_too_many_requests_after_three_attempts(waits):
    with respx.mock() as respx_mock:
        route = respx_mock.get(host="api.crossref.org").mock(return_value=Response(429))
        with pytest.raises(SourceUnavailableError) as info:
            await CrossrefAdapter().fetch(REQUEST)

    assert str(info.value) == TOO_MANY_REQUESTS_MESSAGE
    assert route.call_count == 3
    assert waits == [5.0, 10.0]


@pytest.mark.asyncio
async def test_openalex_without_key_sends_nothing():
    with respx.mock(assert_all_called=False) as respx_mock:
        route = respx_mock.get(host="api.openalex.org").mock(return_value=Response(200, json={"results": []}))
        with pytest.raises(SourceUnavailableError):
            await OpenAlexAdapter().fetch(REQUEST)

    assert not route.called


@pytest.mark.asyncio
async def test_openalex_rejected_key_is_reported(waits):
    with respx.mock() as respx_mock:
        route = respx_mock.get(host="api.openalex.org").mock(return_value=Response(401))
        with pytest.raises(SourceUnavailableError) as info:
            await OpenAlexAdapter(api_key="chiave-sbagliata").fetch(REQUEST)

    assert str(info.value) == INVALID_KEY_MESSAGE
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_openalex_persistent_429_means_daily_budget(waits):
    with respx.mock() as respx_mock:
        respx_mock.get(host="api.openalex.org").mock(return_value=Response(429))
        with pytest.raises(SourceUnavailableError) as info:
            await OpenAlexAdapter(api_key="chiave").fetch(REQUEST)

    assert str(info.value) == RATE_LIMITED_MESSAGE


@pytest.mark.asyncio
async def test_semantic_scholar_rejected_key_falls_back_without_key(waits, monkeypatch):
    monkeypatch.delenv("SEMANTIC_SCHOLAR_API_KEY", raising=False)
    monkeypatch.setattr("backend.app.services.adapters.semanticScholar.load_dotenv", lambda *a, **k: None)
    sent_keys = []

    def responder(http_request):
        sent_keys.append(http_request.headers.get("x-api-key"))
        if http_request.headers.get("x-api-key"):
            return Response(403)
        return Response(200, json={"total": 0, "data": []})

    adapter = SemanticScholarAdapter(api_key="chiave-sbagliata")
    with respx.mock() as respx_mock:
        respx_mock.get(host="api.semanticscholar.org").mock(side_effect=responder)
        results = await adapter.fetch(REQUEST)

    assert results == []
    assert sent_keys == ["chiave-sbagliata", None]
    assert adapter.key_invalid_fallback is True
    assert waits == []
