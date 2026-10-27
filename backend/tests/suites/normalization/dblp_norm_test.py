import json
import os

import pytest
import respx
from httpx import Response
from datetime import date
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.dblp import DBLPAdapter

def get_fixture(filename):
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

@pytest.mark.asyncio
async def test_dblp_normalization():

    data = get_fixture('dblpEx.json') 
    
    with respx.mock(base_url="https://dblp.dagstuhl.de") as respx_mock:
        respx_mock.get(path__startswith="/search/publ/api").mock(
            return_value=Response(200, json=data)
        )
        
        adapter = DBLPAdapter()
        results = await adapter.fetch(SearchRequest(keyword_include=[["Graph Neural Networks"]]))
        
        article = results[0]
        
        assert article.source == "DBLP"
        assert article.title == "BotMHG: a hybrid deep learning-based graphical approach to detect botnets using graph neural networks and graph attention networks on topological and temporal features."
        assert article.publication_date == date(2025, 1, 1)
        assert len(article.authors) == 2
        assert article.authors[0] == "Mohan Honnagudi Gururaj"
        assert article.doi == "10.1007/S00521-025-11402-3"
        assert article.id == "https://doi.org/10.1007/s00521-025-11402-3"

def test_dblp_xml_entities_are_decoded():
    data = {"result": {"hits": {"hit": [{"info": {
        "title": "Large Language Models&apos; Sycophantic Behaviour.",
        "authors": {"author": {"text": "Dan O&apos;Brien"}},
        "venue": "Findings &amp; Workshops",
        "year": "2024",
        "url": "https://dblp.org/rec/test",
    }}]}}}

    article = DBLPAdapter()._normalize(data)[0]

    assert article.title == "Large Language Models' Sycophantic Behaviour."
    assert article.authors == ["Dan O'Brien"]
    assert article.venue == "Findings & Workshops"

def test_dblp_fields_sent_as_lists_take_the_first_value():
    # "software testing" (2026-10-25): un record con 'year' come lista
    # faceva fallire l'intera pagina con AttributeError.
    data = {"result": {"hits": {"hit": [{"info": {
        "title": "A Test Record.",
        "venue": ["ICST", "ICST Workshops"],
        "year": ["2021", "2022"],
        "doi": "10.1000/test",
        "ee": ["https://doi.org/10.1000/test", "https://arxiv.org/abs/2101.00001"],
        "url": "https://dblp.org/rec/test",
    }}]}}}

    article = DBLPAdapter()._normalize(data)[0]

    assert article.publication_date == date(2021, 1, 1)
    assert article.venue == "ICST"
    assert article.doi == "10.1000/test"
    assert article.id == "https://doi.org/10.1000/test"
