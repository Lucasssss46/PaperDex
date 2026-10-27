import json
from pathlib import Path
from typing import Union
from backend.app.statistics.indexes import SearchEvaluationMetrics, SkippedEvaluation

# Report comune a tutti gli script di valutazione (arxiv_openalex.py e gli altri).
EVALUATION_REPORT = "backend/app/statistics/evaluation_report.json"

def load_report(path: Path) -> list:
    if not path.is_file():
        return []
    try:
        with open(path, "r", encoding="utf-8") as f:
            data_list = json.load(f)
    except json.JSONDecodeError:
        # Se il file è vuoto o corrotto, partiamo da una lista nuova
        return []
    if not isinstance(data_list, list):
        data_list = [data_list] # Retrocompatibilità se c'era un oggetto singolo
    return data_list

def _query_key(record: dict) -> tuple:
    return (record.get("query_description"), record.get("source_a"), record.get("source_b"))

def evaluated_queries(file_path: str = EVALUATION_REPORT) -> set:
    """
    Query già valutate nel report, come (query_description, source_a, source_b).
    Le query saltate non contano: un'esecuzione successiva le rifà.
    """
    return {_query_key(entry) for entry in load_report(Path(file_path)) if not entry.get("skipped")}

def save_metrics_to_json(metrics: Union[SearchEvaluationMetrics, SkippedEvaluation], file_path: str = "evaluation_report.json"):
    """
    Salva o aggiunge le metriche di valutazione all'interno di un file JSON.
    Una query saltata (SkippedEvaluation) viene aggiunta allo stesso modo,
    con "skipped": true e il motivo. Quando la si rifà, il nuovo record
    prende il posto di quello saltato invece di aggiungersi.
    """
    path = Path(file_path)
    
    # Se il file esiste già, carichiamo i dati esistenti e aggiungiamo il nuovo record
    data_list = load_report(path)

    # Aggiungiamo il nuovo record convertito in dizionario, al posto della
    # stessa query se era stata saltata
    record = metrics.to_dict()
    for i, entry in enumerate(data_list):
        if entry.get("skipped") and _query_key(entry) == _query_key(record):
            data_list[i] = record
            break
    else:
        data_list.append(record)

    # Salviamo tutto formattato in modo pulito (indentato)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data_list, f, ensure_ascii=False, indent=4)
        
    print(f"Metriche salvate con successo in: {path.absolute()}")