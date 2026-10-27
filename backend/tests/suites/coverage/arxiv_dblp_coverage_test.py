import pytest
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.schemas.search import SearchRequest
from backend.app.services.utils.comparing import normalize_title

@pytest.mark.asyncio
async def test_adapters_overlap():
    # 1. Definisce una SearchRequest comune
    search_request = SearchRequest(
        keyword_include=[["attention mechanism"]],
        limit=200
    )
    
    # 2. Istanzia gli adapter
    arxiv_adapter = ArXivAdapter()
    dblp_adapter = DBLPAdapter()
    
    # 3. Esegue le fetch in parallelo o sequenza (con le accortezze per i rate limit)
    print("Recupero articoli da arXiv...")
    arxiv_articles = await arxiv_adapter.fetch(search_request)
    
    print("Recupero articoli da DBLP...")
    dblp_articles = await dblp_adapter.fetch(search_request)
    
    # 4. Estrae e normalizza i titoli per confrontarli
    arxiv_titles = {normalize_title(art.title) for art in arxiv_articles if art.title}
    dblp_titles = {normalize_title(art.title) for art in dblp_articles if art.title}
    
    # 5. Calcola le metriche di sovrapposizione
    intersection = arxiv_titles.intersection(dblp_titles)
    union = arxiv_titles.union(dblp_titles)
    
    jaccard_similarity = len(intersection) / len(union) if union else 0.0
    
    print(f"\n--- REPORT SOVRAPPOSIZIONE ---")
    print(f"Articoli trovati su arXiv: {len(arxiv_titles)}")
    print(f"Articoli trovati su DBLP: {len(dblp_titles)}")
    print(f"Articoli in comune (intersezione): {len(intersection)}")
    print(f"Indice di Jaccard (Sovrapposizione): {jaccard_similarity:.2%}")
    print(f"-------------------------------\n")
    
    assert jaccard_similarity > 0.0
    assert jaccard_similarity > 0.25
    assert jaccard_similarity > 0.5
    assert jaccard_similarity > 0.75