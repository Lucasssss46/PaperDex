import asyncio
import logging
from typing import List, Optional, Type

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import (
    PARTIAL_RESULTS_MESSAGE,
    UNREACHABLE_MESSAGE,
    BaseAdapter,
    SourceUnavailableError,
    missing_api_key_message,
)
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.adapters.openAlex import OpenAlexAdapter
from backend.app.services.adapters.semanticScholar import SemanticScholarAdapter
from backend.app.services.utils.pagination import PartialResultsError, paginated_fetch

# Nomi coincidenti con Article.source (vedi _normalize di ciascun adapter),
# così una selezione "per nome sorgente" resta coerente con com'è già etichettato
# ogni risultato.
ADAPTER_REGISTRY: dict[str, Type[BaseAdapter]] = {
    "ArXiv": ArXivAdapter,
    "Crossref": CrossrefAdapter,
    "DBLP": DBLPAdapter,
    "OpenAlex": OpenAlexAdapter,
    "Semantic Scholar": SemanticScholarAdapter,
}

# Verso inverso di ADAPTER_REGISTRY: serve per riportare i risultati di un
# adapter al nome sorgente "umano" (coerente con Article.source), non al nome
# della classe Python.
ADAPTER_CLASS_TO_NAME: dict[Type[BaseAdapter], str] = {cls: name for name, cls in ADAPTER_REGISTRY.items()}


def resolve_adapters(
    source_names: Optional[List[str]] = None,
    api_keys: Optional[dict[str, str]] = None,
) -> List[BaseAdapter]:
    """Converte un elenco di nomi sorgente in istanze di adapter. None o lista
    vuota = tutte le sorgenti disponibili. `api_keys` (chiave = source id
    dell'adapter, es. "semantic_scholar") passa a ciascun adapter la chiave
    API personale dell'utente, se ne ha registrata una per quella sorgente."""
    api_keys = api_keys or {}

    def build(adapter_cls: Type[BaseAdapter]) -> BaseAdapter:
        key = api_keys.get(adapter_cls.API_KEY_SOURCE_ID) if adapter_cls.API_KEY_SOURCE_ID else None
        return adapter_cls(api_key=key)

    if not source_names:
        return [build(adapter_cls) for adapter_cls in ADAPTER_REGISTRY.values()]

    unknown = [name for name in source_names if name not in ADAPTER_REGISTRY]
    if unknown:
        raise ValueError(f"Sorgenti sconosciute: {unknown}. Disponibili: {list(ADAPTER_REGISTRY)}")

    return [build(ADAPTER_REGISTRY[name]) for name in source_names]


async def search_all_sources(
    search_request: SearchRequest,
    sources: Optional[List[str]] = None,
    api_keys: Optional[dict[str, str]] = None,
) -> tuple[List[Article], List[dict]]:
    """Interroga in parallelo le sorgenti indicate (default: tutte) e unisce i
    risultati in un'unica lista. Se una sorgente fallisce, le altre proseguono
    comunque.

    Oltre ai risultati, restituisce gli avvisi da mostrare all'utente, uno per
    sorgente: `key_invalid_fallback` (Semantic Scholar, chiave rifiutata e
    ricerca proseguita senza); le sorgenti saltate con SourceUnavailableError
    (chiave mancante o rifiutata, credito esaurito, errore HTTP, limite di
    richieste persistente); quelle saltate per un errore imprevisto, ad
    esempio di rete; quelle interrotte a metà paginazione, di cui si tengono
    i risultati già raccolti (PartialResultsError).
    """
    adapters = resolve_adapters(sources, api_keys)
    # Sorgente -> messaggio, per le sorgenti saltate o interrotte.
    unavailable: dict[str, str] = {}

    async def fetch_from(adapter: BaseAdapter) -> List[Article]:
        name = ADAPTER_CLASS_TO_NAME[type(adapter)]
        try:
            if adapter.REQUIRES_API_KEY and not adapter.api_key:
                # Controllato qui, prima della paginazione: evita le attese
                # di rate limit per richieste che non partirebbero comunque.
                raise SourceUnavailableError(missing_api_key_message(name))
            return await paginated_fetch(adapter, search_request)
        except PartialResultsError as e:
            logging.warning(f"Ricerca interrotta su {adapter.__class__.__name__}: {e.cause}")
            unavailable[name] = PARTIAL_RESULTS_MESSAGE
            return e.results
        except SourceUnavailableError as e:
            unavailable[name] = str(e)
            return []
        except Exception as e:
            # Prima solo nel log: per l'utente la sorgente risultava
            # semplicemente senza risultati.
            logging.warning(f"Ricerca fallita su {adapter.__class__.__name__}: {e}")
            unavailable[name] = UNREACHABLE_MESSAGE
            return []

    results_per_source = await asyncio.gather(*(fetch_from(adapter) for adapter in adapters))

    merged: List[Article] = []
    for results in results_per_source:
        merged.extend(results)

    warnings = [
        {
            "source": ADAPTER_CLASS_TO_NAME[type(adapter)],
            "message": "La chiave API per questa sorgente non è valida: la ricerca è proseguita senza.",
        }
        for adapter in adapters
        if adapter.key_invalid_fallback
    ]
    warnings.extend({"source": name, "message": message} for name, message in unavailable.items())

    return merged, warnings
