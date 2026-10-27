import re
from typing import List, Optional

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest


def _contains_term(text: Optional[str], term: str) -> bool:
    return bool(text) and term.lower() in text.lower()


def _matches_keywords(article: Article, keyword_include, keyword_exclude) -> bool:
    # .lower() una sola volta per articolo, non una volta per ogni termine
    # controllato: su abstract lunghi e molte keyword/gruppi era lavoro ripetuto.
    haystack = " ".join(filter(None, [article.title, article.abstract])).lower()

    if keyword_exclude and any(term.lower() in haystack for term in keyword_exclude):
        return False

    if not keyword_include:
        return True

    # keyword_include e' una lista di gruppi: i termini dentro un gruppo sono
    # in AND, i gruppi tra loro sono in OR.
    return any(
        all(term.lower() in haystack for term in and_group)
        for and_group in keyword_include
    )


def _name_tokens(name: str) -> List[str]:
    return re.findall(r"\w+", name.lower())


def _matches_author_name(article_author: Optional[str], name: str) -> bool:
    # Confronto per parole, non per sottostringa: ogni parola del nome cercato
    # deve comparire nel nome dell'autore, in qualsiasi ordine, così "John
    # Smith" trova anche "John A. Smith" e "Smith, John" (forma frequente in
    # OpenAlex). Una lettera sola vale come iniziale: "A. Ferrara" trova anche
    # "Alfio Ferrara". Ogni parola dell'autore si usa una volta sola, quindi
    # "Li Li" non trova "Li Wang".
    if not article_author:
        return False
    searched = _name_tokens(name)
    remaining = _name_tokens(article_author)
    if not searched:
        return False
    for token in searched:
        match = next((word for word in remaining if word == token), None)
        if match is None and len(token) == 1:
            match = next((word for word in remaining if word.startswith(token)), None)
        if match is None:
            return False
        remaining.remove(match)
    return True


def _matches_authors(article: Article, authors: Optional[list]) -> bool:
    if not authors:
        return True
    if not article.authors:
        return False
    return any(
        any(_matches_author_name(article_author, name) for article_author in article.authors)
        for name in authors
    )


def _matches_journal(article: Article, journals: Optional[list]) -> bool:
    if not journals:
        return True
    return any(_contains_term(article.venue, journal) for journal in journals)


def _matches_year_range(article: Article, year_start: Optional[int], year_end: Optional[int]) -> bool:
    if not year_start and not year_end:
        return True
    if not article.publication_date:
        return False

    year = article.publication_date.year
    if year_start and year < year_start:
        return False
    if year_end and year > year_end:
        return False
    return True


def filter_articles(articles: List[Article], request: SearchRequest) -> List[Article]:
    """Applica internamente i criteri di SearchRequest sui campi standardizzati
    di Article, indipendentemente da cosa la sorgente originale sapesse filtrare."""
    return [
        article for article in articles
        if _matches_keywords(article, request.keyword_include, request.keyword_exclude)
        and _matches_authors(article, request.author)
        and _matches_journal(article, request.journal)
        and _matches_year_range(article, request.year_start, request.year_end)
    ]
