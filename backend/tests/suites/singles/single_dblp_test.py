import pytest
from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.utils.pagination import paginated_fetch

@pytest.mark.asyncio
@pytest.mark.parametrize(
    "search_request, target1, target2",
    [
        (
            SearchRequest(keyword_include=[["vegetation index"]], author=["Tsoulias"], year_start=2020, year_end=2025),
            "In-situ fruit analysis by means of LiDAR 3D point cloud of normalized difference vegetation index (NDVI).",
            None
        ),
        (
            SearchRequest(keyword_include=[["Memory-Augmented Graph Neural Networks"]], journal=["IEEE"], year_start=2024, year_end=2025),
            "Memory-Augmented Graph Neural Networks: A Brain-Inspired Review.",
            None
        ),
        (
            SearchRequest(keyword_include=[["Interindividual Differences"],["Adaptive target detection in hyperspectral imaging"]], author=["Olivier"], year_start=2021, year_end=2021),
            "Adaptive target detection in hyperspectral imaging from two sets of training samples with different means.",
            "Trait Interindividual Differences in the Effectiveness of Modafinil."
        ),

    ]
)
@pytest.mark.asyncio
async def test_article_found_in_all_sources(search_request, target1, target2):
    search = search_request
    article1 = Article(id="test_id", title=target1)
    article2 = None
    if target2:
        article2 = Article(id="test_id", title=target2)
    adapter = DBLPAdapter()
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

