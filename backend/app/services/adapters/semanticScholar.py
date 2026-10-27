import asyncio
from datetime import date, datetime
import os
from pathlib import Path

from dotenv import load_dotenv
import httpx
from typing import List
from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import (
    TOO_MANY_REQUESTS_MESSAGE,
    BaseAdapter,
    SourceUnavailableError,
    http_error_message,
)

class SemanticScholarAdapter(BaseAdapter):
    # Documentato per l'endpoint /paper/search (relevance search, non /bulk):
    # limit di default 100, con il vincolo limit+offset <= 1000 per ricerca.
    MAX_PAGE_SIZE = 100
    API_KEY_SOURCE_ID = "semantic_scholar"
    # "Can only return up to 1,000 relevance-ranked results"
    # (https://api.semanticscholar.org/graph/v1/swagger.json).
    MAX_RESULTS = 1000

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> List[Article]:
        if offset + (search_request.limit or self.MAX_PAGE_SIZE) > self.MAX_RESULTS:
            # Oltre i primi 1000 risultati l'API risponde con un errore: è la
            # fine dei risultati, non un guasto da segnalare all'utente.
            return []

        query = self._build_query(search_request, offset)
        url = f"https://api.semanticscholar.org/graph/v1/paper/search?{query}"
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(3):  # Riprova fino a 3 volte
                # Ricalcolata a ogni tentativo: se un tentativo precedente ha
                # azzerato self.api_key per una chiave non valida (sotto), la
                # richiesta successiva deve riflettere subito il ripiego.
                # Priorità alla chiave personale/condivisa, se impostata;
                # altrimenti quella globale del server; senza nessuna delle
                # due, niente header (un valore None manderebbe in errore
                # httpx, che richiede header sempre stringa).
                api_key = self.api_key or os.getenv('SEMANTIC_SCHOLAR_API_KEY')
                header = {"x-api-key": api_key} if api_key else {}

                response = await client.get(url, headers=header)

                if response.status_code in (429, 503):
                    if attempt == 2:
                        # Dopo l'ultimo tentativo non si attende: l'attesa
                        # allungava solo la ricerca prima dell'avviso (voce 103).
                        break
                    wait_time = 5.0 * (attempt + 1)  # 5s, poi 10s
                    print(f"Server Semantic Scholar occupato o limitato ({response.status_code}). Tentativo {attempt+1}/3. Attendo {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue

                if response.status_code in (401, 403) and self.api_key:
                    # La chiave (personale o condivisa da un membro del team)
                    # non è valida: si ripiega sulla ricerca senza, invece di
                    # far fallire l'intera sorgente (vedi key_invalid_fallback).
                    print(f"Chiave API Semantic Scholar non valida ({response.status_code}). Ripiego senza chiave.")
                    self.key_invalid_fallback = True
                    self.api_key = None
                    continue

                if response.status_code != 200:
                    # Un'eccezione invece di []: la lista vuota finirebbe in
                    # cache e l'utente non saprebbe che la sorgente è mancata.
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))

                if not response.text:
                    return []

                return self._normalize(response.json())

            print("Errore persistente dopo 3 tentativi. Nessun risultato ottenuto.")
            raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE)


    def _build_query(self, request: SearchRequest, offset: int = 0) -> str:
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")
        mailto = f"&mailto={os.getenv('USER_EMAIL')}" # Polite request
        fields = f"&fields=title,authors,abstract,venue,year,publicationDate,externalIds,url"

        # Query minima: solo le keyword grezze del gruppo corrente, separate da
        # spazi. /paper/search accetta solo testo libero ordinato per rilevanza
        # ("No special query syntax is supported"): il `|` usato prima non era
        # un OR vero. I termini sono tutti dello stesso gruppo AND (vedi
        # query_terms()/_matches_keywords), e l'AND lo garantisce il filtro
        # interno, insieme a venue, anno, autore ed exclude.
        query = "query=" + " ".join(request.query_terms())

        # Niente `sort`: esiste solo su /paper/search/bulk, questo endpoint
        # ordina sempre per rilevanza (https://api.semanticscholar.org/graph/v1/swagger.json).
        return f"{query}{fields}{mailto}&limit={request.limit}&offset={offset}"
        

    def _normalize(self, items: List[dict]) -> List[Article]:
        articles = []
        # Nessun tetto qui: la dimensione di pagina la decide paginated_fetch
        # tramite `limit` (max 100, MAX_PAGE_SIZE). Il vecchio contatore a 50
        # (retaggio di /paper/search/bulk, che restituisce fino a 1000 articoli
        # senza `limit`) tagliava le pagine da 100 della profondità alta a 51:
        # paginated_fetch le leggeva come incomplete e smetteva di paginare.
        # Senza risultati la risposta è {"total": 0, "offset": 0}, senza
        # "data": items['data'] dava KeyError, un nuovo tentativo e poi un
        # avviso falso al posto di zero risultati (voce 100).
        for entry in items.get('data', []):
            articles.append(Article(
                id = entry['url'],
                title = entry.get('title', 'Untitled'),
                doi = entry['externalIds']['DOI'] if 'externalIds' in entry and 'DOI' in entry['externalIds'] else None,
                authors = [a['name'] for a in entry['authors']] if 'authors' in entry else None,
                publication_date = datetime.fromisoformat(entry['publicationDate']).date() if entry['publicationDate'] else datetime.fromisoformat(f'{entry['year']}' + "-01-01").date() if entry['year'] else None,
                abstract = entry.get('abstract'),
                source = "Semantic Scholar",
                institution_author = list(set([affiliation for author in entry.get('authors', []) for affiliation in author.get('affiliations', [])])) if 'authors' in entry else None,
                region = None,
                venue = entry['venue'] if 'venue' in entry else None,
            ))
        return articles