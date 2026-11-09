import asyncio

from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import BaseAdapter, SourceUnavailableError
from dataclasses import dataclass, asdict
from typing import Dict, Any, Optional
from backend.app.services.utils.search import cached_raw_fetch, safe_fetch_with_rate_limit


def jaccard(results1: set, results2: set) -> float:
    """Calcola l'indice di Jaccard tra due insiemi."""

    r1_titles = {r.pulisci_titolo() for r in results1 if r.title}
    r2_titles = {r.pulisci_titolo() for r in results2 if r.title}
    intersection = r1_titles.intersection(r2_titles)
    union = r1_titles.union(r2_titles)
    
    return len(intersection) / len(union) if union else 0.0

async def true_coverage(results: set, adapter:BaseAdapter) -> dict:
    """Calcola la copertura vera di un insieme di articoli su un'altra sorgente."""
    found_structurally = 0
    valid_count = 0

    for article in results:
        if not article.title:
            continue
        valid_count += 1

        title_query = SearchRequest(keyword_include=[[article.title]], limit=3)
        # Risultati grezzi, senza filter_articles: il filtro cercherebbe il
        # titolo intero come sottostringa, e basta una differenza di
        # punteggiatura (DBLP chiude i titoli con il punto, arXiv no) per
        # scartare l'articolo giusto. Il confronto vero è quello sul titolo
        # pulito qui sotto.
        # Attesa minima della sorgente se ne dichiara una (arXiv: 3 secondi),
        # altrimenti 2 secondi.
        delay = getattr(adapter, "MIN_REQUEST_INTERVAL", 2.0)
        results_for_title = await cached_raw_fetch(adapter, title_query, delay=delay)
        results_for_title = results_for_title or []

        clean_title = article.pulisci_titolo()
        if any(p.title and p.pulisci_titolo() == clean_title for p in results_for_title):
            found_structurally += 1

    true_coverage_rate = (found_structurally / valid_count) * 100 if valid_count > 0 else 0.0

    return {
        "total_results": valid_count,
        "found_structurally": found_structurally,
        "true_coverage_rate": true_coverage_rate
    }

@dataclass
class SearchEvaluationMetrics:
    query_description: str
    source_a: str
    source_b: str
    total_results_a: int
    total_results_b: int
    jaccard_index: float
    coverage_a_to_b: float  # Quanti titoli di A si trovano cercandoli su B
    coverage_b_to_a: float  # Quanti titoli di B si trovano cercandoli su A
    metadata: Dict[str, Any] = None

    def to_dict(self):
        return asdict(self)

async def evaluate_query_metrics(search_request: SearchRequest, adapter_a: BaseAdapter, name_a, adapter_b, name_b):
    # 1. Ricerca base su entrambe le sorgenti (sfruttano la cache)
    results_a = await safe_fetch_with_rate_limit(adapter_a, search_request)
    results_b = await safe_fetch_with_rate_limit(adapter_b, search_request)

    # 2. Calcolo Indice di Jaccard
    titles_a = {p.pulisci_titolo() for p in results_a if p.title}
    titles_b = {p.pulisci_titolo() for p in results_b if p.title}
    intersection = titles_a.intersection(titles_b)
    union = titles_a.union(titles_b)
    jaccard_index = jaccard(results_a, results_b)

    # 3. True Coverage: da A a B e da B a A (sfruttano la cache per titoli già cercati)
    coverage_a_to_b = await true_coverage(results_a, adapter_b)
    coverage_b_to_a = await true_coverage(results_b, adapter_a)

    # 4. Restituzione delle metriche strutturate
    return SearchEvaluationMetrics(
        query_description=str(search_request),
        source_a=name_a,
        source_b=name_b,
        total_results_a=len(results_a),
        total_results_b=len(results_b),
        jaccard_index=round(jaccard_index * 100, 2),
        coverage_a_to_b=round(coverage_a_to_b["true_coverage_rate"], 2),
        coverage_b_to_a=round(coverage_b_to_a["true_coverage_rate"], 2),
        metadata={
            "intersection_count": len(intersection),
            "union_count": len(union)
        }
    )


@dataclass
class SkippedEvaluation:
    """Query che non è stato possibile valutare perché una sorgente ha
    continuato a rifiutare le richieste. Finisce nel report al posto delle
    metriche, così si vede quale query manca e perché, invece di metriche a
    zero che sembrerebbero un risultato."""
    query_description: str
    source_a: str
    source_b: str
    skipped: bool
    reason: str
    attempts: int

    def to_dict(self):
        return asdict(self)


# Pause prima di rifare una query dopo una SourceUnavailableError: l'adapter
# ha già ritentato per qualche secondo, qui si aspetta che il limite della
# sorgente si azzeri. Le pagine già scaricate sono in cache, quindi la query
# riparte da dove si era fermata.
QUERY_RETRY_WAITS = (60.0, 180.0)


async def evaluate_query_with_retries(search_request: SearchRequest, adapter_a: BaseAdapter, name_a, adapter_b, name_b, retry_waits=QUERY_RETRY_WAITS):
    """evaluate_query_metrics, ma una sorgente che rifiuta le richieste (per
    esempio il 429 di arXiv) non ferma l'intera valutazione: la query viene
    rifatta dopo ogni pausa di retry_waits e, se fallisce ancora, restituisce
    una SkippedEvaluation."""
    attempts = len(retry_waits) + 1
    for attempt in range(attempts):
        try:
            return await evaluate_query_metrics(search_request, adapter_a, name_a, adapter_b, name_b)
        except SourceUnavailableError as e:
            reason = str(e)
            if attempt < len(retry_waits):
                wait_time = retry_waits[attempt]
                print(f"Sorgente non disponibile ({reason}). Tentativo {attempt+1}/{attempts} della query. Attendo {wait_time}s...")
                await asyncio.sleep(wait_time)

    print(f"Query saltata dopo {attempts} tentativi: {search_request}")
    return SkippedEvaluation(
        query_description=str(search_request),
        source_a=name_a,
        source_b=name_b,
        skipped=True,
        reason=reason,
        attempts=attempts,
    )
