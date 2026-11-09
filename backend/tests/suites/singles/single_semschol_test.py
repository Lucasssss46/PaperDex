import pytest
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter
from backend.app.services.utils.pagination import paginated_fetch

@pytest.fixture(autouse=True)
async def setup_mock_db():
    client = AsyncMongoMockClient()
    await init_beanie(database=client.get_database("db_test"), document_models=[Article])

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "search_request, target1, target2",
    [
        (
            SearchRequest(keyword_include=[["Counterfactual Estimation"]], author=["Olivier"]),
            "Accelerating A/B-Tests with Counterfactual Estimation: Reducing Variance through Policy Overlap",
            None
        ),
        (
            SearchRequest(keyword_include=[["Cellular Plasticity"]], author = ["Smith"]),
            "Cellular Plasticity Model for Bottom-Up Robotic Design",
            None
        ),
        (
            SearchRequest(keyword_include = [["Modeling Transformers as complex networks"]], author=["Rocchetti"]),
            "Modeling Transformers as complex networks to analyze learning dynamics",
            None
        ),
        (
            SearchRequest(keyword_include = [["Modeling Transformers as complex networks"]], author=["Rocchetti"], year_start=2023, year_end=2026),
            "Modeling Transformers as complex networks to analyze learning dynamics",
            None
        ),
        (
            SearchRequest(keyword_include = [["chess game datasets"]], author=["Angelopoulos"], journal=["EPTCS"]),
            "Chess\\_db: A framework for working with large chess game datasets",
            None
        ),
        (
            SearchRequest(keyword_include = [["Robostral"], ["YOLO26"]], author=["Olivier"]),
            "Robostral Navigate",
            "Toward Optimal Adenovirus Detection Using YOLO26"
        ),
        (
            SearchRequest(author = ["Rocchetti"]),
            "Refusal Beyond a Single Direction: A Preliminary Comparison of Diff-in-Means and INLP",
            None
        )
    ]
)
async def test_article_found_in_all_sources(search_request, target1, target2):
    search = search_request
    article1 = Article(id="test_id", title=target1)
    article2 = None
    if target2:
        article2 = Article(id="test_id", title=target2)

    adapter = SemanticScholarAdapter()
    results = await paginated_fetch(adapter, search)

    found = any(
        (result.title and result.pulisci_titolo() == article1.pulisci_titolo()) 
        for result in results
        )

    if article2:
        found = found and any(
            (result.title and result.pulisci_titolo() == article2.pulisci_titolo()) 
            for result in results
            )
        
    assert found, f"Article not found"

