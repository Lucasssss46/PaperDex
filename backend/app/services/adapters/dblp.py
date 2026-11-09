import asyncio
from datetime import date
import html
import os
from pathlib import Path

from dotenv import load_dotenv
import httpx
from typing import List, Optional
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import (
    TOO_MANY_REQUESTS_MESSAGE,
    UNREACHABLE_MESSAGE,
    BaseAdapter,
    SourceUnavailableError,
    http_error_message,
)
from backend.app.schemas.models import Article

BOT_CHALLENGE_MESSAGE = (
    "DBLP ha risposto con la verifica anti-bot invece dei risultati. "
    "La sorgente è stata saltata."
)

class DBLPAdapter(BaseAdapter):
    # La FAQ indica "h" fino a 1000 per richiesta
    # (https://dblp.org/faq/How+to+use+the+dblp+search+API.html), ma da
    # ottobre 2026 entrambi i mirror ne mandano al massimo 100 anche con
    # h=1000 (@sent=100; f=100 dà i successivi). Con 1000 la profondità alta
    # chiedeva 150, riceveva 100 e la paginazione si fermava (voce 99).
    MAX_PAGE_SIZE = 100
    # Tetto all'attesa chiesta dal server con Retry-After, per non bloccare a
    # lungo l'intera ricerca multi-sorgente su una sola sorgente.
    MAX_RETRY_AFTER_SECONDS = 60.0
    # Da ottobre 2026 DBLP è dietro Anubis: le richieste senza il parametro
    # "app" ricevono la pagina di verifica anti-bot (HTTP 202, HTML) invece
    # del JSON. Il formato "<nome>_<versione>" è quello indicato dal supporto
    # DBLP (https://github.com/bateman/dblp-search-ext/pull/68).
    APP_ID = "PaperDex_0.1"

    def __init__(self, api_key: Optional[str] = None):
        super().__init__(api_key)
        # Lista di mirror ufficiali in ordine di preferenza
        self.endpoints = [
            "https://dblp.dagstuhl.de/search/publ/api",
            "https://dblp.uni-trier.de/search/publ/api"
        ]

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> List[Article]:

        params = self._build_query(search_request, offset)
        timeout = httpx.Timeout(20.0, connect=10.0)
        for attempt in range(3):  # Riprova fino a 3 volte
            # Attesa chiesta dal server in questo giro (429/503), None se nessun
            # mirror ha segnalato un limite. Prima l'attesa non veniva mai
            # applicata: raise_for_status mandava anche 429/503 nell'except,
            # che passava subito al mirror successivo (voce 94).
            wait_time = None
            # True se almeno un mirror ha risposto con la verifica anti-bot.
            challenged = False
            for base_url in self.endpoints:
                try:
                    async with httpx.AsyncClient(timeout=timeout) as client:
                        response = await client.get(base_url, params=params)
                except httpx.RequestError as e:
                    # Timeout o errore di rete: si prova il mirror di backup.
                    print(f"Errore durante la richiesta a {base_url}: {e}")
                    continue

                if response.status_code in (429, 503):
                    # Si prova comunque l'altro mirror; se anche quello è
                    # limitato si attende prima del giro successivo.
                    server_wait = self._retry_after_seconds(response)
                    backoff = server_wait if server_wait is not None else 5.0 * (attempt + 1)  # 5s, poi 10s, poi 15s
                    wait_time = max(wait_time or 0.0, backoff)
                    print(f"Server DBLP {base_url} occupato o limitato ({response.status_code}).")
                    continue

                if response.status_code >= 500:
                    print(f"Errore del server DBLP {base_url}: {response.status_code}. Provo il mirror successivo.")
                    continue

                if self._is_bot_challenge(response):
                    # Prima finiva nel ramo != 200 e diventava "nessun
                    # risultato": le statistiche salvavano metriche a zero e la
                    # cache teneva la risposta vuota per CACHE_TTL_DAYS.
                    print(f"Server DBLP {base_url}: verifica anti-bot ({response.status_code}). Provo il mirror successivo.")
                    challenged = True
                    continue

                if response.status_code != 200:
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))

                if not response.text:
                    return []

                return self._normalize(response.json())

            if challenged and wait_time is None:
                # Ritentare non serve: la verifica non dipende dal ritmo delle
                # richieste. SourceUnavailableError non viene messa in cache.
                raise SourceUnavailableError(BOT_CHALLENGE_MESSAGE)

            if wait_time is not None and attempt < 2:
                print(f"Tentativo {attempt+1}/3 fallito per limite di richieste. Attendo {wait_time}s...")
                await asyncio.sleep(wait_time)

        # Un'eccezione invece di []: la lista vuota finirebbe in cache e
        # l'utente non saprebbe che la sorgente è mancata.
        print("Errore persistente dopo 3 tentativi. Nessun risultato ottenuto.")
        raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE if wait_time is not None else UNREACHABLE_MESSAGE)

    def _is_bot_challenge(self, response: httpx.Response) -> bool:
        """True se DBLP ha mandato la pagina di verifica di Anubis al posto
        del JSON: arriva con 202 (a volte 200) e Content-Type text/html."""
        if response.status_code == 202:
            return True
        content_type = response.headers.get("Content-Type", "")
        return response.status_code == 200 and "html" in content_type

    def _retry_after_seconds(self, response: httpx.Response) -> Optional[float]:
        """Secondi indicati dall'header Retry-After, che DBLP manda con il 429
        (https://dblp1.uni-trier.de/faq/1474706.html), limitati a MAX_RETRY_AFTER_SECONDS.
        None se l'header manca o non è un numero di secondi."""
        value = response.headers.get("Retry-After")
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(seconds, 0.0), self.MAX_RETRY_AFTER_SECONDS)
        

    @staticmethod
    def _first(value):
        # DBLP manda un campo come stringa se ha un solo valore e come lista
        # se ne ha di più: succede per 'venue' ed 'ee' e, in qualche record,
        # anche per 'year' ("software testing", valutazione del 2026-10-25,
        # voce 113). Si tiene il primo.
        if isinstance(value, list):
            return value[0] if value else None
        return value

    def _build_query(self, request: SearchRequest, offset: int = 0) -> dict:
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

        # Query minima: solo le keyword grezze. Autori, journal e date range
        # vengono applicati internamente dopo il fetch.
        search_query = " ".join(request.query_terms())

        return {
            "q": search_query,
            "h": request.limit if request.limit else 100,
            "f": offset,
            "format": "json",
            "app": self.APP_ID,
            "mailto": os.getenv("USER_EMAIL")
        }
            



    def _normalize(self, data: dict) -> List[Article]:
        articles = []
        
        hits = data.get("result", {}).get("hits", {}).get("hit", [])
        
        for hit in hits:
            info = hit.get("info", {})
            year_val = self._first(info.get("year"))

            authors_raw = info.get('authors', {}).get('author', [])
            if isinstance(authors_raw, dict):
                authors_list = [authors_raw]
            elif isinstance(authors_raw, list):
                authors_list = authors_raw
            else:
                authors_list = []

            # DBLP restituisce 'venue' come stringa semplice se c'e' un solo
            # valore, come lista se ce ne sono di piu' (stesso pattern di 'author').
            venue = self._first(info.get('venue'))

            # DBLP lascia nel JSON le entità XML del suo formato d'origine
            # (es. "Models&apos; Sycophantic Behaviour"): senza decodificarle
            # restavano nel titolo mostrato, negli export e nel confronto tra
            # titoli della deduplicazione.

            articles.append(Article(
                id=self._first(info['ee']) if 'doi' in info and info.get('ee') else info['url'],
                title=html.unescape(info['title']),
                doi=self._first(info['doi']) if 'doi' in info else None,
                authors=[html.unescape(a['text']) for a in authors_list if isinstance(a, dict) and 'text' in a],
                publication_date= date(int(year_val), 1, 1) if isinstance(year_val, str) and year_val.isdigit() else None,
                abstract=None,
                source="DBLP",
                venue=html.unescape(venue) if isinstance(venue, str) else venue,
            ))

        return articles