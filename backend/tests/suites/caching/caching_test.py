import asyncio

import pytest

from backend.app.services.utils import caching


class FakeAdapter:
    def _build_query(self, request, offset=0):
        return {"q": request, "offset": offset}


@pytest.fixture(autouse=True)
def isolate_cache_file(tmp_path, monkeypatch):
    monkeypatch.setattr(caching, "CACHE_FILE", tmp_path / "test_cache.json")


@pytest.mark.asyncio
async def test_parallel_fetches_keep_each_others_entries():
    # Due sorgenti leggono la cache, attendono la rete insieme e poi salvano:
    # prima la seconda scrittura cancellava la voce della prima.
    release = asyncio.Event()

    @caching.file_cache
    async def fetch(adapter, search_request, offset=0):
        await release.wait()
        return []

    first = asyncio.create_task(fetch(FakeAdapter(), "prima"))
    second = asyncio.create_task(fetch(FakeAdapter(), "seconda"))
    await asyncio.sleep(0)  # entrambe hanno già letto la cache
    release.set()
    await asyncio.gather(first, second)

    assert len(caching.load_cache()) == 2


@pytest.mark.asyncio
async def test_save_leaves_no_temporary_file(tmp_path):
    caching.save_cache_entry("chiave", {"fetched_at": "2099-01-01", "data": []})

    assert caching.load_cache() == {"chiave": {"fetched_at": "2099-01-01", "data": []}}
    assert [p.name for p in tmp_path.iterdir()] == ["test_cache.json"]
