import pytest
import respx
from httpx import Response

from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.utils.pagination import paginated_fetch


def _entry(index: int, matches_keyword: bool = True) -> str:
    title = f"{'AI' if matches_keyword else 'Unrelated'} article number {index}"
    return f"""
    <entry>
      <id>http://arxiv.org/abs/test.{index}v1</id>
      <title>{title}</title>
      <summary>An abstract about {title.lower()}.</summary>
      <published>2026-01-0{(index % 9) + 1}T00:00:00Z</published>
      <author><name>Test Author</name></author>
    </entry>
    """


def _feed(entries_xml: list[str]) -> str:
    return f"""<?xml version='1.0' encoding='UTF-8'?>
    <feed xmlns:opensearch="http://a9.com/-/spec/opensearch/1.1/" xmlns:arxiv="http://arxiv.org/schemas/atom" xmlns="http://www.w3.org/2005/Atom">
      <id>https://arxiv.org/api/test</id>
      <title>test feed</title>
      <updated>2026-07-03T07:04:30Z</updated>
      {''.join(entries_xml)}
    </feed>"""


@pytest.mark.asyncio
async def test_stops_when_target_reached_on_first_page():
    # depth "bassa" -> target=15; arXiv MAX_PAGE_SIZE=2000, quindi
    # page_size = min(2000, 15) = 15: la prima pagina basta da sola.
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")
    adapter = ArXivAdapter()

    calls = []
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            return Response(200, text=_feed([_entry(i) for i in range(15)]))

        respx_mock.get(path="/api/query").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 1
    assert calls[0]["start"] == "0"
    assert len(results) == 15


@pytest.mark.asyncio
async def test_stops_at_max_extra_pages_when_target_not_reached():
    # depth "bassa" -> target=15, page_size=15, max 2 pagine aggiuntive. Ogni
    # pagina da 15 risultati grezzi, ma solo 3 passano il filtro keyword ->
    # mai 15 filtrati in totale, quindi deve fermarsi dopo 1 pagina iniziale
    # + 2 aggiuntive (3 richieste), non per aver raggiunto il target.
    request = SearchRequest(keyword_include=[["AI"]], depth="bassa")
    adapter = ArXivAdapter()

    calls = []
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            page = len(calls) - 1
            base = page * 15
            entries = [_entry(base + i, matches_keyword=(i < 3)) for i in range(15)]
            return Response(200, text=_feed(entries))

        respx_mock.get(path="/api/query").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 3
    assert [c["start"] for c in calls] == ["0", "15", "30"]
    assert len(results) == 9  # 3 per pagina x 3 pagine, target (15) mai raggiunto


@pytest.mark.asyncio
async def test_queries_each_or_group_separately_and_merges_results():
    # keyword_include con due gruppi OR su argomenti diversi (es. sinonimi):
    # solo il primo raggiungerebbe l'API tramite query_terms(), quindi
    # paginated_fetch deve interrogare la sorgente una volta per gruppo e unire
    # i risultati, non solo quelli del primo gruppo.
    request = SearchRequest(keyword_include=[["Alpha"], ["Beta"]], depth="bassa")
    adapter = ArXivAdapter()

    calls = []
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        def responder(http_request):
            search_query = http_request.url.params.get("search_query", "")
            calls.append(search_query)
            if "Alpha" in search_query:
                entries = [f"""
                <entry>
                  <id>http://arxiv.org/abs/alpha.1v1</id>
                  <title>Alpha result</title>
                  <summary>About alpha.</summary>
                  <published>2026-01-01T00:00:00Z</published>
                  <author><name>Test Author</name></author>
                </entry>
                """]
            else:
                entries = [f"""
                <entry>
                  <id>http://arxiv.org/abs/beta.1v1</id>
                  <title>Beta result</title>
                  <summary>About beta.</summary>
                  <published>2026-01-01T00:00:00Z</published>
                  <author><name>Test Author</name></author>
                </entry>
                """]
            return Response(200, text=_feed(entries))

        respx_mock.get(path="/api/query").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 2
    assert any("Alpha" in q for q in calls)
    assert any("Beta" in q for q in calls)
    titles = {a.title for a in results}
    assert titles == {"Alpha result", "Beta result"}


@pytest.mark.asyncio
async def test_stops_when_source_runs_out_of_results():
    # depth "alta" -> target=150, page_size=150. Prima pagina piu' piccola del
    # page_size richiesto -> nessuna pagina extra.
    request = SearchRequest(keyword_include=[["AI"]], depth="alta")
    adapter = ArXivAdapter()

    calls = []
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        def responder(http_request):
            calls.append(dict(http_request.url.params))
            return Response(200, text=_feed([_entry(i) for i in range(10)]))

        respx_mock.get(path="/api/query").mock(side_effect=responder)

        results = await paginated_fetch(adapter, request, delay=0.0)

    assert len(calls) == 1
    assert len(results) == 10
