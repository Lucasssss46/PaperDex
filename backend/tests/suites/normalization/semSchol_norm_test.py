from datetime import date

from httpx import Response
import pytest
import json
import os

import respx
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter

def get_fixture(filename):
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

@pytest.mark.asyncio
async def test_semantic_scholar_normalization():
    data = get_fixture('sematicScholarEx.json')
    
    with respx.mock(assert_all_mocked=False) as respx_mock:
        respx_mock.get(url__regex=r"https://api.semanticscholar.org/graph/v1/paper/search.*").mock(
            return_value=Response(200, json=data)
        )

        adapter = SemanticScholarAdapter()
        results = await adapter.fetch(SearchRequest(keyword_include=[["AI"]]))
        
        assert len(results) > 0
        article = results[0]
        
        assert article.source == "Semantic Scholar"
        assert article.id == "https://www.semanticscholar.org/paper/5c5751d45e298cea054f32b392c12c61027d2fe7"
        assert article.title == "Construction of the Literature Graph in Semantic Scholar"
        assert article.publication_date == date(2024, 4, 29)
        assert article.venue == "Annual Meeting of the Association for Computational Linguistics"
        assert article.authors == ["Oren Etzioni"]
        assert isinstance(article.abstract, str)
        assert article.doi == "10.18653/V1/2020.ACL-MAIN.447"
        assert article.institution_author == ["Allen Institute for AI"]
        assert article.region == None
