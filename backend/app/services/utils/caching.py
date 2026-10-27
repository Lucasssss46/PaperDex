from datetime import date, timedelta
import json
import os
from pathlib import Path
import functools
import hashlib

from backend.app.schemas.models import Article
from backend.app.services.adapters.base import ArticlePage


# Ancorato alla posizione del file, non alla working directory del processo:
# un path relativo si rompe a seconda di da dove viene avviato il server
# (es. `cd backend && uvicorn app.main:app` ha CWD diversa da `pytest` lanciato
# dalla radice del repo), causando un FileNotFoundError silenzioso in save_cache.
CACHE_FILE = Path(__file__).resolve().parent / "evaluation_cache.json"

# Una voce più vecchia di così viene trattata come cache miss e rifatta: senza
# scadenza, una query ripetuta a distanza di mesi restituirebbe per sempre lo
# stesso snapshot, anche se nel frattempo sono usciti nuovi articoli che
# avrebbero dovuto comparire. I metadati bibliografici non cambiano ogni
# minuto, quindi qualche giorno di margine resta un buon compromesso tra
# risultati freschi e non martellare le sorgenti esterne per query ripetute.
CACHE_TTL_DAYS = 7
# Oltre il doppio del TTL, una voce scaduta e mai più richiesta nel frattempo
# viene anche eliminata dal file (non solo ignorata in lettura) al prossimo
# salvataggio: altrimenti il file continuerebbe a crescere all'infinito con
# voci ormai inutili, anche se tutte scadute.
CACHE_PRUNE_AFTER_DAYS = CACHE_TTL_DAYS * 2

def load_cache():
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def save_cache(cache_data):
    # Pulizia opportunistica: aggancia la potatura delle voci molto vecchie al
    # ciclo di scrittura già in corso, invece di un processo/cron separato
    # solo per questo. Una voce nel vecchio formato (solo lista, senza
    # "fetched_at" — da prima di questa modifica) non ha un'età nota: viene
    # scartata qui piuttosto che tenuta per sempre.
    cutoff = (date.today() - timedelta(days=CACHE_PRUNE_AFTER_DAYS)).isoformat()
    pruned = {
        key: entry
        for key, entry in cache_data.items()
        if isinstance(entry, dict) and entry.get("fetched_at", "") >= cutoff
    }
    # Prima su un file temporaneo, poi sostituzione in un colpo solo: chi
    # legge nello stesso momento (un altro processo, per esempio uno script
    # di statistica mentre il server è acceso) trova il file vecchio o quello
    # nuovo, mai uno scritto a metà, che load_cache leggerebbe come cache
    # vuota e il salvataggio successivo renderebbe definitiva.
    tmp_file = CACHE_FILE.with_name(f"{CACHE_FILE.name}.{os.getpid()}.tmp")
    with open(tmp_file, "w", encoding="utf-8") as f:
        json.dump(pruned, f, ensure_ascii=False, indent=2)
    try:
        os.replace(tmp_file, CACHE_FILE)
    except OSError as e:
        # Su Windows la sostituzione fallisce se un altro processo ha il file
        # aperto in quell'istante: si perde solo questa scrittura della cache.
        print(f"[CACHE] Salvataggio non riuscito ({e}): la voce verrà riscaricata.")
        tmp_file.unlink(missing_ok=True)


def save_cache_entry(cache_key: str, entry: dict):
    """Aggiunge una sola voce rileggendo il file subito prima di scrivere.
    Tra lettura e scrittura non c'è nessun await, quindi le altre richieste
    in corso nello stesso processo non possono inserirsi nel mezzo."""
    cache_data = load_cache()
    cache_data[cache_key] = entry
    save_cache(cache_data)

def file_cache(func):
    """Decoratore che memorizza i risultati delle funzioni di fetch su un file JSON locale.

    La chiave è basata sulla richiesta HTTP che l'adapter costruirebbe davvero
    (adapter._build_query(search_request, offset)), non sull'intera
    SearchRequest: campi come autore/journal/anno non influenzano la query
    minima mandata alla sorgente (restano solo nel filtro interno), quindi due
    ricerche che differiscono solo per quei campi condividono correttamente
    la stessa pagina in cache invece di rifare la stessa identica chiamata.

    Ogni voce porta anche "fetched_at" (data ISO): una voce più vecchia di
    CACHE_TTL_DAYS è trattata come cache miss e la sorgente viene richiamata di
    nuovo, sovrascrivendola con dati e timestamp freschi."""
    @functools.wraps(func)
    async def wrapper(adapter, search_request, *args, **kwargs):
        cache = load_cache()

        adapter_name = adapter.__class__.__name__
        offset = kwargs.get("offset", 0)
        query = str(adapter._build_query(search_request, offset))
        cache_key = hashlib.md5(f"{adapter_name}:{query}".encode()).hexdigest()

        cached_entry = cache.get(cache_key)
        # isinstance(..., dict): scarta anche una voce nel vecchio formato
        # (solo lista grezza, senza fetched_at) come se fosse un miss, invece
        # di leggerla al buio senza sapere quanto sia vecchia.
        if isinstance(cached_entry, dict):
            is_fresh = cached_entry.get("fetched_at", "") >= (date.today() - timedelta(days=CACHE_TTL_DAYS)).isoformat()
            if is_fresh:
                print(f"[CACHE HIT] {adapter_name} per la richiesta.")
                raw_data = cached_entry["data"]
                # Riconverte i dizionari in oggetti Article se la risposta era una lista di articoli
                if isinstance(raw_data, list):
                    articles = [Article(**item) if isinstance(item, dict) else item for item in raw_data]
                    # Senza "received" (voci salvate prima della voce 102 o
                    # sorgenti che non scartano record) vale il numero di articoli.
                    return ArticlePage(articles, received=cached_entry.get("received"))
                return raw_data
            print(f"[CACHE SCADUTA] {adapter_name}: voce più vecchia di {CACHE_TTL_DAYS} giorni, richiamo la sorgente.")

        print(f"[CACHE MISS] Chiamata di rete per {adapter_name}...")
        result = await func(adapter, search_request, *args, **kwargs)

        # CONVERSIONE DI SICUREZZA PER IL JSON:
        # Trasforma gli oggetti Article in dizionari serializzabili prima di metterli in cache
        serializable_result = []
        if isinstance(result, list):
            for item in result:
                if hasattr(item, "model_dump"):
                    item_dict = item.model_dump()
                elif hasattr(item, "__dict__"):
                    item_dict = item.__dict__.copy()
                else:
                    item_dict = item

                # Converte eventuali oggetti date/datetime in stringhe ISO
                if isinstance(item_dict, dict):
                    for k, v in item_dict.items():
                        if isinstance(v, date):
                            item_dict[k] = v.isoformat()

                serializable_result.append(item_dict)
        else:
            serializable_result = result

        entry = {"fetched_at": date.today().isoformat(), "data": serializable_result}
        if hasattr(result, "received"):
            # Record mandati dalla sorgente, compresi quelli scartati: serve a
            # paginated_fetch anche quando la pagina arriva dalla cache.
            entry["received"] = result.received
        # Non `cache`, letta prima della chiamata di rete: nel frattempo le
        # altre sorgenti, interrogate in parallelo, hanno salvato le loro
        # pagine, e riscrivere quella copia le cancellava (in una ricerca
        # dal vivo restavano in cache 3 pagine su 7).
        save_cache_entry(cache_key, entry)

        return result
    return wrapper
