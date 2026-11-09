import pytest

from backend.app.services.utils import caching


@pytest.fixture(autouse=True)
def isolate_cache_file(tmp_path, monkeypatch):
    """I test di paginazione usano respx per mockare le risposte di rete:
    senza isolare la cache su file, una voce reale lasciata da una chiamata
    live precedente (stessa query+offset) potrebbe bypassare il mock e
    rompere il test in modo non deterministico."""
    monkeypatch.setattr(caching, "CACHE_FILE", tmp_path / "test_cache.json")
