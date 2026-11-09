from backend.app.statistics import summary


def _entry(query, source_b, jaccard, a_to_b, b_to_a, **extra):
    return {
        "query_description": query, "source_a": "arXiv", "source_b": source_b,
        "jaccard_index": jaccard, "coverage_a_to_b": a_to_b, "coverage_b_to_a": b_to_a,
        **extra,
    }


KEYWORD = "SearchRequest(keyword_include=[['x']], keyword_exclude=None, author=None)"
AUTHOR = "SearchRequest(keyword_include=None, keyword_exclude=None, author=['X'])"


def test_summary_per_pair_and_query_kind():
    entries = [
        _entry(KEYWORD, "DBLP", 0.0, 90.0, 30.0),
        _entry(KEYWORD, "DBLP", 2.0, 80.0, 40.0),
        _entry(KEYWORD, "DBLP", 7.0, 98.0, 20.0),
        _entry(AUTHOR, "DBLP", 50.0, 100.0, 60.0),
        _entry(KEYWORD, "OpenAlex", 1.0, 78.0, 4.0),
        # Le query saltate non hanno metriche e non entrano nel conto.
        {"query_description": KEYWORD, "source_a": "arXiv", "source_b": "DBLP", "skipped": True},
    ]

    result = summary.summarize(entries)

    assert set(result) == {("arXiv", "DBLP", "keyword"), ("arXiv", "DBLP", "autore"), ("arXiv", "OpenAlex", "keyword")}
    keyword = result[("arXiv", "DBLP", "keyword")]
    assert keyword["n"] == 3
    assert keyword["jaccard_index"] == {"median": 2.0, "min": 0.0, "max": 7.0}
    assert keyword["coverage_a_to_b"] == {"median": 90.0, "min": 80.0, "max": 98.0}
    assert result[("arXiv", "DBLP", "autore")]["n"] == 1


def test_values_are_written_with_decimal_comma():
    assert summary._format({"median": 1.5, "min": 0.0, "max": 6.85}) == "1,5 (0–6,85)"
