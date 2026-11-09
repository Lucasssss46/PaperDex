import asyncio
import logging
from backend.app.services.adapters.base import BaseAdapter, SourceUnavailableError
from backend.app.services.utils.caching import file_cache
from backend.app.services.utils.filtering import filter_articles

@file_cache
async def cached_raw_fetch(adapter: BaseAdapter, search_request, delay: float = 3.0, offset: int = 0):
    """
    Fetch grezzo (non filtrato) di una singola pagina: rispetta il rate limit
    e passa dalla cache su file (chiave = query effettiva + offset), così
    pagine già scaricate vengono riusate anche da ricerche diverse che
    producono la stessa query (es. stesso gruppo di keyword, autore diverso).
    """
    await asyncio.sleep(delay)
    try:
        return await adapter.fetch(search_request, offset=offset)
    except SourceUnavailableError:
        # Chiave mancante/rifiutata o credito esaurito: ritentare non serve.
        raise
    except Exception as e:
        logging.warning(f"Errore durante la chiamata API: {e}. Ritento tra 5s...")
        await asyncio.sleep(5.0)
        return await adapter.fetch(search_request, offset=offset)


async def safe_fetch_with_rate_limit(adapter: BaseAdapter, search_request, delay: float = 3.0):
    """
    Fetch di una pagina (cache + rate limit tramite cached_raw_fetch), poi
    applica internamente i filtri richiesti sui risultati normalizzati.
    """
    results = await cached_raw_fetch(adapter, search_request, delay=delay)
    return filter_articles(results, search_request)