from backend.app.statistics.queries import EVALUATION_LIMIT, EVALUATION_QUERIES


def test_evaluation_queries_are_keyword_only_or_author_only():
    # Keyword + autore: l'autore non arriva alla sorgente e le query davano 0.
    for query in EVALUATION_QUERIES:
        assert bool(query.keyword_include) != bool(query.author), query
        assert not query.keyword_include or len(query.keyword_include) == 1, query
        assert query.year_start is None and query.year_end is None, query
        assert query.limit == EVALUATION_LIMIT, query
