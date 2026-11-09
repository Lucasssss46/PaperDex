import json

from backend.app.statistics import saving
from backend.app.statistics.indexes import SearchEvaluationMetrics, SkippedEvaluation


def _metrics(query, source_b="DBLP", jaccard=10.0):
    return SearchEvaluationMetrics(
        query_description=query, source_a="arXiv", source_b=source_b,
        total_results_a=1, total_results_b=1, jaccard_index=jaccard,
        coverage_a_to_b=100.0, coverage_b_to_a=100.0,
    )


def _skipped(query, source_b="DBLP"):
    return SkippedEvaluation(
        query_description=query, source_a="arXiv", source_b=source_b,
        skipped=True, reason="Troppe richieste", attempts=3,
    )


def test_redone_query_replaces_the_skipped_one(tmp_path):
    report = tmp_path / "report.json"
    saving.save_metrics_to_json(_metrics("q1"), str(report))
    saving.save_metrics_to_json(_skipped("q2"), str(report))
    saving.save_metrics_to_json(_skipped("q2", source_b="OpenAlex"), str(report))

    saving.save_metrics_to_json(_metrics("q2", jaccard=20.0), str(report))

    data = json.loads(report.read_text(encoding="utf-8"))
    assert [(e["query_description"], e["source_b"], e.get("skipped")) for e in data] == [
        ("q1", "DBLP", None),
        ("q2", "DBLP", None),
        ("q2", "OpenAlex", True),
    ]
    assert data[1]["jaccard_index"] == 20.0


def test_evaluated_queries_leave_out_skipped_ones(tmp_path):
    report = tmp_path / "report.json"
    assert saving.evaluated_queries(str(report)) == set()

    saving.save_metrics_to_json(_metrics("q1"), str(report))
    saving.save_metrics_to_json(_skipped("q2"), str(report))

    assert saving.evaluated_queries(str(report)) == {("q1", "arXiv", "DBLP")}
