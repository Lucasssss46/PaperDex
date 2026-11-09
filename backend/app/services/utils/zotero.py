import os
import re
from datetime import date
from pathlib import Path
from typing import Any, List, Optional

import httpx
from dotenv import load_dotenv

from backend.app.schemas.models import Article

load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

TRANSLATION_SERVER_URL = os.getenv("ZOTERO_TRANSLATION_SERVER_URL", "http://127.0.0.1:1969")


class EnrichmentError(Exception):
    """Sollevata quando l'arricchimento non può procedere: server di
    traduzione irraggiungibile, nessun identificativo utilizzabile,
    nessun dato trovato per quell'identificativo."""


def _extract_creators(item: dict) -> Optional[List[str]]:
    creators = item.get("creators")
    if not creators:
        return None
    names = []
    for c in creators:
        if c.get("name"):
            names.append(c["name"])
        elif c.get("firstName") or c.get("lastName"):
            names.append(f"{c.get('firstName', '')} {c.get('lastName', '')}".strip())
    return names or None


def _parse_date(raw: Optional[str]) -> Optional[date]:
    """Le date di Zotero sono testo libero ("2023-08-15", "2023",
    "August 2023"...): prova prima ISO, poi ripiega sul primo anno a 4 cifre
    trovato nel testo (stesso approccio già usato per le date "solo anno" di
    DBLP/Semantic Scholar in questo progetto)."""
    if not raw:
        return None
    iso_match = re.match(r"^(\d{4})-(\d{2})-(\d{2})", raw)
    if iso_match:
        try:
            return date(int(iso_match[1]), int(iso_match[2]), int(iso_match[3]))
        except ValueError:
            pass
    year_match = re.search(r"\b(1[5-9]\d{2}|20\d{2})\b", raw)
    if year_match:
        return date(int(year_match[1]), 1, 1)
    return None


def _venue(item: dict) -> Optional[str]:
    return item.get("publicationTitle") or item.get("proceedingsTitle") or item.get("conferenceName")


async def _call_translation_server(path: str, body: str) -> List[dict]:
    url = f"{TRANSLATION_SERVER_URL}{path}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, content=body, headers={"Content-Type": "text/plain"})
    except httpx.RequestError as e:
        raise EnrichmentError(
            f"Server di traduzione Zotero non raggiungibile ({TRANSLATION_SERVER_URL}): {e}"
        ) from e

    if response.status_code == 300:
        # Più risultati possibili (tipico di /web su una pagina con più
        # citazioni): si prende il primo, senza costruire un flusso di
        # disambiguazione per un caso raro quando si parte da un URL già
        # specifico di un singolo articolo.
        options = response.json()
        if not options:
            raise EnrichmentError("Nessun dato trovato per questo articolo")
        first_key = next(iter(options))
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    url,
                    json={"url": body, "items": {first_key: options[first_key]}} if path == "/web" else body,
                    headers={"Content-Type": "application/json" if path == "/web" else "text/plain"},
                )
        except httpx.RequestError as e:
            raise EnrichmentError(f"Server di traduzione Zotero non raggiungibile: {e}") from e

    if response.status_code == 501:
        raise EnrichmentError("Nessun traduttore disponibile per questo URL")
    if response.status_code == 400:
        raise EnrichmentError("Identificativo o URL non valido")
    if response.status_code == 404:
        raise EnrichmentError("Nessun dato trovato per questo articolo")
    if response.status_code != 200:
        raise EnrichmentError(f"Errore dal server di traduzione ({response.status_code})")

    data = response.json()
    return data if isinstance(data, list) else [data]


async def fetch_zotero_metadata(article: Article) -> dict:
    """Interroga il translation-server di Zotero per l'identificativo più
    affidabile disponibile: il DOI se c'è (ricerca per identificativo,
    /search), altrimenti l'URL della sorgente originale (scraping della pagina,
    /web) — quasi ogni articolo normalizzato dai nostri adapter ha un id che
    è già una URL vera. Nessun identificativo utilizzabile è un errore
    esplicito, non un ripiego silenzioso."""
    if article.doi:
        items = await _call_translation_server("/search", article.doi)
    elif article.id and article.id.startswith(("http://", "https://")):
        items = await _call_translation_server("/web", article.id)
    else:
        raise EnrichmentError("Nessun identificativo (DOI o URL) disponibile per questo articolo")

    # La risposta può includere voci accessorie (es. itemType "note" con le
    # pagine/figure, agganciate come "figlie" della voce principale tramite
    # parentItem): la prima voce bibliografica vera è quella che ci serve,
    # non necessariamente items[0].
    primary = next((i for i in items if i.get("itemType") not in ("note", "attachment")), None)
    if primary is None:
        raise EnrichmentError("Nessun dato trovato per questo articolo")
    return primary


def _zotero_item(article: Article) -> dict:
    """Converte un nostro Article nel formato item di Zotero atteso da
    /export — l'inverso di quanto fetch_zotero_metadata/apply_enrichment
    fanno per /search: lì si leggono questi stessi campi (creators, date,
    publicationTitle, DOI, abstractNote) da un item Zotero verso il nostro
    modello, qui si scrivono verso un item Zotero a partire dal nostro."""
    item: dict[str, Any] = {
        # "preprint" (non "document"/"misc": non esiste come itemType) per
        # chi non ha una venue nota — stesso identico criterio già usato da
        # to_bibtex/to_ris per scegliere tra @article e @misc, dato che
        # l'export translator di Zotero mappa "preprint" proprio su @misc.
        "itemType": "journalArticle" if article.venue else "preprint",
        "title": article.title,
    }
    if article.authors:
        # "name" (non firstName/lastName): le sorgenti aggregate non separano
        # nome e cognome, lo stesso limite già affrontato in _bibtex_key.
        item["creators"] = [{"creatorType": "author", "name": a} for a in article.authors]
    if article.publication_date:
        item["date"] = article.publication_date.isoformat()
    if article.venue:
        item["publicationTitle"] = article.venue
    if article.doi:
        item["DOI"] = article.doi
    if article.abstract:
        item["abstractNote"] = article.abstract
    if article.id and article.id.startswith(("http://", "https://")):
        item["url"] = article.id
    return item


async def export_via_translation_server(articles: List[Article], export_format: str) -> Optional[str]:
    """Prova a generare l'export (bibtex/ris) tramite gli export translator
    di Zotero — più maturi dei nostri su alcuni casi limite (escape,
    generazione della chiave di citazione). Il translation-server è un
    servizio opzionale (Docker, voce 76): se non è raggiungibile o risponde
    con un errore, restituisce `None` invece di sollevare un'eccezione — chi
    chiama ripiega sul proprio formattatore (services/utils/export.py)
    invece di far fallire l'intero export per un servizio facoltativo
    momentaneamente giù."""
    if not articles:
        return None

    items = [_zotero_item(a) for a in articles]
    url = f"{TRANSLATION_SERVER_URL}/export?format={export_format}"
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, json=items, headers={"Content-Type": "application/json"})
    except httpx.RequestError:
        return None

    if response.status_code != 200:
        return None
    return response.text


def apply_enrichment(article: Article, item: dict) -> List[str]:
    """Riempie solo i campi attualmente vuoti di `article` con quanto
    trovato da Zotero (arricchimento, non sovrascrittura: i dati già
    presenti — verificati dalle sorgenti originali — restano quelli). Modifica
    `article` sul posto e restituisce i nomi dei campi effettivamente
    riempiti, per mostrarli all'utente."""
    filled = []

    if not article.abstract and item.get("abstractNote"):
        article.abstract = item["abstractNote"]
        filled.append("abstract")

    if not article.venue:
        venue = _venue(item)
        if venue:
            article.venue = venue
            filled.append("venue")

    if not article.doi and item.get("DOI"):
        article.doi = item["DOI"]
        filled.append("doi")

    if not article.authors:
        authors = _extract_creators(item)
        if authors:
            article.authors = authors
            filled.append("authors")

    if not article.publication_date:
        parsed = _parse_date(item.get("date"))
        if parsed:
            article.publication_date = parsed
            filled.append("publication_date")

    return filled
