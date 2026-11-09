from datetime import date
import json
import pytest
import respx
from httpx import Response
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.crossref import CrossrefAdapter
import os

def get_fixture(filename):
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

@pytest.mark.asyncio
async def test_crossref_adapter_with_file():

    mock_json_content = get_fixture('crossrefEx.json')
    
    with respx.mock(base_url="https://api.crossref.org") as respx_mock:
        
        respx_mock.get(path="/works").mock(
            return_value=Response(200, json=mock_json_content)
        )
        
        adapter = CrossrefAdapter()
        results = await adapter.fetch(SearchRequest(keyword_include=[["AI"]]))
        
        assert len(results) > 0
        article = results[0]
        
        assert article.id == "https://doi.org/10.1093/ofid/ofv085"
        assert article.title == "Screening for UGT1A1 Genotype in Study A5257 Would Have Markedly Reduced Premature Discontinuation of Atazanavir for Hyperbilirubinemia"
        assert article.abstract is not None
        # `issued` del record dice solo l'anno (2015); il 2015-06-05 usato
        # prima era `created`, la data di registrazione del DOI.
        assert article.publication_date == date(2015, 1, 1)
        assert article.authors == ["Saran Vardhanabhuti", "Heather J. Ribaudo", "Raphael J. Landovitz", "Ighovwerha Ofotokun", "Jeffrey L. Lennox", "Judith S. Currier", "Lana M. Olson", "David W. Haas"]
        assert article.venue == "Oxford University Press (OUP)"
        assert article.source == "Crossref"
        assert article.doi == "10.1093/ofid/ofv085"
        assert set(article.institution_author) == {"Statistical Data Analysis Center, Harvard School of Public Health, Boston, Massachusetts","UCLA Center for Clinical AIDS Research and Education, Los Angeles, California", "Emory University School of Medicine, Atlanta, Georgia","Vanderbilt University School of Medicine, Nashville, Tennessee"}


def test_crossref_publication_date_prefers_issued_over_created():
    adapter = CrossrefAdapter()
    created = {"date-time": "2019-03-04T10:00:00Z"}

    # Rivista del 1987 a cui il DOI è stato assegnato nel 2019.
    assert adapter._publication_date({"issued": {"date-parts": [[1987, 5, 12]]}, "created": created}) == date(1987, 5, 12)
    # Data parziale: mese e giorno mancanti diventano 1.
    assert adapter._publication_date({"issued": {"date-parts": [[1987, 5]]}, "created": created}) == date(1987, 5, 1)
    assert adapter._publication_date({"issued": {"date-parts": [[1987]]}, "created": created}) == date(1987, 1, 1)
    # `issued` vuoto: si ripiega su `created`.
    assert adapter._publication_date({"issued": {"date-parts": [[None]]}, "created": created}) == date(2019, 3, 4)
    assert adapter._publication_date({}) is None

def test_crossref_author_only_search_uses_query_author():
    # Voce 101: nella ricerca solo per autore query.bibliographic trovava
    # soprattutto titoli con il nome ("Castelli, Alfio"), query.author gli autori.
    from urllib.parse import parse_qs, urlparse
    adapter = CrossrefAdapter()

    author_only = parse_qs(urlparse(adapter._build_query(SearchRequest(author=["Alfio Ferrara"]))).query)
    assert author_only["query.author"] == ["Alfio Ferrara"]
    assert "query.bibliographic" not in author_only

    # Con le keyword l'autore resta al filtro interno, come per le altre sorgenti.
    with_keywords = parse_qs(urlparse(adapter._build_query(SearchRequest(keyword_include=[["web"]], author=["Alfio Ferrara"]))).query)
    assert with_keywords["query.bibliographic"] == ["web"]
    assert "query.author" not in with_keywords


def test_crossref_collective_and_empty_authors():
    # Voce 115: un autore collettivo ha solo "name" e prima diventava "".
    data = {"message": {"items": [{
        "URL": "https://doi.org/10.1000/test",
        "title": ["A Consortium Article"],
        "author": [
            {"name": "The ATLAS Collaboration", "sequence": "first"},
            {"given": "Ada", "family": "Lovelace"},
            {"sequence": "additional"},
        ],
    }]}}

    article = CrossrefAdapter()._normalize(data)[0]

    assert article.authors == ["The ATLAS Collaboration", "Ada Lovelace"]
