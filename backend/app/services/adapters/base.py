import asyncio
from abc import ABC, abstractmethod
from typing import List, Optional

import httpx

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest


def missing_api_key_message(source_name: str) -> str:
    return (
        f"{source_name} richiede una chiave API: imposta la tua in Chiavi API, "
        "oppure chiedi a un membro del team di condividerla. La sorgente è stata saltata."
    )


# Avvisi per le sorgenti che non hanno risposto. Il frontend li mostra dopo il
# nome della sorgente ("DBLP: ..."), quindi non lo ripetono.
UNREACHABLE_MESSAGE = "Nessuna risposta (errore di rete o del servizio): la sorgente è stata saltata."
TOO_MANY_REQUESTS_MESSAGE = (
    "Troppe richieste rifiutate anche dopo i tentativi: la sorgente è stata saltata. "
    "Riprova tra qualche minuto."
)
PARTIAL_RESULTS_MESSAGE = (
    "Ha smesso di rispondere durante la ricerca: sono mostrati solo i risultati "
    "raccolti fino a quel momento."
)


# Valore restituito da BaseAdapter._handle_status per chiedere un nuovo
# tentativo (es. Semantic Scholar dopo aver tolto una chiave non valida).
RETRY = object()


def http_error_message(status_code: int) -> str:
    return f"Errore del servizio (HTTP {status_code}): la sorgente è stata saltata."


class SourceUnavailableError(Exception):
    """Sollevata da un adapter quando la sorgente non può essere interrogata per
    un motivo da mostrare all'utente (chiave API mancante o rifiutata, credito
    esaurito, errore HTTP, limite di richieste che persiste dopo i tentativi).
    A differenza di un errore generico non viene ritentata (vedi
    cached_raw_fetch) e non finisce in cache: l'orchestratore la trasforma in
    un avviso per quella sorgente, mentre le altre proseguono."""

class ArticlePage(list):
    """Pagina di articoli normalizzati che ricorda quanti record aveva
    mandato la sorgente (`received`), compresi quelli scartati da _normalize
    perché senza titolo o identificativo. paginated_fetch decide su questo
    numero se la sorgente ha altre pagine: contando solo gli articoli rimasti,
    un record scartato faceva sembrare la pagina l'ultima (voce 102)."""

    def __init__(self, articles=(), received: Optional[int] = None):
        super().__init__(articles)
        self.received = len(self) if received is None else received


class BaseAdapter(ABC):
    #: Numero massimo di risultati per singola richiesta, documentato dalla sorgente.
    #: Usato dalla paginazione per decidere la dimensione di pagina (vedi
    #: services/utils/pagination.py). Ogni adapter lo sovrascrive col proprio valore.
    MAX_PAGE_SIZE: int = 100

    #: Secondi di attesa prima di ogni richiesta alla sorgente (vedi
    #: cached_raw_fetch in services/utils/search.py). Ogni adapter lo
    #: sovrascrive in base al limite di frequenza della propria sorgente;
    #: le sorgenti sono interrogate in parallelo, quindi le attese non si sommano.
    MIN_REQUEST_INTERVAL: float = 3.0

    #: Identificativo con cui questa sorgente compare in User.api_keys (vedi
    #: API_KEY_SOURCES in routes/utenti.py, derivato da questo stesso
    #: attributo). None per le sorgenti che non supportano una chiave personale.
    API_KEY_SOURCE_ID: Optional[str] = None

    #: True per le sorgenti che non si possono interrogare senza una chiave API
    #: (personale o condivisa dal team): senza, l'orchestratore le salta con
    #: un avviso invece di mandare richieste destinate a fallire.
    REQUIRES_API_KEY: bool = False

    #: Nome della sorgente nei messaggi di log.
    SOURCE_NAME: str = ""

    #: Timeout delle richieste HTTP: tempo massimo per la risposta e per
    #: stabilire la connessione.
    TIMEOUT = httpx.Timeout(60.0, connect=15.0)

    #: Tentativi per ogni pagina prima di arrendersi su 429/503.
    MAX_ATTEMPTS: int = 3

    #: Tetto all'attesa chiesta dal server con l'header Retry-After. None per
    #: le sorgenti che non lo mandano: si usa solo l'attesa crescente.
    MAX_RETRY_AFTER_SECONDS: Optional[float] = None

    #: Avviso quando i tentativi finiscono ancora con 429/503.
    EXHAUSTED_MESSAGE: str = TOO_MANY_REQUESTS_MESSAGE

    def __init__(self, api_key: Optional[str] = None):
        # Chiave API personale dell'utente per questa sorgente, se impostata
        # nelle sue API keys; le sottoclassi che la supportano la usano al
        # posto (o in assenza) di quella globale in .env.
        self.api_key = api_key
        # Impostato dalle sottoclassi che supportano una chiave personale
        # quando la sorgente la rifiuta come non valida (401/403): la richiesta
        # viene ritentata senza, e questo flag segnala all'endpoint di
        # ricerca di avvisarne l'utente (vedi resolve_api_keys/ricerca.py).
        self.key_invalid_fallback = False

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> List[Article]:
        """Scarica e normalizza una pagina di risultati.

        Il procedimento è lo stesso per tutte le sorgenti (pattern Template
        Method): fino a MAX_ATTEMPTS tentativi, con attesa crescente su 429 e
        503; un errore HTTP diventa SourceUnavailableError invece di una lista
        vuota, che finirebbe in cache e nasconderebbe all'utente che la
        sorgente è mancata. Le differenze tra le sorgenti stanno nei metodi
        gancio qui sotto, che ogni adapter ridefinisce se gli servono."""
        early_result = self._before_fetch(search_request, offset)
        if early_result is not None:
            return early_result

        async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
            for attempt in range(self.MAX_ATTEMPTS):
                response = await self._send(client, search_request, offset)

                if response.status_code in (429, 503):
                    if attempt == self.MAX_ATTEMPTS - 1:
                        # Dopo l'ultimo tentativo non si attende: l'attesa
                        # allungava solo la ricerca prima dell'avviso (voce 103).
                        break
                    wait_time = self._retry_wait(response, attempt)
                    print(f"Server {self.SOURCE_NAME} occupato o limitato ({response.status_code}). "
                          f"Tentativo {attempt+1}/{self.MAX_ATTEMPTS}. Attendo {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue

                handled = self._handle_status(response, offset)
                if handled is RETRY:
                    continue
                if handled is not None:
                    return handled

                if response.status_code != 200:
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))

                if not response.text:
                    return []

                return self._normalize(self._parse(response))

        print("Errore persistente dopo i tentativi. Nessun risultato ottenuto.")
        raise SourceUnavailableError(self.EXHAUSTED_MESSAGE)

    # ------------------------------------------------------------------
    # Metodi gancio
    # ------------------------------------------------------------------

    def _before_fetch(self, search_request: SearchRequest, offset: int) -> Optional[List[Article]]:
        """Controlli prima di contattare la sorgente: può sollevare
        SourceUnavailableError o restituire subito un risultato. None per
        procedere con la richiesta."""
        return None

    async def _send(self, client: httpx.AsyncClient, search_request: SearchRequest, offset: int) -> httpx.Response:
        """Manda la richiesta alla sorgente: URL, parametri e header."""
        raise NotImplementedError

    def _parse(self, response: httpx.Response):
        """Legge il corpo della risposta (JSON per quasi tutte le sorgenti)."""
        return response.json()

    def _retry_wait(self, response: httpx.Response, attempt: int) -> float:
        """Secondi da aspettare dopo un 429/503: quelli chiesti dal server con
        Retry-After se la sorgente lo manda, altrimenti 5 e poi 10."""
        server_wait = self._retry_after_seconds(response)
        return server_wait if server_wait is not None else 5.0 * (attempt + 1)

    def _retry_after_seconds(self, response: httpx.Response) -> Optional[float]:
        """Secondi indicati dall'header Retry-After, limitati a
        MAX_RETRY_AFTER_SECONDS. None se la sorgente non lo usa, se l'header
        manca o se non è un numero di secondi."""
        if self.MAX_RETRY_AFTER_SECONDS is None:
            return None
        value = response.headers.get("Retry-After")
        try:
            seconds = float(value)
        except (TypeError, ValueError):
            return None
        return min(max(seconds, 0.0), self.MAX_RETRY_AFTER_SECONDS)

    def _handle_status(self, response: httpx.Response, offset: int):
        """Gestione degli stati propri di una sorgente, prima dei controlli
        comuni. Restituisce None per proseguire, RETRY per un nuovo tentativo
        o una lista di articoli come risultato; può sollevare
        SourceUnavailableError."""
        return None

    @abstractmethod
    def _build_query(self, request: SearchRequest, offset: int = 0) -> dict:
        pass

    @abstractmethod
    def _normalize(self, raw_data: dict) -> List[Article]:
        pass