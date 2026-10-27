import asyncio
import os
from pathlib import Path
import re

from dotenv import load_dotenv
import httpx
from datetime import datetime
from typing import List

from backend.app.schemas.models import Article
from backend.app.schemas.search import SearchRequest
from backend.app.services.adapters.base import ArticlePage, BaseAdapter, SourceUnavailableError, http_error_message, missing_api_key_message

INVALID_KEY_MESSAGE = "La chiave API per OpenAlex non è valida: la sorgente è stata saltata."
RATE_LIMITED_MESSAGE = (
    "OpenAlex ha rifiutato le richieste: probabilmente il credito giornaliero "
    "della chiave è esaurito. La sorgente è stata saltata."
)


class OpenAlexAdapter(BaseAdapter):
    # Documentato: "per-page" tra 1 e 200
    # (https://docs.openalex.org/how-to-use-the-api/get-lists-of-entities/paging).
    MAX_PAGE_SIZE = 200
    API_KEY_SOURCE_ID = "openalex"
    # Da febbraio 2026 l'API richiede una chiave per ogni richiesta (senza,
    # solo poche chiamate dimostrative): si usa soltanto la chiave personale
    # dell'utente o quella condivisa da un membro del team, mai una del server
    # (https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/).
    REQUIRES_API_KEY = True

    async def fetch(self, search_request: SearchRequest, offset: int = 0) -> List[Article]:
        if not self.api_key:
            raise SourceUnavailableError(missing_api_key_message("OpenAlex"))

        params = self._build_query(search_request, offset)
        timeout = httpx.Timeout(20.0, connect=10.0)    
        async with httpx.AsyncClient(timeout=timeout) as client:
            for attempt in range(3):

                response = await client.get("https://api.openalex.org/works", params=params)

                if response.status_code in (429, 503):
                    if attempt == 2:
                        # Dopo l'ultimo tentativo non si attende: l'attesa
                        # allungava solo la ricerca prima dell'avviso (voce 103).
                        break
                    wait_time = 5.0 * (attempt + 1)  # 5s, poi 10s
                    print(f"Server OpenAlex occupato o limitato ({response.status_code}). Tentativo {attempt+1}/3. Attendo {wait_time}s...")
                    await asyncio.sleep(wait_time)
                    continue

                if response.status_code in (401, 403):
                    # Chiave (personale o condivisa) rifiutata: senza chiave
                    # OpenAlex non si può più interrogare, quindi niente
                    # ripiego, solo un avviso per questa sorgente.
                    print(f"Chiave API OpenAlex non valida ({response.status_code}).")
                    raise SourceUnavailableError(INVALID_KEY_MESSAGE)

                if response.status_code != 200:
                    print(f"Errore API: {response.status_code} - {response.text}")
                    raise SourceUnavailableError(http_error_message(response.status_code))
                    
                if not response.text:
                    return []
                
                return self._normalize(response.json())
            # 429 anche dopo i tentativi: con la tariffazione a consumo è quasi
            # sempre il credito giornaliero della chiave esaurito. Un'eccezione
            # invece di [] evita di salvare in cache una pagina vuota.
            print("Errore persistente dopo 3 tentativi. Nessun risultato ottenuto.")
            raise SourceUnavailableError(RATE_LIMITED_MESSAGE)
        
    def _build_query(self, request: SearchRequest, offset: int = 0) -> dict:
        load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

        # Query minima: solo i termini del gruppo corrente. Date range ed
        # exclude vengono applicati internamente dopo il fetch.
        terms = request.query_terms()
        filter_field_cs = "topics.field.id:17"

        if not request.keyword_include and request.author:
            # Fallback per ricerche solo-autore: la ricerca full-text generica
            # (search=) non matcha in modo affidabile sugli autori (verificato:
            # risultati quasi tutti estranei), va usato il filtro dedicato.
            # Più autori = OR, coerente con _matches_authors.
            search = ""
            author_filter = "raw_author_name.search:" + " OR ".join(
                phrase for name in terms for phrase in self._author_phrases(name)
            )
            request_filter = f"{filter_field_cs},{author_filter}"
        else:
            # I termini in `terms` appartengono tutti allo stesso gruppo AND
            # (vedi query_terms()/_matches_keywords): vanno uniti in AND, non
            # OR, altrimenti un solo termine generico inonda i risultati di
            # rumore (verificato con ["YOLO26", "adenovirus"]: "adenovirus" da
            # solo pesca centinaia di articoli medici estranei).
            search = " AND ".join(phrase for phrase in map(self._search_phrase, terms) if phrase)
            request_filter = filter_field_cs

        # OpenAlex pagina per numero di pagina (1-indicizzato), non per offset
        # assoluto: convertiamo il nostro offset in item nella pagina corrispondente.
        per_page = request.limit if request.limit else 25
        page = (offset // per_page) + 1

        return {
            "search": search,
            "filter": request_filter,
            "select": "id,title,doi,authorships,publication_date,abstract_inverted_index,primary_location,best_oa_location",
            # Solo la chiave personale o condivisa: fetch non arriva qui senza.
            "api_key": self.api_key,
            "sort": "relevance_score:desc",
            "per-page": per_page,
            "page": page,
            "mailto": os.getenv('USER_EMAIL')
        }


    @staticmethod
    def _search_phrase(term: str) -> str:
        # In search= "?" e "*" sono caratteri jolly, ammessi solo nella
        # ricerca esatta: il titolo DBLP che inizia con "Are the current topic
        # modeling evaluation metrics enough?", cercato per la copertura, dava
        # HTTP 400 ("Wildcards (* or ?) require exact (no-stem) search",
        # voce 114). Le virgolette interne chiuderebbero la frase. Si tolgono
        # tutti e tre: della frase si perde solo la punteggiatura.
        cleaned = " ".join(re.sub(r'["?*]', " ", term).split())
        return f'"{cleaned}"' if cleaned else ""

    @staticmethod
    def _author_phrases(name: str) -> List[str]:
        # Tra virgolette il nome deve comparire in un'unica firma; senza, ogni
        # parola può cadere su un autore diverso ("john smith" trova anche un
        # lavoro di "John Doe" e "Alice Smith"). Si aggiunge l'ordine
        # cognome-nome per le firme invertite ("Priem, Jason"), unendo le
        # varianti con OR come indica la documentazione
        # (https://help.openalex.org/api/searching/). Virgolette e virgole
        # del nome vengono tolte: chiuderebbero la frase o il filtro.
        tokens = name.replace('"', " ").replace(",", " ").split()
        if not tokens:
            return []
        phrases = [" ".join(tokens)]
        if len(tokens) > 1:
            phrases.append(" ".join(tokens[-1:] + tokens[:-1]))
        return [f'"{phrase}"' for phrase in phrases]

    def _normalize(self, raw_data: dict) -> List[Article]:
        entryes = raw_data.get('results', [])
        articles = []
        
        for entry in entryes:
            # Metadati OpenAlex a volte incompleti (titolo o id mancanti,
            # publication_date presente ma null): scartiamo la voce invece di
            # far fallire l'intera pagina.
            if not entry.get('title') or not (entry.get('doi') or entry.get('id')):
                continue

            doi_raw = entry['doi'] if 'doi' in entry else None
            doi_clean = doi_raw.replace('https://doi.org/', '') if doi_raw else None

            primary_loc = entry.get('primary_location') or {}
            best_oa_loc = entry.get('best_oa_location') or {}

            venue = None
            if isinstance(primary_loc, dict):
                source = primary_loc.get('source')
                if isinstance(source, dict):
                    venue = source.get('display_name')

            if not venue and isinstance(best_oa_loc, dict):
                source = best_oa_loc.get('source')
                if isinstance(source, dict):
                    venue = source.get('display_name')

            articles.append(Article(
                id = entry['doi'] if doi_clean else entry['id'],
                title = entry['title'],
                doi = doi_clean,
                authors = [a['author']['display_name'] for a in entry['authorships']] if 'authorships' in entry else None,
                publication_date = datetime.fromisoformat(entry['publication_date']).date() if entry.get('publication_date') else None,
                abstract = self._reconstruct_abstract(entry.get('abstract_inverted_index', {})),
                source = "OpenAlex",
                region = self._extract_regions(entry['authorships']) if 'authorships' in entry else None,
                venue = venue,
                institution_author = self._extract_institutions(entry['authorships']) if 'authorships' in entry else None
            ))
        return ArticlePage(articles, received=len(entryes))


    def _reconstruct_abstract(self, inverted_index):
        if not inverted_index:
            return None
        
        d = {word: positions for word, positions in inverted_index.items()}
        indexed = []
        for word, positions in d.items():
            for pos in positions:
                indexed.append((pos, word))
        return " ".join([word for pos, word in sorted(indexed)])


    def _extract_institutions(self, authorships: list) -> List[str]:
        institutions = set()

        for authorship in authorships:
            for inst in authorship.get('institutions', []):
                name = inst.get('display_name')
                if name:
                    institutions.add(name)
                    
        return list(institutions)
    
    def _extract_regions(self, authorships: list) -> List[str]:
        regions = set()
        
        for authorship in authorships:
            for country in authorship.get('countries', []):
                regions.add(country)
                    
        return list(regions)