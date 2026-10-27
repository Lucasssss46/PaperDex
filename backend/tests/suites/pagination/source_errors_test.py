import httpx
import pytest
import respx
from httpx import Response

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.base import UNREACHABLE_MESSAGE, SourceUnavailableError
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter
from backend.app.services.utils import caching, pagination
from backend.app.services.utils.pagination import PartialResultsError, paginated_fetch
from backend.app.services.utils.search import cached_raw_fetch

DBLP_URL = r"https://dblp\.(dagstuhl|uni-trier)\.de/search/publ/api.*"


@pytest.mark.asyncio
async def test_http_error_raises_and_is_not_cached():
    # Prima l'errore diventava una lista vuota, salvata in cache per 7 giorni.
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        respx_mock.get(path="/api/query").mock(return_value=Response(500, text="errore"))
        with pytest.raises(SourceUnavailableError, match="HTTP 500"):
            await cached_raw_fetch(ArXivAdapter(), SearchRequest(keyword_include=[["AI"]]), delay=0)

    assert caching.load_cache() == {}


@pytest.mark.asyncio
async def test_dblp_unreachable_mirrors_raise():
    with respx.mock() as respx_mock:
        route = respx_mock.get(url__regex=DBLP_URL).mock(side_effect=httpx.ConnectError("rete"))
        with pytest.raises(SourceUnavailableError) as info:
            await DBLPAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert str(info.value) == UNREACHABLE_MESSAGE
    assert route.call_count == 6  # 3 giri, 2 mirror


@pytest.mark.asyncio
async def test_semantic_scholar_stops_at_first_1000_results():
    with respx.mock(assert_all_called=False) as respx_mock:
        route = respx_mock.get(host="api.semanticscholar.org").mock(return_value=Response(400))
        results = await SemanticScholarAdapter().fetch(SearchRequest(keyword_include=[["AI"]], limit=100), offset=1000)

    assert results == []
    assert not route.called


def _page(size: int, matching: int) -> list:
    return [
        Article(id=f"p{i}", title=f"{'AI' if i < matching else 'Unrelated'} article {i}")
        for i in range(size)
    ]


@pytest.mark.asyncio
async def test_error_after_first_page_keeps_collected_results(monkeypatch):
    async def fake_fetch(adapter, search_request, delay=3.0, offset=0):
        if offset:
            raise SourceUnavailableError(UNREACHABLE_MESSAGE)
        return _page(15, matching=5)  # pagina piena, sotto il target di 15

    monkeypatch.setattr(pagination, "cached_raw_fetch", fake_fetch)

    with pytest.raises(PartialResultsError) as info:
        await paginated_fetch(ArXivAdapter(), SearchRequest(keyword_include=[["AI"]], depth="bassa"), delay=0)

    assert [a.id for a in info.value.results] == ["p0", "p1", "p2", "p3", "p4"]


@pytest.mark.asyncio
async def test_error_on_first_page_is_raised_as_is(monkeypatch):
    async def fake_fetch(adapter, search_request, delay=3.0, offset=0):
        raise SourceUnavailableError(UNREACHABLE_MESSAGE)

    monkeypatch.setattr(pagination, "cached_raw_fetch", fake_fetch)

    with pytest.raises(SourceUnavailableError):
        await paginated_fetch(ArXivAdapter(), SearchRequest(keyword_include=[["AI"]], depth="bassa"), delay=0)


@pytest.mark.asyncio
async def test_semantic_scholar_without_results_returns_empty_list():
    # Voce 100: senza risultati la risposta non ha "data". Prima KeyError,
    # nuovo tentativo e un avviso falso al posto di zero risultati.
    with respx.mock(assert_all_called=False) as respx_mock:
        route = respx_mock.get(host="api.semanticscholar.org").mock(
            return_value=Response(200, json={"total": 0, "offset": 0})
        )
        results = await cached_raw_fetch(SemanticScholarAdapter(), SearchRequest(keyword_include=[["AI"]], limit=15), delay=0)

    assert results == []
    assert route.call_count == 1


@pytest.mark.asyncio
async def test_no_wait_after_last_rate_limited_attempt(monkeypatch):
    # Voce 103: dopo il terzo 429 la sorgente viene saltata subito, senza
    # l'attesa di 15 secondi che allungava solo la ricerca.
    import backend.app.services.adapters.arXiv as arxiv_module

    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr(arxiv_module.asyncio, "sleep", fake_sleep)

    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        route = respx_mock.get(path="/api/query").mock(return_value=Response(429))
        with pytest.raises(SourceUnavailableError):
            await ArXivAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert route.call_count == 3
    assert waits == [5.0, 10.0]


ANUBIS_PAGE = "<!doctype html><html><head><title>Making sure you&#39;re not a bot!</title></head></html>"


def _dblp_json(title):
    return {"result": {"hits": {"hit": [{"info": {"url": "https://dblp.org/rec/x", "title": title, "year": "2026"}}]}}}


@pytest.mark.asyncio
async def test_dblp_bot_challenge_on_both_mirrors_skips_source_without_cache():
    # Pagina anti-bot di Anubis (202, HTML) su entrambi i mirror: prima
    # diventava "nessun risultato" e restava in cache.
    from backend.app.services.adapters.dblp import BOT_CHALLENGE_MESSAGE

    with respx.mock() as respx_mock:
        route = respx_mock.get(url__regex=DBLP_URL).mock(
            return_value=Response(202, text=ANUBIS_PAGE, headers={"Content-Type": "text/html"})
        )
        with pytest.raises(SourceUnavailableError) as info:
            await cached_raw_fetch(DBLPAdapter(), SearchRequest(keyword_include=[["AI"]]), delay=0)

    assert str(info.value) == BOT_CHALLENGE_MESSAGE
    assert route.call_count == 2  # un giro solo: ritentare non serve
    assert caching.load_cache() == {}


@pytest.mark.asyncio
async def test_dblp_bot_challenge_with_200_tries_other_mirror():
    def responder(http_request):
        if http_request.url.host == "dblp.dagstuhl.de":
            return Response(200, text=ANUBIS_PAGE, headers={"Content-Type": "text/html; charset=utf-8"})
        return Response(200, json=_dblp_json("AI article"))

    with respx.mock() as respx_mock:
        respx_mock.get(url__regex=DBLP_URL).mock(side_effect=responder)
        results = await DBLPAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert [a.title for a in results] == ["AI article"]


@pytest.mark.asyncio
async def test_dblp_sends_app_identifier():
    # Senza app=<nome>_<versione> DBLP risponde con la pagina anti-bot.
    with respx.mock() as respx_mock:
        route = respx_mock.get(url__regex=DBLP_URL).mock(return_value=Response(200, json=_dblp_json("AI article")))
        await DBLPAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert route.calls[0].request.url.params["app"] == DBLPAdapter.APP_ID
