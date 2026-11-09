from backend.app.services.adapters.arXiv import ArXivAdapter
from backend.app.services.adapters.openAlex import OpenAlexAdapter
from backend.app.services.utils.db_init import init_test_db
from backend.app.statistics.indexes import evaluate_query_with_retries
from backend.app.statistics.queries import EVALUATION_QUERIES
from backend.app.statistics.saving import EVALUATION_REPORT, evaluated_queries, save_metrics_to_json
import asyncio
import os
from pathlib import Path

from dotenv import load_dotenv

async def run_evaluation_suite():

    await init_test_db()
    
    queries_to_evaluate = EVALUATION_QUERIES

    adapter_a = ArXivAdapter()
    name_a = "arXiv"
    # OpenAlex richiede una chiave: per gli script di valutazione si usa quella del .env.
    load_dotenv(Path(__file__).resolve().parents[2] / ".env")
    adapter_b = OpenAlexAdapter(api_key=os.getenv("OPENALEX_API_KEY"))
    name_b = "OpenAlex"

    # Le query già nel report non si rifanno: un'esecuzione interrotta, o
    # fermata dal credito giornaliero di OpenAlex, riprende dalle query
    # mancanti o saltate. Per rifare tutto da capo si rinomina prima il report.
    already_evaluated = evaluated_queries(EVALUATION_REPORT)

    for query in queries_to_evaluate:
        if (str(query), name_a, name_b) in already_evaluated:
            continue

        # Una sorgente che rifiuta le richieste salta solo questa query,
        # registrata nel report, e la valutazione prosegue.
        res = await evaluate_query_with_retries(
            search_request= query, 
            adapter_a = adapter_a, 
            name_a = name_a, 
            adapter_b = adapter_b,
            name_b = name_b
        )

        save_metrics_to_json(res, EVALUATION_REPORT)

if __name__ == "__main__":
    asyncio.run(run_evaluation_suite())