from datetime import date

import pytest

from backend.app.schemas.models import Article
from backend.app.services.utils.dedup import are_duplicates


def _article(id_, title, doi=None, authors=("Ashish Vaswani",), year=2023):
    return Article(
        id=id_,
        title=title,
        doi=doi,
        authors=list(authors) if authors else None,
        publication_date=date(year, 1, 1) if year else None,
    )


@pytest.mark.asyncio
async def test_same_doi_is_enough():
    a = _article("a", "Un titolo", doi="10.1145/123", authors=None, year=None)
    b = _article("b", "Tutt'altro titolo", doi="https://doi.org/10.1145/123")
    assert are_duplicates(a, b)


@pytest.mark.asyncio
async def test_arxiv_doi_and_published_doi_are_duplicates():
    # Caso tipico (voce 92): il preprint ha il DOI di arXiv (10.48550), la
    # versione pubblicata quello dell'editore; stesso titolo, autore, anno ±1.
    preprint = _article("p", "Attention Is All You Need in Speech Separation", doi="10.48550/arXiv.2010.13154", year=2020)
    published = _article("j", "Attention is All You Need in Speech Separation", doi="10.1109/ICASSP39728.2021.9413901", year=2021)
    assert are_duplicates(preprint, published)


@pytest.mark.asyncio
async def test_different_dois_with_same_prefix_are_not_duplicates():
    # Stesso ente di registrazione, DOI diversi: oggetti distinti (es. pagine
    # quasi identiche che cambiano solo per un codice), anche a titoli simili.
    a = _article("a", "Skillfully PSD Exam Dumps All You Need to Pass Exam", doi="10.55277/researchhub.aaa", year=2025)
    b = _article("b", "Skillfully CBA Exam Dumps All You Need to Pass Exam", doi="10.55277/researchhub.bbb", year=2025)
    assert not are_duplicates(a, b)


@pytest.mark.asyncio
async def test_different_dois_need_strict_title_match():
    # token_set_ratio darebbe 100 ("X" è contenuto nell'altro titolo): con DOI
    # diversi si usa token_sort_ratio, che non perdona le parole in più.
    original = _article("o", "Attention Is All You Need", doi="10.48550/arXiv.1706.03762")
    erratum = _article("e", "Correction to: Attention Is All You Need", doi="10.1007/erratum.1")
    assert not are_duplicates(original, erratum)


@pytest.mark.asyncio
async def test_different_dois_need_authors_on_both():
    a = _article("a", "Attention Is All You Need", doi="10.48550/arXiv.1706.03762", authors=None)
    b = _article("b", "Attention Is All You Need", doi="10.5555/3295222.3295349", authors=None)
    assert not are_duplicates(a, b)


@pytest.mark.asyncio
async def test_missing_doi_keeps_lenient_title_match():
    # Invariato rispetto alla voce 72: se a uno dei due manca il DOI, il
    # titolo si confronta con token_set_ratio (perdona i sottotitoli aggiunti).
    a = _article("a", "Attention Is All You Need")
    b = _article("b", "Attention Is All You Need: Transformers for Translation", doi="10.5555/3295222.3295349")
    assert are_duplicates(a, b)


@pytest.mark.asyncio
async def test_different_first_author_is_not_duplicate():
    a = _article("a", "Attention Is All You Need", doi="10.48550/arXiv.1706.03762")
    b = _article("b", "Attention Is All You Need", doi="10.5555/3295222.3295349", authors=("Mario Rossi",))
    assert not are_duplicates(a, b)


@pytest.mark.asyncio
async def test_missing_authors_on_both_is_not_duplicate():
    # Voce 93: anche senza DOI, due articoli senza autori non contano come
    # "stesso primo autore" (prima None == None li faceva passare).
    a = _article("a", "Editorial", authors=None)
    b = _article("b", "Editorial", authors=None)
    assert not are_duplicates(a, b)


@pytest.mark.asyncio
async def test_blank_author_names_are_skipped():
    # Voce 115: un autore vuoto ("") faceva fallire la ricerca con IndexError.
    a = _article("a", "Attention Is All You Need", authors=("", "Ashish Vaswani"))
    b = _article("b", "Attention Is All You Need", authors=("Ashish Vaswani",))
    assert are_duplicates(a, b)

    c = _article("c", "Editorial", authors=("", " "))
    d = _article("d", "Editorial", authors=("", " "))
    assert not are_duplicates(c, d)
