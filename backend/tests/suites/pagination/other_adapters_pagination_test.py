import pytest
import respx
from httpx import Response

from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.adapters.openAlex import OpenAlexAdapter
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter
from backend.app.services.utils.pagination import paginated_fetch
from backend.app.services.utils.search import cached_raw_fetch


def _title(i: int, matches: bool) -> str:
    return f"{'AI' if matches else 'Unrelated'} article {i}"


# ---- Crossref -------------------------------------------------------------

def _crossref_item(i: int, matches: bool) -> dict:
    return {
        "URL": f"https://doi.org/10.1/test.{i}",
        "title": [_title(i, matches)],
        "DOI": f"10.1/test.{i}",
        "author": [{"given": "Test", "family": "Author"}],
        "created": {"date-time": "2026-01-01T00:00:00Z"},
        "publisher": "Test Publisher",
    }


@pytest.mark.asyncio
async def test_crossref_pagination_uses_rows_and_offset():
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")  # target=15, page_size=15
    adapter = CrossrefAdapter()

    calls = []
    with respx.mock(base_url="https://api.crossref.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 15 if len(calls) == 1 else 5
            items = [_crossref_item(i, matches=False) for i in range(n)]
            return Response(200, json={"message": {"items": items}})

        respx_mock.get(path="/works").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    assert calls[0]["rows"] == "15" and calls[0]["offset"] == "0"
    assert calls[1]["rows"] == "15" and calls[1]["offset"] == "15"
    assert len(results) == 0  # nessun articolo matcha "AI"


# ---- DBLP -------------------------------------------------------------

def _dblp_hit(i: int, matches: bool) -> dict:
    return {
        "info": {
            "url": f"https://dblp.org/rec/test{i}",
            "title": _title(i, matches),
            "year": "2026",
            "authors": {"author": [{"text": "Test Author"}]},
        }
    }


@pytest.mark.asyncio
async def test_dblp_pagination_uses_f_offset():
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")
    adapter = DBLPAdapter()

    calls = []
    with respx.mock(base_url="https://dblp.dagstuhl.de") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 15 if len(calls) == 1 else 5
            hits = [_dblp_hit(i, matches=False) for i in range(n)]
            return Response(200, json={"result": {"hits": {"hit": hits}}})

        respx_mock.get(path__startswith="/search/publ/api").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    assert calls[0]["f"] == "0"
    assert calls[1]["f"] == "15"
    assert len(results) == 0


# ---- OpenAlex -------------------------------------------------------------

def _openalex_work(i: int, matches: bool) -> dict:
    return {
        "id": f"https://openalex.org/W{i}",
        "title": _title(i, matches),
        "publication_date": "2026-01-01",
    }


@pytest.mark.asyncio
async def test_openalex_pagination_uses_page_number():
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")  # per_page=15
    adapter = OpenAlexAdapter(api_key="test-key")

    calls = []
    with respx.mock(base_url="https://api.openalex.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 15 if len(calls) == 1 else 5
            works = [_openalex_work(i, matches=False) for i in range(n)]
            return Response(200, json={"results": works})

        respx_mock.get(path__startswith="/works").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    # offset 0 -> pagina 1, offset 15 (= per_page) -> pagina 2
    assert calls[0]["page"] == "1"
    assert calls[1]["page"] == "2"
    assert len(results) == 0


# ---- Semantic Scholar -------------------------------------------------------------

def _s2_article(i: int, matches: bool) -> dict:
    return {
        "url": f"https://www.semanticscholar.org/paper/test{i}",
        "title": _title(i, matches),
        "publicationDate": "2026-01-01",
        "year": 2026,
    }


@pytest.mark.asyncio
async def test_semantic_scholar_pagination_uses_offset():
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")
    adapter = SemanticScholarAdapter()

    calls = []
    with respx.mock(assert_all_mocked=False) as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 15 if len(calls) == 1 else 5
            articles = [_s2_article(i, matches=False) for i in range(n)]
            return Response(200, json={"data": articles})

        respx_mock.get(url__regex=r"https://api.semanticscholar.org/graph/v1/paper/search.*").mock(
            side_effect=responder
        )

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    assert calls[0]["offset"] == "0"
    assert calls[1]["offset"] == "15"
    assert len(results) == 0


@pytest.mark.asyncio
async def test_semantic_scholar_full_page_of_100_is_kept():
    # Profondità alta: pagina da 100 (MAX_PAGE_SIZE). Prima il normalizzatore
    # la tagliava a 51 e la paginazione si fermava alla prima pagina.
    request = SearchRequest(keyword_include=[["AI"]], depth="alta")
    adapter = SemanticScholarAdapter()

    calls = []
    with respx.mock(assert_all_mocked=False) as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 100 if len(calls) == 1 else 10
            articles = [_s2_article(len(calls) * 1000 + i, matches=True) for i in range(n)]
            return Response(200, json={"data": articles})

        respx_mock.get(url__regex=r"https://api.semanticscholar.org/graph/v1/paper/search.*").mock(
            side_effect=responder
        )

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert calls[0]["limit"] == "100"
    assert len(calls) == 2
    assert calls[1]["offset"] == "100"
    assert len(results) == 110


@pytest.mark.asyncio
async def test_semantic_scholar_terms_sent_as_plain_text():
    # /paper/search non supporta sintassi speciale: i termini del gruppo AND
    # vanno mandati separati da spazi, non uniti con "|".
    request = SearchRequest(keyword_include=[["causal inference", "LLM"]], depth="bassa")
    adapter = SemanticScholarAdapter()

    calls = []
    with respx.mock(assert_all_mocked=False) as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            return Response(200, json={"data": []})

        respx_mock.get(url__regex=r"https://api.semanticscholar.org/graph/v1/paper/search.*").mock(
            side_effect=responder
        )

        await paginated_fetch(adapter, request, delay=0.0)

    assert calls[0]["query"] == "causal inference LLM"


@pytest.mark.asyncio
async def test_dblp_waits_on_429_then_retries(monkeypatch):
    # Voce 94: su 429 si prova l'altro mirror; se anche quello è limitato si
    # attende quanto chiesto da Retry-After e si riprova.
    import backend.app.services.adapters.dblp as dblp_module

    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr(dblp_module.asyncio, "sleep", fake_sleep)

    calls = []

    def responder(http_request):
        calls.append(http_request.url.host)
        if len(calls) <= 2:
            return Response(429, headers={"Retry-After": "7"})
        return Response(200, json={"result": {"hits": {"hit": [_dblp_hit(1, matches=True)]}}})

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(url__regex=r"https://dblp\.(dagstuhl|uni-trier)\.de/search/publ/api.*").mock(side_effect=responder)
        results = await DBLPAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert calls == ["dblp.dagstuhl.de", "dblp.uni-trier.de", "dblp.dagstuhl.de"]
    assert waits == [7.0]
    assert len(results) == 1


@pytest.mark.asyncio
async def test_dblp_server_error_switches_mirror_without_waiting(monkeypatch):
    import backend.app.services.adapters.dblp as dblp_module

    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr(dblp_module.asyncio, "sleep", fake_sleep)

    def responder(http_request):
        if http_request.url.host == "dblp.dagstuhl.de":
            return Response(500)
        return Response(200, json={"result": {"hits": {"hit": [_dblp_hit(1, matches=True)]}}})

    with respx.mock(assert_all_called=False) as respx_mock:
        respx_mock.get(url__regex=r"https://dblp\.(dagstuhl|uni-trier)\.de/search/publ/api.*").mock(side_effect=responder)
        results = await DBLPAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    assert waits == []
    assert len(results) == 1


@pytest.mark.asyncio
async def test_dblp_page_size_is_100_and_pagination_continues():
    # Voce 99: DBLP manda al massimo 100 risultati anche con h=1000. Con
    # MAX_PAGE_SIZE 1000 la profondità alta chiedeva 150, riceveva 100 e si fermava.
    request = SearchRequest(keyword_include=[["AI"]], depth="alta")
    adapter = DBLPAdapter()

    calls = []
    with respx.mock(base_url="https://dblp.dagstuhl.de") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            n = 100 if len(calls) == 1 else 10
            hits = [_dblp_hit(len(calls) * 1000 + i, matches=True) for i in range(n)]
            return Response(200, json={"result": {"hits": {"hit": hits}}})

        respx_mock.get(path__startswith="/search/publ/api").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert calls[0]["h"] == "100"
    assert len(calls) == 2
    assert calls[1]["f"] == "100"
    assert len(results) == 110


def _crossref_page_with_discarded_record(n: int) -> list:
    items = [_crossref_item(i, matches=False) for i in range(n)]
    del items[3]["title"]  # record senza titolo, scartato da _normalize
    return items


@pytest.mark.asyncio
async def test_discarded_record_does_not_stop_pagination():
    # Voce 102: una pagina Crossref piena con un record senza titolo dava un
    # articolo in meno della dimensione di pagina, e la paginazione si fermava.
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")  # page_size=15
    adapter = CrossrefAdapter()

    calls = []
    with respx.mock(base_url="https://api.crossref.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            items = _crossref_page_with_discarded_record(15) if len(calls) == 1 else [_crossref_item(i, matches=False) for i in range(5)]
            return Response(200, json={"message": {"items": items}})

        respx_mock.get(path="/works").mock(side_effect=responder)

        await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    assert calls[1]["offset"] == "15"


@pytest.mark.asyncio
async def test_received_count_survives_the_cache():
    # Il numero di record mandati dalla sorgente resta anche quando la pagina
    # arriva dalla cache, altrimenti la seconda ricerca uguale si fermerebbe.
    request = SearchRequest(keyword_include=[["AI"]], limit=15)

    with respx.mock(base_url="https://api.crossref.org") as respx_mock:
        route = respx_mock.get(path="/works").mock(
            return_value=Response(200, json={"message": {"items": _crossref_page_with_discarded_record(15)}})
        )
        first = await cached_raw_fetch(CrossrefAdapter(), request, delay=0)
        second = await cached_raw_fetch(CrossrefAdapter(), request, delay=0)

    assert route.call_count == 1
    assert (len(first), first.received) == (14, 15)
    assert (len(second), second.received) == (14, 15)
