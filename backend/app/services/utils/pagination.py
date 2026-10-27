from dataclasses import replace
from typing import List

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import BaseAdapter
from backend.app.services.utils.filtering import filter_articles
from backend.app.services.utils.search import cached_raw_fetch


class PartialResultsError(Exception):
    """Una pagina successiva alla prima è fallita dopo che altre avevano già
    dato risultati: `results` contiene quelli raccolti fino a lì, che restano
    validi. L'orchestratore li tiene e avvisa l'utente."""

    def __init__(self, results: List[Article], cause: Exception):
        super().__init__(str(cause))
        self.results = results
        self.cause = cause


async def paginated_fetch(adapter: BaseAdapter, search_request: SearchRequest, delay: float = 3.0) -> List[Article]:
    """Recupera risultati da un adapter paginando in modo adattivo: continua a
    chiedere pagine successive finché non si raggiunge il target di risultati
    filtrati previsto dal livello di profondità della richiesta (SearchRequest.depth),
    finché non si esaurisce il tetto di pagine aggiuntive per sorgente, o finché la
    sorgente non ha più risultati da dare.

    keyword_include può contenere più gruppi OR (es. sinonimi/acronimi: [["NLP"],
    ["Natural Language Processing"]]): dato che SearchRequest.query_terms() manda
    alla sorgente solo il primo gruppo di una richiesta (per tenere la query
    semplice), qui si interroga la sorgente separatamente per ciascun gruppo,
    unendo e deduplicando i risultati — altrimenti gli articoli che matchano solo un
    gruppo diverso dal primo non verrebbero mai scaricati dall'API.

    La dimensione di pagina non viene presa da search_request.limit, ma decisa
    qui come il minimo tra il massimo per richiesta documentato dalla sorgente
    (adapter.MAX_PAGE_SIZE) e il target di risultati filtrati del livello di
    profondità: se il massimo della sorgente è inferiore al target, si procede
    comunque con la paginazione per provare a raggiungerlo, entro il tetto di
    pagine aggiuntive.

    Ogni gruppo ottiene sempre almeno una pagina (altrimenti non avrebbe alcuna
    possibilità di contribuire risultati); oltre a quella, le pagine aggiuntive
    attingono a un tetto CONDIVISO tra tutti i gruppi, così il numero totale di
    richieste resta limitato indipendentemente da quanti gruppi OR scrive
    l'utente (non si moltiplica il tetto per numero di gruppi).

    Ogni pagina passa da cached_raw_fetch, quindi beneficia della cache su
    file (chiave = query effettiva + offset) e del rispetto del rate limit.
    """
    target, max_extra_pages = search_request.depth_targets()
    page_size = min(adapter.MAX_PAGE_SIZE, target)
    groups = search_request.keyword_include if search_request.keyword_include else [None]

    filtered: List[Article] = []
    seen_ids = set()
    extra_pages_used = 0

    for group in groups:
        group_request = replace(
            search_request,
            keyword_include=[group] if group else None,
            limit=page_size,
        )
        page_index = 0

        while True:
            if len(filtered) >= target:
                return filtered

            offset = page_index * page_size
            try:
                raw = await cached_raw_fetch(adapter, group_request, delay=delay, offset=offset)
            except Exception as e:
                # Senza risultati da salvare l'errore risale così com'è e la
                # sorgente viene saltata; altrimenti un errore a metà paginazione
                # farebbe perdere anche le pagine già scaricate.
                if not filtered:
                    raise
                raise PartialResultsError(filtered, e) from e

            for article in filter_articles(raw, search_request):
                if article.id not in seen_ids:
                    seen_ids.add(article.id)
                    filtered.append(article)

            # Record mandati dalla sorgente, compresi quelli scartati dalla
            # normalizzazione (ArticlePage.received): contando solo gli
            # articoli rimasti, una pagina Crossref da 150 con un record senza
            # titolo ne dava 149 e la paginazione si fermava (voce 102).
            received = getattr(raw, "received", len(raw))
            got_full_page = received >= page_size
            if page_index > 0:
                extra_pages_used += 1  # la prima pagina di ogni gruppo e' sempre gratuita

            if len(filtered) >= target or not got_full_page or extra_pages_used >= max_extra_pages:
                break

            page_index += 1

    return filtered
