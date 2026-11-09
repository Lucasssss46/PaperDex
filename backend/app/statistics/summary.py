from backend.app.statistics.saving import EVALUATION_REPORT, load_report
from pathlib import Path
from statistics import median

# Riepilogo del report: per ogni coppia di sorgenti, mediana e intervallo
# (minimo e massimo) di Jaccard e coperture, separando le query solo keyword
# da quelle solo autore (voce 112). Le query saltate non entrano nel conto.
METRICS = ("jaccard_index", "coverage_a_to_b", "coverage_b_to_a")


def query_kind(query_description: str) -> str:
    # query_description è str(SearchRequest); le query di valutazione hanno
    # solo keyword oppure solo autore (queries.py).
    return "autore" if "keyword_include=None" in query_description else "keyword"


def summarize(entries: list) -> dict:
    """{(source_a, source_b, tipo di query): {"n": ..., metrica: {"median", "min", "max"}}}"""
    groups = {}
    for entry in entries:
        if entry.get("skipped"):
            continue
        key = (entry["source_a"], entry["source_b"], query_kind(entry["query_description"]))
        groups.setdefault(key, []).append(entry)

    summary = {}
    for key, group in groups.items():
        summary[key] = {"n": len(group)}
        for metric in METRICS:
            values = [entry[metric] for entry in group]
            summary[key][metric] = {
                "median": round(median(values), 2),
                "min": min(values),
                "max": max(values),
            }
    return summary


def _format(stats: dict) -> str:
    return f"{stats['median']:g} ({stats['min']:g}–{stats['max']:g})".replace(".", ",")


def print_summary(file_path: str = EVALUATION_REPORT):
    # Tabella Markdown, nello stesso formato delle tabelle della tesi
    # (decimali con la virgola).
    print("| Coppia | Query | N | Jaccard | A→B | B→A |")
    print("|---|---|---|---|---|---|")
    for (source_a, source_b, kind), stats in sorted(summarize(load_report(Path(file_path))).items()):
        print(f"| {source_a}–{source_b} | {kind} | {stats['n']} | "
              + " | ".join(_format(stats[metric]) for metric in METRICS) + " |")


if __name__ == "__main__":
    print_summary()
