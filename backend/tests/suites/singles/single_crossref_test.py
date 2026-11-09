import pytest
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.crossref import CrossrefAdapter
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
            # Crossref indicizza principalmente contenuti con DOI registrato
            # (venue peer-reviewed), non i preprint arXiv usati per le altre
            # sorgenti: articoli e frasi qui sono verificati esistere davvero su
            # Crossref (query.bibliographic diretta, non solo per titolo).
            SearchRequest(keyword_include=[["Artistic Prompt Interpretation"]], author=["Rocchetti"]),
            "The Cow of Rembrandt Analyzing Artistic Prompt Interpretation in Text-to-Image Models",
            None
        ),
        (
            SearchRequest(keyword_include=[["Unveiling Transformer Perception"]], author = ["Rocchetti"]),
            "Unveiling Transformer Perception by Exploring Input Manifolds",
            None
        ),
        (
            SearchRequest(keyword_include = [["Unveiling Transformer Perception"]], author=["Rocchetti"], year_start=2025, year_end=2026),
            "Unveiling Transformer Perception by Exploring Input Manifolds",
            None
        ),
        (
            SearchRequest(keyword_include = [["Human Values in Arguments with SuperASKE"]], author=["Rocchetti"], journal=["Association for Computational Linguistics"]),
            "Augustine of Hippo at SemEval-2023 Task 4: An Explainable Knowledge Extraction Method to Identify Human Values in Arguments with SuperASKE",
            None
        ),
        (
            SearchRequest(keyword_include = [["Artistic Prompt Interpretation"], ["Vision-Language Models Biometric Capabilities"]], author=["Rocchetti"]),
            "The Cow of Rembrandt Analyzing Artistic Prompt Interpretation in Text-to-Image Models",
            "Investigating Vision-Language Models Biometric Capabilities Via Sequence-Based Predictions"
        ),
        (
            # Solo autore, nome completo: dalla voce 101 si usa query.author,
            # che mette l'articolo target in posizione 20 (verificato il
            # 2026-10-24). Il cognome da solo non serve più: con query.author
            # i lavori dei tanti Rocchetti hanno tutti lo stesso punteggio e il
            # target non compare nei primi 300; con query.bibliographic il nome
            # completo non dava nessun lavoro dell'autrice tra i primi 50.
            SearchRequest(author = ["Elisabetta Rocchetti"]),
            "Investigating Vision-Language Models Biometric Capabilities Via Sequence-Based Predictions",
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

    adapter = CrossrefAdapter()
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

