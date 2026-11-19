import os
from pathlib import Path

from dotenv import load_dotenv
import httpx
import xmltodict
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import BaseAdapter
from backend.app.schemas.models import Article
from datetime import datetime

class ArXivAdapter(BaseAdapter):
    # Documentato: max_results limitato a 2000 per singola richiesta
    # (https://info.arxiv.org/help/api/user-manual.html).
    SOURCE_NAME = "arXiv"
    MAX_PAGE_SIZE = 2000
    # Le condizioni d'uso chiedono al massimo una richiesta ogni 3 secondi
    # (https://info.arxiv.org/help/api/tou.html): con 2 secondi arXiv
    # rispondeva 429 (report del 24 ottobre 2026).
    MIN_REQUEST_INTERVAL = 3.0
    # Tetto all'attesa chiesta dal server con Retry-After, come per DBLP.
    MAX_RETRY_AFTER_SECONDS = 60.0

    async def _send(self, client, search_request: SearchRequest, offset: int) -> httpx.Response:
        params = self._build_query(search_request, offset)
        return await client.get("https://export.arxiv.org/api/query", params=params)

    def _parse(self, response: httpx.Response):
        # arXiv risponde in XML (Atom), non in JSON.
        return xmltodict.parse(response.text)

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
            "mailto": os.getenv("CONTACT_EMAIL")
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