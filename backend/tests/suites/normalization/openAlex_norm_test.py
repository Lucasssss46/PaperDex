from httpx import Response
import pytest
import json
import os

import respx
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.openAlex import OpenAlexAdapter

def get_fixture(filename):
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)
    
@pytest.mark.asyncio
async def test_openalex_normalization():
    
    data = get_fixture('openAlexEx.json')
    with respx.mock(base_url="https://api.openalex.org") as respx_mock:
        respx_mock.get(path__startswith="/works").mock(return_value=Response(200, json=data))

        adapter = OpenAlexAdapter(api_key="test-key")
        results = await adapter.fetch(SearchRequest(keyword_include=[["AI"]]))
    
        assert len(results) > 0
        article = results[0]
        
        assert article.source == "OpenAlex"
        assert article.title == "AI-Assisted Pipeline for Dynamic Generation of Trustworthy Health Supplement Content at Scale"
        assert article.id == "https://doi.org/10.4230/lipics.cosit.2022.18"
        assert article.doi == "10.4230/lipics.cosit.2022.18"
        assert article.publication_date.isoformat() == "2018-10-11"
        assert article.authors == ["Beydokhti, Mohammad Kazemi", "Duckham, Matt", "Tao, Yaguang", "Vasardani, Maria", "Griffin, Amy"]
        assert isinstance(article.abstract, str)
        assert sorted(article.institution_author) == sorted(["Google (United States)", "Ollscoil na Gaillimhe – University of Galway"])
        assert sorted(article.region) == sorted(["US", "IE"])

@pytest.mark.asyncio
async def test_openalex_without_key_sends_no_request():
    from backend.app.services.adapters.base import SourceUnavailableError

    with respx.mock(base_url="https://api.openalex.org", assert_all_called=False) as respx_mock:
        route = respx_mock.get(path__startswith="/works").mock(return_value=Response(200, json={"results": []}))

        with pytest.raises(SourceUnavailableError):
            await OpenAlexAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

        assert not route.called


@pytest.mark.asyncio
async def test_openalex_rejected_key_raises():
    from backend.app.services.adapters.base import SourceUnavailableError

    with respx.mock(base_url="https://api.openalex.org") as respx_mock:
        route = respx_mock.get(path__startswith="/works").mock(return_value=Response(401, json={}))

        with pytest.raises(SourceUnavailableError):
            await OpenAlexAdapter(api_key="bad-key").fetch(SearchRequest(keyword_include=[["AI"]]))

        assert route.call_count == 1


def test_openalex_author_names_are_quoted_phrases():
    adapter = OpenAlexAdapter(api_key="test-key")
    params = adapter._build_query(SearchRequest(author=["Alfio Ferrara", "Ernesto Damiani"]))

    assert params["search"] == ""
    assert params["filter"] == (
        'topics.field.id:17,raw_author_name.search:'
        '"Alfio Ferrara" OR "Ferrara Alfio" OR "Ernesto Damiani" OR "Damiani Ernesto"'
    )


def test_openalex_search_phrase_drops_wildcards_and_inner_quotes():
    # Titolo DBLP che dava HTTP 400 nella copertura (2026-10-26).
    adapter = OpenAlexAdapter(api_key="test-key")
    title = '"Are the current topic modeling evaluation metrics enough?" Mitigating the limitations*'
    params = adapter._build_query(SearchRequest(keyword_include=[[title, "?"]]))

    assert params["search"] == '"Are the current topic modeling evaluation metrics enough Mitigating the limitations"'


def test_openalex_author_phrase_strips_quotes_and_commas():
    assert OpenAlexAdapter._author_phrases("Ferrara") == ['"Ferrara"']
    assert OpenAlexAdapter._author_phrases('Ferrara, "Alfio"') == ['"Ferrara Alfio"', '"Alfio Ferrara"']
