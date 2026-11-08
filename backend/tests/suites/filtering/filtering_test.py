from datetime import date

import pytest

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.utils.filtering import filter_articles


def _article(id_, authors):
    return Article(id=id_, title="Un titolo", authors=list(authors), publication_date=date(2024, 1, 1))


def _kept(authors_by_id, searched):
    articles = [_article(id_, authors) for id_, authors in authors_by_id.items()]
    return [a.id for a in filter_articles(articles, SearchRequest(author=searched))]


@pytest.mark.parametrize("author", ["John Smith", "John A. Smith", "Dr. John Brewster Smith", "Smith, John", "SMITH John"])
def test_author_found_with_middle_names_and_reversed_order(author):
    assert _kept({"a": [author]}, ["John Smith"]) == ["a"]


def test_author_name_must_match_whole_words():
    kept = _kept({"a": ["Johnson Smith"], "b": ["John Smithson"], "c": ["Jane Smith", "John Doe"]}, ["John Smith"])
    assert kept == []


def test_single_letter_is_an_initial():
    kept = _kept({"a": ["Alfio Ferrara"], "b": ["A Ferrara"], "c": ["Ferrara, Antonio"], "d": ["Bruno Ferrara"]}, ["A. Ferrara"])
    assert kept == ["a", "b", "c"]


def test_full_first_name_does_not_match_an_initial():
    assert _kept({"a": ["A. Ferrara"]}, ["Alfio Ferrara"]) == []


def test_repeated_word_needs_repeated_word():
    assert _kept({"a": ["Li Wang"], "b": ["Li Li"]}, ["Li Li"]) == ["b"]


def test_dblp_homonym_number_is_ignored():
    assert _kept({"a": ["Wei Wang 0001"]}, ["Wei Wang"]) == ["a"]


def _kept_venues(venue_by_id, searched):
    articles = [Article(id=id_, title="Un titolo", venue=venue) for id_, venue in venue_by_id.items()]
    return [a.id for a in filter_articles(articles, SearchRequest(journal=searched))]


def test_acronym_finds_full_venue_name():
    # Caso reale: Semantic Scholar scrive il nome esteso, il test cercava "EPTCS".
    assert _kept_venues({"a": "Electronic Proceedings in Theoretical Computer Science"}, ["EPTCS"]) == ["a"]


def test_full_name_finds_acronym_venue():
    # Verso opposto: DBLP scrive di solito la sigla.
    assert _kept_venues({"a": "NeurIPS", "b": "Advances in Neural Information Processing Systems"}, ["neural information processing systems"]) == ["a", "b"]


def test_alias_acronym_variant():
    assert _kept_venues({"a": "NIPS"}, ["NeurIPS"]) == ["a"]


def test_alias_does_not_match_inside_other_acronyms_or_longer_names():
    kept = _kept_venues(
        {
            "naacl": "NAACL",  # "ACL" come forma alternativa non deve trovare NAACL
            "icmla": "International Conference on Machine Learning and Applications",
        },
        ["Meeting of the Association for Computational Linguistics", "ICML"],
    )
    assert kept == []


def test_unknown_venue_keeps_plain_substring_match():
    assert _kept_venues({"a": "Journal of Obscure Studies", "b": "Other"}, ["Obscure"]) == ["a"]
