import importlib

import pytest

from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.crossref import CrossrefAdapter
from backend.app.services.adapters.dblp import DBLPAdapter
from backend.app.services.adapters.openAlex import OpenAlexAdapter
from backend.app.statistics.queries import EVALUATION_QUERIES


# Ogni script di valutazione confronta una coppia di sorgenti sulle stesse
# query e scrive nello stesso report.
SCRIPTS = [
    ("arxiv_openalex", ArXivAdapter, "arXiv", OpenAlexAdapter, "OpenAlex"),
    ("arxiv_dblp", ArXivAdapter, "arXiv", DBLPAdapter, "DBLP"),
    ("openalex_dblp", OpenAlexAdapter, "OpenAlex", DBLPAdapter, "DBLP"),
    ("crossref_dblp", CrossrefAdapter, "Crossref", DBLPAdapter, "DBLP"),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("module_name, cls_a, name_a, cls_b, name_b", SCRIPTS)
async def test_script_evaluates_all_queries_on_its_pair(monkeypatch, module_name, cls_a, name_a, cls_b, name_b):
    script = importlib.import_module(f"backend.app.statistics.{module_name}")
    evaluated = []
    saved = []

    async def no_db():
        pass

    async def fake_evaluation(search_request, adapter_a, name_a, adapter_b, name_b):
        evaluated.append((search_request, type(adapter_a), name_a, type(adapter_b), name_b))
        return search_request

    monkeypatch.setattr(script, "init_test_db", no_db)
    # Gli script con OpenAlex leggono la chiave dal .env: nei test non serve.
    if hasattr(script, "load_dotenv"):
        monkeypatch.setattr(script, "load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setattr(script, "evaluate_query_with_retries", fake_evaluation)
    monkeypatch.setattr(script, "save_metrics_to_json", lambda res, path: saved.append((res, path)))
    # Report vuoto: il vero report sul disco ha già delle query valutate.
    monkeypatch.setattr(script, "evaluated_queries", lambda path: set())

    await script.run_evaluation_suite()

    assert [e[0] for e in evaluated] == EVALUATION_QUERIES
    assert {e[1:] for e in evaluated} == {(cls_a, name_a, cls_b, name_b)}
    assert saved == [(q, "backend/app/statistics/evaluation_report.json") for q in EVALUATION_QUERIES]


@pytest.mark.asyncio
@pytest.mark.parametrize("module_name, cls_a, name_a, cls_b, name_b", SCRIPTS)
async def test_script_skips_queries_already_in_report(monkeypatch, module_name, cls_a, name_a, cls_b, name_b):
    script = importlib.import_module(f"backend.app.statistics.{module_name}")
    evaluated = []
    done = EVALUATION_QUERIES[:2]

    async def no_db():
        pass

    async def fake_evaluation(search_request, *args, **kwargs):
        evaluated.append(search_request)
        return search_request

    monkeypatch.setattr(script, "init_test_db", no_db)
    if hasattr(script, "load_dotenv"):
        monkeypatch.setattr(script, "load_dotenv", lambda *args, **kwargs: None)
    monkeypatch.setattr(script, "evaluate_query_with_retries", fake_evaluation)
    monkeypatch.setattr(script, "save_metrics_to_json", lambda res, path: None)
    # La stessa query su un'altra coppia non conta.
    monkeypatch.setattr(script, "evaluated_queries", lambda path: {(str(q), name_a, name_b) for q in done} | {(str(EVALUATION_QUERIES[2]), "altra", "coppia")})

    await script.run_evaluation_suite()

    assert evaluated == EVALUATION_QUERIES[2:]
