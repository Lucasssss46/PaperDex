import pytest

from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.adapters.openAlex import OpenAlexAdapter
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter
from backend.app.services.utils import search

ADAPTERS = [ArXivAdapter, CrossrefAdapter, DBLPAdapter, OpenAlexAdapter, SemanticScholarAdapter]


@pytest.mark.parametrize("adapter_class", ADAPTERS)
@pytest.mark.asyncio
async def test_default_wait_is_the_source_interval(adapter_class, monkeypatch):
    # Senza delay esplicito si aspetta l'intervallo della sorgente, non più
    # i 3 secondi di arXiv per tutte.
    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    async def fake_fetch(self, search_request, offset=0):
        return []

    monkeypatch.setattr(search.asyncio, "sleep", fake_sleep)
    monkeypatch.setattr(adapter_class, "fetch", fake_fetch)

    await search.cached_raw_fetch(adapter_class(), SearchRequest(keyword_include=[["AI"]]))

    assert waits == [adapter_class.MIN_REQUEST_INTERVAL]


def test_intervals_follow_source_limits():
    assert ArXivAdapter.MIN_REQUEST_INTERVAL == 3.0
    assert DBLPAdapter.MIN_REQUEST_INTERVAL == 2.0
    assert CrossrefAdapter.MIN_REQUEST_INTERVAL == 1.0
    assert SemanticScholarAdapter.MIN_REQUEST_INTERVAL == 1.0
    assert OpenAlexAdapter.MIN_REQUEST_INTERVAL == 0.5
