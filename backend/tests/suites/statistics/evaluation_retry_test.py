import json

import pytest
import respx
from httpx import Response

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters import arXiv
from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.base import TOO_MANY_REQUESTS_MESSAGE, SourceUnavailableError
from backend.app.statistics import indexes, saving
from backend.app.statistics.indexes import SearchEvaluationMetrics, SkippedEvaluation


@pytest.fixture(autouse=True)
def no_real_wait(monkeypatch):
    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr(indexes.asyncio, "sleep", fake_sleep)
    return waits


def _metrics(request):
    return SearchEvaluationMetrics(
        query_description=str(request), source_a="arXiv", source_b="OpenAlex",
        total_results_a=1, total_results_b=1, jaccard_index=100.0,
        coverage_a_to_b=100.0, coverage_b_to_a=100.0,
    )


@pytest.mark.asyncio
async def test_query_is_retried_after_source_error(monkeypatch, no_real_wait):
    # Il 24 ottobre il 429 di arXiv sull'ultima query fermava lo script.
    calls = []

    async def flaky_evaluation(search_request, *args):
        calls.append(search_request)
        if len(calls) == 1:
            raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE)
        return _metrics(search_request)

    monkeypatch.setattr(indexes, "evaluate_query_metrics", flaky_evaluation)
    request = SearchRequest(author=["Martin Ruskov"], limit=50)

    res = await indexes.evaluate_query_with_retries(request, None, "arXiv", None, "OpenAlex")

    assert isinstance(res, SearchEvaluationMetrics)
    assert len(calls) == 2
    assert no_real_wait == [indexes.QUERY_RETRY_WAITS[0]]


@pytest.mark.asyncio
async def test_query_is_skipped_when_source_keeps_failing(monkeypatch, tmp_path, no_real_wait):
    async def failing_evaluation(search_request, *args):
        raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE)

    monkeypatch.setattr(indexes, "evaluate_query_metrics", failing_evaluation)
    request = SearchRequest(author=["Martin Ruskov"], limit=50)

    res = await indexes.evaluate_query_with_retries(request, None, "arXiv", None, "OpenAlex", retry_waits=(1.0, 2.0))

    assert isinstance(res, SkippedEvaluation)
    assert res.reason == TOO_MANY_REQUESTS_MESSAGE
    assert res.attempts == 3
    assert no_real_wait == [1.0, 2.0]

    # Nel report la query saltata compare con il motivo, accanto alle altre.
    report = tmp_path / "report.json"
    saving.save_metrics_to_json(_metrics(request), str(report))
    saving.save_metrics_to_json(res, str(report))
    data = json.loads(report.read_text(encoding="utf-8"))
    assert "skipped" not in data[0]
    assert data[1]["skipped"] is True and data[1]["source_a"] == "arXiv"


@pytest.mark.asyncio
async def test_other_errors_are_not_retried(monkeypatch, no_real_wait):
    async def broken_evaluation(search_request, *args):
        raise ValueError("bug")

    monkeypatch.setattr(indexes, "evaluate_query_metrics", broken_evaluation)

    with pytest.raises(ValueError):
        await indexes.evaluate_query_with_retries(SearchRequest(author=["X"]), None, "arXiv", None, "OpenAlex")
    assert no_real_wait == []


@pytest.mark.asyncio
async def test_arxiv_waits_as_long_as_retry_after(monkeypatch):
    waits = []

    async def fake_sleep(seconds):
        waits.append(seconds)

    monkeypatch.setattr(arXiv.asyncio, "sleep", fake_sleep)
    with respx.mock(base_url="https://export.arxiv.org") as respx_mock:
        respx_mock.get(path="/api/query").mock(side_effect=[
            Response(429, headers={"Retry-After": "20"}),
            Response(429, headers={"Retry-After": "600"}),
            Response(429),
        ])
        with pytest.raises(SourceUnavailableError):
            await ArXivAdapter().fetch(SearchRequest(keyword_include=[["AI"]]))

    # 20 come chiesto, 600 limitato al tetto; nessuna attesa dopo l'ultimo.
    assert waits == [20.0, ArXivAdapter.MAX_RETRY_AFTER_SECONDS]


def test_arxiv_coverage_waits_three_seconds():
    assert ArXivAdapter.MIN_REQUEST_INTERVAL == 3.0
