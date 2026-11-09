from abc import ABC, abstractmethod
from typing import List, Optional
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

    #: Identificativo con cui questa sorgente compare in User.api_keys (vedi
    #: API_KEY_SOURCES in routes/utenti.py, derivato da questo stesso
    #: attributo). None per le sorgenti che non supportano una chiave personale.
    API_KEY_SOURCE_ID: Optional[str] = None

    #: True per le sorgenti che non si possono interrogare senza una chiave API
    #: (personale o condivisa dal team): senza, l'orchestratore le salta con
    #: un avviso invece di mandare richieste destinate a fallire.
    REQUIRES_API_KEY: bool = False

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

    @abstractmethod
    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> List[Article]:
        pass

    @abstractmethod
    def _build_query(self, request: SearchRequest, offset: int = 0) -> dict:
        pass

    @abstractmethod
    def _normalize(self, raw_data: dict) -> List[Article]:
        pass