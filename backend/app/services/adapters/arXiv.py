import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv
import httpx
import xmltodict
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import (
    TOO_MANY_REQUESTS_MESSAGE,
    BaseAdapter,
    SourceUnavailableError,
    http_error_message,
)
from backend.app.schemas.models import Article
from datetime import datetime
from typing import Optional

class ArXivAdapter(BaseAdapter):
    # Documentato: max_results limitato a 2000 per singola richiesta
    # (https://info.arxiv.org/help/api/user-manual.html).
    MAX_PAGE_SIZE = 2000
    # Le condizioni d'uso chiedono al massimo una richiesta ogni 3 secondi
    # (https://info.arxiv.org/help/api/tou.html). true_coverage lo usa come
    # attesa tra le ricerche per titolo: con 2 secondi arXiv rispondeva 429
    # (report del 24 ottobre 2026).
    MIN_REQUEST_INTERVAL = 3.0
    # Tetto all'attesa chiesta dal server con Retry-After, come per DBLP.
    MAX_RETRY_AFTER_SECONDS = 60.0

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> list[Article]:
        params = self._build_query(search_request, offset)
        url = f"https://export.arxiv.org/api/query"
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(3):  # Riprova fino a 3 volte
                
                response = await client.get(url, params=params)
                
                if response.status_code in (429, 503):
                    if attempt == 2:
                        # Dopo l'ultimo tentativo non si attende: l'attesa
                        # allungava solo la ricerca prima dell'avviso (voce 103).
                        break
                    server_wait = self._retry_after_seconds(response)
                    wait_time = server_wait if server_wait is not None else 5.0 * (attempt + 1)  # 5s, poi 10s
                    print(f"Server arXiv occupato o limitato ({response.status_code}). Tentativo {attempt+1}/3. Attendo {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue
                    
                if response.status_code != 200:
                    # Un'eccezione invece di []: la lista vuota finirebbe in
                    # cache e l'utente non saprebbe che la sorgente è mancata.
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))
                    
                if not response.text:
                    return []

                data = xmltodict.parse(response.text)
                return self._normalize(data)

            print("Errore persistente dopo 3 tentativi. Nessun risultato ottenuto.")
            raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE)

    def _retry_after_seconds(self, response: httpx.Response) -> Optional[float]:
        """Secondi indicati dall'header Retry-After, limitati a
        MAX_RETRY_AFTER_SECONDS. None se l'header manca o non è un numero di
        secondi: in quel caso si usa l'attesa crescente."""
        value = response.headers.get("Retry-After")
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(seconds, 0.0), self.MAX_RETRY_AFTER_SECONDS)
        
    def _build_query(self, request: SearchRequest, offset: int = 0) -> dict:
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

        # Query minima: solo i termini del gruppo corrente. Journal, date range
        # ed exclude vengono applicati internamente dopo il fetch (vedi
        # services/utils/filtering.py), non qui.
        terms = request.query_terms()
        if not request.keyword_include and request.author:
            # Fallback per ricerche solo-autore: ti:/abs: non includono gli
            # autori su arXiv (verificato: 0 risultati cercando un cognome lì),
            # va usato il campo au: dedicato. Più autori = OR (uno qualsiasi
            # di quelli richiesti), coerente con _matches_authors.
            keyword_query = " OR ".join(f'au:"{term}"' for term in terms)
        else:
            # I termini in `terms` appartengono tutti allo stesso gruppo AND
            # (vedi query_terms()/_matches_keywords): vanno uniti in AND, non
            # OR, altrimenti un solo termine generico (es. "adenovirus" dentro
            # ["YOLO26", "adenovirus"]) inonda i risultati di rumore.
            keyword_query = " AND ".join(f'(ti:"{term}" OR abs:"{term}")' for term in terms)

        query_parts = [f"({keyword_query})"] if keyword_query else []
        query_parts.append("cat:cs.*")

        return {
            "search_query": " AND ".join(query_parts),
            "start": offset,
            "max_results": request.limit if request.limit else 100,
            "sortBy": "relevance",
            "sortOrder": "descending",
            "mailto": os.getenv("USER_EMAIL")
        }

    def _normalize(self, raw_data: dict) -> list[Article]:
        
        entries = raw_data.get('feed', {}).get('entry', [])
        if not entries:
            return []

        if isinstance(entries, dict):
            entries = [entries]

        articles = []
        for entry in entries:

            links = entry.get('link', [])
            if isinstance(links, dict):
                links = [links]
            doi_link = next((item for item in links if item.get('@title') == 'doi'), None)

            raw_id = doi_link.get('@href') if doi_link else entry.get('id')
            if isinstance(raw_id, list):
                article_id = raw_id[0] if raw_id else ""
            else:
                article_id = raw_id or ""

            raw_doi = entry.get('arxiv:doi')
            if isinstance(raw_doi, list):
                doi_value = raw_doi[0] if raw_doi else None
            else:
                doi_value = raw_doi
                    
            raw_venue = entry.get('arxiv:journal_ref')
            if isinstance(raw_venue, list):
                venue_value = raw_venue[0] if raw_venue else None
            else:
                venue_value = raw_venue

            articles.append(Article(
                id = article_id,
                title = entry['title'],
                doi = doi_value,
                authors = [a['name'] for a in entry['author']] if isinstance(entry['author'], list) else [entry['author']['name']],
                publication_date = datetime.fromisoformat(entry['published'].replace('Z', '+00:00')).date(),
                abstract = entry['summary'],
                source ="ArXiv",
                venue = venue_value,
            ))
            
        return articles