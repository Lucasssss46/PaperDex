import pytest

from backend.app.schemas.models import Article
from backend.app.services.adapters.base import BaseAdapter
from backend.app.services.utils import caching, search
from backend.app.statistics import indexes


class FakeSource(BaseAdapter):
    """Restituisce sempre gli stessi articoli, qualunque titolo si cerchi."""

    def __init__(self, titles):
        super().__init__()
        self.titles = titles

    async def fetch(self, search_request, offset=0):
        return [Article(id=f"r{i}", title=title) for i, title in enumerate(self.titles)]

    def _build_query(self, request, offset=0):
        return {"q": request.keyword_include, "offset": offset}

    def _normalize(self, raw_data):
        return []


@pytest.fixture(autouse=True)
def no_delay_and_isolated_cache(tmp_path, monkeypatch):
    monkeypatch.setattr(caching, "CACHE_FILE", tmp_path / "test_cache.json")

    async def cached_raw_fetch_without_delay(adapter, search_request, delay=0, offset=0):
        return await search.cached_raw_fetch(adapter, search_request, delay=0, offset=offset)

    # Solo sul nome usato da true_coverage: se tornasse a passare da
    # safe_fetch_with_rate_limit (e quindi dal filtro interno) il test
    # attenderebbe il ritardo vero e fallirebbe sul punto finale.
    monkeypatch.setattr(indexes, "cached_raw_fetch", cached_raw_fetch_without_delay)


@pytest.mark.asyncio
async def test_coverage_ignores_final_period_of_dblp_titles():
    # DBLP chiude i titoli con il punto, arXiv no: cercando su arXiv il
    # titolo DBLP, il filtro interno scartava l'articolo giusto.
    dblp_results = [Article(id="d1", title="Attention Is All You Need.")]
    arxiv = FakeSource(["Attention is all you need"])

    coverage = await indexes.true_coverage(dblp_results, arxiv)

    assert coverage["found_structurally"] == 1
    assert coverage["true_coverage_rate"] == 100.0


@pytest.mark.asyncio
async def test_coverage_counts_a_different_title_as_missing():
    dblp_results = [Article(id="d1", title="Attention Is All You Need.")]
    arxiv = FakeSource(["Attention is not all you need"])

    coverage = await indexes.true_coverage(dblp_results, arxiv)

    assert coverage["found_structurally"] == 0
