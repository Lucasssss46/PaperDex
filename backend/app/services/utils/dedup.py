import re
from typing import List, Optional

from rapidfuzz import fuzz

from backend.app.schemas.models import Article
from backend.app.services.utils.orchestrator import ADAPTER_REGISTRY

# --- Criterio di similarità ---------------------------------------------
# Cascata concordata con l'utente (e la correlatrice): due articoli sono lo
# stesso articolo se hanno lo stesso DOI, oppure — quando manca o non coincide —
# se titolo, primo autore e anno sono abbastanza vicini da soli. Il DOI da
# solo non basta come unico criterio: un preprint arXiv e la sua versione
# pubblicata hanno spesso DOI diversi (o il preprint non ne ha affatto), che
# è probabilmente il caso di duplicati più comune in questo dominio.
#
# DOI diversi non escludono il duplicato (voce 92 del registro): arXiv
# assegna a ogni articolo un proprio DOI 10.48550, che OpenAlex e Semantic
# Scholar riportano, e lo stesso fanno SSRN, bioRxiv, NBER per preprint e
# working paper. In quel caso però il confronto è più severo, perché due DOI
# diversi sono comunque un indizio contrario:
# - prefissi diversi (la parte prima di "/", cioè l'ente che ha registrato il
#   DOI): stesso prefisso con DOI diversi vuol dire che lo stesso ente ha
#   registrato due oggetti distinti, come pagine spam quasi identiche o, al
#   più, versioni successive dello stesso preprint, che non vengono unite;
# - titolo con token_sort_ratio, che non perdona parole in più (a differenza
#   di token_set_ratio, che dà 100 a "Correction to: X" contro "X");
# Il cognome del primo autore deve essere presente su entrambi, con o senza
# DOI (voce 93): due articoli senza autori non contano come stesso autore.
TITLE_SIMILARITY_THRESHOLD = 90  # su 100, rapidfuzz.fuzz.token_set_ratio
DIFFERENT_DOI_TITLE_THRESHOLD = 90  # su 100, rapidfuzz.fuzz.token_sort_ratio
YEAR_TOLERANCE = 1  # anni di differenza tollerati (preprint vs pubblicazione)


def _normalize_doi(doi: Optional[str]) -> Optional[str]:
    if not doi:
        return None
    return re.sub(r"^https?://(dx\.)?doi\.org/", "", doi.strip().lower())


def _doi_prefix(doi: str) -> str:
    return doi.split("/", 1)[0]


def _first_author_surname(article: Article) -> Optional[str]:
    # Solo i nomi non vuoti: un autore vuoto non ha un'ultima parola, e
    # split()[-1] faceva fallire l'intera ricerca con IndexError (voce 115).
    names = [name for name in (article.authors or []) if name and name.strip()]
    if not names:
        return None
    # Ultima parola del nome completo come euristica di cognome (stessa già
    # usata per le chiavi BibTeX in services/utils/export.py): non ci sono
    # dati nome/cognome separati nelle sorgenti aggregate.
    surname = re.sub(r"[^a-zA-Z]", "", names[0].split()[-1])
    return surname.lower() or None


def _year(article: Article) -> Optional[int]:
    return article.publication_date.year if article.publication_date else None


def are_duplicates(a: Article, b: Article) -> bool:
    """True se a e b sono considerati lo stesso articolo."""
    doi_a, doi_b = _normalize_doi(a.doi), _normalize_doi(b.doi)
    if doi_a and doi_b and doi_a == doi_b:
        return True
    different_dois = bool(doi_a and doi_b)
    if different_dois and _doi_prefix(doi_a) == _doi_prefix(doi_b):
        return False

    if not a.title or not b.title:
        return False

    if different_dois:
        title_score = fuzz.token_sort_ratio(a.pulisci_titolo(), b.pulisci_titolo())
        threshold = DIFFERENT_DOI_TITLE_THRESHOLD
    else:
        title_score = fuzz.token_set_ratio(a.pulisci_titolo(), b.pulisci_titolo())
        threshold = TITLE_SIMILARITY_THRESHOLD
    if title_score < threshold:
        return False

    author_a, author_b = _first_author_surname(a), _first_author_surname(b)
    if author_a is None or author_b is None or author_a != author_b:
        return False

    year_a, year_b = _year(a), _year(b)
    if year_a is None or year_b is None or abs(year_a - year_b) > YEAR_TOLERANCE:
        return False

    return True


class _UnionFind:
    """Disjoint Set Union con path compression: la struttura standard per
    raggruppare elementi quando la relazione di somiglianza è a coppie e non
    necessariamente transitiva a mano (A~B e B~C devono finire nello stesso
    gruppo di A~C, anche se A e C non risultano simili se confrontati
    direttamente — es. lo stesso articolo con titoli lievemente diversi su tre
    sorgenti diverse, a catena)."""

    def __init__(self, items):
        self.parent = {item: item for item in items}

    def find(self, item):
        if self.parent[item] != item:
            self.parent[item] = self.find(self.parent[item])
        return self.parent[item]

    def union(self, a, b):
        root_a, root_b = self.find(a), self.find(b)
        if root_a != root_b:
            self.parent[root_a] = root_b


def group_articles(articles: List[Article]) -> List[List[Article]]:
    """Raggruppa gli articoli considerati duplicati tra loro (are_duplicates),
    per componenti connesse: O(n²) confronti a coppie, trascurabile per le
    dimensioni in gioco (i risultati di una singola ricerca, non l'intero
    database)."""
    uf = _UnionFind(a.id for a in articles)
    for i, a in enumerate(articles):
        for b in articles[i + 1 :]:
            if are_duplicates(a, b):
                uf.union(a.id, b.id)

    groups: dict[str, List[Article]] = {}
    for article in articles:
        root = uf.find(article.id)
        groups.setdefault(root, []).append(article)
    return list(groups.values())


def annotate_with_group_key(articles: List[Article]) -> List[dict]:
    """Un dict (model_dump) per articolo, con in più 'group_key': stesso
    valore per articoli nello stesso gruppo di duplicati. Usato dalla
    risposta di ricerca perché il frontend possa raggrupparli senza
    restrutturare l'elenco piatto dei risultati — la chiave è solo l'id del
    primo membro di ciascun gruppo, un valore comodo e già unico."""
    groups = group_articles(articles)
    key_by_id = {a.id: group[0].id for group in groups for a in group}
    return [{**a.model_dump(), "group_key": key_by_id[a.id]} for a in articles]


# --- Preferenza sorgente (scelta automatica in un gruppo) -------------------
# Classifica di default, usata finché una Ricerca non ne imposta una propria
# (tendina trascinabile nella tab Deduplicazione — vedi Project.source_priority
# e le rotte source-priority in routes/ricerche.py). Non è una preferenza
# personale dell'utente ma della Ricerca: la scelta automatica è condivisa da
# tutto il team, coerente con "Articoli salvati"/Query salvate/Team.
#
# Ordine pensato per autorevolezza del *record bibliografico*, non per
# comodità di accesso: Crossref è la sorgente ufficiale dei DOI (il record
# arriva direttamente dall'editore) e DBLP è una bibliografia CS curata a
# mano — entrambe rappresentano la versione "di riferimento" di un lavoro
# pubblicato. OpenAlex e Semantic Scholar aggregano/derivano metadati da
# altre sorgenti (comunque affidabili, ma non primarie). ArXiv è per definizione
# un preprint, non revisionato tra pari: è spesso la versione più accessibile
# ma non quella "autorevole" come record bibliografico.
DEFAULT_SOURCE_PRIORITY: List[str] = ["Crossref", "DBLP", "OpenAlex", "Semantic Scholar", "ArXiv"]

assert set(DEFAULT_SOURCE_PRIORITY) == set(ADAPTER_REGISTRY), "DEFAULT_SOURCE_PRIORITY deve coprire ogni sorgente"


def pick_preferred(articles: List[Article], source_priority: Optional[List[str]] = None) -> Article:
    """`source_priority` è l'ordine (dal più preferito) impostato per la
    Ricerca; se assente, o se una sorgente non vi compare (es. lista salvata
    prima che una nuova sorgente fosse aggiunta all'app), si ripiega sull'ordine
    di default per quella sorgente."""
    ranking = source_priority or DEFAULT_SOURCE_PRIORITY
    priority = {name: index for index, name in enumerate(ranking)}
    default_priority = {name: index for index, name in enumerate(DEFAULT_SOURCE_PRIORITY)}
    fallback = len(ranking) + len(DEFAULT_SOURCE_PRIORITY)

    def rank(article: Article) -> int:
        if article.source in priority:
            return priority[article.source]
        return len(ranking) + default_priority.get(article.source, fallback)

    return min(articles, key=rank)
