from types import SimpleNamespace

from backend.app.routes.ricerche import ArticleSelectionIn, only_selected


def _added(article_id: str):
    # Stessa forma minima che linked_id legge da un Link di Beanie: link.ref.id
    return SimpleNamespace(article=SimpleNamespace(ref=SimpleNamespace(id=article_id)))


def test_only_selected_filters_to_given_ids():
    added = [_added("a1"), _added("a2"), _added("a3")]
    result = only_selected(added, ArticleSelectionIn(article_ids=["a1", "a3"]))
    assert [a.article.ref.id for a in result] == ["a1", "a3"]


def test_only_selected_without_selection_keeps_all():
    added = [_added("a1"), _added("a2")]
    assert only_selected(added, None) == added
    assert only_selected(added, ArticleSelectionIn()) == added


def test_only_selected_empty_list_selects_nothing():
    assert only_selected([_added("a1")], ArticleSelectionIn(article_ids=[])) == []
