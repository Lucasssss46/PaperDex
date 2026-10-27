import csv
import io
import json
import re
from typing import List

from backend.app.schemas.models import Article

# Formato -> (content_type, estensione file), unica fonte di verità condivisa
# tra la rotta (per Content-Type/nome file) e chi genera il contenuto qui.
EXPORT_FORMATS: dict[str, tuple[str, str]] = {
    "json": ("application/json", "json"),
    "csv": ("text/csv", "csv"),
    "bibtex": ("application/x-bibtex", "bib"),
    "ris": ("application/x-research-info-systems", "ris"),
}


def _authors_or_empty(article: Article) -> List[str]:
    # Senza i nomi vuoti: la chiave BibTeX prende l'ultima parola del primo
    # autore, che per un nome vuoto non esiste (voce 115).
    return [name for name in (article.authors or []) if name and name.strip()]


def _year(article: Article) -> str:
    return str(article.publication_date.year) if article.publication_date else ""


def to_json(articles: List[Article]) -> str:
    return json.dumps([a.model_dump(mode="json") for a in articles], ensure_ascii=False, indent=2)


def to_csv(articles: List[Article]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["title", "authors", "year", "venue", "doi", "source", "abstract"])
    for a in articles:
        writer.writerow(
            [
                a.title,
                "; ".join(_authors_or_empty(a)),
                _year(a),
                a.venue or "",
                a.doi or "",
                a.source or "",
                a.abstract or "",
            ]
        )
    return buffer.getvalue()


def _bibtex_key(article: Article, seen: dict[str, int]) -> str:
    # cognome+anno, l'ultima parola del nome completo come euristica di
    # cognome (funziona per la maggior parte dei nomi occidentali, non
    # esistono dati separati nome/cognome nelle sorgenti aggregate). Deduplicato
    # con un suffisso a/b/c se più articoli producono la stessa chiave.
    authors = _authors_or_empty(article)
    surname = re.sub(r"[^a-zA-Z]", "", authors[0].split()[-1]).lower() if authors else "unknown"
    base = f"{surname}{_year(article) or 'nd'}"
    count = seen.get(base, 0)
    seen[base] = count + 1
    return base if count == 0 else f"{base}{chr(ord('a') + count - 1)}"


def _bibtex_escape(value: str) -> str:
    return value.replace("{", "\\{").replace("}", "\\}")


def to_bibtex(articles: List[Article]) -> str:
    seen: dict[str, int] = {}
    entries = []
    for a in articles:
        key = _bibtex_key(a, seen)
        # @article se c'è una venue nota (rivista/conferenza), altrimenti
        # @misc (tipico per preprint arXiv senza pubblicazione formale) —
        # stesso criterio con cui arXiv stessa distingue le due voci.
        entry_type = "article" if a.venue else "misc"
        fields = [f'  title = {{{_bibtex_escape(a.title)}}}']
        authors = _authors_or_empty(a)
        if authors:
            fields.append(f'  author = {{{" and ".join(authors)}}}')
        if a.publication_date:
            fields.append(f"  year = {{{a.publication_date.year}}}")
        if a.venue:
            fields.append(f'  journal = {{{_bibtex_escape(a.venue)}}}')
        if a.doi:
            fields.append(f"  doi = {{{a.doi}}}")
        if a.id and a.id.startswith("http"):
            fields.append(f"  url = {{{a.id}}}")
        if a.source:
            fields.append(f'  note = {{via {a.source}}}')
        entries.append(f"@{entry_type}{{{key},\n" + ",\n".join(fields) + "\n}")
    return "\n\n".join(entries)


def to_ris(articles: List[Article]) -> str:
    entries = []
    for a in articles:
        lines = [f"TY  - {'JOUR' if a.venue else 'GEN'}"]
        lines.append(f"TI  - {a.title}")
        for author in _authors_or_empty(a):
            lines.append(f"AU  - {author}")
        if a.publication_date:
            lines.append(f"PY  - {a.publication_date.year}")
        if a.venue:
            lines.append(f"JO  - {a.venue}")
        if a.doi:
            lines.append(f"DO  - {a.doi}")
        if a.abstract:
            lines.append(f"AB  - {a.abstract}")
        if a.id and a.id.startswith("http"):
            lines.append(f"UR  - {a.id}")
        lines.append("ER  - ")
        entries.append("\n".join(lines))
    return "\n\n".join(entries)


EXPORTERS = {
    "json": to_json,
    "csv": to_csv,
    "bibtex": to_bibtex,
    "ris": to_ris,
}
