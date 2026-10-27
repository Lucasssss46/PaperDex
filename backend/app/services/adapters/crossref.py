import asyncio
from datetime import date, datetime
import os
from pathlib import Path
import re
from typing import Optional
from dotenv import load_dotenv
import httpx
from backend.app.services.adapters.base import (
    TOO_MANY_REQUESTS_MESSAGE,
    ArticlePage,
    BaseAdapter,
    SourceUnavailableError,
    http_error_message,
)
from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from crossref.restful import Works, Etiquette

class CrossrefAdapter(BaseAdapter):
    # Documentato: "rows" massimo 1000 per richiesta
    # (https://github.com/CrossRef/rest-api-doc).
    MAX_PAGE_SIZE = 1000

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> list[Article]:
        url = self._build_query(search_request, offset)
        print(f"Crossref URL: {url}")
        timeout = httpx.Timeout(60.0, connect=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(3):
                response = await client.get(url)

                if response.status_code in (429, 503):
                    if attempt == 2:
                        # Dopo l'ultimo tentativo non si attende: l'attesa
                        # allungava solo la ricerca prima dell'avviso (voce 103).
                        break
                    wait_time = 5.0 * (attempt + 1)  # 5s, poi 10s
                    print(f"Server Crossref occupato o limitato ({response.status_code}). Tentativo {attempt+1}/3. Attendo {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue

                if response.status_code != 200:
                    # Un'eccezione invece di []: la lista vuota finirebbe in
                    # cache e l'utente non saprebbe che la sorgente è mancata.
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))
                    
                if not response.text:
                    return []
                
                data = response.json()
                return self._normalize(data)

            print("Errore persistente dopo 3 tentativi. Nessun risultato ottenuto.")
            raise SourceUnavailableError(TOO_MANY_REQUESTS_MESSAGE)
        
    def _build_query(self, request: SearchRequest, offset: int = 0) -> str:
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")
        my_etiquette = Etiquette(
                "PapèrDex",
                "alpha",
                "https://github.com/Lucasssss46/PaperDex",
                os.getenv("USER_EMAIL")
            )

        work = Works(etiquette=my_etiquette)

        # Query minima: solo le keyword grezze. Autori, journal, date range
        # ed exclude vengono applicati internamente dopo il fetch.
        all_terms = request.query_terms()
        if not request.keyword_include and request.author:
            # Ricerca solo per autore: query.bibliographic cerca il nome in
            # tutti i campi, e per "Alfio Ferrara" nessuno dei primi 50
            # risultati era suo (in cima titoli come "Castelli, Alfio");
            # query.author li trova tutti e 50 (voce 101). Stesso principio
            # del campo au: di arXiv e del filtro autore di OpenAlex.
            work = work.query(author=" ".join(all_terms))
        elif all_terms:
            work = work.query(bibliographic=" ".join(all_terms))

        work = work.sort('relevance').select(
            'URL', 'title', 'DOI', 'author', 'issued', 'created', 'publisher', 'abstract'
        )

        # La libreria crossref.restful non espone rows/offset nella catena:
        # li aggiungiamo a mano sull'URL che genera.
        rows = request.limit if request.limit else 100
        return str(httpx.URL(work.url).copy_merge_params({"rows": str(rows), "offset": str(offset)}))

    def _publication_date(self, entry: dict) -> Optional[date]:
        """`issued` è la data di pubblicazione: la prima tra stampa e online,
        obbligatoria in ogni record (https://github.com/CrossRef/rest-api-doc/blob/master/api_format.md).
        `created` invece è quando il DOI è stato registrato, che può cadere
        anni dopo (es. riviste digitalizzate a posteriori): usato solo come
        ripiego. `issued` è una data parziale in cui solo l'anno è garantito:
        mese e giorno mancanti diventano 1, come già per le date "solo anno"
        di DBLP e Semantic Scholar."""
        parts = (entry.get('issued') or {}).get('date-parts') or [[]]
        first = parts[0] if parts else []
        if first and first[0] is not None:
            year, month, day = (list(first) + [1, 1])[:3]
            try:
                return date(int(year), int(month or 1), int(day or 1))
            except (TypeError, ValueError):
                pass

        created = (entry.get('created') or {}).get('date-time')
        if created:
            return datetime.fromisoformat(created.replace('Z', '+00:00')).date()
        return None

    def _normalize(self, data: dict) -> list[Article]:

        entries = data['message']['items']
        articles = []
        for entry in entries:
            # Non tutti i record Crossref hanno tutti i campi richiesti (es.
            # titolo o URL mancanti su record legacy/incompleti): li scartiamo
            # invece di far fallire l'intera pagina.
            if not entry.get('URL') or not entry.get('title'):
                continue

            # Gli autori collettivi (consorzi, gruppi di lavoro) arrivano con
            # "name" al posto di "given" e "family": prima diventavano ""
            # e potevano far fallire la deduplicazione (voce 115). Un autore
            # senza nessuno dei tre campi viene scartato.
            authors = [
                name for name in (
                    f"{a.get('given', '')} {a.get('family', '')}".strip() or (a.get('name') or '').strip()
                    for a in entry.get('author', [])
                ) if name
            ]

            affiliations = {
                affiliation.get('name')
                for author_entry in entry.get('author', [])
                for affiliation in author_entry.get('affiliation', [])
                if affiliation.get('name')
            }

            articles.append(Article(
                id = entry['URL'].replace("\\", ""),
                title = entry['title'][0],
                doi = entry['DOI'].replace("\\", "") if 'DOI' in entry else None,
                abstract = re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', entry['abstract']).replace('\u2003', ' ')).strip()  if 'abstract' in entry else None,
                authors = authors if authors else None,
                publication_date = self._publication_date(entry),
                source = "Crossref",
                venue = entry.get('publisher'),
                institution_author = list(affiliations) if affiliations else None,
            ))

        return ArticlePage(articles, received=len(entries))