from datetime import date, datetime
import os
from pathlib import Path

from dotenv import load_dotenv
import httpx
from typing import List
from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import RETRY, BaseAdapter

class SemanticScholarAdapter(BaseAdapter):
    # Documentato per l'endpoint /paper/search (relevance search, non /bulk):
    # limit di default 100, con il vincolo limit+offset <= 1000 per ricerca.
    SOURCE_NAME = "Semantic Scholar"
    MAX_PAGE_SIZE = 100
    # Con la chiave il limite è di una richiesta al secondo su tutti gli
    # endpoint (https://www.semanticscholar.org/product/api). Rallentare non
    # riduce i 429 osservati, che arrivano anche a 10 secondi di intervallo
    # (voce 104).
    MIN_REQUEST_INTERVAL = 1.0
    API_KEY_SOURCE_ID = "semantic_scholar"
    # "Can only return up to 1,000 relevance-ranked results"
    # (https://api.semanticscholar.org/graph/v1/swagger.json).
    MAX_RESULTS = 1000

    def _before_fetch(self, search_request: SearchRequest, offset: int):
        if offset + (search_request.limit or self.MAX_PAGE_SIZE) > self.MAX_RESULTS:
            # Oltre i primi 1000 risultati l'API risponde con un errore: è la
            # fine dei risultati, non un guasto da segnalare all'utente.
            return []
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")
        return None

    async def _send(self, client, search_request: SearchRequest, offset: int) -> httpx.Response:
        query = self._build_query(search_request, offset)
        url = f"https://api.semanticscholar.org/graph/v1/paper/search?{query}"
        # Ricalcolata a ogni tentativo: se un tentativo precedente ha
        # azzerato self.api_key per una chiave non valida (_handle_status),
        # la richiesta successiva deve riflettere subito il ripiego.
        # Priorità alla chiave personale/condivisa, se impostata;
        # altrimenti quella globale del server; senza nessuna delle
        # due, niente header (un valore None manderebbe in errore
        # httpx, che richiede header sempre stringa).
        api_key = self.api_key or os.getenv('SEMANTIC_SCHOLAR_API_KEY')
        header = {"x-api-key": api_key} if api_key else {}
        return await client.get(url, headers=header)

    def _handle_status(self, response: httpx.Response, offset: int):
        if response.status_code in (401, 403) and self.api_key:
            # La chiave (personale o condivisa da un membro del team)
            # non è valida: si ripiega sulla ricerca senza, invece di
            # far fallire l'intera sorgente (vedi key_invalid_fallback).
            print(f"Chiave API Semantic Scholar non valida ({response.status_code}). Ripiego senza chiave.")
            self.key_invalid_fallback = True
            self.api_key = None
            return RETRY

        if response.status_code == 400 and offset > 0:
            # Con offset >= total l'API risponde 400 ("Requested data for this
            # limit and/or offset is not available") invece di una pagina vuota:
            # succede quando il totale è multiplo esatto della pagina. È la fine
            # dei risultati, non un guasto (verificato dal vivo, voce 123).
            # A offset 0 un 400 resta un errore vero: non ci sono pagine
            # precedenti, quindi è la query stessa a essere rifiutata.
            return []
        return None

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
        # Solo informatica, stesso scope di OpenAlex (topics.field.id:17): senza, su
        # keyword generiche i paper giusti finiscono oltre le pagine lette (voce 123).
        fields_of_study = "&fieldsOfStudy=Computer%20Science"
        return f"{query}{fields}{fields_of_study}{mailto}&limit={request.limit}&offset={offset}"
        

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
                # /paper/search restituisce per ogni autore solo authorId e name:
                # le affiliazioni sono disponibili solo dagli endpoint degli
                # autori, con una richiesta in più (voce 127).
                institution_author = None,
                region = None,
                venue = entry['venue'] if 'venue' in entry else None,
            ))
        return articles