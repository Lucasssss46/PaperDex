import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from beanie import init_beanie
from mongomock_motor import AsyncMongoMockClient

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.openAlex import OpenAlexAdapter
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
            SearchRequest(keyword_include=[["Counterfactual Estimation"]], author=["Jeunen"]),
            "Accelerating A/B-Tests with Counterfactual Estimation: Reducing Variance through Policy Overlap",
            None
        ),
        (
            SearchRequest(keyword_include=[["active attitude control"]], author = ["Fukuda"], year_start=1988, year_end=1988),
            "A 3-D pattern recognition method by the active attitude control of objects.",
            None
        ),
        (
            # "Edirectives" (articolo di diritto UE) non è classificato come
            # Computer Science da OpenAlex: il filtro di dominio dell'app
            # (topics.field.id:17, fisso su tutte le query) lo esclude sempre,
            # a prescindere dalla query. Sostituito con un target verificato
            # essere classificato CS.
            SearchRequest(keyword_include = [["Human Values in Arguments with SuperASKE"]]),
            "Augustine of Hippo at SemEval-2023 Task 4: An Explainable Knowledge Extraction Method to Identify Human Values in Arguments with SuperASKE",
            None
        ),
        (
            SearchRequest(keyword_include = [["Imparts Length Control"]], author=["Elisabetta Rocchetti"], year_start=2023, year_end=2026),
            "How Instruction-Tuning Imparts Length Control: A Cross-Lingual Mechanistic Analysis",
            None
        ),
        (
            SearchRequest(keyword_include = [["Drug Traceability in Healthcare"],["Ownership Management of Medical Devices"]], author=["Salah"], journal=["IEEE Access"], year_start=2021, year_end=2022),
            "A Blockchain-Based Approach for Drug Traceability in Healthcare Supply Chain",
            "NFT-Based Traceability and Ownership Management of Medical Devices"
        ),
        (
            # "YOLO26 Adenovirus Segmentation" ha zero topic assegnati su
            # OpenAlex (troppo recente per la loro pipeline di classificazione)
            # quindi il filtro di dominio CS lo esclude sempre. Sostituito con
            # la stessa coppia già verificata su Crossref.
            SearchRequest(keyword_include = [["Artistic Prompt Interpretation"], ["Vision-Language Models Biometric Capabilities"]]),
            "The Cow of Rembrandt Analyzing Artistic Prompt Interpretation in Text-to-Image Models",
            "Investigating Vision-Language Models Biometric Capabilities Via Sequence-Based Predictions"
        ),
        (
            # Stesso motivo del caso sopra: "Refusal Beyond a Single Direction"
            # non è classificato CS su OpenAlex (verificato: sparisce col
            # filtro di dominio anche se l'articolo esiste ed è dell'autrice).
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

    # OpenAlex richiede una chiave: per i test di rete si usa quella del .env.
    load_dotenv(Path(__file__).resolve().parents[3] / ".env")
    adapter = OpenAlexAdapter(api_key=os.getenv("OPENALEX_API_KEY"))
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

