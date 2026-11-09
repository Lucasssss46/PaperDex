from typing import Any, Optional

from rapidfuzz import fuzz

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import SourceUnavailableError
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.utils.dedup import are_duplicates
from backend.app.services.utils.zotero import EnrichmentError, _parse_date, fetch_zotero_metadata

# Soglia aggiuntiva, più severa di are_duplicates, solo per questo contesto:
# verificato dal vivo che un autore prolifico con un titolo corto/generico
# (es. "Deep learning") può far scattare are_duplicates contro un SUO lavoro
# del tutto diverso ma dal titolo simile (es. "Deep learning & convolutional
# networks"), perché quando l'articolo salvato non ha DOI are_duplicates usa
# fuzz.token_set_ratio — che dà 100 a un titolo completamente contenuto in un
# altro, per design (tollera sottotitoli diversi tra fonti). Lì ha senso:
# confronta pochi risultati della stessa ricerca, dove una simile collisione è
# rara. Qui il pool è una ricerca per titolo apposta più ampia, dove il
# rischio è concreto. fuzz.ratio (similarità carattere per carattere, che non
# perdona parole extra) scarta questo caso con un punteggio di 52.
_STRICT_TITLE_THRESHOLD = 90

# Il DOI che arXiv assegna automaticamente ad ogni submission dal 2022, non
# quello di un editore: scoperto empiricamente (non assunto) che non
# distingue affatto un preprint ancora tale da uno poi pubblicato altrove —
# compare identico in entrambi i casi. Va escluso quando si decide se vale
# la pena cercare una versione pubblicata.
_ARXIV_SELF_DOI_PREFIX = "10.48550/arxiv."


def _has_publisher_doi(article: Article) -> bool:
    if not article.doi:
        return False
    return not article.doi.strip().lower().startswith(_ARXIV_SELF_DOI_PREFIX)


async def _check_same_source_revision(article: Article) -> Optional[dict]:
    """Passo 1, economico: ri-interroga la stessa fonte con lo stesso
    identificativo già noto. Rileva le revisioni (es. una nuova versione
    arXiv, che aggiorna la data del record) — non un nuovo articolo, lo
    stesso record con contenuto aggiornato."""
    try:
        item = await fetch_zotero_metadata(article)
    except EnrichmentError:
        # Nessun identificativo utilizzabile, o nessun dato trovato: non è
        # un errore in questo contesto, solo "niente da segnalare qui".
        return None

    new_date = _parse_date(item.get("date"))
    if new_date and article.publication_date and new_date != article.publication_date:
        return {
            "kind": "revision",
            "message": f"Trovata una revisione più recente (data aggiornata al {new_date.isoformat()})",
            "item": item,
        }
    return None


async def _search_for_published_version(article: Article) -> Optional[dict]:
    """Passo 2, solo se il passo 1 non ha trovato nulla e l'articolo non ha
    ancora un DOI di editore: ricerca mirata per titolo/autore su Crossref
    (fonte più autorevole per i DOI, prima in DEFAULT_SOURCE_PRIORITY),
    bassa profondità (basta sapere se esiste, non esplorare a fondo),
    filtrata dalla stessa euristica titolo/autore/anno della deduplicazione
    — necessaria: una ricerca per solo titolo può restituire risultati
    rumorosi (verificato dal vivo prima di scrivere questa funzione)."""
    if not article.title:
        return None

    # Il cognome del primo autore entra nella query vera e propria (non solo
    # nel filtro are_duplicates dopo): verificato dal vivo che un titolo
    # corto o generico da solo possa non bastare a far emergere il paper
    # giusto tra i primi risultati — Crossref restituisce altri lavori con
    # titolo simile ma tutt'altro autore, scartati correttamente da
    # are_duplicates ma mai arrivati abbastanza in alto da essere tra i
    # candidati considerati.
    query_terms = [article.title]
    if article.authors:
        surname = article.authors[0].split()[-1]
        if surname:
            query_terms.append(surname)

    try:
        request = SearchRequest(keyword_include=[query_terms], depth="bassa", limit=10)
    except ValueError:
        return None

    try:
        candidates = await CrossrefAdapter().fetch(request)
    except SourceUnavailableError as e:
        # Diverso da "cercato e non trovato nulla": senza distinguerlo,
        # un rate limit di Crossref (osservato dal vivo durante la verifica)
        # sembrerebbe un esito negativo legittimo invece di un controllo non
        # completato — stessa distinzione che l'app fa già altrove (gli
        # avvisi per sorgente di search_all_sources) invece di nascondere il
        # fallimento.
        return {"kind": "unavailable", "message": str(e)}

    for candidate in candidates:
        if candidate.id == article.id:
            continue
        if not _has_publisher_doi(candidate) or not are_duplicates(article, candidate):
            continue
        strict_score = fuzz.ratio(article.pulisci_titolo(), candidate.pulisci_titolo())
        if strict_score < _STRICT_TITLE_THRESHOLD:
            continue
        return {
                "kind": "new_source",
                "message": f"Trovata una versione pubblicata su {candidate.venue or candidate.source}",
                "candidate": candidate,
            }
    return None


async def check_for_new_version(article: Article) -> Optional[dict[str, Any]]:
    """Controllo manuale (vedi docs/monitoraggio-versioni-e-query.md) per un
    singolo articolo salvato: `None` se non trova nulla di nuovo, altrimenti
    un dict con `kind` ("revision" o "new_source"), un messaggio leggibile e
    il dato trovato (`item` grezzo di Zotero, o `candidate` Article per una
    nuova fonte). Due passi in cascata, non uno: il primo da solo non basta
    a rilevare il passaggio da preprint a pubblicato (vedi _has_publisher_doi)."""
    revision = await _check_same_source_revision(article)
    if revision:
        return revision

    if not _has_publisher_doi(article):
        return await _search_for_published_version(article)

    return None
