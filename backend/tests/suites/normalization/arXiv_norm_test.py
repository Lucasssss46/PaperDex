import pytest
import respx
from httpx import Response
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.arXiv import ArXivAdapter
from datetime import date
import os

def get_fixture(filename):
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'fixtures', filename)
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

@pytest.mark.asyncio
async def test_arxiv_adapter_with_file():
    # Carica l'XML dal file
    mock_xml_content = get_fixture('arXivEx.xml')
    
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        # Mock
        respx_mock.get(path="/api/query").mock(return_value=Response(200, text=mock_xml_content))
        
        adapter = ArXivAdapter()
        results = await adapter.fetch(SearchRequest(keyword_include=[["AI"]]))
        
        assert len(results) > 0
        assert results[0].title == "AI prediction leads people to forgo guaranteed rewards"
        assert results[0].authors == ["Aoi Naito", "Hirokazu Shirado"]
        assert results[0].abstract.startswith("Artificial intelligence (AI) is understood to affect the content of people's decisions.")
        assert results[0].publication_date == date(2026, 3, 30)
        assert results[0].id == "http://arxiv.org/abs/2603.28944v1"