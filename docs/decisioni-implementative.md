# Decisioni implementative — PapérDex

Questo documento raccoglie le scelte di design/implementazione prese durante lo sviluppo, con il ragionamento dietro ciascuna. Va aggiornato ogni volta che se ne prende una nuova, così da avere sempre un riferimento su *cosa* è stato deciso e *perché*, utile anche in fase di scrittura della tesi.

Ogni voce riporta uno stato: **Implementato** (già nel codice) o **Deciso, da implementare** (concordato ma non ancora scritto).

---

## 1. Query minime alle fonti + filtraggio interno (2026-08-18)

**Contesto.** Le fonti (arXiv, Crossref, DBLP, OpenAlex, Semantic Scholar) hanno capacità di query molto disomogenee: alcune supportano AND/OR annidati e filtri ricchi, altre solo ricerca per keyword senza nemmeno poter specificare AND/OR. Il dominio di paper varia da pochi milioni a centinaia di milioni. Provare a inseguire le capacità reali di ciascuna fonte con un "contratto di capacità" per adapter è stato valutato e scartato con la correlatrice: troppo complesso rispetto al valore che porta.

**Decisione.** Ogni adapter manda alla propria API una query minima (solo keyword grezze), per massimizzare il recall e non dipendere dalla sintassi specifica di ciascuna fonte. Tutto il filtraggio reale (AND/OR sulle keyword, autore, journal, anno, esclusioni) avviene *dopo* il fetch, internamente, sugli stessi campi standardizzati di `Article` per tutte le fonti.

**Stato.** Implementato.

---

## 2. Adapter semplificati (2026-08-18)

Rimossi da `_build_query` di tutti e 5 gli adapter i parametri per autore, journal, range di date ed esclusioni — restano solo le keyword (in OR) e, dove già presente, il vincolo di dominio dell'app (`cat:cs.*` su arXiv, `topics.field.id:17` su OpenAlex, non derivato da `SearchRequest` ma fisso).

Durante il refactor sono emersi e sistemati alcuni bug collaterali:
- **Crossref**: il loop su `keyword_include` sovrascriveva la query a ogni iterazione (sopravviveva solo l'ultimo gruppo); mancava `'abstract'` nella `select`, quindi l'abstract non veniva mai restituito.
- **Semantic Scholar**: i blocchi della query venivano concatenati senza operatori tra loro, producendo query malformate.

**Stato.** Implementato.

---

## 3. Modulo di filtraggio interno — `filtering.py` (2026-08-18)

**Decisione.** Nuovo modulo `backend/app/services/utils/filtering.py` con `filter_articles(articles, request)`, applicato automaticamente da `safe_fetch_with_rate_limit` dopo ogni fetch (prima della cache).

Criteri, tutti sui campi standardizzati di `Article`:
- **Keyword**: match su **titolo + abstract** (non solo titolo) — scelto per essere più vicino a come si comportavano già arXiv/OpenAlex, accettando che le fonti senza abstract (es. DBLP) matchino solo sul titolo. AND dentro ogni gruppo di `keyword_include`, OR tra i gruppi; `keyword_exclude` scarta se un termine compare in titolo o abstract.
- **Autore**: match per sottostringa case-insensitive su `article.authors`.
- **Journal/venue**: match per sottostringa case-insensitive su `article.venue`.
- **Anno**: `article.publication_date.year` dentro `[year_start, year_end]`.

**Stato.** Implementato.

---

## 4. Fallback per ricerche senza keyword — `SearchRequest.query_terms()` (2026-08-18)

**Contesto.** Con la query minima, una ricerca senza keyword (es. solo per autore) produce una query vuota — alcune API la rifiutano esplicitamente (Semantic Scholar: `Missing required parameter: 'query'`).

**Decisione.** `SearchRequest.query_terms()` centralizza il calcolo dei termini da mandare alle fonti: le keyword se presenti, altrimenti gli autori come fallback. Tutti gli adapter usano questo metodo invece di ricalcolare i termini inline.

**Stato.** Implementato. Nota: col punto 8 (minimo obbligatorio lato UI), questo fallback diventerà un caso raro di difesa in profondità piuttosto che il comportamento normale.

---

## 5. `Article.publication_date`: da `datetime` a `date` (2026-08-18)

**Contesto.** Il campo era tipizzato `datetime`, ma una data di pubblicazione non ha un orario significativo; inoltre alcuni adapter normalizzavano a `date` e altri a `datetime`, causando confronti inconsistenti nei test.

**Decisione.** Campo tipizzato `date`; tutti gli adapter normalizzano coerentemente a `date`; la cache su file (`caching.py`) converte in ISO qualunque `date` (non solo `datetime`, dato che `date` non è un'istanza di `datetime`).

**Stato.** Implementato.

---

## 6. Test: allineamento alla nuova pipeline e rinvio dei test "singles" (2026-08-18)

- Corretti i path dei fixture nelle suite di normalizzazione (puntavano a una cartella inesistente) e il mock URL del test DBLP (puntava a `dblp.org` invece di `dblp.dagstuhl.de`, l'endpoint reale usato dall'adapter).
- I test in `suites/singles/` sono stati aggiornati per passare da `safe_fetch_with_rate_limit` (fetch + filtro) invece di chiamare `adapter.fetch()` a nudo.
- **Scoperta**: con query minime e `limit` di default (50), un paper specifico spesso non rientra nemmeno nel fetch grezzo se la keyword è generica (es. "robotics" da solo) — non è un bug del filtro, è la conseguenza diretta di query minime su fonti da milioni di paper.
- **Decisione**: non forzare questi test al verde con aggiustamenti isolati (bump di `limit`, keyword più mirate) prima del tempo. Vanno rivisitati insieme all'implementazione della vera logica di ricerca interna (paginazione, limiti per fonte, casi di test più selettivi).

**Stato.** Implementato (aggiornamento pipeline test); test `singles` **rimandati**, in attesa del punto 8.

---

## 7. Filosofia di query booleana delle 5 fonti (2026-08-19)

Verificato sulla documentazione ufficiale di ciascuna fonte come interpretano più parole senza operatori booleani espliciti:

| Fonte | Comportamento di default |
|---|---|
| arXiv | Nessun default implicito: gli operatori (AND/OR/ANDNOT) vanno sempre specificati esplicitamente. |
| OpenAlex | Default **AND** esplicito ("words not separated by boolean operators are treated as AND"); supporta anche AND/OR/NOT in maiuscolo e frasi tra virgolette. |
| DBLP | Default **AND** per prefisso su termini separati da spazio; OR con `\|`; NOT e phrase-search disabilitati dalla piattaforma. |
| Crossref | Nessun booleano reale: `query`/`query.bibliographic` è ricerca full-text a punteggio di rilevanza, non richiede il match di tutti i termini. |
| Semantic Scholar | La sintassi booleana (`+`, `\|`, `-`, virgolette, wildcard) esiste solo sull'endpoint `/paper/search/bulk`; l'endpoint usato dal nostro adapter (`/paper/search`) usa un ranker a rilevanza, non booleano vero — il `\|` mandato oggi non ha effetto garantito. |

**Implicazione.** 3 fonti su 5 (arXiv, OpenAlex, DBLP) hanno un AND reale sui termini mandati; le altre 2 (Crossref, Semantic Scholar) sono ranking a rilevanza puro, dove il filtro interno resta comunque l'unica vera fonte di verità.

**Stato.** Ricerca completata, usata per informare il punto 8.

---

## 8. Query semplice lato UI: minimo, gruppo unico, paginazione adattiva (2026-08-19)

Basandosi sul punto 7:

- **Minimo obbligatorio**: la UI richiede almeno un campo valorizzato tra keyword, autore o venue, per evitare ricerche vuote.
- **Un solo gruppo OR mandato all'API**: tra i gruppi di `keyword_include`, solo il primo viene mandato per intero (tutti i suoi termini AND) alla fonte come query; gli altri gruppi, così come autore/journal/anno/esclusioni, restano solo nel filtro interno. Scelta motivata dal punto 7: per arXiv/OpenAlex/DBLP questo produce un vero narrowing lato API; per Crossref/Semantic Scholar non fa danno (nessun sottoinsieme di termini garantirebbe comunque un AND reale lì) e aiuta comunque il ranking per rilevanza.
- **Paginazione adattiva**: si richiedono pagine successive alla fonte finché non si raggiunge il numero di risultati filtrati desiderato, fino a un tetto massimo di pagine aggiuntive per fonte, invece di richiedere sempre il massimo consentito. Il tetto è espresso in **numero di richieste aggiuntive**, non di risultati grezzi, perché è il numero di chiamate HTTP a far scattare i rate limit, non la quantità di dati per chiamata (ogni fonte manda già una pagina piena tramite i parametri che già impostiamo: `max_results`, `per-page`, `h`, `rows`...).
- **Profondità di ricerca lato UI**: livelli qualitativi (bassa/media/alta) invece di uno slider numerico sul risultato finale — un numero esatto crea un'aspettativa che il sistema non può sempre garantire (dipende da quanto la query è generica), mentre un livello comunica "quanto sforzo/tempo dedicare", cosa che il sistema controlla davvero. Ogni livello mappa internamente a una coppia (target risultati filtrati, tetto pagine aggiuntive per fonte):

  | Livello | Target risultati filtrati | Pagine aggiuntive max per fonte |
  |---|---|---|
  | Bassa | 15 | 2 |
  | Media | 50 (= default attuale di `SearchRequest.limit`) | 5 |
  | Alta | 150 | 10 |

  Valori di partenza, facilmente ritarabili in futuro senza cambiare la logica.

**Stato.** Deciso; implementato **solo su arXiv** come prova, per validare l'approccio prima di replicarlo sulle altre 4 fonti.

---

## 9. Implementazione della paginazione — prova su arXiv (2026-08-19)

**Decisione.** Prima di estendere la paginazione a tutti gli adapter, implementata e validata solo su arXiv:

- `SearchRequest` ora ha un campo `depth` (`"bassa"|"media"|"alta"`, default `"media"`), la mappa `SEARCH_DEPTH_LEVELS` e il metodo `depth_targets()`. `__post_init__` applica il minimo obbligatorio (almeno una keyword, un autore o una venue) — implementato lato backend perché la UI di ricerca non esiste ancora.
- `query_terms()` aggiornata per riflettere il punto 8: restituisce solo i termini del **primo gruppo** di `keyword_include` (non più tutti i gruppi appiattiti), o gli autori come fallback. Cambio centralizzato, quindi si applica subito a tutti e 5 gli adapter (basso rischio, nessuna nuova dipendenza), a differenza della paginazione vera e propria.
- `BaseAdapter.fetch`/`_build_query` accettano ora un `offset: int = 0` (solo firma, non forza gli altri adapter a implementarlo — Python non verifica le firme sulle ABC).
- Solo `ArXivAdapter` usa davvero `offset` (mappato sul parametro `start` dell'API).
- Nuovo `services/utils/pagination.py` — `paginated_fetch(adapter, search_request, delay)`: cicla pagina per pagina, applica `filter_articles`, deduplica per `id`, si ferma quando raggiunge il target di `depth_targets()`, esaurisce il tetto di pagine aggiuntive, o la fonte restituisce una pagina non piena (fine dei risultati disponibili).
- **Nota**: `paginated_fetch` **non** passa per `safe_fetch_with_rate_limit`/la cache su file — la chiave di cache attuale non include l'offset di pagina, quindi pagine diverse colliderebbero sulla stessa voce. Da sistemare quando si estende la paginazione alle altre fonti.
- Validato con 3 test deterministici mockati (`suites/pagination/arxiv_pagination_test.py`) che coprono i tre motivi di stop (target raggiunto, tetto pagine esaurito, fonte esaurita) — non con chiamate live, per isolare la correttezza del meccanismo dalla variabilità del recall reale.

**Stato.** Implementato su arXiv. Da valutare se estendere agli altri 4 adapter così com'è, e da risolvere il limite della cache prima di generalizzare.

---

## 10. Dimensione di pagina derivata da fonte + depth, non da `limit` (2026-08-19)

**Contesto.** Dubbio: per la paginazione conviene sempre chiedere il massimo consentito da ciascuna API, per minimizzare il numero di richieste (è il numero di chiamate a far scattare i rate limit, non i byte)? Chiedere sempre il massimo assoluto però spreca banda/parsing quando il target è piccolo (es. `depth="bassa"`, target 15, non ha senso scaricare centinaia di risultati per usarne 15). Una singola costante "minimo dei massimi" condivisa tra le fonti eviterebbe questo, ma penalizzerebbe le fonti più permissive.

Verificati sulla documentazione ufficiale i massimi per richiesta di ciascuna fonte:

| Fonte | Max per richiesta (documentato) |
|---|---|
| arXiv | 2000 (`max_results`, in slice; consigliato affinare query con >1000 risultati) |
| Crossref | 1000 (`rows`) |
| DBLP | 1000 (`h`, "per motivi di banda") |
| OpenAlex | 200 (`per-page`) |
| Semantic Scholar (`/paper/search`, non `/bulk`) | 100 (`limit`; vincolo `limit+offset <= 1000` per ricerca) |

**Decisione.** Ogni adapter dichiara `MAX_PAGE_SIZE` (il proprio massimo documentato). `paginated_fetch` calcola la dimensione di pagina come `min(adapter.MAX_PAGE_SIZE, target)` — mai più di quanto serva per il livello di profondità, mai più di quanto la fonte permetta in una richiesta. Se il massimo della fonte è comunque inferiore al target (es. Semantic Scholar, max 100, con `depth="alta"` target 150), si procede comunque con la paginazione fino al tetto di pagine aggiuntive, invece di accontentarsi di una singola pagina sotto-target. `search_request.limit` non viene più letto per la dimensione di pagina dentro `paginated_fetch` — la funzione costruisce una copia della richiesta (`dataclasses.replace`) con `limit` impostato al valore calcolato, così `_build_query` la usa senza bisogno di un parametro separato.

**Stato.** Implementato (costanti su tutti e 5 gli adapter; consumate da `paginated_fetch`, quindi per ora effettive solo su arXiv).

---

## 11. Micro-ottimizzazione del filtro interno (2026-08-19)

**Contesto.** Il filtraggio (`filter_articles`) è strutturalmente O(n): ogni articolo va valutato indipendentemente dagli altri, quindi non esiste un modo per scendere sotto O(n) senza un indice precostruito — che qui non converrebbe comunque, dato che la lista arriva fresca a ogni ricerca e viene scansionata una volta sola (costruire l'indice costerebbe già O(n) e non si ripagherebbe mai). Con n al più nell'ordine delle migliaia (pagine fino a `MAX_PAGE_SIZE`, poche pagine per il tetto di `depth`), il costo è comunque trascurabile rispetto alla latenza di rete.

**Decisione.** Trovato uno spreco di costante in `_matches_keywords`: `.lower()` veniva richiamato sull'intero `haystack` (titolo+abstract) una volta per ogni termine controllato invece che una volta per articolo. Sistemato calcolando `haystack.lower()` una sola volta per articolo. Non cambia la classe di complessità, riduce solo il fattore costante su testi lunghi con molte keyword/gruppi.

**Stato.** Implementato.

---

## 12. Paginazione estesa a Crossref, DBLP, OpenAlex, Semantic Scholar (2026-08-19)

**Decisione.** Estesa la paginazione (validata su arXiv al punto 9) agli altri 4 adapter, ognuno con la propria convenzione nativa per l'offset:

- **Crossref**: la libreria `crossref.restful` non espone `rows`/`offset` nella catena `.query()...`; li aggiungiamo a mano sull'URL generato (`work.url`) con `httpx.URL(...).copy_merge_params(...)`.
- **DBLP**: parametro `f` (indice del primo hit), già previsto dalla API.
- **OpenAlex**: pagina per **numero di pagina**, non per offset assoluto — convertito con `page = (offset // per_page) + 1`.
- **Semantic Scholar**: parametro `offset` diretto, stesso modello del nostro `offset` interno.

Bug collaterale trovato e sistemato: `dblp.py` usava `asyncio.sleep` nel ramo di retry su 429/503 senza importare `asyncio` — sarebbe andato in errore silente (mai esercitato finora nei test, solo su rate limit reale). Rimosso anche un import inutilizzato (`from http import client`) nello stesso file.

Nota sul vincolo Semantic Scholar `limit+offset <= 1000`: non serve gestirlo esplicitamente — se una pagina lo sfora l'API risponde con errore, l'adapter lo traduce già in lista vuota, e `paginated_fetch` interpreta una pagina vuota come "fonte esaurita" fermandosi da solo (stesso meccanismo generico usato per il fine-risultati, non serve conoscere il vincolo specifico).

Validato con 4 nuovi test mockati (`suites/pagination/other_adapters_pagination_test.py`), uno per fonte, che verificano che la seconda richiesta usi il parametro di offset corretto nella convenzione nativa di ciascuna API.

**Stato.** Implementato su tutti e 5 gli adapter.

---

## 13. Una query per gruppo OR, non solo il primo (2026-08-22)

**Contesto.** Riscrivendo i test `singles/` (che verificano che un paper specifico venga trovato) è emerso un problema nella decisione del punto 8 ("solo il primo gruppo OR mandato all'API"): un `keyword_include` con più gruppi su argomenti diversi — lo stesso schema usato per **l'espansione semantica/acronimi** descritta nella proposta di tesi, es. `[["NLP"], ["Natural Language Processing"]]` — faceva sì che un paper che matcha solo un gruppo diverso dal primo non venisse **mai** scaricato dall'API, indipendentemente da quanta paginazione si facesse: il filtro interno non può recuperare un candidato che non è mai stato fetchato. Non un bug di per sé, ma una conseguenza non del tutto valutata del punto 8 che avrebbe rotto silenziosamente una funzionalità centrale della tesi.

**Decisione.** `paginated_fetch` ora interroga la fonte **una volta per ciascun gruppo OR** di `keyword_include` (non solo il primo), unendo e deduplicando (per `id`) i risultati prima del filtro finale. Per non far esplodere il numero di richieste con query_builder complessi (molti gruppi sinonimo), ogni gruppo ottiene sempre almeno una pagina gratuita, ma le pagine **aggiuntive** oltre alla prima attingono a un tetto **condiviso** tra tutti i gruppi (lo stesso `max_extra_pages` di `depth_targets()`, non moltiplicato per numero di gruppi). Si esce comunque appena si raggiunge il target di risultati filtrati, anche a metà tra un gruppo e l'altro.

Validato con un nuovo test mockato (`suites/pagination/arxiv_pagination_test.py::test_queries_each_or_group_separately_and_merges_results`) che verifica l'interrogazione separata dei due gruppi e l'unione dei risultati.

**Stato.** Implementato.

---

## 14. Fallback autore: campo dedicato solo dove serve davvero (2026-08-22)

**Contesto.** Riprendendo i test `singles/`, le ricerche solo-per-autore fallivano su arXiv: il fallback di `query_terms()` (nome dell'autore usato come termine generico) viene passato ai campi `ti:`/`abs:`, che su arXiv **escludono strutturalmente** gli autori (verificato con una chiamata diretta: 0 risultati cercando un cognome). Avevo inizialmente ipotizzato, basandomi su documentazione aggregata di terze parti, che il problema riguardasse anche DBLP e Semantic Scholar (richiedendo per loro un flusso a due passaggi autore→pubblicazioni). **Verificato empiricamente con chiamate dirette alle 5 API** invece di fidarsi della documentazione aggregata, il quadro reale è diverso:

| Fonte | La query generica trova gli autori? |
|---|---|
| arXiv | **No** (0 risultati verificati) — `ti:`/`abs:` sono strettamente titolo/abstract |
| Crossref | Sì (`query.bibliographic` include gli autori) |
| DBLP | Sì (`q` include gli autori, confermato: cercare un cognome restituisce esattamente i suoi paper) |
| Semantic Scholar | Sì (`/paper/search` include gli autori) |
| OpenAlex | **No** in modo affidabile (`search=` restituisce quasi solo rumore) — serve `filter=raw_author_name.search:` |

**Decisione.** Fix mirato solo dove necessario: se `keyword_include` è vuoto ed è presente `author`, arXiv usa `au:"nome"` invece di `ti:`/`abs:`; OpenAlex usa `filter=raw_author_name.search:nome` (con `search` vuoto) invece del generico `search=`. Crossref, DBLP e Semantic Scholar restano invariati — il loro fallback attuale (nome come termine generico) funziona già correttamente, verificato con chiamate reali.

Lezione operativa: la documentazione aggregata/di terze parti su comportamenti impliciti delle API (cosa matcha un campo di ricerca "generico") va verificata con una chiamata reale prima di prendere decisioni architetturali — due volte in questa sessione (qui e sulla sintassi booleana) le fonti aggregate erano fuorvianti o incomplete rispetto al comportamento reale osservato.

**Stato.** Implementato su arXiv e OpenAlex.

---

## 15. Test `singles`: keyword distintive, target verificati per fonte, bugfix Crossref (2026-08-22)

**Contesto.** Riprendendo i test `singles/` (rimandati al punto 6) con la paginazione reale disponibile, sono emersi più problemi distinti mentre si tarava ogni caso:

- Le keyword generiche (`"AI"`, `"LLM"`, `"robotics"`, e perfino `"complex networks"` da solo — 927 risultati in cs.* su arXiv) non portano il paper cercato entro il budget di pagine, anche quando il termine compare letteralmente nel titolo. Sistemato scegliendo per ogni caso una frase abbastanza lunga/distintiva da comparire quasi certamente in cima al ranking per rilevanza (verificato con chiamate dirette, non a tentativi).
- Alcuni `keyword_exclude` erano auto-lesivi: es. `exclude=["Situ"]` su un paper il cui titolo contiene "In-situ" — la sottostringa matcha e scarterebbe il target stesso. Rimossi gli exclude non essenziali al test.
- **Crossref indicizza un universo diverso**: i target usati per le altre 4 fonti sono preprint arXiv, in gran parte privi di DOI Crossref — nessuna query li avrebbe mai trovati lì. Sostituiti con paper (stessa autrice, Elisabetta Rocchetti) verificati realmente presenti su Crossref via chiamata diretta.
- **2 bug reali in `crossref.py`** (non nei test): (1) `_normalize` costruiva `institution_author` includendo affiliazioni senza campo `name` come `None` nel set, facendo fallire la validazione pydantic di `Article` per l'intero articolo — e quindi l'intera pagina, portando via con sé anche i candidati validi; (2) `entry['title'][0]` esplodeva su record Crossref privi di titolo (capita su record legacy/incompleti). Sistemati filtrando i `None` prima di costruire la lista e scartando le entry senza `URL`/`title`/data invece di far fallire l'intera pagina.
- Per la ricerca solo-autore su Crossref, controintuitivamente il **cognome da solo** ranka meglio del nome completo (`"Rocchetti"` → target in posizione ~33/100; `"Elisabetta Rocchetti"` → non trovato nei primi 100). Annotato nel test.
- **Attenzione alle frasi "ricostruite"**: per rendere una keyword più distintiva è tentante concatenare parole chiave saltando articoli/preposizioni (es. "Unveiling Transformer Perception Input Manifolds" invece del titolo vero "...Perception **by Exploring** Input Manifolds"). Crossref la trova comunque (la sua ricerca è a rilevanza, non richiede il match esatto), ma il **nostro filtro interno richiede una sottostringa letterale** — quindi l'articolo veniva scartato dal filtro anche quando l'API lo trovava correttamente. Le keyword nei test vanno sempre verificate come sottostringa verbatim del titolo/abstract reale, non solo "concettualmente" presenti.

- **Bug reale in `semanticScholar.py`**: a differenza degli altri 4 adapter, `fetch` non aveva alcun retry su 429/503 — un rate limit (frequente dopo tante run live in una sessione) faceva fallire silenziosamente la pagina (lista vuota) invece di riprovare. Aggiunto lo stesso pattern di retry con backoff (5s/10s/15s) già usato da arXiv/OpenAlex/DBLP.

Il fix del retry ha aiutato ma non basta: dopo tante run live in questa sessione la quota di Semantic Scholar è rimasta in 429 persistente anche coi retry (5 falliti su 7, peggio di prima). Accantonato temporaneamente — non è un problema di query/codice, va solo ripreso quando la quota si è svuotata.

- **Bug reale in `openAlex.py`**: `entry['publication_date']` a volte è presente come chiave ma con valore `null` (metadati incompleti), e `datetime.fromisoformat(None)` esplode facendo fallire l'intera pagina — stesso pattern già visto due volte su Crossref. Sistemato controllando la verità del valore (`entry.get('publication_date')`) invece della sola presenza della chiave, e scartando le entry senza titolo o id/doi.

- **Bug di semantica AND/OR in arXiv e OpenAlex**: `query_terms()` restituisce i termini di **un solo gruppo AND** (vedi punto 13), ma `_build_query` di arXiv e OpenAlex li univa in OR invece che in AND — retaggio di quando `query_terms()` appiattiva tutti i gruppi. Con un gruppo a più termini (es. `["YOLO26", "adenovirus"]`) questo manda all'API una query più larga di quella richiesta: un termine generico da solo (qui "adenovirus") inonda i risultati di rumore estraneo, affogando il target entro il budget di pagine. Corretto unendo in AND (coerente con `_matches_keywords` e con le capacità booleane reali verificate al punto 7). DBLP univa già in AND di default (nessuna modifica necessaria); Crossref non ha booleani reali (nessuna modifica necessaria); Semantic Scholar rimandato.
- **Filtro di dominio CS di OpenAlex più restrittivo del previsto**: alcuni paper reali ed esistenti (verificati) non hanno il topic "Computer Science" assegnato — o perché classificati sotto un altro campo (es. un paper ML di sicurezza classificato altrove) o perché troppo recenti per la pipeline di classificazione di OpenAlex (topic vuoto `[]`). Il filtro fisso `topics.field.id:17` dell'app li esclude sempre, indipendentemente dalla query — non è un bug, ma un limite noto della classificazione automatica di OpenAlex. Tre casi di test sono stati sostituiti con target verificati avere topic CS assegnato.

- **Bug reale in `dblp.py`**: DBLP restituisce `venue` come stringa semplice quando c'è un solo valore e come lista quando ce ne sono di più (lo stesso pattern già gestito correttamente per `author`), ma `_normalize` estraeva il venue solo nel caso lista — quindi `venue` era sempre `None` e ogni filtro per `journal` falliva sempre, silenziosamente. Sistemato gestendo entrambi i casi.
- Anche su DBLP, `"hyperspectral imaging"` da solo (1575 risultati totali) non basta a portare il paper nel budget di pagine nonostante la paginazione multi-gruppo: sostituito con una frase quasi completa del titolo (2 risultati totali, target in cima).

**Stato.** Implementato (bugfix + keyword riviste su arXiv, Crossref, OpenAlex, DBLP; Semantic Scholar rimandato per rate limit persistente).

---

## 16. Cache collegata alla paginazione, chiave basata sulla query effettiva (2026-08-22)

**Contesto.** `paginated_fetch` (punto 9) non passava dalla cache su file: la chiave di `file_cache` era basata sull'intera `SearchRequest`, che non teneva conto dell'offset di pagina (pagine diverse avrebbero collìso sulla stessa voce). Ripensandoci: il problema vero non era solo l'offset mancante, ma che la chiave si basava su campi (autore, journal, anno) che **non influenzano affatto la richiesta HTTP reale** — restano solo nel filtro interno (punto 1). Due ricerche con la stessa keyword ma autore diverso avrebbero prodotto due chiamate di rete identiche invece di condividere la cache.

**Decisione.** La chiave di `file_cache` ora si basa su `adapter._build_query(search_request, offset)` — cioè sulla richiesta che l'adapter costruirebbe davvero — invece che sul repr dell'intera `SearchRequest`. Aggiunto `cached_raw_fetch` (in `search.py`, decorato con `@file_cache`, offset incluso): fetch grezzo con rate limit e cache, usato sia da `paginated_fetch` sia da `safe_fetch_with_rate_limit` (che ora è un sottile wrapper: fetch grezzo cachato + filtro interno), eliminando la duplicazione tra le due funzioni.

**Nota collaterale**: la cache su file, essendo condivisa tra run reali e test mockati, può far bypassare un mock `respx` se una chiamata live precedente ha già popolato la stessa chiave — aggiunto un `conftest.py` in `suites/pagination/` che isola `CACHE_FILE` su un path temporaneo per test, altrimenti i test di paginazione diventerebbero non deterministici in base a cosa è stato cercato dal vivo in sessione.

**Sleep ridondante rimosso**: `file_cache` aveva anche un `sleep(3)` fisso dopo ogni cache-miss, indipendente dal `delay` passato — reso visibile dal punto sopra (i test di paginazione, con `delay=0.0` per essere istantanei, prima non passavano da `file_cache`). Analisi: `cached_raw_fetch` già aspetta `delay` *prima* di ogni chiamata reale (solo sui miss, essendo dentro la funzione decorata), quindi si sommavano due attese da ~3s per ogni pagina non cachata (~6s+ totali). L'unica fonte con un vincolo di cadenza esplicito e documentato è arXiv ("3 second delay tra le chiamate"), già soddisfatto dal solo `delay` prima della chiamata; Semantic Scholar (l'unica in difficoltà in sessione) sembra avere un limite a finestra più lunga (quota oraria/giornaliera) che un secondo sleep per chiamata non avrebbe comunque risolto. Rimosso: un'unica attesa (`delay`, già configurabile) invece di due scollegate. Suite di test di paginazione passata da ~56s a ~6s.

**Da fare in futuro**: la cache su file non ha scadenza (TTL) né limite di dimensione — cresce indefinitamente e può servire risultati sempre più vecchi per query ripetute nel tempo (un paper pubblicato dopo che una ricerca è già in cache non comparirebbe finché la query non cambia). Non urgente per il prototipo, ma da affrontare prima di un uso reale prolungato.

**Stato.** Implementato (nota "da fare in futuro" sopra esclusa).

---

## 17. Orchestratore di ricerca multi-fonte (2026-08-22)

**Contesto.** Fino ad ora ogni fonte si interrogava singolarmente (`paginated_fetch(adapter, request)`); mancava qualcosa che le interrogasse tutte insieme e unisse i risultati — il pezzo che rende la pipeline costruita finora effettivamente utilizzabile come "ricerca unica".

**Decisioni.**
- **Fonti selezionabili**, non sempre tutte e 5: nuovo `services/utils/orchestrator.py` con `ADAPTER_REGISTRY` (nome fonte → classe adapter, stessi nomi già usati in `Article.source`) e `resolve_adapters(source_names)` che converte un elenco di nomi in istanze (`None`/vuoto = tutte).
- **Fan-out in parallelo** (`asyncio.gather`) su `paginated_fetch` per ciascuna fonte selezionata.
- **Isolamento dei fallimenti**: se una fonte solleva un'eccezione (dopo aver già esaurito i propri retry interni), viene loggata e ignorata — le altre fonti proseguono comunque, non fanno fallire l'intera ricerca.
- **Nessuna deduplicazione tra fonti**, per scelta esplicita: il vero motore di merge/conflict-resolution (DOI/titolo/similarità, con scelta della fonte più autorevole) è una feature a parte descritta nella proposta di tesi, non ancora costruita. Per ora `search_all_sources` restituisce tutti i risultati di tutte le fonti concatenati, duplicati inclusi.

Validato con 6 test mockati (`suites/orchestrator/orchestrator_test.py`, `paginated_fetch` sostituito con un doppio per isolare la logica di orchestrazione da rete/paginazione già testate a parte) più una verifica live con due fonti reali.

**Stato.** Implementato. Non ancora esposto come endpoint HTTP (nessuna route `/search` esiste ancora — solo `/users` e `/login`).

---

## 18. Endpoint `POST /api/search` (2026-08-22)

**Decisione.** Nuova route `backend/app/routes/ricerca.py`, montata in `main.py` sotto `/api` come le altre. `SearchRequestIn` (Pydantic, non la dataclass interna `SearchRequest`) valida il corpo della richiesta via HTTP; il campo `sources` è opzionale e passa direttamente a `search_all_sources`. La validazione interna di `SearchRequest.__post_init__` (minimo obbligatorio, `depth` valido) e quella di `resolve_adapters` (nomi fonte sconosciuti) vengono catturate e tradotte in `HTTPException(422)` con il messaggio originale, invece di propagarsi come errore 500. Non c'è ancora autenticazione su questa route — nessuna route del progetto la richiede oggi, non solo questa.

Validato con 4 test (`suites/routes/ricerca_test.py`) che chiamano la funzione della route direttamente (stesso approccio "mock del livello sotto" usato per l'orchestratore), niente `TestClient`/avvio reale dell'app — richiederebbe una connessione Mongo vera nel lifespan di `main.py`, fuori scope per ora.

**Dipendenze mancanti trovate e installate** (preesistenti, non legate a oggi): il progetto non ha alcun `requirements.txt`/`pyproject.toml` che tracci le dipendenze, e nell'ambiente mancavano `python-jose` (usato da `utenti.py` per i JWT) e `python-multipart` (richiesto da FastAPI per il form OAuth2 di `/login`) — senza questi `main.py` non riusciva proprio ad avviarsi, indipendentemente dalla nuova route. Verificato dopo l'installazione che l'app importa correttamente e lo schema OpenAPI espone `/api/users`, `/api/login`, `/api/search`.

**Stato.** Implementato.

---

## 19. Bug: cache su path relativo si rompeva a seconda della working directory (2026-08-23)

**Contesto.** Avviando davvero il backend (`cd backend && uvicorn app.main:app`, il modo naturale di lanciarlo, coerente con `if __name__ == "__main__"` in `main.py`) per collaudare il primo componente frontend, le ricerche restituivano sempre 0 risultati anche per query palesemente valide — verificato che l'adapter e l'orchestratore, chiamati direttamente in Python, funzionavano correttamente. Il problema: `CACHE_FILE = Path("backend/app/services/utils/evaluation_cache.json")` in `caching.py` è un path **relativo**, che presume la working directory sia la radice del repo (vero quando `pytest` gira da lì, falso quando si avvia il server da dentro `backend/`). Con CWD sbagliata, `save_cache()` tentava di scrivere in una cartella inesistente (`backend/backend/...`), sollevando `FileNotFoundError` — e l'orchestratore, per design (punto 17: isolamento dei fallimenti), catturava l'eccezione e scartava silenziosamente anche i risultati già recuperati con successo dalla fonte.

**Decisione.** `CACHE_FILE` ora è ancorato alla posizione del file (`Path(__file__).resolve().parent / "evaluation_cache.json"`), non alla working directory del processo — corretto indipendentemente da dove viene avviato il server.

Verificato dal vivo dopo il fix: ricerca "attention mechanism" su arXiv, profondità bassa → 15 risultati mostrati correttamente nel frontend.

**Stato.** Implementato.

**Nota (2026-08-26).** Il comando di avvio indicato sopra (`cd backend && uvicorn app.main:app`) non è più corretto: `main.py` importava con lo stile `from app.X import ...` (relativo a `backend/`), mentre ormai *tutto* il resto del backend (routes, services, adapters, tests) usa lo stile `from backend.app.X import ...` (relativo alla radice del repo) — un'incoerenza scoperta avviando il server per collaudare il menu profilo. Corretto allineando i 3 import di `main.py` allo stile dominante. Il comando di avvio corretto è ora, dalla **radice del repo**: `uvicorn backend.app.main:app --reload`.
## 20. Loghi delle fonti: asset ufficiali con varianti chiaro/scuro invece di uno sfondo fisso (2026-08-26)

**Contesto.** Il badge di ogni fonte (`SourceLabel`, `SourceIcon`) mostrava il logo ufficiale su uno sfondo bianco fisso, per garantire contrasto sia in tema chiaro che scuro. Il problema: alcuni loghi ufficiali (OpenAlex nero, testo Semantic Scholar `#12233B`, testo Crossref `#4F5858`) sono pensati per sfondi chiari e perdono leggibilità se il tema dell'app passa a scuro; uno sfondo nero fisso, sondato come alternativa, avrebbe rotto allo stesso modo i loghi pensati per sfondi chiari. Non esiste un unico colore di sfondo compatibile con tutte le varianti ufficiali reperite.

**Decisione.** L'utente ha fornito direttamente le varianti dark/light ufficiali per OpenAlex e Semantic Scholar. `sourceLogos.js` ora associa a ogni fonte fino a due asset (`light`/`dark`); `SourceIcon` alterna automaticamente le due immagini con le classi Tailwind `dark:hidden` / `hidden dark:block`, seguendo il tema dell'app senza bisogno di uno sfondo dedicato. Per le fonti con una sola variante disponibile e poco leggibile sul tema opposto, l'icona può restare avvolta in un piccolo riquadro (`chip: 'dark'` o `'light'`) che garantisce sempre lo sfondo giusto per quell'asset — usato per ora solo da arXiv (solo "Darkmode").

Crossref è referenziato direttamente dall'URL ufficiale (`https://assets.crossref.org/logo/crossref-logo-landscape-200.svg`), non scaricato in locale, seguendo le linee guida di branding di Crossref ("so you automatically get updated files"). Sia Crossref (testo grigio scuro fisso `#4F5858`) che DBLP (testo grigio chiaro fisso) sono stati portati senza riquadro, su richiesta esplicita dell'utente, e ingranditi (`scale: 1.35` in `sourceLogos.js`) per migliorarne la visibilità. Per Crossref il risultato è leggibile in entrambi i temi; per DBLP il testo resta invece praticamente invisibile in tema scuro (resta visibile solo l'iconcina blu/gialla) — segnalato esplicitamente all'utente, che ha scelto comunque di tenerlo così com'è.

Nelle card dei risultati di ricerca (`SearchResults.jsx`), il logo della fonte è mostrato da solo (senza più il nome scritto accanto) dentro un pallino colorato per fonte. Qui l'ingrandimento di Crossref/DBLP inizialmente usava CSS `transform: scale()`, che ingrandisce solo visivamente senza far crescere lo spazio riservato nel layout: il pallino, dimensionato sul contenuto (`inline-flex`), non si allargava di conseguenza e il logo sbordava fuori dal bordo arrotondato. Corretto usando `zoom` al posto di `transform: scale()` in `SourceIcon`: a differenza di `transform`, `zoom` è preso in considerazione dal calcolo del layout, quindi il contenitore si adatta correttamente.

**Stato.** Implementato.

## 21. Scheletro di navigazione multi-pagina: sidebar + React Router (2026-08-26)

**Contesto.** Finora il frontend era una singola pagina (`SearchPage`) mostrata subito dopo il login. L'utente ha chiesto di introdurre una struttura a più pagine: una sidebar a scorrimento per navigare, una pagina "Profilo" (impostazioni), e una pagina "Ricerca" con due sottopagine — "Paper e ricerche salvate" (la ricerca attuale più uno spazio per le ricerche salvate) e "Membri del team".

**Decisione.** Introdotta `react-router-dom`, scelta esplicitamente dall'utente rispetto a un semplice stato interno per la pagina attiva: garantisce URL reali per ogni pagina (bookmarkabili) e supporto nativo al tasto indietro/avanti del browser.

Struttura delle route (tutte protette dietro il login, gestito ancora con lo stesso meccanismo a token in `localStorage` di prima — `App.jsx` mostra `AuthForm` se non c'è un token, altrimenti monta il router):
- `/profilo` → `ProfilePage` (placeholder, "In arrivo")
- `/ricerca/paper` → `SearchPapersPage` (la vecchia `SearchPage`, spostata in `src/pages/`, con in più una sezione placeholder "Ricerche salvate" sopra al form di ricerca)
- `/ricerca/team` → `TeamPage` (placeholder, "In arrivo")
- `/ricerca` e ogni rotta non riconosciuta reindirizzano a `/ricerca/paper` (pagina di atterraggio di default)

Layout: `AppLayout` (route madre con `<Outlet/>`) monta una `Sidebar` fissa a sinistra (logo in alto, voci di navigazione al centro in un'area scrollabile — `overflow-y-auto`, coerente con la richiesta di sidebar "a scorrimento" — bottone "Esci" in basso) e il contenuto della pagina attiva a destra. Il logo "PapérDex" e il bottone "Esci", prima nell'header di `SearchPage`, sono stati spostati nella sidebar, dato che ora sono elementi persistenti su tutte le pagine e non specifici della ricerca.

Le sottopagine di "Ricerca" sono mostrate come voci indentate sotto un'intestazione "RICERCA" nella sidebar, non come una tab-bar interna alla pagina — coerente con la formulazione dell'utente ("una sottopagina... e quella dei membri del team").

Verificato dal vivo con Playwright: navigazione tra le tre pagine con URL ed evidenziazione della voce attiva corretti, nessun errore in console, ricerca e logout ancora funzionanti dopo lo spostamento.

**Sidebar retrattile.** Su richiesta dell'utente, la sidebar è comprimibile (`w-64` ↔ `w-20`, toggle con un bottoncino circolare a sbalzo sul bordo destro). Il logo deve restare sempre visibile — requisito esplicito dell'utente — quindi da compressa mostra un monogramma "P" nello stesso stile (font, contorno viola, ombra) invece del wordmark completo. Le voci di navigazione, prive finora di icone, hanno ricevuto icone SVG inline minimali (persona, lente di ingrandimento, gruppo di persone, per Profilo/Paper/Team) così che restino comprensibili anche da compresse (solo icona + tooltip via attributo `title`); anche il bottone "Esci" segue lo stesso pattern icona+testo/solo icona.

**Stato.** Implementato (scheletro). Pagine "Profilo" e "Membri del team" sono placeholder vuoti; "Ricerche salvate" è un placeholder statico non collegato a nessuna persistenza. **Regola stabilita dall'utente per il futuro: ogni nuova pagina aggiunta all'app va indicizzata nella sidebar.**

La variante scura di OpenAlex, fornita con `fill="currentColor"` (pensata per ereditare il colore del testo circostante), è stata modificata nella copia locale in `fill="#FFFFFF"`: gli SVG caricati via `<img src="...">` sono renderizzati in un contesto isolato e non ereditano il `color` CSS della pagina, quindi `currentColor` al loro interno risolve al colore di default dell'SVG (nero), non a quello del tema — per farlo funzionare davvero servirebbe inlineare l'SVG nel DOM, complessità non necessaria dato che questa copia locale serve solo per lo sfondo scuro dell'app.

arXiv resta segnalato come da rivedere in futuro (unica variante disponibile: "Darkmode").

Verificato dal vivo con screenshot Playwright in tema chiaro e scuro.

**Stato.** Implementato.

## 22. Menu profilo in alto a destra, con nome utente reale e sottopagina "API keys" (2026-08-26)

**Contesto.** L'utente ha chiesto un menu profilo che mostri nome e cognome dell'utente autenticato invece della semplice etichetta "Profilo", con un menù che si espande verso il basso per raggiungere le pagine "Profilo" e "API keys" (quest'ultima nuova). Posizione richiesta inizialmente "in alto a sinistra" nella sidebar, poi corretta dall'utente in "in alto a destra" — chiarito trattarsi non della sidebar (che resta dedicata alla sola navigazione) ma di una barra in alto nell'area principale, con l'account in alto a destra del contenuto: pattern comune (Notion, GitHub) di sidebar per la navigazione + account nell'angolo in alto a destra.

**Decisione.** Aggiunto un endpoint `GET /api/users/me` nel backend (protetto: richiede un JWT valido nell'header `Authorization`), che decodifica il token, recupera l'utente da MongoDB e restituisce `{name, email}`. Finora nessuna rotta del backend verificava davvero il token — `/api/search` è tuttora raggiungibile senza autenticazione, gap preesistente non affrontato qui. Per supportare la nuova chiamata autenticata, `apiRequest` (`client.js`) ora allega automaticamente l'header `Authorization: Bearer <token>` a ogni richiesta, leggendo il token da `localStorage` (`TOKEN_KEY`, spostato qui da `App.jsx` per essere condiviso).

`ProfileMenu` è un componente a sé (`src/components/ProfileMenu.jsx`), montato in una nuova barra in cima ad `AppLayout` (sopra all'`<Outlet/>`, a fianco della sidebar — non dentro di essa), allineata a destra. Mostra `user.name` (recuperato da `/users/me` al mount, con fallback "Profilo" durante il caricamento) e si apre in un piccolo pannello flottante ancorato in basso a destra del bottone (`position: absolute`, `right-0 top-full`), con due voci — "Profilo" (`/profilo`) e "API keys" (`/profilo/api-keys`, pagina placeholder nuova). Si apre automaticamente quando l'URL corrente è già sotto `/profilo`, restando comunque apribile/richiudibile manualmente.

Di conseguenza, le pagine "Profilo"/"API keys" sono ora indicizzate tramite il menu profilo in alto a destra, non nella sidebar — la regola "ogni nuova pagina va indicizzata nella sidebar" (punto 21) si applica alle pagine di navigazione generale (accanto a "Ricerca"); le pagine legate all'account dell'utente vivono invece nel menu profilo.

**Bug scoperto e corretto durante il collaudo.** Riavviando il backend per testare `/users/me`, il server non si avviava (`ModuleNotFoundError: No module named 'backend'`): `main.py` era l'unico file dell'intero backend a importare con lo stile `from app.X import ...` (relativo a `backend/`), mentre ogni altro file (routes, services, adapters, test) usa `from backend.app.X import ...` (relativo alla radice del repo) — vedi nota aggiunta al punto 19. Corretto allineando i 3 import (e la stringa passata a `uvicorn.run` nel blocco `__main__`) allo stile dominante.

Verificato dal vivo: nome utente reale mostrato in alto a destra, apertura/chiusura del pannello, navigazione a Profilo e API keys con evidenziazione corretta, nessun errore in console.

**Stato.** Implementato (scheletro). "API keys" è un placeholder vuoto, come le altre pagine non ancora sviluppate.

## 23. "Paper e ricerche salvate" divisa in due pagine; rinominato "ricerche salvate" → "query salvate" (2026-08-26)

**Contesto.** La sottopagina "Paper e ricerche salvate" (punto 21) univa in una sola pagina la ricerca vera e propria e un placeholder per le ricerche salvate. L'utente ha chiesto di separarle in due pagine distinte, e di rinominare "ricerche salvate" in "query salvate" ovunque sul sito, da qui in avanti.

**Decisione.** Nuova pagina `SavedQueriesPage` (`/ricerca/query-salvate`, placeholder "Nessuna query salvata per ora."), separata da `SearchPapersPage` (`/ricerca/paper`, che ora contiene solo la ricerca, senza più la sezione placeholder in cima). Nella sidebar, la voce "Paper e ricerche salvate" è diventata due voci sotto "RICERCA": "Paper" (icona lente d'ingrandimento) e "Query salvate" (nuova icona segnalibro).

**Stato.** Implementato (scheletro). "Query salvate" è un placeholder vuoto.

## 24. Pagina Home, raggiungibile cliccando il logo (2026-08-26)

**Contesto.** L'utente ha chiesto una pagina "Home" con una breve presentazione della piattaforma, il logo in grande e la tagline "Gotta find 'em all" (parodia di "Gotta catch 'em all" di Pokémon, coerente con lo stile del logo già ispirato al logo Pokémon), raggiungibile cliccando il logo.

**Decisione.** Nuova pagina `HomePage` (`/home`): logo "PapérDex" a dimensione grande (stesso font/contorno viola/ombra della sidebar, solo più grande), tagline in corsivo sotto al logo, breve paragrafo di presentazione della piattaforma. Il logo nella sidebar (`Sidebar.jsx`) — prima un semplice `<h1>` statico — è ora un `<Link to="/home">`, sia nella variante espansa (wordmark) che compressa (monogramma "P"). La pagina di atterraggio di default dopo il login resta `/ricerca/paper` (non modificata): la Home è raggiungibile on-demand cliccando il logo, non è stata impostata come landing automatica, dato che non è stato richiesto esplicitamente.

Verificato dal vivo in entrambi i temi: clic sul logo porta a `/home`, contenuto renderizzato correttamente.

**Stato.** Implementato.

## 25. Footer, per ora solo testo "UniMi - Università degli Studi di Milano" (2026-08-26)

**Contesto.** L'utente ha chiesto un footer globale, inizialmente pensato per contenere il logo ufficiale UniMi. Non avendo però i permessi per usare le immagini del logo e viste le norme stringenti dell'ateneo sul loro utilizzo (diversamente da Crossref, che invece incoraggia esplicitamente il riferimento al proprio logo), si è deciso di non usare alcuna immagine.

**Decisione.** Nuovo componente `Footer.jsx`, montato in `AppLayout` sotto l'`<Outlet/>` (visibile in fondo a ogni pagina). Contiene solo il testo "UniMi - Università degli Studi di Milano", nessun logo.

**Stato.** Implementato.

## 26. Bottone "Esci" spostato in fondo al menu profilo (2026-08-26)

**Contesto.** Il logout viveva in un bottone a sé in fondo alla sidebar. L'utente ha chiesto di spostarlo in fondo alla tendina del menu profilo (punto 22), insieme a "Profilo" e "API keys".

**Decisione.** Rimosso il bottone dedicato dalla sidebar (che quindi perde la prop `onLogout`, non più necessaria). `ProfileMenu` riceve ora `onLogout` da `AppLayout` (passato prima a `Sidebar`, ora a `ProfileMenu`) e lo espone come ultima voce del pannello a tendina, separata dalle altre due da un divider.

Verificato dal vivo: bottone non più presente in sidebar, presente in fondo al menu profilo, logout ancora funzionante.

**Stato.** Implementato.

## 27. Sidebar e menu profilo responsive per schermi piccoli (2026-08-26)

**Contesto.** La sidebar era sempre visibile e occupava spazio fisso (`w-64`/`w-20`) indipendentemente dalla larghezza dello schermo — su mobile avrebbe schiacciato eccessivamente il contenuto. L'utente ha chiesto di sistemare sidebar e menu profilo anche per schermi piccoli.

**Decisione.** Sotto il breakpoint Tailwind `md` (768px), la sidebar diventa un cassetto a scomparsa: `position: fixed`, fuori schermo di default (`-translate-x-full`), aperto da un bottone hamburger nella barra in alto (visibile solo sotto `md`, `AppLayout.jsx`) con uno sfondo semitrasparente dietro (chiudibile cliccandolo). Cliccare una voce di navigazione o il logo chiude automaticamente il cassetto (`onCloseMobile`, passato a ogni `NavLink`/`Link`). Da `md` in su il comportamento resta quello preesistente: sidebar sempre visibile, in flusso normale, con il toggle a compressione (icona-rail).

Il bottone di compressione (icona-rail) è nascosto sotto `md` (`hidden md:flex`), dato che su mobile la sidebar è già a piena larghezza quando aperta e non ha senso una modalità "compressa" per un cassetto che normalmente è chiuso del tutto. Per evitare un caso limite (un utente comprime la sidebar da desktop, poi ridimensiona la finestra sotto `md` senza ricaricare: le etichette sparirebbero comunque per via dello stato `collapsed`, ma dentro un cassetto ormai a piena larghezza), lo stato "compresso" è ora derivato (`collapsed = collapsedPref && isDesktop`) da un hook `useIsDesktop` basato su `window.matchMedia('(min-width: 768px)')` con listener sul resize live, non più uno stato grezzo.

Il menu profilo (`ProfileMenu.jsx`) non ha richiesto modifiche strutturali: il pannello a tendina (`w-32`, ancorato a destra del bottone) resta ben contenuto anche su schermi stretti, verificato a 375px di larghezza.

Verificato dal vivo con Playwright a 375×812 (mobile) e 1400×800 (desktop): apertura/chiusura del cassetto via hamburger e via sfondo, chiusura automatica al click su una voce, hamburger nascosto da desktop, comportamento a compressione desktop invariato, menu profilo leggibile e ben contenuto su entrambe le larghezze.

**Stato.** Implementato.

## 28. Pagina "Ricerche" (progetti di ricerca), distinta dalla sezione "Ricerca" (ricerca paper) (2026-08-26)

**Contesto.** L'utente ha chiesto una pagina "Ricerche" che mostri le ricerche create dall'utente e quelle a cui partecipa, in due colonne affiancate. Il backend ha già modelli pensati esattamente per questo (`Project`, `Research`, `Invite` in `schemas/models.py`, non ancora esposti da alcuna route): un `Research` collega uno `User` a un `Project` tramite un `Filter`, e `Invite` gestisce le partecipazioni ad un progetto altrui — un concetto di "progetto di ricerca collaborativo", distinto dalla ricerca di paper vera e propria.

**Decisione.** Data l'ambiguità del nome — "Ricerche" (progetti) è facilmente confondibile con la sezione già esistente "RICERCA" (ricerca paper) — le due cose sono state tenute volutamente separate nella sidebar: "Ricerche" è una nuova voce di primo livello a sé (icona cartella), posizionata sopra alla sezione "RICERCA", non annidata al suo interno. Nuova pagina `ResearchesPage` (`/ricerche`): due colonne affiancate (`grid md:grid-cols-2`) — "Create da te" e "A cui partecipi" — entrambe per ora con solo uno stato vuoto placeholder, dato che il backend non espone ancora alcuna route per `Project`/`Research`/`Invite`.

Verificato dal vivo: voce in sidebar, navigazione, due colonne renderizzate correttamente, nessun errore console.

**Stato.** Implementato (scheletro). Nessuna route backend collegata: il contenuto delle due colonne è statico.

## 29. Home ridefinita come schermata pre-login; "Ricerche" pagina principale post-login (2026-08-27)

**Contesto.** La Home (punto 24) era una pagina interna all'app autenticata, raggiungibile cliccando il logo. L'utente ha chiesto di ridefinirla: la Home deve essere *solo* la schermata mostrata a chi non ha ancora fatto l'accesso (niente sidebar, un bottone che porti al login), mentre "Ricerche" diventa la pagina principale dopo l'accesso.

**Decisione.** `App.jsx` ora distingue tre stati invece di due: senza token → `HomePage` (schermata pubblica, fuori da `AppLayout`/`BrowserRouter`, quindi senza sidebar/topbar/footer); un nuovo stato locale `showAuth` (attivato dal bottone "Accedi" su `HomePage`) mostra `AuthForm`; con token → l'app autenticata con `AppLayout`. `handleLogout` resetta anche `showAuth`, così dopo il logout si torna alla Home pubblica, non direttamente al form di login.

`HomePage` è stata riscritta come schermata autonoma a tutta pagina (prima presumeva lo sfondo/contenitore di `AppLayout`), con in fondo un bottone "Accedi" (`onLoginClick`).

La route index e il wildcard dell'app autenticata puntano ora a `/ricerche` invece di `/ricerca/paper`. La route `/home` è stata rimossa dal router autenticato (la Home non esiste più lì); il logo nella sidebar, che ci puntava, ora porta a `/ricerche`.

Verificato dal vivo l'intero flusso: Home pubblica senza sidebar → Accedi → login → atterraggio su `/ricerche` → click sul logo resta su `/ricerche` → logout torna alla Home pubblica. Nessun errore console.

**Stato.** Implementato.

## 30. Ricerca rapida vs ricerca agganciata a una Ricerca; creazione/eliminazione Ricerche (2026-08-27)

**Contesto.** Discusso con l'utente (senza implementare) se dividere la schermata di ricerca paper in due varianti: una libera, senza contesto, che non permette di salvare i paper; una raggiunta da una Ricerca specifica (pagina "Ricerche", punto 28), che permette di aggiungere i paper trovati a quella Ricerca. L'utente ha approvato il disegno e ha chiesto di implementarlo, aggiungendo anche creazione ed eliminazione (solo per il proprietario) delle Ricerche.

**Modello dati.** Il backend aveva già `Project` (contenitore), `Research` (partecipazione di uno `User` a un `Project`) e `AddedArticle` (un `Article` salvato su una `Research`), ma senza alcuna route che li usasse. Corretto un gap reale: `Project` non aveva un campo proprietario — aggiunto `owner: Link["User"]`. `Research.filter` (obbligatorio) è stato reso opzionale: collegare un filtro di ricerca vero e proprio a ogni partecipazione è un lavoro futuro, non necessario per creare/eliminare una Ricerca oggi.

**Bug scoperti e corretti durante l'implementazione:**
- `PastDate` (usato per `creation_date`/`date`) rifiuta anche la data odierna, non solo quelle future (verificato empiricamente) — impossibile quindi valorizzarli con `date.today()` al momento della creazione. Cambiati in `date` semplice.
- `Project.find_all(fetch_links=True)`/`Research.find_all(fetch_links=True)` sollevano `TypeError: 'AsyncIOMotorLatentCommandCursor' object can't be awaited` con la combinazione di versioni installate (beanie 2.0.0, pymongo 4.17.0) — un problema di compatibilità tra le librerie, non del codice applicativo. Risolto evitando `fetch_links` del tutto: confrontando gli id tramite `link.ref.id` (accessibile su un `Link` non risolto, senza round-trip al database) invece di richiedere il documento collegato per intero.
- Lo stesso bug di `load_dotenv()` senza percorso esplicito del punto 19/nota (2026-08-26) era presente anche in `routes/utenti.py` e in tutti e 5 gli adapter (`USER_EMAIL`, `OPENALEX_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY` risolvevano silenziosamente a `None` sotto `uvicorn --reload`). Corretti tutti allo stesso modo, ancorando il percorso a `Path(__file__)`.
- Durante il collaudo, `uvicorn --reload` si è dimostrato inaffidabile in questo ambiente: processi Python/uvicorn precedenti restavano vivi (orfani) anche dopo un `taskkill` da git-bash che riportava successo, servendo codice non aggiornato o fallendo la connessione a MongoDB con errori fuorvianti (tentativo di connessione a `localhost:27017` invece che ad Atlas). Non risolto alla radice — per i prossimi riavvii del backend durante lo sviluppo, preferire un kill esplicito di tutti i processi `python`/`uvicorn` via PowerShell (`Get-Process ... | Stop-Process -Force`, più affidabile di `taskkill` da git-bash su questo ambiente) prima di ripartire, event. cancellando `__pycache__`.

**Backend.** Nuovo file `backend/app/routes/ricerche.py`:
- `POST /api/ricerche` — crea un `Project` (proprietario = utente autenticato) e una `Research` di partecipazione per il creatore.
- `GET /api/ricerche` — restituisce `{mine, participating}`: le Ricerche di cui l'utente è proprietario, e quelle a cui partecipa senza esserne proprietario (tramite `Research` esistenti).
- `GET /api/ricerche/{id}` — dettaglio di una singola Ricerca (richiede di esserne proprietario o partecipante).
- `DELETE /api/ricerche/{id}` — solo il proprietario; elimina a cascata `Research`/`AddedArticle` collegati.
- `POST /api/ricerche/{id}/paper` — aggiunge un paper (dal payload di ricerca, non ancora persistito) alla Ricerca: richiede che il chiamante vi partecipi, salva l'`Article` se non esiste già (upsert per id), evita duplicati in `AddedArticle`.

**Frontend.**
- `ResearchesPage.jsx`: form di creazione (nome, descrizione opzionale) in cima; le due colonne ora mostrano dati reali da `GET /ricerche`; ogni voce in "Create da te" ha un bottone "Elimina" (non presente in "A cui partecipi", dato che lì l'utente non è proprietario); ogni voce è un link a `/ricerche/{id}/cerca`.
- `Sidebar.jsx`: voce "Paper" rinominata "Ricerca rapida", per distinguerla chiaramente dalle Ricerche vere e proprie.
- `SearchPapersPage.jsx` ora accetta un prop opzionale `research` (`{id, name}`): mostra una fascia colorata in cima che segnala la modalità — grigia "Ricerca rapida: sei fuori da qualsiasi Ricerca, qui puoi solo cercare i paper, non salvarli" quando assente, viola con il nome della Ricerca quando presente.
- Nuova pagina `ResearchSearchPage.jsx` (`/ricerche/:id/cerca`): recupera nome/dati della Ricerca da `GET /ricerche/{id}` e monta `SearchPapersPage` passandole come prop.
- `SearchResults.jsx`/`ArticleCard`: il bottone "+ Aggiungi alla ricerca" ora è renderizzato solo quando `research` è presente (assente in Ricerca rapida) ed è collegato a `POST /ricerche/{id}/paper`, con stati locali (Aggiunta…/Aggiunto ✓/Riprova).

Verificato dal vivo l'intero flusso con Playwright: creazione di una Ricerca dal form, ingresso nella ricerca-specifica (banner corretto), ricerca reale su arXiv, aggiunta di un paper con feedback visivo; verificato separatamente che "Ricerca rapida" non mostri il bottone; verificato via curl la corretta applicazione dei controlli di autorizzazione (403 per chi tenta di aggiungere un paper senza partecipare, 403 per chi tenta di eliminare una Ricerca senza esserne proprietario) e l'assenza di duplicati aggiungendo lo stesso paper due volte.

**Stato.** Implementato. Non gestita: la lista "a cui partecipi" resta vuota finché non esiste un flusso di invito reale (`Invite` è nello schema ma non ha ancora alcuna route) — segnalato come lavoro futuro, non richiesto in questo giro.

## 31. "Query salvate" e "Membri del team" annidate dentro ogni Ricerca (2026-08-28)

**Contesto.** L'utente ha osservato che, logicamente, ogni Ricerca ha le proprie query salvate e il proprio team — quindi queste due pagine non devono più essere voci globali della sidebar, ma raggiungibili solo dall'interno di una Ricerca specifica.

**Decisione.** Nuovo componente `ResearchLayout.jsx`: recupera il nome della Ricerca da `GET /ricerche/{id}` e monta tre tab (Cerca / Query salvate / Team) come sotto-rotte annidate di `/ricerche/:id`. Le vecchie rotte globali `/ricerca/query-salvate` e `/ricerca/team` sono state rimosse — quelle pagine esistono ora solo come `/ricerche/:id/query-salvate` e `/ricerche/:id/team`.

Di conseguenza `SavedQueriesPage`/`TeamPage` non hanno più un proprio contenitore a piena pagina (vivono dentro al contenitore di `ResearchLayout`, che già fornisce titolo e larghezza massima). Per lo stesso motivo, il contenitore a piena pagina è stato tolto anche da `SearchPapersPage` (ora usato sia standalone — `/ricerca/paper`, tramite il nuovo wrapper `QuickSearchPage` — sia annidato dentro `ResearchLayout` tramite `ResearchSearchPage`, che ora legge id/nome dal context di `Outlet` invece di rifare la fetch già effettuata da `ResearchLayout`).

Nella sidebar, la sezione "RICERCA" (che raggruppava le tre voci) non ha più senso con una sola voce rimasta: "Ricerca rapida" è ora una voce di primo livello a sé, come "Ricerche".

Verificato dal vivo: sidebar semplificata a due sole voci, le tre tab (Cerca/Query salvate/Team) funzionano correttamente all'interno di una Ricerca creata al volo, nessun errore console, nessun doppio contenitore/padding.

**Stato.** Implementato (scheletro). Query salvate e Team restano contenuti placeholder.

## 32. Bug: la colonna Keyword sbordava in quella Autori a schermi stretti (2026-08-28)

**Contesto.** L'utente ha segnalato che, restringendo la finestra, la barra dei termini keyword straborda dal proprio riquadro fino a finire dentro quello "Autori e profondità". Riprodotto: succede nella fascia di larghezza appena sopra al breakpoint `lg` (1024px) di Tailwind, dove la griglia a 3 colonne (`grid-cols-[260px_minmax(0,1fr)_320px]`) è attiva ma la colonna centrale ha pochissimo spazio.

**Causa.** Un elemento grid/flex senza `min-width: 0` esplicito non si restringe mai sotto la larghezza intrinseca del proprio contenuto (il default CSS è `min-width: auto`) — anche se il suo contenitore (la colonna della griglia) è più stretto, l'elemento sborda invece di restringersi o andare a capo. La catena di elementi tra la griglia e l'input dei termini ne era priva in più punti: il wrapper `<aside>` di ciascun pannello (`SourcesPanel`, `KeywordsPanel`, il `<form>` di `SearchForm`), il div `flex-1` che avvolge ogni `TagInput` dentro `KeywordsPanel`, il contenitore `flex flex-wrap` di `TagInput` stesso, e i singoli tag (un tag lungo e senza spazi, es. "attention-mechanism", non può andare a capo internamente senza `break-words`, e senza `min-w-0` sul proprio testo neppure restringersi).

**Decisione.** Aggiunto `min-w-0` a tutti i livelli della catena: i tre `<aside>`/`<form>` dei pannelli, il wrapper `flex-1` in `KeywordsPanel`, il contenitore di `TagInput`, e un `<span>` interno dedicato al testo del tag (con `break-words`) così un singolo termine lungo va a capo internamente invece di forzare l'overflow. Il pezzo decisivo era il wrapper `flex-1` in `KeywordsPanel.jsx`, privo di `min-w-0`: senza quello, tutti gli altri fix non bastavano.

Verificato dal vivo con Playwright a più larghezze (1024–1280px) con termini keyword lunghi: nessuno sbordamento nella colonna vicina in nessun caso testato (misurato via bounding box, non solo a occhio).

**Nota.** Al confine esatto del breakpoint (1024px) lo spazio per la colonna Keyword resta comunque molto ridotto (~100px): il testo dei tag va a capo quasi carattere per carattere, leggibile ma esteticamente compresso. Non più un bug (nulla sborda), ma un possibile miglioramento futuro sarebbe spostare il passaggio a 3 colonne a un breakpoint più largo (es. `xl`, 1280px) — non fatto qui perché non richiesto e fuori dallo scope della segnalazione.

**Stato.** Implementato.

**Seguito (stesso giorno).** Con lo spazio ridotto a ~100px, anche il placeholder ("es. transformer…") dell'input dei termini finiva per sbordare visivamente. Su richiesta dell'utente, invece di comprimerlo ulteriormente, il placeholder viene nascosto quando lo spazio è insufficiente, lasciando l'input vuoto ma ancora presente e funzionante (l'utente può continuare a digitare, semplicemente senza il testo di esempio come guida). Implementato con le container query di Tailwind v4 (native, nessun plugin necessario): l'input di `TagInput` diventa un `@container`, e il placeholder passa a `placeholder:text-transparent` quando quel container specifico è sotto i 140px (`@max-[140px]:`) — una container query invece di un breakpoint sul viewport perché la larghezza effettivamente disponibile per l'input dipende dalla colonna della griglia in cui si trova, non dalla larghezza della finestra.

Verificato dal vivo: placeholder trasparente (invisibile) sotto i 140px di spazio disponibile, visibile normalmente sopra, in entrambi i casi input ancora presente e cliccabile.

**Seguito 2 (stesso giorno).** Applicato anche il miglioramento segnalato come possibile ma non richiesto sopra: il passaggio dalla disposizione impilata a colonna singola a quella a 3 colonne (`SearchPapersPage.jsx`) è stato spostato dal breakpoint Tailwind `lg` (1024px) a `xl` (1280px). La fascia di larghezza compressa (~1024–1150px, dove la colonna Keyword aveva solo ~100px) non esiste più: sotto 1280px il layout resta a colonna singola a piena larghezza (comodo), da 1280px in su scatta direttamente la disposizione a 3 colonne con spazio adeguato per tutte e tre.

Verificato dal vivo: a 1279px ancora impilato a colonna singola, a 1280px passaggio netto a 3 colonne senza alcuno stato intermedio compresso.

**Seguito 3 (stesso giorno).** 1280px giudicato eccessivo dall'utente (passaggio a colonna singola troppo presto/per troppa larghezza). Riportato a un valore intermedio tra il vecchio 1024px (troppo stretto) e 1280px (troppo largo): breakpoint arbitrario `min-[1180px]:` invece di `xl`. Verificato dal vivo con tag lunghi: a 1180px le tre colonne hanno già margine sufficiente, nessuna compressione.

## 33. Pagina Overview di una Ricerca: statistiche, ultime aggiunte, anteprime di query salvate e team (2026-08-28)

**Contesto.** L'utente ha chiesto una pagina di overview per ogni Ricerca: principalmente gli articoli salvati, più statistiche (da definire in seguito) e una lista ridotta delle ultime aggiunte, cliccabile per accedere alla lista completa in un'altra pagina. Dalla stessa pagina si devono poter raggiungere, con lo stesso meccanismo (anteprima ridotta + link alla pagina completa), anche le query salvate e il team.

**Decisione.** Nessun endpoint esisteva ancora per *elencare* i paper aggiunti a una Ricerca (esisteva solo `POST .../paper` per aggiungerli). Aggiunto `GET /api/ricerche/{id}/paper`: verifica che il chiamante sia proprietario o partecipante (fattorizzato in un helper `require_access`, riusato anche da `get_ricerca`), poi recupera gli `Article` collegati tramite `AddedArticle`, ordinati dal più recente — sfruttando che gli ObjectId di Mongo sono monotonicamente crescenti nel tempo, senza bisogno di un campo timestamp dedicato.

Nuova tab "Overview" in `ResearchLayout.jsx`, aggiunta come prima voce e resa il landing di default di una Ricerca (`index` → `overview`, non più `cerca`). Nuova pagina `OverviewPage.jsx`: sezione "Statistiche" (placeholder, contenuto da decidere in futuro), poi tre riquadri identici nella struttura — titolo, link "Vedi tutti →", anteprima delle prime 5 voci — per "Ultime aggiunte" (paper, dati reali da `GET .../paper`), "Query salvate" e "Team" (ancora placeholder statici, dato che quelle due funzionalità non hanno backend). Nuovo componente condiviso `ArticleListItem.jsx` (riga compatta: logo fonte, titolo, autori/anno, link DOI) per l'anteprima e per la nuova pagina "lista completa" `ResearchArticlesPage.jsx` (`/ricerche/:id/articoli`, senza propria tab — raggiungibile solo dal link "Vedi tutti", coerente con la richiesta di una pagina "diversa", non un'altra tab).

**Bug scoperti e corretti durante il collaudo:**
- Il link di ogni voce in `ResearchesPage.jsx` puntava ancora direttamente a `.../cerca`, bypassando il nuovo default "overview" — corretto a `.../overview`.
- I link "Vedi tutti →" usavano percorsi relativi (`to="articoli"` ecc.): risolti dal router *relativi alla rotta corrente* (`/ricerche/:id/overview`), finendo quindi in `/ricerche/:id/overview/articoli` — una rotta inesistente, che cadeva sul redirect jolly verso `/ricerche`. Corretto costruendo percorsi assoluti con `researchId` (letto dal context di `Outlet`), indipendenti dalla profondità della pagina che li renderizza.

Verificato dal vivo l'intero flusso con Playwright: creazione di una Ricerca → atterraggio su Overview (vuota) → ricerca reale e aggiunta di un paper dalla tab Cerca → ritorno su Overview (paper visibile in "Ultime aggiunte") → "Vedi tutti" → lista completa su `/ricerche/:id/articoli`. Nessun errore console.

**Stato.** Implementato. Le anteprime di "Query salvate" e "Team" restano placeholder statici, in attesa che quelle due funzionalità abbiano un backend reale.

**Seguito (stesso giorno).** L'utente ha chiarito il ruolo delle sezioni: gli articoli salvati sono il concetto *principale* dell'Overview, il resto (statistiche, anteprime di query salvate e team) è materiale di contorno — va in una sidebar. Contestualmente, la tab "Cerca" diventa un bottone in alto vicino al nome della Ricerca (non più una tab), e le tab "Query salvate"/"Membri del team" in alto vengono rimosse (restano raggiungibili solo dalla sidebar dell'Overview).

`ResearchLayout.jsx` non ha più una barra di tab: il titolo (nome della Ricerca) è ora un link cliccabile verso l'Overview di quella Ricerca, e accanto compare un bottone pieno "Cerca" verso la ricerca vera e propria — le uniche due voci di navigazione rimaste nell'intestazione. `OverviewPage.jsx` è stata riorganizzata in due colonne (`grid-cols-[minmax(0,1fr)_300px]`): a sinistra, largo, il riquadro "Articoli salvati" (contenuto principale, fino a 10 voci più recenti, "Vedi tutti →"); a destra, stretta, la sidebar con Statistiche/Query salvate/Team, invariate nel contenuto.

Verificato dal vivo con Playwright (con selettori precisi, dato che "Ricerca rapida" contiene "cerca" come sottostringa e in una ricerca testuale generica intercetta erroneamente i click destinati al bottone "Cerca"): il bottone "Cerca" porta a `.../cerca`, il titolo riporta a `.../overview`, il nuovo layout a due colonne renderizzato correttamente.

**Seguito 2 (stesso giorno).** Due ulteriori richieste: il bottone "Cerca" va spostato sotto al titolo (riga propria, non più accanto), e rinominato in qualcosa come "Aggiungi articoli"; nella pagina "Articoli salvati" completa, mostrarli sempre tutti, paginati se troppi.

`ResearchLayout.jsx`: il titolo è ora da solo sulla prima riga, il bottone (rinominato "+ Aggiungi articoli", stesso stile pieno viola, stessa destinazione `.../cerca`) è sulla riga sotto.

Aggiunta paginazione lato server a `GET /api/ricerche/{id}/paper` (parametri `page`/`page_size`, risposta con `count`/`page`/`total_pages`): scelta deliberata rispetto a paginare lato client, dato che l'obiettivo esplicito era non appesantire le prestazioni — con la paginazione lato client si sarebbe comunque scaricato tutto in un colpo solo, vanificando lo scopo. Dimensione di pagina fissata a 20 (default) con un tetto massimo di 50 anche se richiesto diversamente dal client: un compromesso fra leggibilità (lista scorribile a colpo d'occhio) e il numero di pagine per una ricerca bibliografica realistica (decine-centinaia di paper, non decine di migliaia). `ResearchArticlesPage.jsx` ora gestisce lo stato di pagina e mostra i controlli "Precedente"/"Successiva" solo quando `total_pages > 1`. Come effetto collaterale positivo, anche l'anteprima "Ultime aggiunte" nell'Overview ora chiede al backend solo le 10 voci che le servono (`page_size=10`) invece di scaricare sempre tutto l'elenco per poi tagliarlo lato client.

Verificato dal vivo: creata una ricerca con 25 paper via API, pagina 1 mostra 20 voci, pagina 2 mostra le restanti 5 con "Precedente" abilitato e "Successiva" disabilitato.

**Correzione (stesso giorno).** L'utente ha chiarito di essersi espresso male al giro precedente: gli articoli salvati vanno mostrati *tutti* direttamente nella pagina Overview (paginati), non in un'anteprima ridotta con link a una pagina separata. Rimossa `ResearchArticlesPage.jsx` e la rotta `/ricerche/:id/articoli`; la logica di paginazione (stato di pagina, bottoni Precedente/Successiva, gestione di caricamento/errore) è stata spostata dentro `OverviewPage.jsx`, nello stesso riquadro principale "Articoli salvati" — stessa dimensione di pagina (20) e stesso endpoint paginato lato server di prima, solo senza più una pagina/rotta a parte. La sidebar (Statistiche, Query salvate, Team) resta invariata, con i propri link "Vedi tutti" verso le rispettive pagine (quelle sì ancora separate, dato che non fanno parte di questa correzione).

Verificato dal vivo: una ricerca con 22 paper mostra tutti e 22 gli articoli direttamente nell'Overview su 2 pagine (20 + 2), la vecchia rotta `/ricerche/:id/articoli` non esiste più (cade sul redirect verso `/ricerche`).

## 34. Team di una Ricerca: il proprietario ne fa sempre parte, con un tag dedicato (2026-08-28)

**Contesto.** Né la pagina "Team" né l'anteprima nell'Overview avevano un backend reale (solo placeholder statici). L'utente ha chiesto che il proprietario compaia sempre tra i membri del team, con un tag a fianco che lo segnali come tale.

**Decisione.** Nuovo endpoint `GET /api/ricerche/{id}/team`: costruisce l'elenco membri partendo sempre dal proprietario del `Project` (`is_owner: true`), poi aggiunge chiunque altro abbia una `Research` collegata alla stessa Ricerca (`is_owner: false`) — deduplicando per id, così il proprietario non compare due volte anche se ha anche lui una propria `Research` (il caso normale, dato che chi crea una Ricerca vi partecipa automaticamente, punto 30).

Nuovo componente condiviso `TeamMemberItem.jsx` (nome, email, e un tag viola "Proprietario" mostrato solo per `is_owner: true`), usato sia nella pagina `TeamPage.jsx` (lista completa) sia nell'anteprima "Team" della sidebar dell'Overview (`OverviewPage.jsx`, capped a 5 voci) — entrambe ora con dati reali invece del placeholder statico.

Verificato dal vivo: creata una Ricerca, il proprietario compare sia nell'anteprima sidebar sia nella pagina Team completa, con il tag "Proprietario" ben visibile in entrambi i casi.

**Stato.** Implementato. Nessun flusso di invito reale ancora presente (`Invite` resta senza route): altri membri compariranno solo quando quel flusso esisterà.

## 35. Pagina "Impostazioni profilo": nome/cognome/username modificabili, email principale fissa con aggiunta di altre, password con conferma della attuale (2026-08-28)

**Contesto.** La pagina Profilo era ancora un placeholder. L'utente ha chiesto: nome, cognome, username (modificabile), password (modificabile confermando quella attuale — per ora: chiarito con l'utente che un vero flusso di conferma via email, e il recupero password dalla schermata di login, sono estensioni future, non ancora costruite), email principale non modificabile con possibilità di aggiungerne altre.

**Decisione — modello dati.** `User` non aveva né nome/cognome separati né uno username reale (il login "alternativo all'email" usava impropriamente il campo `name`, pensato per la visualizzazione). Aggiunti `first_name`, `last_name`, `username` (valorizzato di default con la parte locale dell'email in fase di registrazione, poi modificabile) e `additional_emails: list[EmailStr]`. Il vecchio campo `name` è stato trasformato da campo memorizzato a **property calcolata** (`f"{first_name} {last_name}".strip()`), usata dove serve un'unica stringa (es. il saluto nel menu profilo) — non è più interrogabile su Mongo, quindi la query di login che cercava `User.name` è stata corretta per usare `User.username`, il campo per cui era stata pensata fin dall'inizio.

**Nota.** Gli utenti creati prima di questa modifica avranno `first_name`/`last_name`/`username` vuoti nella nuova struttura (i vecchi documenti hanno ancora un campo `name` salvato, ma non più letto): dovranno compilarli dalle impostazioni. Nessuno script di migrazione per i dati di test esistenti — non richiesto, e i dati in gioco sono solo utenti di prova di questa sessione.

**Backend.** In `routes/utenti.py`: `GET /api/users/me` ora restituisce anche `first_name`/`last_name`/`username`/`additional_emails`; `PATCH /api/users/me` aggiorna nome/cognome/username (con controllo di unicità sullo username, dato che è anche un identificatore di login); `POST /api/users/me/password` richiede la password attuale (verificata con `verify_password`) prima di accettarne una nuova (minimo 8 caratteri, coerente con il form di registrazione); `POST /api/users/me/emails` aggiunge un indirizzo aggiuntivo, rifiutando duplicati sia sullo stesso account sia su un altro (nessuna verifica reale della proprietà della casella, per ora — annotato nel codice come lavoro futuro insieme al resto del flusso email).

**Frontend.** `ProfilePage.jsx` riscritta con tre sezioni (stesso stile a riquadro viola delle altre pagine): Informazioni personali (nome, cognome, username, salvataggio indipendente), Email (principale disabilitata via `disabled` + stile attenuato, lista delle aggiuntive, form per aggiungerne una), Password (attuale + nuova + conferma, con controllo lato client che le due nuove coincidano prima di inviare). Nuovo `src/api/profile.js` con le tre chiamate corrispondenti.

Verificato dal vivo via curl l'intero flusso backend: registrazione con split nome/cognome e username derivato dall'email, login sia per email sia per username, aggiornamento profilo, cambio password rifiutato con la password attuale sbagliata (400) e accettato con quella giusta (poi verificato che la nuova password permetta davvero il login), aggiunta email con rifiuto dei duplicati (400). Verificato anche via Playwright che l'interfaccia richiami correttamente questi endpoint e mostri gli stati di salvataggio/errore.

**Stato.** Implementato. Note per il futuro (segnalate esplicitamente dall'utente): il cambio password andrà esteso con una vera conferma via email, e andrà aggiunto un flusso di recupero password dalla schermata di login.

## 36. Immagine profilo, con fallback a un'immagine di default (2026-08-28)

**Contesto.** L'utente ha chiesto di poter impostare un'immagine profilo, con un'immagine di default quando non ne è stata caricata una.

**Decisione.** Il modello `User` aveva già un campo `profile_img` (stringa URL, con un'immagine di default già impostata) ma non era mai stato esposto né usato da nessuna parte. Estratta l'immagine di default in una costante condivisa (`DEFAULT_PROFILE_IMG`, in `schemas/models.py`) per poterla ripristinare esplicitamente. `profile_img` è ora incluso nella risposta di `GET /api/users/me` e aggiornabile tramite `PATCH /api/users/me` (già usato per nome/cognome/username): un valore vuoto ripristina l'immagine di default invece di salvare una stringa vuota come URL.

Scelto un campo URL testuale (come già impostato dallo schema esistente) invece di un vero upload di file: caricare, salvare e servire file richiederebbe un'infrastruttura (storage, endpoint dedicato) non ancora presente nel progetto, e non era stata esplicitamente richiesta — resta un'estensione naturale per il futuro se servisse davvero l'upload da disco.

**Frontend.** Nuova sezione "Immagine profilo" in `ProfilePage.jsx`: anteprima circolare (64px) accanto al campo URL, con testo di aiuto che spiega che lasciarlo vuoto ripristina il default. `ProfileMenu.jsx` (il widget in alto a destra) mostra ora la vera immagine profilo al posto della generica icona utente, con l'icona come fallback finché l'utente non è ancora stato caricato.

Verificato dal vivo via curl (default → impostazione di un URL personalizzato → ripristino con stringa vuota) e via Playwright (anteprima nella pagina impostazioni e avatar in alto a destra aggiornati correttamente dopo il salvataggio).

**Stato.** Implementato, poi sostituito dal vero upload (vedi voce 37).

## 37. Immagine profilo: da URL testuale a upload reale di file, con nuovo layout della pagina impostazioni (2026-08-28)

**Contesto.** L'utente ha chiesto esplicitamente di rendere l'immagine profilo caricabile da file locale, non più tramite incollaggio di un URL (la voce 36 sopra), con un pulsante a forma di cerchietto con matita in basso a destra dell'avatar per aprire il selettore di file. Ha anche chiesto un nuovo layout per la pagina "Impostazioni profilo": avatar ingrandito in alto a sinistra, "Informazioni personali" affiancata sulla stessa riga, ed Email/Password disposte sotto in due colonne.

**Decisione — backend.** Aggiunta la serve di file statici: `backend/app/static/` (esclusa da git) montata su `/api/static` in `main.py` tramite `StaticFiles`. Nuovo endpoint `POST /api/users/me/avatar` (multipart) in `utenti.py`: valida content-type (`image/png|jpeg|gif|webp`) e dimensione (max 5MB), salva il file in `static/avatars/` con nome univoco (`<id-utente>-<uuid4>.<ext>`), e aggiorna `profile_img` con un **URL assoluto** costruito da `request.base_url` — necessario perché in sviluppo frontend (5173) e backend (8000) hanno origini diverse, quindi un path relativo verrebbe risolto dal browser contro l'origine sbagliata (quella del frontend).

**Decisione — frontend.** `apiRequest` in `client.js` supporta ora anche un'opzione `formData`, che passa il `FormData` direttamente come body senza impostare manualmente `Content-Type` (il browser genera da solo il boundary multipart corretto). Nuova funzione `uploadAvatar(file)` in `profile.js`. Sostituita `ProfileImageSection` (URL-based) con `AvatarUpload`: avatar da 128px con un pulsante circolare "matita" posizionato in overlay (assoluto, in basso a destra) che apre un `<input type="file">` nascosto; la selezione del file avvia l'upload immediatamente, senza bisogno di un pulsante "Salva" separato.

Il layout di `ProfilePage.jsx` è stato ristrutturato: avatar e `InfoSection` ora in una riga flex (`flex-col` su schermi stretti, `flex-row` da `sm:`), con Email e Password sotto in una griglia a due colonne (`md:grid-cols-2`, una colonna su schermi stretti). La larghezza massima della pagina è passata da `max-w-3xl` a `max-w-5xl` per ospitare comodamente la riga avatar+info.

**Verifica.** Backend testato via curl (registrazione utente di test, login, upload di un'immagine reale, verifica che il file caricato sia effettivamente servito da `/api/static/avatars/...`). Frontend verificato via Playwright: login, upload di un file locale tramite `setInputFiles`, screenshot che confermano sia il nuovo layout (avatar in alto a sinistra ingrandito con badge matita, info accanto, email/password sotto in due colonne) sia l'aggiornamento dell'avatar nel widget `ProfileMenu` in alto a destra.

**Stato.** Implementato.

## 38. Nome e cognome non modificabili in "Informazioni personali"; aggiunta l'istituzione (2026-08-28)

**Contesto.** L'utente ha chiesto di rendere nome e cognome (preimpostati alla registrazione) non modificabili dalle impostazioni profilo, di unirli in un'unica casella di testo disabilitata, di affiancarci lo username con il pulsante "Salva" sulla stessa riga, e di aggiungere un nuovo campo "istituzione" (vuoto di default, anch'esso salvabile).

**Decisione — backend.** Aggiunto `institution: str = ""` al modello `User` in `schemas/models.py`. `GET /api/users/me` lo espone; `ProfileUpdate` (usato da `PATCH /api/users/me`) ha perso `first_name`/`last_name` — non più modificabili da qui — e ha guadagnato `institution`.

**Decisione — frontend.** In `InfoSection` (`ProfilePage.jsx`) il nome e cognome sono ora mostrati come un unico campo disabilitato (`fullName = first_name + last_name`, sola lettura — il valore arriva da `user`, cioè dalla risposta di `GET /api/users/me`, quindi sempre dal database). Nessun hint testuale: la disabilitazione del campo (stile "grigiato", cursore non consentito) è già sufficiente a comunicare che non è modificabile. Layout finale a due righe: la prima affianca Nome e Username, la seconda affianca Istituzione e il pulsante "Salva" (spostato qui su richiesta esplicita, invece che accanto a Username). Il pulsante salva comunque entrambi i campi modificabili in un solo submit (`updateProfile({ username, institution })`).

**Verifica.** Backend testato via curl (`GET`/`PATCH /users/me` con `institution`, incluso un valore con caratteri accentati per escludere problemi di encoding — l'errore di parsing iniziale era dovuto all'escaping della shell nel test, non al backend). Frontend verificato via Playwright: screenshot che confermano il nome in sola lettura senza hint, e "Salva" ora accanto a Istituzione.

**Stato.** Implementato.

## 39. Migrazione automatica degli account legacy senza first_name/last_name (2026-08-28)

**Contesto.** Dopo la voce 38, la casella "Nome" risultava vuota per gli account creati prima dell'introduzione dei campi `first_name`/`last_name` (incluso l'account reale dell'utente): quei documenti su MongoDB hanno solo un vecchio campo `name` (es. `"Luca Rossi"`), che il modello attuale non legge da nessuna parte — Pydantic scarta silenziosamente i campi sconosciuti in fase di parsing, quindi quel valore era già presente nel database ma non più raggiungibile dall'app.

**Decisione.** Niente script una tantum sul database (i tentativi di scrittura diretta su MongoDB, sia bulk sia sul singolo account, sono stati bloccati dal sandbox in quanto modifiche dirette a stato condiviso): la migrazione avviene invece dentro l'applicazione stessa, al primo accesso autenticato. Aggiunto a `User` un campo `legacy_name: Optional[str] = Field(default=None, alias="name")`, che intercetta il vecchio campo se presente nel documento. In `get_current_user` (`utenti.py`), se `first_name`/`last_name` sono vuoti ma `legacy_name` è valorizzato, viene scomposto (stessa logica di `toDocument`: split sul primo spazio) e salvato su `first_name`/`last_name` (e `username`, se anch'esso mancante); `legacy_name` viene poi azzerato. Essendo dentro `get_current_user`, scatta automaticamente ad ogni richiesta autenticata di un account legacy, senza bisogno di alcun intervento manuale sui dati.

**Verifica.** Validato lo schema con `User.model_validate()` su un documento a forma legacy (conferma che `legacy_name` intercetta correttamente la vecchia chiave `"name"`). Verificato l'intero flusso end-to-end creando un account di prova con la stessa forma legacy tramite l'ODM stesso (non uno script SQL/Mongo diretto), autenticandosi via curl e osservando che la prima `GET /users/me` popola `first_name`/`last_name`/`username` correttamente e che le chiamate successive restano stabili (idempotenza); l'account di prova è stato poi eliminato.

**Stato.** Implementato, poi superato dalla voce 40 (che elimina la necessità stessa di questa migrazione).

## 40. Ritorno a un campo `name` unico, raccolto da Nome+Cognome separati in registrazione; scoperta e riparazione di un account duplicato reale (2026-08-28)

**Contesto.** L'utente ha chiesto di sistemare la fase di registrazione in modo che nome e cognome vengano inseriti (come due campi separati) ma salvati concatenati in un unico campo, mostrato poi così com'è nel frontend — invece dei due campi separati `first_name`/`last_name` introdotti nelle voci 35/38. Lo username resta derivato dalla parte locale dell'email alla creazione, poi modificabile (comportamento già esistente, confermato invariato).

**Decisione — backend.** `User` torna ad avere un solo campo `name: str = ""` (niente più `first_name`/`last_name`, né la `legacy_name` aggiunta nella voce 39, che diventa superflua: un vecchio documento con solo il campo `"name"` ora combacia direttamente con lo schema, senza bisogno di alcuna migrazione). `UserCreate` accetta `first_name`, `last_name`, `email` (ora un semplice `EmailStr`, non più il trucco `NameEmail` tipo `"Nome <email>"`), `password`; `toDocument` li concatena in `name`. La migrazione automatica in `get_current_user` (voce 39) è stata rimossa: non serve più.

**Decisione — frontend.** `AuthForm.jsx`: il singolo campo "Nome" in registrazione è diventato due campi affiancati, "Nome" e "Cognome". `api/auth.js`: `register(firstName, lastName, email, password)` invia i campi separati al backend. `ProfilePage.jsx`: `InfoSection` mostra direttamente `user.name` (niente più concatenazione lato frontend).

**Scoperta collaterale — account duplicato.** Verificando l'account reale dell'utente (`luca.rossi2200@gmail.com`) per assicurarsi che il campo Nome si popolasse, sono emersi **due documenti utente distinti con la stessa email**: uno vecchio (probabilmente un artefatto di una registrazione di test) e uno con `name: "Luca Rossi"`. La migrazione automatica della voce 39 aveva agito sul documento sbagliato (quello restituito per primo da `find_one`), impostandone il campo `name` a `null` — che con il nuovo schema (`name: str`, non opzionale) avrebbe causato un errore di validazione al login/caricamento profilo per quell'account.

Controllando i riferimenti reali (progetti posseduti, ricerche), è emerso che il documento "corrotto" era in realtà quello **con dati reali** (1 progetto, 1 ricerca) — cioè l'account effettivamente usato — mentre quello con `name: "Luca Rossi"` era un doppione vuoto, mai referenziato da nulla. Confermato esplicitamente con l'utente (dato che si trattava di una correzione diretta e distruttiva su dati reali, con scrittura diretta su MongoDB bloccata di default dal sandbox finché non autorizzata) prima di procedere: riparato `name: "Luca Rossi"` sul documento con i dati reali, rimossi i campi `first_name`/`last_name` residui, ed eliminato il doppione vuoto. Verificata l'assenza di altre email duplicate nella collezione.

**Verifica.** Registrazione end-to-end testata via curl (nome/cognome separati → `name` concatenato corretto) e via Playwright (form con due campi, salvataggio, "Nome" e menu profilo mostrano il nome completo). Confermato che account più vecchi privi del campo `name` (mai toccati dalla migrazione rimossa) continuano a caricare correttamente sfruttando il default `""`, senza errori di validazione.

**Stato.** Implementato. L'account reale dell'utente è stato riparato e il doppione eliminato.

## 41. Email univoca per account, imposta a livello di database (2026-08-28)

**Contesto.** Il doppione scoperto nella voce 40 è stato possibile perché `POST /api/users` (registrazione) non ha mai controllato se l'email fosse già in uso: bastava registrarsi due volte con la stessa email per ottenere due account distinti. Da correggere alla radice.

**Decisione.** Il vincolo di unicità è imposto **a livello di database**, non solo applicativo: `User` dichiara ora, in `class Settings`, `indexes = [IndexModel("email", unique=True)]` (da `pymongo`), che crea un indice univoco su MongoDB al prossimo `init_beanie()`. Un controllo solo lato applicazione (query "esiste già?" prima dell'insert) avrebbe comunque una finestra di corsa tra il controllo e la scrittura in caso di richieste concorrenti sulla stessa email — l'indice univoco del database è l'unica garanzia che non lascia margine. `POST /api/users` intercetta la `DuplicateKeyError` sollevata dall'indice e la traduce in un `HTTPException` 400 con messaggio leggibile ("Email già in uso da un altro account"), coerente con gli altri controlli di unicità già presenti (username, email aggiuntive).

Prima scelta scartata: annotare direttamente il campo come `email: Indexed(EmailStr, unique=True)` (l'helper di Beanie pensato apposta per questo). Funzionalmente equivalente, ma `Indexed(...)` è una chiamata a funzione usata in posizione di annotazione di tipo — un pattern che Pylance/Pyright non riesce a interpretare e segnala come warning ("Call expression not allowed in type expression"). L'indice dichiarato in `Settings.indexes` ottiene lo stesso risultato lasciando `email: EmailStr` un'annotazione di tipo normale, senza warning.

**Verifica.** Confermato con `index_information()` che l'indice `email_1` con `unique: True` viene creato correttamente all'avvio (verificato sia con l'annotazione `Indexed()` sia, dopo il cambio, con `Settings.indexes`). Testato via curl: prima registrazione con una email va a buon fine, la seconda con la stessa email restituisce `400 Email già in uso da un altro account` invece di un errore 500 grezzo di violazione indice. Account di prova poi eliminati.

**Stato.** Implementato.

## 42. Rimossa la sidebar: Logo, Ricerche e Ricerca rapida nell'header; padding laterale generoso su tutto il sito (2026-08-28)

**Contesto.** L'utente ha trovato la sidebar troppo vuota (conteneva solo il logo e due link: "Ricerche" e "Ricerca rapida"). Richiesta: eliminarla e spostare quei tre elementi nell'header in alto; aggiungere inoltre un padding laterale importante a tutte le pagine del sito, escludendo header e footer (che devono restare a piena larghezza).

**Decisione — navigazione.** `Sidebar.jsx` è stata eliminata (nessun altro file la referenziava, a parte l'omonimo componente locale `SidebarSection` di `OverviewPage.jsx`, un pannello interno alla pagina Overview senza relazione con la sidebar globale). `AppLayout.jsx` è stato riscritto: l'header ora contiene, sulla stessa riga, il logo/wordmark "PapérDex" e i link "Ricerche"/"Ricerca rapida" a sinistra, il menu account (`ProfileMenu`) a destra. Rimossa insieme a tutta la logica del cassetto mobile (stato `mobileNavOpen`, overlay scuro, bottone hamburger): non più necessaria senza una sidebar da aprire/chiudere. L'header usa `flex-wrap`, quindi su schermi stretti va a capo invece di rompersi (verificato a 480px).

**Decisione — padding.** Aggiunto `px-6 sm:px-10 lg:px-20` al `<main>` di `AppLayout.jsx` (che avvolge l'`<Outlet />` di ogni pagina), non alle singole pagine: essendo nel layout condiviso, si applica automaticamente a tutte le rotte esistenti e future, senza dover toccare ogni pagina singolarmente. Header e footer restano fuori da quel wrapper, quindi a piena larghezza come richiesto. Le pagine che hanno già un proprio `max-w-Nxl` e `px-*` interno (es. `ProfilePage.jsx`, `ResearchesPage.jsx`) sommano il proprio padding a quello del layout: è una scelta consapevole (confermata dall'utente con "in tutto il sito" quando chiesto se il padding dovesse essere globale) piuttosto che andare a rimuovere il padding interno di ogni pagina una per una.

**Verifica.** Lint e build puliti (un modulo in meno). Verificato via Playwright su tre pagine (Ricerche, Impostazioni profilo) e due larghezze (1280px, 480px): header senza sidebar, padding laterale visibile ed escluso da header/footer, nessuna rottura del layout a schermi stretti.

**Stato.** Implementato, con la voce 43 che ne raffina il comportamento a schermi via via più stretti.

## 43. Header responsive: prima sparisce il nome account, poi il logo si riduce a "P" (2026-08-28)

**Contesto.** Con logo, link di navigazione e menu account ora tutti sulla stessa riga dell'header (voce 42), l'utente ha chiesto un ordine di sacrificio esplicito per evitare che l'header si ingrandisca troppo sugli schermi stretti: prima il nome dell'utente accanto all'immagine account (restando solo l'immagine), poi il wordmark del logo (riducendosi alla sola "P").

**Decisione.** Due soglie responsive distinte, nell'ordine giusto (il nome sparisce a una larghezza più ampia di quella a cui il logo si riduce, così il nome è sempre il primo a sparire mentre lo schermo si restringe): in `ProfileMenu.jsx` il nome (`<span>{displayName}</span>`) diventa `hidden md:inline` (sparisce sotto 768px, lasciando solo l'icona/immagine account); in `AppLayout.jsx` il testo del logo è ora due `<span>` alternativi, `hidden sm:inline` per "PapérDex" e `sm:hidden` per "P" (sotto 640px mostra solo "P"). Nessuna nuova logica JS: solo classi Tailwind responsive, coerenti con l'uso di `flex-wrap` già presente nell'header.

**Verifica.** Verificato via Playwright a tre larghezze (1280px, 700px, 500px) con un account di prova dal nome reale (il precedente account di test usato in altre verifiche ha il campo `name` vuoto, inadatto a controllare visivamente la sparizione del testo): a 1280px nome e logo completi; a 700px il nome è sparito (resta la sola icona) ma il logo è ancora "PapérDex"; a 500px anche il logo si è ridotto a "P". Account di prova poi eliminato.

**Stato.** Implementato.

## 44. La tendina del menu profilo si chiude al cambio pagina (2026-08-29)

**Contesto.** La tendina di `ProfileMenu.jsx` restava aperta dopo aver cliccato un suo link interno (es. "Profilo" o "API keys"): l'apertura era già legata a `manualOpen` (stato esplicito dell'utente) con fallback automatico su `isProfileSection` mentre si naviga dentro `/profilo/*`, ma nulla la richiudeva dopo la navigazione.

**Decisione.** Aggiunto un `useEffect` che osserva `location.pathname` e, quando cambia rispetto al valore precedente (tracciato con un `useRef`, non con lo stato, per non causare un altro render), imposta `manualOpen` a `false`. Il confronto con un ref invece che con un semplice `useEffect(() => setManualOpen(false), [location.pathname])` è voluto: quest'ultimo scatterebbe anche al primo render, chiudendo la tendina pure quando si atterra già su `/profilo` (es. da un refresh o da un link esterno) — comportamento che invece deve restare aperto di default in quel caso, sfruttando il fallback `manualOpen ?? isProfileSection` già esistente.

**Verifica.** Verificato via Playwright: aperta la tendina da `/ricerche`, cliccato "Profilo" (naviga a `/profilo`), confermato che subito dopo la navigazione la tendina risulta chiusa (screenshot e conteggio 0 per l'elemento "API keys", prima presente). Account di prova poi eliminato.

**Stato.** Implementato.

## 45. Cronologia delle aggiunte a una Ricerca, con anteprima nella sidebar dell'Overview e pagina completa (2026-08-29)

**Contesto.** L'utente ha chiesto di poter vedere, nella sidebar dell'Overview di una singola Ricerca, la cronologia delle ultime aggiunte con chi le ha inserite — con lo stesso pattern già usato per Query salvate/Team: poche voci in anteprima, con un "Vedi tutti" che apre la pagina completa.

**Decisione — backend.** Nessuna modifica allo schema: né un campo "chi ha aggiunto" né un timestamp dedicato sono serviti. `AddedArticle.research` è un `Link[Research]`, e `Research.user` è già il partecipante proprietario di quella specifica partecipazione all'interno del progetto (`add_article_to_ricerca` in `ricerche.py` associa sempre l'articolo alla Research dell'utente che lo sta aggiungendo) — quindi "chi" è già ricavabile risalendo da `AddedArticle.research` a `Research.user`, senza un nuovo campo. Per "quando", riusato lo stesso trucco già in uso in `list_ricerca_articles` (gli ObjectId di MongoDB sono monotonicamente crescenti nel tempo): oltre a ordinare, l'ObjectId di ogni `AddedArticle` espone `.generation_time` (verificato con beanie `PydanticObjectId`), un timestamp reale senza bisogno di salvarne uno a parte. Nuovo endpoint `GET /ricerche/{id}/cronologia`, paginato con la stessa struttura di `/paper`, che restituisce per ogni voce: titolo articolo, nome di chi l'ha aggiunto, timestamp.

**Decisione — frontend.** Nessun endpoint di anteprima dedicato: come già per Team, la sezione "Cronologia" dell'Overview chiama lo stesso `listRicercaCronologia` passando solo un `page_size` più piccolo (5). Nuovo componente `HistoryEntryItem.jsx` ("‹Nome› ha aggiunto ‹titolo›" + data formattata in italiano) e nuova pagina `HistoryPage.jsx` (paginazione identica a quella già usata per "Articoli salvati" nell'Overview), raggiungibile solo da `/ricerche/:id/cronologia` tramite il "Vedi tutti" — coerente con la nota già presente in `ResearchLayout.jsx` secondo cui le pagine specifiche di una Ricerca non hanno una propria voce in una tab bar, ma sono raggiungibili solo dall'Overview.

**Verifica.** Testato end-to-end via curl (creata una Ricerca, aggiunto un articolo, chiamata `/cronologia`: nome di chi ha aggiunto e timestamp corretti). Verificato via Playwright: anteprima nella sidebar dell'Overview con testo troncato correttamente, click su "Vedi tutti" naviga a `/ricerche/:id/cronologia` e mostra la voce completa. Dati di prova (utente, progetto, ricerca, articolo aggiunto) ripuliti al termine.

**Stato.** Implementato.

## 46. Pagina "API keys": registrazione delle chiavi personali, solo per le fonti che le supportano (2026-08-29)

**Contesto.** La pagina "API keys" (già presente nel menu account, raggiunta da `ProfileMenu.jsx`) era solo un placeholder ("In arrivo"). L'utente ha chiesto di aggiungere un modo per registrare le chiavi API — ma solo per le fonti che ne hanno effettivamente bisogno — più il backend per salvarle.

**Decisione — quali fonti.** Delle cinque fonti integrate (arXiv, Crossref, DBLP, OpenAlex, Semantic Scholar), solo due supportano una chiave API personale per aumentare i propri limiti di frequenza: Semantic Scholar (header `x-api-key` in `semanticScholar.py`) e OpenAlex (parametro `api_key` in `openAlex.py`) — verificato cercando ogni uso di `API_KEY`/`Authorization` negli adapter. arXiv, Crossref e DBLP non ne accettano una: non compaiono nella pagina, coerentemente con la richiesta di limitarsi "ai siti che ne hanno bisogno".

**Decisione — backend.** Aggiunto `api_keys: dict[str, str] = Field(default_factory=dict)` a `User` (`models.py`), chiave = identificativo della fonte (`semantic_scholar`, `openalex`). `GET /users/me/api-keys` restituisce, per ciascuna fonte supportata, solo se una chiave è impostata (`is_set`) — mai il valore salvato, stesso principio già usato per la password (si può sovrascrivere, non rileggere). `PUT /users/me/api-keys/{source_id}` salva (o, se il valore è una stringa vuota, rimuove) la chiave per quella fonte; una fonte non riconosciuta restituisce 404.

**Decisione — frontend.** `ApiKeysPage.jsx` riscritta: una card per fonte (`SourceKeyCard`), con badge "Impostata" + link "Rimuovi" quando una chiave è già salvata, campo `type="password"` (mai precompilato col valore esistente, per lo stesso motivo per cui il backend non lo restituisce mai) e pulsante "Salva" disabilitato a campo vuoto — la rimozione passa invece dal link dedicato, per evitare che un submit vuoto accidentale cancelli una chiave esistente.

**Verifica.** Testato via curl l'intero ciclo (nessuna chiave → imposta → verifica `is_set` → fonte inconsistente → 404 → rimozione con stringa vuota). Verificato via Playwright: stato iniziale, salvataggio di una nuova chiave (badge "Impostata" compare, messaggio "Salvata."), rimozione di una chiave esistente (badge sparisce, placeholder torna quello di default). Account di prova poi eliminato.

**Aggiornamento (2026-08-29) — collegamento alle chiamate reali.** Su richiesta esplicita di completare il collegamento lasciato in sospeso: `BaseAdapter` (`services/adapters/base.py`) ha ora un `__init__(self, api_key=None)` e un attributo di classe `API_KEY_SOURCE_ID` (`None` di default, valorizzato solo da `SemanticScholarAdapter`/`OpenAlexAdapter`). `DBLPAdapter` aveva un proprio `__init__` che sovrascriveva quello della base senza chiamare `super().__init__()`: aggiustato per accettare e propagare `api_key`, altrimenti la app sarebbe andata in errore ogni volta che veniva istanziato (scoperto proprio testando questa modifica, non dalla sola lettura del codice). `SemanticScholarAdapter`/`OpenAlexAdapter` usano ora `self.api_key or os.getenv(...)`: priorità alla chiave personale, altrimenti fallback su quella globale del server, invariato per chi non ne ha ancora registrata una propria.

`resolve_adapters`/`search_all_sources` (`orchestrator.py`) accettano ora un `api_keys: dict[str, str]` (chiave = source id) e lo passano solo all'adapter con lo `API_KEY_SOURCE_ID` corrispondente. `POST /api/search` (`ricerca.py`) richiede ora un utente autenticato (prima non richiedeva alcun token) — necessario per sapere di chi caricare le chiavi; non rompe il frontend, che allega già sempre il token quando presente, ed è comunque coerente con il resto dell'app, già tutta dietro login. `utenti.py` ora deriva `API_KEY_SOURCES` direttamente da `ADAPTER_REGISTRY` (leggendo `API_KEY_SOURCE_ID` di ciascun adapter) invece di duplicarlo a mano: una sola fonte di verità, niente rischio di disallineamento tra le due liste.

**Verifica del collegamento.** Confermato che `resolve_adapters` assegna la chiave passata solo agli adapter con `API_KEY_SOURCE_ID` valorizzato (gli altri restano `None`, come da comportamento invariato). Prova end-to-end decisiva: impostata una chiave OpenAlex fittizia sull'account di test, eseguita una ricerca autenticata su OpenAlex — nei log del backend la chiamata reale a OpenAlex ha ricevuto quella chiave ed è stata rifiutata dal server (`401 Invalid or missing API key`), a conferma che la chiave personale viene davvero inviata nella richiesta esterna, non solo salvata. Verificato anche che `POST /search` senza token restituisce `401`, e che la ricerca dalla UI (Playwright, pagina "Ricerca rapida") continua a funzionare (`200`) ora che il token è obbligatorio. Account di prova eliminato.

**Stato.** Implementato, incluso il collegamento alle chiamate reali agli adapter.

## 47. Query salvate: modello `Filter` rinominato `Query`, salvataggio reale, pulsante "Usa" (2026-08-31)

**Contesto.** "Query salvate" era finora solo un placeholder statico, senza alcun backend. L'utente ha chiesto di: rinominare il modello `Filter` (mai realmente usato) in `Query` e usarlo per salvare le query, associandole a una Ricerca; aggiungere un pulsante/link "Usa" per ciascuna query salvata che ne reimposti i parametri nel form di ricerca di quella Ricerca, restando comunque modificabili.

**Decisione — modello.** `Filter` (`models.py`) era già inutilizzato nella pratica (zero rotte lo toccavano, collezione MongoDB vuota, verificato prima di procedere) e i suoi campi non corrispondevano comunque ai parametri reali di una ricerca. Sostituito con `Query`, i cui campi rispecchiano esattamente `SearchRequestIn`/`SearchRequest` (`keyword_include`, `keyword_exclude`, `author`, `year_start`, `year_end`, `journal`, `depth`, `sources`) più un `name` e un `project: Link[Project]` — associata al Project (la Ricerca condivisa da tutto il team), non alla singola partecipazione (`Research`), così ogni membro la vede e la può riusare, coerente con Team/Cronologia. Rimosso anche lo stub `Research.filter` (mai collegato a nulla, superato da questo modello). `database.py` aggiornato di conseguenza (registrazione Beanie).

**Decisione — backend.** Tre rotte in `ricerche.py`, stesso pattern di Team/Cronologia: `GET /ricerche/{id}/query` (lista, più recenti prima, filtrando per `project`), `POST /ricerche/{id}/query` (chiunque partecipi alla Ricerca può salvare, non solo il proprietario), `delete_ricerca` esteso per ripulire anche le Query quando si elimina una Ricerca (come già faceva per Research/AddedArticle).

**Decisione — frontend.** Per far funzionare "Usa" (reimpostare i parametri nel form, restando modificabili) è servito sollevare lo stato di `SearchForm.jsx` — prima interamente interno al componente (autori, escludi, venue, anni, profondità) — nel genitore `SearchPapersPage.jsx`, che già possedeva keyword e fonti: `SearchForm` è ora un componente controllato. "Usa" (in `SavedQueriesPage.jsx` e nell'anteprima "Query salvate" dell'Overview, nuovo componente `QueryListItem.jsx`) naviga a `/ricerche/:id/cerca` passando la query come stato di navigazione (`navigate(path, { state: { applyQuery: query } })`); `SearchPapersPage` la legge negli inizializzatori di `useState` (non in un `useEffect`, per evitare sia il rischio di scatenare la regola `set-state-in-effect` sia il problema di riapplicarla ad ogni cambio di stato) così da precompilare il form una sola volta, al montaggio. Aggiunto anche un piccolo form "Salva query" (nome + bottone) accanto al pulsante "Cerca" nella pagina di ricerca, visibile solo dentro una Ricerca — è il modo con cui una query arriva effettivamente a esistere, altrimenti "Usa" non avrebbe nulla da mostrare.

**Verifica.** Testato l'intero ciclo via curl (creazione Ricerca → lista query vuota → creazione query con gruppi keyword, autore, fonti e profondità → lista aggiornata). Verificato via Playwright end-to-end: ricerca con parametri specifici → "Salva query" → apertura di "Query salvate" (elenco con riepilogo leggibile: keyword, autori) → click su "Usa" → il form di ricerca si ripresenta con fonti, gruppi di keyword, autore e profondità esattamente come salvati, tutti ancora modificabili. Dati di prova ripuliti al termine.

**Stato.** Implementato.

## 48. Espansione semantica/acronimi: approccio ibrido, dizionario statico o LLM a scelta dell'utente (2026-08-31)

**Contesto.** Feature della proposta di tesi mai costruita: suggerire automaticamente varianti/acronimi delle keyword inserite (es. "NLP" → "Natural Language Processing"). Discusso con l'utente un approccio ibrido: senza una chiave LLM personale, un dizionario statico locale dei termini più noti dell'informatica; con una chiave, un LLM a scelta dell'utente tra i principali (non decisa a priori da noi, per evitare scontenti sulla scelta).

**Decisione — chiave LLM, non una per provider.** A differenza di `api_keys` (una voce per fonte di ricerca, l'utente può volerle tutte insieme), qui l'utente ne usa uno alla volta: due campi nuovi su `User` (`llm_provider`, `llm_api_key`) invece di un'altra voce nel dizionario `api_keys` — evita di dover mostrare tre card quasi identiche (OpenAI/Anthropic/Google) quando se ne userà una sola. In `ApiKeysPage.jsx`, un'unica card "Assistente AI" con un menu a tendina per il provider accanto al campo chiave, sotto le card delle fonti di ricerca esistenti.

**Decisione — backend, provider LLM.** Nuovo pacchetto `services/llm/`: `BaseLLMProvider` (interfaccia `expand(terms, api_key) -> list[str]`, stesso spirito di `BaseAdapter` per le fonti di ricerca) con `OpenAIProvider`, `AnthropicProvider`, `GoogleProvider` — un piccolo adapter ciascuno perché formato di richiesta/risposta e modalità di autenticazione differiscono (Google passa la chiave come query param, non come header). Prompt e parsing della risposta (split su virgole/a-capo, dedup, max 4 suggerimenti) condivisi in `base.py`. `LLM_PROVIDERS` è il registro (stessa idea di `ADAPTER_REGISTRY`); `LLM_PROVIDER_NAMES` in `utenti.py` derivato da lì, non duplicato.

**Decisione — backend, endpoint e fallback.** `POST /api/keywords/expand` (nuovo `routes/keywords.py`): se l'utente ha un provider LLM configurato lo usa, altrimenti ripiega sul dizionario statico (`services/utils/keyword_dictionary.py`, ~40 acronimi comuni di informatica). Scelta deliberata: se l'LLM configurato fallisce (chiave non valida, rate limit), l'errore viene propagato al client (502) invece di ripiegare in silenzio sul dizionario — una chiave rotta deve essere visibile, non nascosta dietro un fallback silenzioso che la farebbe sembrare funzionante.

**Decisione — frontend.** `KeywordsPanel.jsx`: un pulsante "✨" per ogni gruppo di keyword, che manda i termini già presenti nel gruppo e aggiunge i suggerimenti restituiti come nuovi tag nello stesso gruppo OR (già pensato per sinonimi/alternative) — l'utente li vede e può rimuoverli con la stessa interazione già esistente per i tag, senza bisogno di una UI di conferma dedicata (coerente con "attivabile a discrezione dell'utente, restando modificabile" della proposta).

**Verifica.** Dizionario testato via curl (termine noto → espansione corretta; termine sconosciuto → lista vuota, nessun errore). Collegamento reale ai provider verificato con lo stesso metodo già usato per le API keys di ricerca: impostata una chiave OpenAI fittizia, la richiesta di espansione ha ricevuto un 401 reale da OpenAI, propagato correttamente come 502 — prova che la chiave viaggia davvero nella richiesta esterna, non solo salvata. Verificato anche il ripristino del dizionario dopo rimozione della chiave. Verificato via Playwright: card "Assistente AI" con tendina provider nella pagina API keys; click su "✨" su un gruppo con "NLP" aggiunge "Natural Language Processing" come nuovo tag rimovibile. Account di prova ripuliti al termine.

**Stato.** Implementato.

## 49. Aggiornato il modello Google, ampliato il dizionario statico (2026-08-31)

**Contesto.** Verificando con l'utente costi/free tier dei tre provider LLM (pagine ufficiali di pricing, non aggregatori), è emerso che `gemini-2.0-flash` — il modello scelto per `GoogleProvider` nella voce 48 — non compare più nella pagina di pricing corrente di Google, sostituito da `gemini-2.5-flash` (confermato attuale, con free tier per input/output testuale). L'utente ha chiesto di aggiornarlo e, separatamente, di ampliare un po' il dizionario statico (segnalato come volutamente ristretto — 42 voci — nella voce 48).

**Decisione.** `GoogleProvider.MODEL` aggiornato a `gemini-2.5-flash`. `CS_ACRONYMS` (`keyword_dictionary.py`) ampliato da 42 a 95 voci, organizzate per area invece che in un unico blocco piatto: AI/ML (aggiunte GNN, RAG, ViT, VAE, MLP, XAI, PCA, MDP, SGD, ecc.), software/web generico (SDK, IDE, OOP, TDD, JSON, XML, CORS, SSH, ecc.), database (ACID, CAP, ETL, OLAP, OLTP), sicurezza (XSS, CSRF, DDoS, 2FA, MFA, TLS, OAuth, ecc. — area completamente assente prima), reti/infrastruttura (CDN, CI/CD, VM, HPC, MPI, SIMD), blockchain (DLT, NFT, DAO).

**Verifica.** Contate le voci via import diretto (95, confermato). Nuove voci testate via curl (XSS, ACID, RAG, CI → espansioni corrette). Modello Google aggiornato verificato con lo stesso metodo delle altre chiavi: chiave fittizia, la risposta di Google è un errore di *chiave non valida* (400) e non di *modello non trovato* (404), a conferma che `gemini-2.5-flash` è riconosciuto dall'API. Account di prova eliminato.

**Stato.** Implementato.

## 50. Server SMTP: conferma email (logica pronta, non collegata), cambio/recupero password (2026-08-31)

**Contesto.** L'utente ha chiesto di configurare l'invio email per due usi: conferma dell'indirizzo email — costruendo solo la logica, senza collegarla ancora a nessun flusso automatico (altrimenti ogni account di prova creato durante lo sviluppo richiederebbe una vera verifica, complicando i test del resto dell'app) — e cambio/recupero password, per cui invece il collegamento reale era esplicitamente atteso (il "recupero password dalla schermata di login" era l'ultimo pezzo mancante segnalato dal TODO nella voce 35).

**Decisione — invio email.** Nuovo `services/utils/email.py`: `send_email()` sincrona (smtplib non ha API asyncio) che legge host/porta/utente/password/mittente da variabili d'ambiente (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_USE_TLS`) — se `SMTP_HOST` non è configurato solleva un errore leggibile invece di tentare una connessione a vuoto. Dalle rotte va sempre chiamata tramite `asyncio.to_thread` per non bloccare l'event loop. Aggiunti in `.env` i placeholder vuoti per queste variabili, più `FRONTEND_URL` (usato per costruire i link nelle email), documentati con un commento su cosa serve compilare.

**Decisione — token azione.** Riusato lo stesso meccanismo del token di login (jose + `SECRET_KEY`), con l'aggiunta di un campo `purpose` (`"email_confirmation"` o `"password_reset"`) per evitare che un token pensato per un'azione venga riusato per un'altra, e una scadenza indipendente (1 ora per il reset password, 24 per la conferma email) da quella di sessione. Due helper in `utenti.py`, `create_action_token`/`decode_action_token`, condivisi tra i due flussi.

**Decisione — recupero password (collegato).** `POST /password-reset/request` (pubblica, nessuna autenticazione): se l'email esiste invia il link di reset, ma **risponde con lo stesso messaggio generico in ogni caso** — non deve rivelare quali indirizzi sono registrati. `POST /password-reset/confirm` verifica il token e imposta la nuova password. Entrambi i cambi password (questo flusso e quello già esistente da autenticati) inviano anche un'email di notifica "la tua password è stata modificata" — un fallimento di invio non blocca mai il cambio password stesso (funzione `send_email_safely`, che logga e prosegue), perché l'azione critica è cambiare la password, non l'email che lo segnala.

Per rendere `/reset-password?token=...` raggiungibile da un link email anche senza sessione attiva, `App.jsx` è stato ristrutturato: prima il routing esisteva solo per l'area autenticata (`if (!token) return <AuthForm/>` restituiva un componente diretto, senza `<BrowserRouter>`); ora c'è un unico `<BrowserRouter>`/`<Routes>` in cima, con `/reset-password` come rotta di primo livello indipendente dallo stato di autenticazione. `AuthForm.jsx` ha una terza modalità "forgot" (link "Password dimenticata?" sotto il campo password, solo in login), e la nuova `ResetPasswordPage.jsx` legge il token dalla query string.

**Decisione — conferma email (non collegata).** Aggiunto `User.email_confirmed: bool = False`. `POST /users/me/confirm-email/request` (autenticata) e `POST /confirm-email` (pubblica, verifica token) esistono e funzionano in autonomia, ma **nessun punto dell'app le chiama**: la registrazione non invia nulla, `/users/me` non espone il campo, non c'è alcuna pagina o banner che inviti a confermare. È logica testabile via API ma dormiente, esattamente come richiesto — pronta per essere accesa in un secondo momento senza dover essere ridisegnata.

**Verifica.** Impossibile usare un vero provider SMTP (nessuna credenziale disponibile); verificato con un server SMTP di debug locale (`aiosmtpd`, installato solo per questa sessione di test — nessun requirements.txt nel progetto da tenere sincronizzato) avviato su `127.0.0.1:1025`, con `SMTP_HOST`/`SMTP_PORT`/`SMTP_USE_TLS` passate come variabili d'ambiente al processo `uvicorn` invece che scritte nel `.env` reale (che resta con i placeholder vuoti). Flusso completo testato end-to-end via curl: richiesta reset → email intercettata dal server di debug e decodificata (oggetto, corpo HTML, link con token reale) → conferma con quel token → login con la vecchia password fallisce, con la nuova funziona → email di notifica "password modificata" ricevuta sia dal reset sia dal cambio autenticato. Endpoint di conferma email testato allo stesso modo (email intercettata, token decodificato, `email_confirmed` passa a `True` nel database) pur restando irraggiungibile da qualunque flusso applicativo. Verificato via Playwright l'intero percorso utente: link "Password dimenticata?" → richiesta → pagina `/reset-password` → nuova password → login riuscito. Dopo i test, server di debug fermato, backend riavviato senza gli override (SMTP di nuovo non configurato, come nel `.env` reale), confermato che la richiesta di reset continua a rispondere con successo generico anche così. Account di prova e file temporanei ripuliti.

**Stato.** Implementato. Recupero password e notifiche di cambio password sono pienamente funzionanti (in attesa solo di credenziali SMTP reali in `.env` per l'invio effettivo); la conferma email è pronta ma resta intenzionalmente scollegata.

## 51. Inviti via email a una Ricerca, con doppio scenario in base alla registrazione del destinatario (2026-08-31)

**Contesto.** L'utente ha chiesto di costruire il flusso di inviti, via email: il proprietario di una Ricerca inserisce un indirizzo e preme "Invita"; chi riceve l'email, cliccando il link, vede due scenari diversi a seconda che l'indirizzo sia già registrato o no. Se lo è: una pagina con le info principali (mittente, nome e descrizione della ricerca) e la scelta di accettare o rifiutare. Se non lo è: cliccando per accettare deve passare dalla registrazione, obbligato **lato server** a usare l'indirizzo a cui è arrivato l'invito, e finire — una volta creato l'account — già sulla propria home (Ricerche) con quella Ricerca tra le partecipazioni.

**Decisione — modello.** `Invite` (mai realmente usato: collezione MongoDB vuota, verificato prima di procedere) aveva `receiver: Link[User]`, incompatibile con lo scenario "destinatario non ancora registrato". Sostituito con `receiver_email: EmailStr` — un invito esiste per un indirizzo, non per un account. Un utente già registrato conta come destinatario anche se quell'indirizzo è una delle sue `additional_emails`, non solo quella principale (richiesto esplicitamente: "una di quelle aggiungibili"). `date_sent` passato da `PastDate` (che rifiuta anche la data odierna, bug noto in questo file) a `date` semplice.

**Decisione — token e invio.** Riusato `create_action_token`/`decode_action_token_payload` (voce 50), esteso per accettare claim extra (`invite_id`, oltre a `sub`/`purpose`): permette di risalire all'invito esatto senza doverlo riderivare da email+progetto, e resta valido anche se nel frattempo l'invito viene re-inviato con un token diverso (più inviti "attivi" per lo stesso invito, tutti validi finché lo stato resta `pending`). `POST /ricerche/{id}/invite` (solo il proprietario, non un generico partecipante): valida che il destinatario non sia già proprietario/membro, riusa un invito `pending` già esistente per la stessa combinazione invece di accumularne di nuovi ad ogni click, e — a differenza delle notifiche di password — se l'invio email fallisce la richiesta fallisce visibilmente: qui l'invio *è* l'azione richiesta, non un effetto collaterale.

**Decisione — accettazione (due rotte pubbliche, guidate dal token).** Nuovo `routes/inviti.py`: `GET /inviti/{token}` restituisce mittente, nome/descrizione progetto, stato e se il destinatario risulta già registrato (`user_exists`); `POST /inviti/{token}/accept` — **niente login richiesto**, stesso principio di fiducia già usato per il reset password (il possesso del link è la prova, non una sessione attiva) — crea la partecipazione (`Research`) se il destinatario esiste, ma **non autentica il browser**: l'accettazione conferma solo la partecipazione, non equivale a provare la password, quindi dopo aver accettato bisogna comunque accedere normalmente (stesso principio del reset password, che non restituisce mai un token di sessione). `POST /inviti/{token}/decline` marca l'invito rifiutato.

**Decisione — registrazione vincolata (scenario 2).** `UserCreate` accetta un `invite_token` opzionale. In `POST /users`, se presente, il payload viene decodificato e **l'email del form viene sostituita con quella del token indipendentemente da cosa sia stato scritto** — non un controllo che rifiuta un mismatch, ma un'sostituzione lato server che rende impossibile registrarsi con un indirizzo diverso, qualunque cosa il client invii (verificato inviando deliberatamente un'email diversa nel form: l'account è stato creato con quella dell'invito, l'altra non è mai esistita). Se la registrazione ha successo, crea subito la `Research` e marca l'invito accettato, nello stesso giro. Il frontend (`InvitePage.jsx`) fa poi login automatico e un reload completo (`window.location.href`, non `navigate`) su `/ricerche`: essendo `App.jsx` inizializzato da `localStorage` solo al mount, un reload è il modo più semplice per farlo ripartire già autenticato, senza dover passare token attraverso il componente.

**Decisione — frontend, resto.** `AppLayout`/`TeamPage.jsx`: il form "Invita un collaboratore" compare solo se `is_owner` (nuovo campo a livello di risposta di `GET /ricerche/{id}/team`, oltre a quello già esistente per membro — evita al frontend di dover incrociare la propria identità con l'elenco). `InvitePage.jsx` (nuova rotta di primo livello `/inviti/accetta`, fuori dal ramo autenticato come `/reset-password`) gestisce entrambi gli scenari in un solo componente: stessa info di invito in testa, poi Accetta/Rifiuta oppure — se non registrato — un mini-form di registrazione con l'email mostrata disabilitata (coerente col vincolo server-side) invece di un `AuthForm` riadattato, per non intrecciare la logica specifica dell'invito con le modalità già esistenti di login/registrazione.

**Verifica.** Intero ciclo testato via curl per entrambi gli scenari: creazione ricerca, invito a un utente esistente (poi verificato nel suo team via `/ricerche`), invito a un indirizzo non registrato, `GET /inviti/{token}` che distingue correttamente `user_exists`, accettazione scenario 1 con verifica della partecipazione risultante, tentativo di riaccettare un invito già gestito (rifiutato con 400), registrazione scenario 2 **inviando deliberatamente un'email diversa nel form** per provare che il server la ignora e usa comunque quella dell'invito, controlli di validazione (già membro, invito a se stessi, non-proprietario che prova a invitare — tutti rifiutati correttamente), rifiuto (decline) e re-invito della stessa persona dopo un rifiuto. Verificato via Playwright l'intero percorso utente: form "Invita" visibile solo al proprietario nella pagina Team, pagina di accettazione con le info corrette per lo scenario utente-esistente, form di registrazione con email bloccata per lo scenario utente-non-registrato, e — dopo la registrazione — atterraggio diretto sulla pagina Ricerche con la ricerca invitata già presente sotto "A cui partecipi", senza alcun passaggio manuale aggiuntivo. Stesso server SMTP di debug locale della voce 50 per intercettare le email reali. Dati e account di prova ripuliti al termine.

**Bug scoperto e corretto durante la verifica.** Sia `invite_to_ricerca` sia `request_email_confirmation` chiamavano `send_email` senza intercettare `EmailSendError`: con SMTP non configurato (il caso normale finché non si aggiungono credenziali reali in `.env`), l'eccezione risaliva non gestita fino a FastAPI, che rispondeva con un 500 grezzo ("Internal Server Error", nessun dettaglio) — l'invito veniva comunque creato lato database, ma chi lo mandava non aveva modo di saperlo né di capire cosa fosse andato storto. Corretto in entrambi i punti: `except EmailSendError` che rilancia un `HTTPException(502, ...)` con il messaggio leggibile, stesso principio già usato per il reset password.

**Stato.** Implementato.

## 52. Inviti mandati (sidebar in Team) e inviti ricevuti (pagina nel menu profilo) (2026-08-31)

**Contesto.** Con l'invio degli inviti funzionante (voce 51), mancava un modo per vederli: da proprietario, sapere a chi si è già scritto e con che esito; da destinatario, vedere gli inviti ricevuti senza dover ripescare l'email. Richiesta dell'utente: una sidebar nella pagina Team con gli inviti mandati (solo proprietario), e una pagina nel menu profilo con quelli ricevuti, con un link che porti alla stessa esperienza del link via email.

**Decisione — backend.** Due nuove rotte, entrambe sola lettura. `GET /ricerche/{id}/invites` (`ricerche.py`, solo proprietario, stesso controllo già usato per l'invio): elenco degli inviti mandati per quella Ricerca, più recenti prima. `GET /users/me/invites` (`utenti.py`): elenco di *tutti* gli inviti ricevuti dall'utente corrente, su qualunque Ricerca — conta sia l'email principale sia le `additional_emails`, stesso criterio già usato per l'accettazione. Per ogni invito ancora `pending`, la risposta include anche un token generato al volo con `create_action_token` (stesso meccanismo dei link via email): il frontend può linkare direttamente alla `InvitePage` già costruita, senza duplicare lì la UI di accetta/rifiuta.

**Decisione — frontend.** `TeamPage.jsx` diventa un layout a due colonne (stesso pattern a griglia già usato in `OverviewPage.jsx`, `minmax(0,1fr)_300px`): colonna principale invariata (form invito + elenco membri), sidebar "Inviti mandati" — solo per il proprietario — con badge di stato (In attesa / Accettato / Rifiutato) per ciascun invito; si aggiorna da sola dopo un nuovo invio (contatore di refresh passato come dipendenza dell'effetto). Nuova `MyInvitesPage.jsx` (rotta `/profilo/inviti`, nuova voce "Inviti" nella tendina di `ProfileMenu.jsx`): elenco degli inviti ricevuti con mittente, nome ricerca, stato, e un link "Rispondi" — presente solo per gli inviti `pending` che hanno un token nella risposta — che porta a `/inviti/accetta?token=...`, cioè la stessa pagina già usata per il link via email.

**Verifica.** Entrambe le nuove rotte testate via curl: elenco mandati corretto, un non-proprietario che prova a vederli riceve 403, elenco ricevuti con token presente solo per l'invito pending. Verificato via Playwright: sidebar "Inviti mandati" nella pagina Team con i badge di stato corretti; pagina "Inviti ricevuti" raggiungibile dalla nuova voce del menu profilo; click su "Rispondi" verificato portare esattamente alla stessa `InvitePage` (stesso URL, stesse informazioni di mittente/ricerca/descrizione) già validata nella voce 51. Dati di prova ripuliti al termine.

## 53. Pagine secondarie di una Ricerca: "Nome - Pagina" al posto del bottone "+ Aggiungi articoli" (2026-08-31)

**Contesto.** Il bottone "+ Aggiungi articoli" (in `ResearchLayout.jsx`, il layout condiviso da tutte le sotto-pagine di una Ricerca) compariva su ogni pagina, incluse quelle dove non ha senso — su "Cerca" linkerebbe alla pagina stessa. L'utente ha chiesto di toglierlo dalle pagine secondarie e mettere lì, accanto al nome della Ricerca, il nome della pagina corrente ("Nome Ricerca - Team", ecc.).

**Decisione.** `ResearchLayout.jsx` ora distingue Overview (la pagina "principale": nessun suffisso, resta il bottone) dalle altre quattro (Cerca, Query salvate, Cronologia, Team: niente bottone, suffisso " - [Nome pagina]" accanto al titolo). La distinzione è ricavata da `useLocation()` — l'ultimo segmento del path confrontato con una mappa `slug → nome visualizzato` — non da un prop esplicito passato da ciascuna pagina figlia: tiene la logica in un solo posto invece di doverla ripetere in ogni pagina.

**Verifica.** Verificato via Playwright su tutte e cinque le pagine di una Ricerca di prova: Overview mostra solo il nome e il bottone; Cerca, Query salvate, Cronologia e Team mostrano il suffisso corretto e nessun bottone. Lint e build puliti. Dati di prova ripuliti al termine.

**Stato.** Implementato.

## 54. Dopo l'accettazione di un invito (scenario utente esistente): "Vai alla ricerca" invece di "Vai al login" (2026-08-31/09-01)

**Contesto.** In `InvitePage.jsx`, dopo aver accettato un invito da account già registrato, il link mostrato puntava genericamente a "/" con testo "Vai al login". L'utente ha chiesto di puntare direttamente alla Ricerca appena accettata, con testo "Vai alla ricerca".

**Decisione.** `POST /inviti/{token}/accept` (`inviti.py`) ora restituisce anche `project_id` insieme al messaggio. Il frontend lo salva nello stato e lo usa per costruire `/ricerche/{project_id}/overview`. Il messaggio informativo sopra il link ("Accedi al tuo account per vedere la ricerca") resta invariato: se chi clicca non ha una sessione attiva in quel browser, l'app lo riporterebbe comunque al login (nessun meccanismo di redirect-post-login esiste ancora) — ma se è già loggato (es. ha accettato dalla pagina "Inviti ricevuti" di questa sessione), il link lo porta dritto lì, senza passaggi intermedi.

**Verifica.** Testato via curl che `project_id` nella risposta di accept coincide esattamente con l'id della Ricerca invitata. Verificato via Playwright: da un browser già loggato come il destinatario, accettato un invito dalla pagina "Inviti ricevuti" → comparso "Vai alla ricerca" con `href` corretto → click → atterraggio diretto sulla pagina Overview della Ricerca appena accettata, con il destinatario già visibile nel Team. Dati di prova ripuliti al termine.

**Stato.** Implementato.

## 55. Il login riporta sempre a "Ricerche", indipendentemente dall'URL precedente (2026-09-01)

**Contesto.** L'utente ha segnalato che il login, in certi casi, non atterrava sulla pagina "Ricerche" ma su una Ricerca specifica. Causa: il ramo non autenticato di `App.jsx` (introdotto per `/reset-password` e `/inviti/accetta`, voce 50) usa un `path="*"` che mostra `AuthForm`/`HomePage` per qualunque URL, senza mai cambiare l'URL stesso nella barra degli indirizzi. Se prima del login quell'URL era già quello di una Ricerca specifica (vecchio bookmark, link diretto, o il "Vai alla ricerca" della voce 54 aperto da sloggati), al login il ramo autenticato si attiva e quell'URL — ora un percorso valido — viene renderizzato così com'è, invece di passare da "Ricerche".

**Decisione.** In `AuthForm.jsx`, dopo un login riuscito, `navigate('/ricerche', { replace: true })` esplicito (non un semplice cambio di `token` lasciato risolvere da solo dal routing). Il cambio di modalità non tocca "Registrati" (che torna al login con una notifica, comportamento invariato) né "Password dimenticata" (resta sulla stessa pagina).

**Verifica.** Riprodotto deliberatamente il bug segnalato con Playwright: navigato da sloggati direttamente a `/ricerche/{id}/overview` di una Ricerca di prova (l'URL nella barra resta quello, come da comportamento del ramo `path="*"`), poi effettuato il login — prima della correzione l'atterraggio sarebbe stato su quella Ricerca specifica; dopo la correzione, confermato l'atterraggio su `/ricerche`. Lint e build puliti. Dati di prova ripuliti al termine.

**Stato.** Implementato.

## 56. Salvataggio automatico della query al primo articolo aggiunto alla Ricerca (2026-09-01)

**Contesto.** L'utente ha chiesto che una query venga salvata automaticamente tra le "Query salvate" della Ricerca nel momento in cui il primo articolo trovato con quella query viene aggiunto alla Ricerca — senza dover passare dal pulsante manuale "Salva query".

**Decisione.** In `SearchPapersPage.jsx`, un `useRef(false)` (non uno stato: non deve causare un re-render) traccia se la query corrente è già stata salvata — automaticamente o a mano. Resettato a `false` ad ogni nuova ricerca eseguita (inizio di `handleFormSubmit`): ogni ricerca "vergine" torna candidabile al salvataggio automatico. `SearchResults.jsx` propaga un nuovo callback `onArticleAdded` fino al singolo `ArticleCard`, invocato solo dopo un `addArticleToRicerca` andato a buon fine. Al primo articolo aggiunto da una ricerca non ancora salvata, `handleArticleAdded` marca subito il ref (prima ancora di sapere se il salvataggio andrà a buon fine, per non ritentare ad ogni articolo successivo aggiunto nel frattempo) e chiama `createRicercaQuery` con un nome generato automaticamente (`buildAutoQueryName`: i termini del primo gruppo di keyword, o gli autori, o la venue, in quest'ordine di priorità — nessun campo nome da compilare in questo flusso, a differenza del salvataggio manuale). Se il salvataggio esplicito "Salva query" viene usato prima che un articolo venga aggiunto, marca anch'esso il ref: non si vuole un doppio salvataggio della stessa query.

Il salvataggio automatico fallito non genera un errore visibile né interrompe il flusso di aggiunta articoli (solo un `console.warn`): l'utente ha cliccato "Aggiungi alla ricerca", non "Salva query" — un effetto collaterale implicito non deve disturbare l'azione esplicitamente richiesta.

**Verifica.** Verificato via Playwright con chiamate dirette all'endpoint durante il flusso: query salvate vuote prima di aggiungere un articolo; una query salvata (nome "transformer", parametri corretti) dopo il primo articolo aggiunto; ancora una sola query, non duplicata, dopo aver aggiunto un secondo articolo dagli stessi risultati. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 57. Sessione scaduta: redirect automatico alla schermata di login (2026-09-05)

**Contesto.** L'utente ha chiesto che, quando il token JWT scade o diventa non valido, l'app riporti automaticamente alla schermata di login invece di lasciare l'interfaccia bloccata su errori silenziosi delle chiamate API.

**Decisione.** In `client.js`, `apiRequest` intercetta le risposte `401` ricevute da una richiesta che aveva effettivamente allegato un token (per non scattare su un login con credenziali sbagliate, dove non c'è alcun token da allegare), e invoca un handler globale registrabile (`setSessionExpiredHandler`). `App.jsx` lo registra al mount: pulisce il token da `localStorage`, forza `showAuth=true` (schermata di login diretta, non la Home) e imposta un messaggio "Sessione scaduta: accedi di nuovo." mostrato da `AuthForm` tramite il box notice già esistente (letto via `useState` lazy initializer, coerente con il pattern già usato per le query salvate — niente `useEffect`). Il logout esplicito e il click su "Accedi" dalla Home restano invariati (nessun avviso mostrato in quei casi).

**Stato.** Implementato.

---

## 58. Bottone info sulla "Profondità di ricerca" (2026-09-05)

**Contesto.** L'utente ha chiesto un modo per vedere, direttamente nel form di ricerca, quanti articoli per fonte restituisce ciascun livello di profondità (bassa/media/alta), senza dover consultare il codice.

**Decisione.** In `SearchForm.jsx`, un bottone "i" accanto all'etichetta "Profondità di ricerca" mostra un tooltip con i target per livello (15/50/150 articoli per fonte), presi da `SEARCH_DEPTH_LEVELS` in `schemas/search.py`. Il tooltip si apre in hover (o al focus da tastiera) via CSS puro (Tailwind `group`/`group-hover`/`group-focus-within`), posizionato in `absolute` per sovrapporsi al resto della UI invece di spostarne il layout sottostante — nessuno stato React necessario per aprirlo o chiuderlo.

**Stato.** Implementato.

---

## 59. Nessun tetto fisso sul numero di keyword mandate alle API (2026-09-05)

**Contesto.** L'utente ha proposto di limitare la query esterna alle prime 1-2-3 keyword del gruppo attivo, per delegare il più possibile il filtraggio alla logica interna, chiedendo conferma che l'idea avesse senso.

**Decisione.** Confermato che il principio di fondo (query esterna minima, filtro completo sempre locale) è già alla base dell'architettura (voce 1): ogni fetch manda già solo i termini del gruppo AND attivo, non tutti i gruppi della ricerca insieme. Un tetto fisso a 1-2-3 termini è stato però scartato: su Crossref/DBLP (query libera per rilevanza) e Semantic Scholar (termini in OR) ridurre i termini abbassa il tasso di articoli che superano poi il filtro locale, e la paginazione adattiva ha un budget fisso di pagine extra per fonte (2/5/10 su bassa/media/alta, vedi voce 10) — si rischia di esaurirlo prima di raggiungere il target, ottenendo **meno** articoli restituiti, non di più. Se in futuro serve ridurre il rumore nei risultati, la leva corretta è il budget di pagine extra o il target per livello di profondità, non il troncamento dei termini in query.

**Stato.** Deciso, nessuna modifica al codice (comportamento esistente confermato corretto).

---

## 60. Bug: l'espansione semantica restringeva i risultati invece di allargarli (2026-09-05)

**Contesto.** Rileggendo l'architettura di ricerca per rispondere a una domanda dell'utente, è emerso un bug reale nella feature di espansione semantica (voce 48): `KeywordsPanel.jsx` aggiungeva i suggerimenti (sinonimi/acronimi) come nuovi tag nello **stesso** gruppo OR del termine originale. Ma `filtering.py::_matches_keywords` tratta i termini dentro un gruppo in **AND**, non OR — quindi un suggerimento aggiunto così facendo *restringeva* i risultati (richiedendo termine originale E sinonimo insieme), l'esatto opposto dello scopo della feature (allargare il recall). L'utente ha confermato la correzione: il tasto "✨" deve creare una nuova sezione delle keyword in OR con il suggerimento al suo interno, non estendere quella esistente.

**Decisione.** `KeywordsPanel.jsx::handleExpand` ora deduplica i suggerimenti contro tutti i termini già presenti in *qualunque* gruppo (non solo quello corrente), e per ognuno crea una nuova sezione OR a sé (un gruppo con un solo termine), invece di aggiungerlo al gruppo esistente. Nuovo handler `addGroups` in `SearchPapersPage.jsx` (accanto al già esistente `addGroup` per il "+" manuale) che appende più gruppi in un solo aggiornamento di stato, passato come prop `onAddGroups`.

**Verifica.** Riprodotto il bug e la correzione via Playwright con un account di prova: inserito "nlp" nel gruppo principale, cliccato "✨" → comparsa una nuova sezione "Alternativa 1" con "Natural Language Processing" (preso dal dizionario statico, `nlp` è un acronimo noto), gruppo principale rimasto invariato con solo "nlp" (non fuso). Account e dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 61. Ricerca rapida pubblica, senza login, come alternativa alla pagina di accesso (2026-09-05)

**Contesto.** L'utente ha chiesto di rendere la ricerca rapida raggiungibile anche da fuori del sito, come alternativa al login sulla schermata iniziale — non solo da autenticati.

**Decisione — backend.** `POST /api/search` richiedeva `get_current_user` (401 senza token). Nuovo `get_optional_user` in `utenti.py`, basato su un secondo `OAuth2PasswordBearer(auto_error=False)`: restituisce `None` invece di sollevare 401 quando manca l'header Authorization (un token presente ma invalido resta un errore esplicito, propagato da `get_current_user`). L'endpoint `/search` lo usa al posto dell'originale; senza utente autenticato, `api_keys` passato a `search_all_sources` è `None`, e ogni adapter ripiega sulla chiave API globale del server se impostata (comportamento già esistente per gli utenti senza chiave personale).

**Decisione — frontend.** Nuova rotta pubblica `ricerca/paper` dentro il ramo non autenticato di `App.jsx` (accanto al catch-all che mostra Home/AuthForm), che monta `PublicSearchPage.jsx` — un header minimale (logo + bottone "Accedi", che salva `showAuth=true` e naviga a `/` per far comparire `AuthForm`) al posto di `AppLayout` (che presuppone un utente loggato: `ProfileMenu` chiama `/users/me`, fallirebbe per un anonimo). Il contenuto è lo stesso `SearchPapersPage` già usato dalla ricerca rapida autenticata, montato senza prop `research`: già gestiva questo caso (nessun salvataggio, bottone "Aggiungi alla ricerca" nascosto). `HomePage.jsx` mostra ora due bottoni impilati verticalmente ("Accedi" sopra, poi "o", poi "Prova la ricerca rapida" sotto) invece del solo "Accedi".

**Verifica.** Testato `/api/search` senza header Authorization: 200 con risultati reali (prima del fix, 401). Verificato via Playwright da browser anonimo (nessun token in localStorage): bottone "Prova la ricerca rapida" in Home → click → atterraggio su `/ricerca/paper` → bottone "Accedi" nell'header pubblico presente, "Aggiungi alla ricerca" assente → ricerca reale eseguita con successo → click su "Accedi" riporta alla schermata di login.

**Stato.** Implementato.

---

## 62. Permessi del proprietario: rimozione membri dal team e di articoli salvati (2026-09-05)

**Contesto.** L'utente ha chiesto due nuove azioni riservate al proprietario di una Ricerca: rimuovere un membro dal team, e rimuovere un articolo dalla lista di quelli salvati.

**Decisione — rimozione membro.** Nuovo `DELETE /ricerche/{id}/team/{user_id}` (`ricerche.py`), solo proprietario (403 altrimenti), che rifiuta la rimozione del proprietario stesso (400). Cancella la/le `Research` (partecipazione) dell'utente per quel progetto, ma lascia intatti gli `AddedArticle` che vi fanno riferimento: i paper già aggiunti da un membro restano nella Ricerca come contributo condiviso, non suo personale (stesso principio delle Query salvate) — la Cronologia mostra già "Utente rimosso" per un `added_by` la cui `Research` non esiste più, quindi il caso era già gestito con grazia altrove nel codice. Frontend: bottone "Rimuovi" in `TeamMemberItem.jsx`, mostrato solo se non è il proprietario e chi guarda lo è (`TeamPage.jsx`, `isOwner` già disponibile da `listRicercaTeam`).

**Decisione — rimozione articolo.** Nuovo `DELETE /ricerche/{id}/paper/{article_id}` (`ricerche.py`), solo proprietario. L'id articolo è quasi sempre una URL intera (es. `http://arxiv.org/abs/...`), quindi la rotta usa il convertitore `{article_id:path}` per accettare gli slash al suo interno senza spezzarli su più segmenti; il frontend fa comunque `encodeURIComponent` sull'id per sicurezza. Rimuove **tutte** le istanze salvate di quell'articolo nella Ricerca (un `AddedArticle` per membro che l'ha aggiunto separatamente, se capitato): dal punto di vista dell'utente è un solo articolo da togliere dalla collezione condivisa, non una rimozione per partecipante. Frontend: bottone "Rimuovi" in `ArticleListItem.jsx`, mostrato in `OverviewPage.jsx` solo se `isOwner` (già recuperato dalla stessa chiamata a `listRicercaTeam` usata per la sidebar "Team").

Nessuna conferma richiesta prima di rimuovere (né per il membro né per l'articolo): stesso pattern già in uso per "Elimina" su una Ricerca intera in `ResearchesPage.jsx`, un solo click.

**Verifica.** Script end-to-end via richieste HTTP dirette al server reale (due utenti di prova, A proprietario e B membro aggiunto direttamente in DB per bypassare il flusso invito via email, già verificato altrove): B non può rimuovere se stesso dal team (403, non è owner) né A stesso (400, è il proprietario); A rimuove B con successo (200), B sparisce dalla lista team; articolo aggiunto e poi rimosso da A (200), B (ormai fuori dal team) riceve 403 nel tentativo. Verificato anche via Playwright che i bottoni "Rimuovi" compaiono solo per il proprietario e che il click su un membro lo rimuove davvero dalla lista. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 63. Condivisione trasparente delle chiavi API personali con il team di una Ricerca (2026-09-05)

**Contesto.** L'utente ha chiesto di poter condividere le proprie chiavi API personali (OpenAlex, Semantic Scholar) con gli altri membri di una Ricerca specifica, disattivata di default e attivabile ricerca per ricerca da un controllo vicino a ciascuna chiave nella pagina "API keys". Due punti chiariti con l'utente prima di implementare: (1) il controllo seleziona le *Ricerche* a cui condividere quella chiave, non le fonti; (2) la chiave condivisa viene usata automaticamente lato server per chi ne beneficia, senza mai essere mostrata agli altri membri; (3) la chiave personale di chi cerca ha comunque sempre priorità su una condivisa da altri.

**Decisione — modello dati.** Nuovo campo `User.api_key_shared_with: dict[str, list[str]]` (`models.py`): per ogni `source_id`, la lista degli id di `Project` a cui quella chiave è condivisa. Assente/vuoto di default (nessuna condivisione).

**Decisione — backend, impostazione.** `GET /users/me/api-keys` ora restituisce anche `researches` e, per ogni fonte, `shared_with`. Corretto durante la verifica con l'utente: `researches` elenca solo le Ricerche di cui l'utente è **proprietario**, non anche quelle a cui partecipa soltanto (`my_owned_project_ids` in `utenti.py`, non la più ampia "proprietario o partecipante" di `list_ricerche`) — condividere una chiave con l'intero team è una decisione riservata a chi possiede la Ricerca, stessa asimmetria di invita/rimuovi-membro/elimina-Ricerca in `routes/ricerche.py`. `shared_with` resta comunque filtrato contro le Ricerche attuali dell'utente, nel caso non ne fosse più proprietario dopo aver attivato lì la condivisione. Nuovo `PUT /users/me/api-keys/{source_id}/sharing` (body `{project_ids}`): sostituisce l'intera lista, validando lato server che ogni id sia davvero una Ricerca di cui l'utente è proprietario (un id forzato per una Ricerca a cui partecipa soltanto viene scartato in silenzio, non è un errore).

**Decisione — backend, risoluzione durante la ricerca.** `SearchRequestIn` (`ricerca.py`) guadagna un campo opzionale `ricerca_id`, mandato dal frontend solo per una ricerca fatta da dentro una Ricerca specifica (non per la ricerca rapida, autenticata o pubblica). Nuova `resolve_api_keys(current_user, ricerca_id)`: parte dalle chiavi personali dell'utente (sempre prioritarie); se manca una chiave per una fonte e `ricerca_id` è valido e accessibile, cerca tra gli altri membri della stessa Ricerca uno che abbia condiviso la propria chiave per quella fonte *e per quel progetto specifico*, e la usa. Un `ricerca_id` mancante, inesistente o non accessibile non è un errore: si prosegue con le sole chiavi personali (la condivisione è un bonus, non un requisito — stessa filosofia resiliente della ricerca multi-fonte, voce 1).

**Decisione — frontend.** `ApiKeysPage.jsx`: sotto ogni chiave impostata, un toggle "+ Condividi con una Ricerca" (mostrato solo se la chiave è impostata e l'utente ha almeno una Ricerca) apre una checklist scorrevole (`max-h-40 overflow-y-auto`) con le Ricerche dell'utente, una per riga con checkbox — la "tendina a scorrimento" richiesta. Ogni check/uncheck salva subito (`PUT .../sharing` con la lista aggiornata), nessun bottone "Salva" separato. `SearchPapersPage.jsx` passa `ricercaId: research?.id` a `searchPapers()` quando la ricerca avviene dentro una Ricerca specifica.

**Verifica.** Script end-to-end via richieste HTTP + chiamata diretta a `resolve_api_keys` sullo stato DB reale: A imposta e condivide la propria chiave OpenAlex con una Ricerca di cui B (senza chiave propria) fa parte → `resolve_api_keys(B, ricerca_id)` risolve alla chiave di A; B imposta poi una propria chiave → `resolve_api_keys(B, ricerca_id)` risolve alla chiave di B, non più a quella di A (priorità della chiave personale confermata). Verificato anche via Playwright il rendering del toggle "Condividi con una Ricerca" e il funzionamento della checklist (checkbox marcata solo dopo la conferma dal server, persistente al reload). Ripetuto dopo la correzione proprietario-vs-partecipante: A (proprietario) vede la Ricerca tra quelle condivisibili, B (solo partecipante) no; B che forza comunque l'id nel body di `PUT .../sharing` ottiene una lista scartata (`shared_with: []`), A la stessa richiesta va a buon fine. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 64. Fallback automatico e avviso quando una chiave API di ricerca non è valida (2026-09-05)

**Contesto.** L'utente ha notato che OpenAlex e Semantic Scholar (le uniche fonti con chiave personale/condivisa) non avevano alcun controllo su una chiave non più valida: un 401/403 cadeva nello stesso `if response.status_code != 200: return []` di qualunque altro errore, quindi quella fonte restituiva zero risultati in silenzio, indistinguibile da "nessun risultato" o da un guasto momentaneo del server. A differenza della chiave LLM per l'espansione semantica (voce 48, dove una chiave rotta deve dare un errore visibile e niente fallback silenzioso — lì è un'azione esplicita con feedback immediato), qui la chiave è usata in modo trasparente dentro una ricerca multi-fonte parallela: l'utente ha chiesto di ripiegare sulla versione senza chiave invece di perdere la fonte, ma con un avviso visibile che lo informi dell'accaduto.

**Decisione — adapter.** Nuovo `BaseAdapter.key_invalid_fallback: bool` (`base.py`), `False` di default. `OpenAlexAdapter`/`SemanticScholarAdapter`: un 401/403 mentre `self.api_key` è impostata (personale o condivisa da un membro del team, non quella globale del server) marca il flag, azzera `self.api_key` e ritenta nello stesso ciclo di retry già esistente (stesso budget di 3 tentativi usato per 429/503, nessun budget separato). Corretto anche un bug collaterale in Semantic Scholar: l'header `x-api-key` veniva costruito una sola volta prima del loop (non rifletteva mai un ripiego a metà tentativo) e, senza alcuna chiave configurata né personale né globale, sarebbe stato `{"x-api-key": None}` — valore che httpx rifiuta perché gli header devono essere stringhe; ora viene ricalcolato a ogni tentativo e omesso del tutto se non c'è nessuna chiave.

**Decisione — propagazione.** `search_all_sources` (`orchestrator.py`) ora restituisce una tupla `(articles, warnings)` invece della sola lista di articoli (unico chiamante, `/search` in `ricerca.py`, aggiornato di conseguenza): dopo il fetch, controlla `key_invalid_fallback` su ciascuna istanza adapter e costruisce un avviso per fonte, con il nome "umano" della fonte (nuovo `ADAPTER_CLASS_TO_NAME`, verso inverso di `ADAPTER_REGISTRY`) invece del nome della classe Python. `POST /api/search` include `warnings` nella risposta accanto a `count`/`results`.

**Decisione — frontend.** `SearchPapersPage.jsx` salva `data.warnings` in uno stato dedicato, azzerato ad ogni nuova ricerca; se non vuoto, un banner ambra per ciascun avviso (`"<Fonte>: <messaggio>"`) compare sopra i risultati — coerente con lo stile già usato per notice/errori nel resto del sito, ma in ambra invece che rosso/verde perché è un avviso, non un errore bloccante (la ricerca è comunque riuscita).

**Verifica.** Impostata via API una chiave OpenAlex volutamente non valida, poi eseguita una ricerca reale (`bassa`, solo OpenAlex): risposta 200 con 27 risultati reali (fallback riuscito, non un fallimento silenzioso) e `warnings` con un'unica voce `{"source": "OpenAlex", "message": "..."}`. Verificato via Playwright che il banner ambra compare davvero nella pagina sopra i risultati con il testo corretto. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 65. Bug: "Profilo" evidenziato insieme alla sottopagina attiva nella tendina profilo; tendina chiusa al click fuori (2026-09-05)

**Contesto.** L'utente ha segnalato che, su "API keys" (o "Inviti"), la tendina del menu profilo evidenziava sia la voce attiva sia "Profilo" — bug di `NavLink` di React Router: senza la prop `end`, `to="/profilo"` è considerato attivo per qualunque path che *inizia* con `/profilo`, quindi anche `/profilo/api-keys` e `/profilo/inviti`. Ha chiesto anche di chiudere la tendina cliccando fuori da essa, finora possibile solo ricliccando il bottone o cambiando pagina.

**Decisione.** `ProfileMenu.jsx`: aggiunta la prop `end` alla `NavLink` di "Profilo" (le altre due, "API keys" e "Inviti", non ne hanno bisogno: non hanno sotto-percorsi propri da distinguere). Nuovo listener `mousedown` su `document` (attivo solo mentre la tendina è aperta, ripulito altrimenti) che la chiude se il click cade fuori dal contenitore (`ref` sul `div` esterno, `.contains(event.target)`).

**Verifica.** Playwright: atterrati direttamente su `/profilo/api-keys` (tendina già aperta di default, segue la sezione attiva) → "API keys" evidenziato, "Profilo" no; click fuori dalla tendina (sul titolo della pagina) → tendina chiusa. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 66. Un membro può abbandonare una Ricerca di propria iniziativa (2026-09-05)

**Contesto.** Discutendo se avesse senso aggiungere altri ruoli oltre a proprietario/membro, è emerso un gap più concreto: un membro non può uscire da una Ricerca da solo, deve chiedere al proprietario di rimuoverlo. Valutato che un terzo ruolo (es. "admin" con permessi di invito/rimozione ma non di eliminazione) non risolve un problema reale per team piccoli come quelli di una rassegna di letteratura; questa azione self-service sì.

**Decisione.** Nuovo `POST /ricerche/{id}/leave` (`ricerche.py`), simmetrico a `remove_team_member` (voce 62) ma iniziato dall'utente su se stesso: rifiuta il proprietario (400, non può abbandonare la propria Ricerca — non esiste un flusso di trasferimento proprietà) e chi non partecipa affatto (403). Stessa scelta della voce 62 sui paper già aggiunti: restano nella Ricerca come contributo condiviso, si rimuove solo la `Research` (partecipazione). Frontend: `TeamPage.jsx` mostra, nello stesso spazio in cui l'owner vede il form di invito, una card "Abbandona la Ricerca" per chi non è proprietario; un click chiama `leaveRicerca` e reindirizza a `/ricerche` (l'utente perde l'accesso alla Ricerca, non avrebbe più senso restare sulle sue sottopagine). Nessuna conferma richiesta, stesso pattern one-click già in uso per le altre azioni distruttive del sito.

**Verifica.** Script end-to-end via richieste HTTP dirette al server reale: il proprietario non può abbandonare (400); un estraneo non può abbandonare una Ricerca a cui non partecipa (403); un membro abbandona con successo (200), sparisce dalla lista team, perde l'accesso alla Ricerca (403 su richieste successive) e non può abbandonare una seconda volta (403, non ne fa più parte). Verificato anche via Playwright: form di invito non visibile a un membro, click su "Lascia la Ricerca" seguito da redirect reale a `/ricerche`. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 67. Server SMTP reale: account Gmail dedicato al progetto (2026-09-05)

**Contesto.** Il server SMTP (voce 50) era pronto ma mai configurato con credenziali reali (`SMTP_HOST` ecc. vuoti in `backend/.env`). Discusso con l'utente: l'utenza iniziale sarà ristretta (dipartimento di Informatica UniMi — ricercatori, dottorandi, qualche laureando, professori) e il volume di email basso (inviti al team, reset password), quindi un provider transazionale dedicato (SendGrid, Mailgun, SES...) è sovradimensionato per ora: Gmail gratuito è sufficiente.

**Decisione.** Creato un account Gmail dedicato al progetto (`paperdex.unimi@gmail.com`), non l'account personale dell'utente — l'indirizzo mittente che vedranno gli utenti reali non deve essere una casella personale, ed è più facile da passare ad altri (relatore, altri sviluppatori) in futuro. Attivata la verifica in due passaggi e generata una password per le app (obbligatoria per l'autenticazione SMTP, Google non accetta più la password normale). Valori scritti in `backend/.env` (gitignored, non nel repo): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER`/`SMTP_FROM` con l'indirizzo dedicato, `SMTP_PASSWORD` con la password per le app (spazi rimossi: Google la mostra a gruppi di 4 solo per leggibilità, il valore reale non li contiene), `SMTP_USE_TLS=true` (STARTTLS, coerente con `send_email()` in `email.py`).

**Stato.** Implementato (credenziali configurate); invio di prova reale ancora da eseguire.

---

## 68. Cambio password da loggato rimosso dall'interfaccia, in favore del solo flusso email (2026-09-05)

**Contesto.** Con l'SMTP ora configurato, l'utente ha sollevato la questione di come debba convivere il cambio password già esistente in due forme: quello da loggato in `ProfilePage.jsx` (richiede la password attuale, nessuna email) e il recupera-password via email (per chi non riesce ad accedere). Non è una scelta obbligata — sono flussi complementari in uso in molte app — ma l'utente preferisce per ora un solo percorso, quello email, mantenendo però il codice del cambio password da loggato pronto per un eventuale ripristino: è una decisione ancora provvisoria, non definitiva.

**Decisione.** `PasswordSection` in `ProfilePage.jsx` non viene più renderizzata, ma la funzione resta definita nel file con un commento che ne spiega lo stato provvisorio, invece di essere cancellata: una `eslint-disable-next-line no-unused-vars` evita che il linter la segnali come codice morto. L'endpoint `POST /users/me/password` sul backend non è stato toccato — resta raggiungibile (es. da un client esterno o in un test), semplicemente nessuna UI lo chiama più.

Al suo posto, nuova `PasswordResetSection`: un bottone "Invia email per reimpostare la password" che richiama lo stesso `requestPasswordReset` già usato da "Password dimenticata?" in `AuthForm.jsx`, passando `user.email` (l'utente è già loggato, non serve chiedergliela). Occupa lo stesso spazio prima condiviso con Email (griglia a due colonne ripristinata). Così un utente loggato che vuole cambiare password ha comunque un modo per farlo direttamente dal proprio profilo, senza dover uscire e passare dalla schermata di login.

**Verifica.** Playwright: vecchio form "Password attuale" assente dalla pagina; nuova sezione "Password" presente con l'indirizzo email dell'utente citato correttamente e il bottone di invio. Dati di prova ripuliti al termine.

**Stato.** Implementato, provvisorio sulla rimozione del cambio password da loggato (l'utente potrebbe tornare sulla decisione).

---

## 69. Occhiolino per mostrare/nascondere la password, in tutti i campi password del sito (2026-09-05)

**Contesto.** L'utente ha chiesto un toggle "occhiolino" dentro la barra di ogni campo password, applicato uniformemente a tutti i form del sito, non solo al login.

**Decisione.** Nuovo componente `PasswordInput.jsx`: wrapper su un `<input>` con stato locale `visible` (default `false`), che alterna `type="password"`/`type="text"` e mostra un'icona occhio/occhio-barrato come bottone `position: absolute` dentro la stessa barra (padding destro aggiunto perché il testo non ci finisca sotto). Riceve le stesse prop di un input normale (`value`, `onChange`, `required`, `minLength`, `placeholder`...) così da sostituire un `<input type="password" className={inputClass}>` senza cambiare nient'altro attorno. Sostituiti tutti e 9 i campi password del sito: login/registrazione (`AuthForm.jsx`), reimposta password (`ResetPasswordPage.jsx`), registrazione da invito (`InvitePage.jsx`), le due chiavi API in "API keys" (`ApiKeysPage.jsx` — stesso `type="password"` usato per mascherarle, stesso beneficio nel poterle rileggere prima di salvare), e i tre campi del cambio password da loggato in `ProfilePage.jsx` (voce 68: non più mostrato in UI, ma tenuto aggiornato per coerenza visto che potrebbe tornare visibile).

**Verifica.** Playwright sul form di login: campo `type="password"` di partenza, click sull'occhiolino → `type="text"` e valore digitato leggibile in chiaro, secondo click → torna `type="password"`. Verificato anche via screenshot l'allineamento dentro la barra (icona non sovrapposta al testo, padding corretto).

**Stato.** Implementato.

---

## 70. Esportazione degli articoli salvati: JSON, CSV, BibTeX, RIS (2026-09-05)

**Contesto.** L'utente ha chiesto una tendina per esportare gli articoli salvati di una Ricerca, con scelta del formato tra JSON/CSV/BibTeX; ha chiesto un consiglio su altri formati utili — proposto (e accettato implicitamente, nessuna obiezione) **RIS**, il formato che quasi tutti i reference manager (Zotero, EndNote, Mendeley) importano nativamente, a differenza di BibTeX che resta più legato a chi scrive in LaTeX. Chiarito con l'utente: esporta gli articoli salvati di UNA Ricerca (non i risultati di ricerca non ancora salvati), e il file generato non va persistito sul server — resta scaricabile solo per la sessione corrente della pagina (nessuna nuova collezione nel database, nessuna cronologia delle esportazioni passate).

**Decisione — backend.** Nuovo modulo `services/utils/export.py`: `EXPORT_FORMATS` (formato → content-type/estensione) ed `EXPORTERS` (formato → funzione di serializzazione), entrambi dizionari così la rotta non deve conoscere i dettagli di ciascun formato. JSON è il `model_dump` diretto degli articoli; CSV appiattisce i campi principali (titolo, autori uniti da "; ", anno, venue, doi, fonte, abstract) via il modulo `csv` di Python (gestisce da solo virgolette/virgole negli abstract); BibTeX genera una chiave `cognome+anno` deduplicata con suffisso a/b/c in caso di collisione (euristica: ultima parola del nome completo come cognome, non ci sono dati nome/cognome separati nelle fonti aggregate), tipo `@article` se c'è una venue nota altrimenti `@misc` (tipico per preprint senza pubblicazione formale); RIS usa i tag standard (TY/TI/AU/PY/JO/DO/AB/UR/ER), tipo `JOUR` se c'è una venue altrimenti `GEN`.

Nuovo `GET /ricerche/{id}/export?format=...` (`ricerche.py`): stesso controllo di accesso di `list_ricerca_articles` (chiunque partecipi alla Ricerca, non solo il proprietario — esportare non è un'azione distruttiva), recupera **tutti** gli `AddedArticle` collegati (niente paginazione, a differenza di `/paper`: qui serve l'elenco completo), e restituisce il contenuto come `Response` con `Content-Disposition: attachment` e un nome file basato sullo slug del nome della Ricerca (non il solo id Mongo). Formato sconosciuto → 422 con l'elenco di quelli validi.

**Decisione — CORS.** Aggiunto `expose_headers=["Content-Disposition"]` alla `CORSMiddleware` in `main.py`: di default il browser nasconde a `fetch()` ogni header di risposta fuori dalla lista "safe" del CORS, `Content-Disposition` non c'è — senza questa riga il frontend non avrebbe potuto leggere il nome file suggerito dal backend (scoperto durante la verifica, non a priori).

**Decisione — frontend.** Nuovo `exportRicercaArticles` in `api/ricerche.js`: non passa da `apiRequest` (che fa sempre `response.json()`) perché la risposta è un file grezzo in un formato a scelta, non JSON — un fetch diretto con l'header `Authorization` letto da `localStorage` (stesso `TOKEN_KEY` di `client.js`, ora esportato insieme ad `API_BASE_URL` per essere riusabile qui), che legge il nome file dall'header `Content-Disposition` e restituisce `{ blob, filename }`. Nuovo `ExportMenu.jsx`: bottone "Esporta ▾" che apre una tendina con i 4 formati (stesso pattern click-fuori-per-chiudere di `ProfileMenu.jsx`, voce 65); scegliendone uno si genera il file (stato di caricamento sul singolo bottone), poi la tendina si chiude e compare un link "Scarica `<nomefile>`" (Blob URL via `URL.createObjectURL`, liberato con `revokeObjectURL` al successivo export o allo smontaggio) — il download vero e proprio è quindi un secondo click esplicito, non automatico. Montato in `OverviewPage.jsx` accanto al conteggio "N paper salvati", visibile solo se ce n'è almeno uno.

**Verifica.** Backend: creata una Ricerca di prova con due articoli (uno stile preprint senza venue, uno con venue/DOI, abstract con virgolette e virgola per testare l'escaping CSV) → tutti e 4 i formati restituiscono 200 con `Content-Type`/`Content-Disposition` corretti e contenuto verificato riga per riga (incluso il fallback `@misc`/`GEN` senza venue vs `@article`/`JOUR` con venue); formato sconosciuto → 422. Frontend via Playwright: tendina con le 4 opzioni, generazione BibTeX, comparsa del link "Scarica", download reale intercettato e contenuto del file salvato verificato, tendina chiusa al click fuori. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 71. Deduplicazione automatica dei risultati, con revisione manuale (2026-09-06)

**Contesto.** L'utente ha delineato l'intero flusso di deduplicazione: raggruppare graficamente gli articoli simili nei risultati di ricerca, poter aggiungere un gruppo intero (ne finisce salvato solo uno, per preferenza), e una tab "Deduplicazione" per Ricerca dove rivedere ogni gruppo e sostituire la scelta, con un "annulla" finché si resta sulla pagina. Criterio di similarità e preferenza-fonte esplicitamente rimandati a dopo ("li vedremo dopo") — concordato con l'utente di costruire comunque tutta l'infrastruttura ora, con questi due punti isolati in un solo modulo per essere facili da sostituire quando verranno decisi davvero.

**Decisione — criteri placeholder, isolati.** Nuovo `services/utils/dedup.py`: `group_key(article)` usa il titolo normalizzato esatto (`Article.pulisci_titolo()` — minuscolo, senza punteggiatura, spazi collassati), lo stesso criterio già usato in `statistics/indexes.py` per confrontare risultati tra fonti nella valutazione di copertura per la tesi; titolo assente resta un gruppo a sé (id come fallback, non accorpa articoli scorrelati sotto la chiave vuota). `pick_preferred(articles)` sceglie semplicemente la fonte più in alto nell'ordine (già arbitrario) di `ADAPTER_REGISTRY` (ArXiv > Crossref > DBLP > OpenAlex > Semantic Scholar). Nessun altro punto del codice dipende da come sono implementate queste due funzioni.

**Decisione — modello dati.** Nuovo `DuplicateGroup` (`models.py`): `project`, `added_article` (Link all'`AddedArticle` attualmente "scelto"), `alternative_ids` (id di `Article` scartati — inseriti comunque nella cache globale `Article` al momento dell'aggiunta di gruppo, altrimenti non ci sarebbe nulla da mostrare più tardi nella tab, dato che i risultati di ricerca non salvati sono normalmente solo transitori, mai persistiti).

**Decisione — backend, ricerca.** `POST /api/search` annota ogni risultato con `group_key` (`annotate_with_group_key`, usato al posto del semplice `model_dump`) invece di restituire un elenco piatto senza alcuna indicazione di raggruppamento.

**Decisione — backend, aggiunta di gruppo e revisione.** `POST /ricerche/{id}/paper/group` (body `{articles: [...]}`): upsert di *tutti* i membri nella cache `Article`, sceglie il preferito, crea un solo `AddedArticle` (idempotente come il singolo add) e un `DuplicateGroup` (esteso invece di duplicato se già esistente per lo stesso articolo scelto). `GET /ricerche/{id}/duplicate-groups`: elenca i gruppi della Ricerca con l'articolo scelto e le alternative per intero (salta in silenzio un gruppo il cui `added_article` è stato rimosso nel frattempo). `POST /ricerche/{id}/duplicate-groups/{group_id}/choose` (body `{article_id}`): scambia la scelta — cancella il vecchio `AddedArticle`, ne crea uno nuovo attribuito a chi effettua lo scambio (non a chi aveva aggiunto il gruppo, stessa logica di attribuzione già in uso per `remove_team_member`), aggiorna `alternative_ids` scambiando il vecchio scelto con quello nuovo. Operazione simmetrica: "annulla" lato frontend è semplicemente rifare la scelta sull'id precedente, nessuna logica server-side dedicata a uno stato "in sospeso" — coerente col vincolo dell'utente ("finché non si lascia la pagina": la cronologia delle scelte vive solo nello stato React del componente). `remove_article_from_ricerca` ora ripulisce anche i `DuplicateGroup` il cui `added_article` è stato appena rimosso, invece di lasciarli orfani nel database indefinitamente.

**Decisione — frontend, risultati di ricerca.** `SearchResults.jsx` raggruppa i risultati per `group_key` (client-side, nessuna restrutturazione della risposta piatta); i gruppi con più di un membro sono avvolti in un contenitore evidenziato (bordo e sfondo violetto) con l'etichetta "N versioni dello stesso paper trovate" e il bottone "+ Aggiungi tutto il gruppo"; ogni membro resta comunque aggiungibile singolarmente com'era già, con in più un badge "Preferito per il gruppo" su quello che la preferenza placeholder sceglierebbe (calcolato anche lato client solo per l'anteprima, la scelta vera resta autoritativa sul backend).

**Decisione — frontend, tab Deduplicazione.** Nuova pagina `DeduplicationPage.jsx` (rotta `ricerche/:id/deduplicazione`, sotto-pagina di una Ricerca come Query salvate/Cronologia/Team — raggiungibile dalla sidebar dell'Overview, non dalla barra di navigazione in alto, stesso pattern già in uso per quelle tre). Ogni gruppo mostra l'articolo scelto (badge "Salvato") e le alternative con un bottone "Scegli questo" ciascuna; un "Annulla ultima scelta" compare dopo il primo scambio e richiama di nuovo `choose` sull'id precedente. Nuova sezione "Deduplicazione" nella sidebar dell'Overview con il conteggio dei gruppi da rivedere e link "Vedi tutti".

**Verifica.** Backend via richieste HTTP dirette: tre "versioni" dello stesso titolo (maiuscole/punteggiatura diverse, fonti ArXiv/Crossref/OpenAlex) + un articolo slegato → `group_key` corretto (uguale per le tre versioni, diverso per l'estraneo); aggiunta di gruppo sceglie ArXiv (primo in `ADAPTER_REGISTRY`); "Articoli salvati" conta 2 (il preferito + lo slegato), non 4; tab Deduplicazione mostra 1 gruppo con le 2 alternative corrette; scambio verso Crossref e poi "annulla" verso ArXiv confermati, conteggio salvati invariato durante lo scambio; rimozione dell'articolo scelto fa sparire il gruppo dalla tab. Frontend via Playwright (risposta di `/api/search` intercettata per simulare un duplicato senza dipendere da API esterne reali): wrapper di gruppo ed etichetta corretti nei risultati, badge "Preferito per il gruppo" sulla fonte giusta, articolo slegato senza wrapper, "Aggiungi tutto il gruppo" funzionante dalla UI; tab Deduplicazione con badge "Salvato", un solo bottone "Scegli questo" per l'alternativa, scambio e "Annulla" verificati end-to-end. Controllato anche visivamente via screenshot. Dati di prova ripuliti al termine.

**Stato.** Implementato (criteri di similarità e preferenza-fonte volutamente placeholder, da rivedere quando l'utente deciderà quelli definitivi).

---

## 72. Criterio di similarità definitivo per la deduplicazione: DOI, poi titolo+autore+anno (2026-09-06)

**Contesto.** Discusso a fondo con l'utente (e la correlatrice) il criterio di similarità rimandato dalla voce 71. Il DOI da solo non basta come unico criterio: un preprint arXiv e la sua versione pubblicata hanno spesso DOI diversi (o il preprint non ne ha affatto), probabilmente il caso di duplicati più comune in questo dominio — serve quindi un criterio di riserva quando il DOI manca o non coincide. Concordato con l'utente: DOI uguale (quando presente su entrambi) **oppure** titolo simile (non uguale) + stesso primo autore + anno vicino. Per il titolo, valutate le opzioni (match esatto, Jaccard su token, distanza di edit via `difflib` di libreria standard, `rapidfuzz`, embedding semantici — questi ultimi scartati: catturano somiglianza di significato, rischiando più falsi positivi tra survey diversi sullo stesso argomento, oltre a essere una dipendenza pesante per un problema di sole stringhe); scelto `rapidfuzz.fuzz.token_set_ratio`, pensato apposta per "stesso titolo, fonti diverse" (perdona riordino di parole, typo e sottotitoli aggiunti).

**Decisione — cascata di criteri.** `services/utils/dedup.py::are_duplicates(a, b)`: se entrambi gli articoli hanno un DOI, uguaglianza diretta (normalizzato: minuscolo, senza prefisso `https://doi.org/`) decide da sola, nessun altro controllo. Altrimenti: `token_set_ratio` sui titoli normalizzati (soglia 90/100, `TITLE_SIMILARITY_THRESHOLD`) **e** stesso cognome del primo autore (ultima parola del nome completo, stessa euristica già usata per le chiavi BibTeX in `export.py` — non uguaglianza sull'intera lista di autori, troppo fragile tra fonti con ordine/formato diversi) **e** anno entro ±1 (`YEAR_TOLERANCE`, tollera lo sfasamento preprint/pubblicazione). Soglie isolate in costanti in cima al modulo, pensate per essere affinate quando si vedranno più casi reali. Dato che ogni gruppo resta comunque rivedibile dall'utente nella tab Deduplicazione (nulla è irreversibile), la soglia pende leggermente verso il recall piuttosto che verso la precisione assoluta: un falso positivo si scarta con un click, un falso negativo (duplicato mai raggruppato) l'utente non lo scopre nemmeno.

**Decisione — algoritmo di raggruppamento.** La similarità a coppie non è transitiva "gratis" come lo era il semplice match-per-chiave della voce 71 (A~B per titolo, B~C per DOI, ma A e C confrontati direttamente potrebbero non risultare simili). Sostituito il raggruppamento con **Union-Find** (Disjoint Set Union, path compression): confronto a coppie di tutti gli articoli di una ricerca (O(n²), trascurabile per le dimensioni in gioco — i risultati di una singola ricerca, non l'intero database) poi raggruppamento per componenti connesse, così A, B e C finiscono comunque nello stesso gruppo anche se solo collegati a catena. L'interfaccia pubblica del modulo (`annotate_with_group_key`, `pick_preferred`) non è cambiata: `ricerca.py` e `ricerche.py` non hanno richiesto alcuna modifica, la `group_key` di ogni articolo è ora semplicemente l'id del primo membro del suo gruppo (comodo, già unico) invece del titolo normalizzato.

**Decisione — dipendenza.** Aggiunta `rapidfuzz` al virtualenv (`pip install rapidfuzz`, nessun file di dipendenze nel progetto da aggiornare — non ce n'è uno, le dipendenze vivono solo nel `.venv` locale).

**Verifica.** Script diretto con casi mirati: DOI uguale (case diverso) forza il duplicato anche con titoli scorrelati; titolo con un typo + stesso autore/anno → duplicati; titolo uguale ma autore diverso → non duplicati; anno con 1 di differenza → duplicati, con 3 → non duplicati; titoli chiaramente diversi → non duplicati; transitività verificata esplicitamente (A~B per titolo, B~C per DOI, titoli di A e C molto diversi tra loro) → un solo gruppo da 3 tramite componenti connesse; due gruppi distinti nello stesso batch restano separati. Verificato anche che `POST /api/search` funziona con l'algoritmo reale collegato (chiamata dal vivo contro ArXiv, `group_key` presente su ogni risultato, nessun errore di importazione di `rapidfuzz` all'avvio del server).

**Stato.** Implementato.

---

## 73. Classifica delle fonti trascinabile per la scelta automatica dei duplicati (2026-09-06)

**Contesto.** Ultimo pezzo rimandato dalla voce 71: la preferenza-fonte per `pick_preferred`. L'utente ha chiesto una tendina a blocchi trascinabili nella tab Deduplicazione, priorità dall'alto verso il basso, con una classifica di default lasciata a me — "tenendo il più autorevole prima".

**Decisione — classifica di default.** `Crossref > DBLP > OpenAlex > Semantic Scholar > ArXiv` (`DEFAULT_SOURCE_PRIORITY` in `dedup.py`), ragionata per autorevolezza del *record bibliografico*, non per comodità di accesso: Crossref è la fonte ufficiale dei DOI (il record arriva direttamente dall'editore) e DBLP è una bibliografia CS curata a mano — entrambe rappresentano la versione "di riferimento" di un lavoro pubblicato. OpenAlex e Semantic Scholar aggregano/derivano metadati da altre fonti (comunque affidabili, ma non primarie). ArXiv è per definizione un preprint non revisionato tra pari: spesso la versione più accessibile, ma non quella autorevole come record bibliografico — per questo in fondo, anche se è la fonte di query di ricerca predefinita e la più "familiare" nel dominio CS. Questo ordine sostituisce l'ordine arbitrario di `ADAPTER_REGISTRY` usato come placeholder nella voce 71.

**Decisione — dato per Ricerca, non personale.** Nuovo campo `Project.source_priority: Optional[list[str]]` (`None` = non ancora personalizzata, si ripiega sul default). Non è una preferenza dell'utente ma della Ricerca: la scelta automatica è condivisa da tutto il team (la tab Deduplicazione stessa è per Ricerca, non per singolo membro), coerente con Query salvate/Team/Articoli salvati. `pick_preferred(articles, source_priority=None)` accetta ora una classifica esplicita; se una fonte non vi compare (es. lista salvata prima che una nuova fonte fosse aggiunta all'app) si ripiega sulla sua posizione nel default invece di romperlo.

**Decisione — backend, endpoint.** `GET /ricerche/{id}/source-priority` (restituisce la classifica attuale — quella salvata o il default — più `is_custom`, per distinguere "non ancora personalizzata" da "personalizzata esplicitamente" senza doverlo indovinare), aperto a qualunque partecipante (deve poter vedere l'ordine anche chi non può cambiarlo). `PUT /ricerche/{id}/source-priority` (valida che la lista sia esattamente una permutazione delle 5 fonti note, 422 altrimenti) inizialmente aperto quanto il GET, **poi ristretto al solo proprietario** su richiesta esplicita dell'utente in un turno successivo — a differenza del salvataggio di una query (non distruttivo, ognuno salva le proprie), qui la classifica è una singola impostazione condivisa che cambia il comportamento per tutto il team, quindi ha più senso vederla come gli altri campi di configurazione della Ricerca già riservati al proprietario.

**Decisione — frontend.** Nuovo `SourcePriorityEditor.jsx`: blocchi trascinabili con drag-and-drop HTML5 nativo (`draggable`, `onDragStart`/`onDragOver`/`onDrop`) — nessuna libreria nuova, sono solo 5 elementi da riordinare. Ogni blocco mostra posizione numerica, icona e nome della fonte (`SourceIcon`, stessa già usata altrove); il riordino salva subito (nessun bottone "Salva" separato, stesso pattern della condivisione API key). Montato in cima a `DeduplicationPage.jsx`, sempre visibile (anche senza ancora nessun gruppo da rivedere: la classifica si può impostare in anticipo). `DeduplicationPage.jsx` recupera `is_owner` da `listRicercaTeam` (fallimento silenzioso: se la chiamata fallisce si ripiega su sola-lettura, non deve rompere il resto della pagina) e lo passa giù: da non-proprietario i blocchi non sono trascinabili (`draggable={isOwner}`, niente maniglia "⠿") e il testo esplicita che solo il proprietario può modificare l'ordine.

**Verifica.** Backend via richieste HTTP dirette: default corretto e `is_custom: false` su una Ricerca nuova; lista incompleta e nome di fonte sconosciuto entrambi rifiutati con 422; classifica personalizzata (ArXiv per primo) salvata e riletta correttamente; aggiunto un gruppo Crossref+ArXiv con quell'ordine attivo → scelto davvero ArXiv, non Crossref (la preferenza personalizzata influenza per davvero `pick_preferred`, non solo salvata senza effetto). Ripetuto dopo la restrizione al proprietario: un partecipante non-owner riceve 403 sul `PUT` ma vede comunque la classifica col `GET`; il proprietario modifica con successo. Frontend via Playwright: drag reale (mouse down/move/up) dell'ultimo blocco (ArXiv) in cima → ordine cambiato nella UI, "Salvataggio…" mostrato, e — dopo un reload della pagina — l'ordine risulta ancora quello trascinato (persistito sul server, non solo in stato locale); poi, con due account, verificato che il non-proprietario vede zero elementi trascinabili e la nota "solo il proprietario", mentre il proprietario vede tutti e 5 gli elementi trascinabili. Controllato anche visivamente via screenshot. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 74. Arricchimento metadati via Zotero `translation-server` (2026-09-07)

**Contesto.** Discusso con l'utente cos'è Zotero e perché è adatto all'arricchimento: non l'app di Zotero in sé, ma due componenti tecnici — i "translator" (centinaia di script, mantenuti da una grande community open source, che sanno estrarre metadati strutturati da migliaia di siti di editori/biblioteche) e `translation-server`, un servizio open source e auto-ospitabile che li espone via HTTP (dato un DOI/ISBN/PMID o un URL, restituisce un record bibliografico pulito). Confermato con l'utente il ruolo nella pipeline: non una sesta fonte di ricerca (non si interroga con una query testuale), ma un arricchimento *dopo* che un articolo è già stato trovato/salvato — dato un articolo con metadati scarsi, completa i campi mancanti.

**Decisione — infrastruttura, fuori dal repository.** `translation-server` è un progetto Node.js di Zotero, clonato (`git clone --recurse-submodules`) in una cartella **fuori** da PapérDex, come sibling (`Desktop/translation-server`, non dentro il repo): è software di terze parti con i propri submodule Git, non ha senso vendorizzarlo dentro il nostro repository. Gira in locale senza Docker (`npm install && npm start`, porta 1969 di default) — nessuna dipendenza nuova per il backend Python, solo un servizio in più da avere avviato durante lo sviluppo (come uvicorn e Vite). Nuova variabile `ZOTERO_TRANSLATION_SERVER_URL` in `backend/.env` (default `http://127.0.0.1:1969`).

**Decisione — quale identificativo usare.** Se l'articolo ha un DOI, ricerca per identificativo (`POST /search`, il DOI come corpo testuale) — più precisa. Altrimenti, dato che ogni adapter normalizza `Article.id` come una URL vera (verificato per tutte e 5 le fonti), scraping della pagina originale (`POST /web`, l'URL come corpo) — copre comunque la maggioranza degli articoli senza DOI (tipicamente i preprint arXiv). Nessun identificativo utilizzabile è un errore esplicito (502 con messaggio chiaro), non un fallimento silenzioso.

**Decisione — arricchisce, non sovrascrive.** `apply_enrichment()` in `services/utils/zotero.py` riempie solo i campi attualmente vuoti dell'`Article` (`abstract`, `venue`, `doi`, `authors`, `publication_date`) con quanto trovato da Zotero — mai sovrascrive un dato già presente, verificato dalla fonte originale. Le date di Zotero sono testo libero ("2023-08-15", "2023", "August 2023"...): parse ISO se possibile, altrimenti il primo anno a 4 cifre nel testo (stesso approccio già usato per le date "solo anno" di DBLP/Semantic Scholar). La risposta di `/search`/`/web` può includere voci accessorie (`itemType: "note"`, es. "15 pagine, 5 figure") agganciate come figlie della voce principale: si prende sempre la prima voce bibliografica vera, non semplicemente `items[0]`.

**Decisione — endpoint e persistenza.** `POST /ricerche/{id}/paper/{article_id}/enrich` (stesso `:path` degli altri endpoint che accettano un id-URL come segmento). Aperto a chiunque partecipi alla Ricerca, non solo al proprietario: non distruttivo, stessa apertura di `add_article_to_ricerca`. Aggiorna e salva l'`Article` direttamente (la cache globale, non una copia): l'arricchimento beneficia ogni Ricerca che referenzia lo stesso articolo, non solo quella da cui è stato lanciato. Restituisce l'articolo aggiornato più `filled_fields` (i nomi dei campi effettivamente riempiti, per il feedback preciso in UI).

**Decisione — frontend.** Bottone "Arricchisci" in `ArticleListItem.jsx` (aperto a tutti, non gated da `isOwner` come "Rimuovi"), con un breve messaggio di conferma sotto ("+ abstract, DOI, autori, data", o "Nessun nuovo dato trovato" se non c'era nulla da aggiungere) — mappa i nomi dei campi in etichette italiane. L'aggiornamento arriva subito nella card (nessun reload della pagina), tramite lo stesso pattern di callback-verso-il-genitore già usato per "Rimuovi".

**Verifica.** Backend con richieste reali contro il `translation-server` locale (non mockato): un articolo arXiv "povero" (solo id e titolo) arricchito con abstract, DOI, autori e data reali (paper "Attention Is All You Need", risposta autentica del servizio); riarricchimento non sovrascrive nulla (`filled_fields` vuoto la seconda volta); un articolo senza DOI né URL valido fallisce con 502 e messaggio chiaro. Frontend via Playwright con un secondo paper mai toccato prima in sessione ("BERT"): nessun link DOI prima, comparsa immediata di DOI/autori/anno dopo il click su "Arricchisci" senza reload, messaggio "+ abstract, DOI, autori, data" mostrato. Controllato anche visivamente via screenshot (prima/dopo). Dati di prova ripuliti al termine (gli `Article` arricchiti restano nella cache globale per design, non sono dati "di prova" da eliminare).

**Stato.** Implementato. Nota operativa: il `translation-server` deve essere avviato manualmente (`cd` nella cartella clonata fuori dal repo, `npm start`) prima di usare la feature — non parte da solo insieme a backend/frontend.

---

## 75. Arricchimento in blocco: bottone "Arricchisci tutti" (2026-09-07)

**Contesto.** L'utente ha chiesto un bottone per arricchire in blocco tutti gli articoli salvati di una Ricerca, invece di uno alla volta.

**Decisione — copre l'intera Ricerca, non solo la pagina visibile.** "Articoli salvati" è paginato (`list_ricerca_articles`, 20 per pagina); "tutti" però deve intendersi alla lettera, non solo quelli caricati sullo schermo in quel momento — sarebbe stato fuorviante altrimenti. Nuovo `POST /ricerche/{id}/paper/enrich-all`: stessa query "tutti gli AddedArticle della Ricerca" già usata da `export_ricerca_articles` (non paginata), non i soli articoli della pagina corrente del frontend.

**Decisione — un errore non blocca gli altri.** Stessa filosofia resiliente già in uso in `search_all_sources` (un adapter che fallisce non ferma gli altri): un articolo senza identificativo utilizzabile, o per cui Zotero non trova nulla, finisce nella lista `errors` della risposta invece di interrompere il giro — gli articoli successivi vengono comunque processati. Sequenziale, non parallelo: stessa cautela già adottata verso le fonti di ricerca esterne, anche se qui il servizio è locale e non ha limiti di frequenza documentati.

**Decisione — nessuna nuova infrastruttura di progresso.** Una singola richiesta HTTP che processa tutti gli articoli in sequenza può richiedere qualche decina di secondi per Ricerche con molti articoli; niente streaming/websocket per il progresso in tempo reale — stesso compromesso già accettato per la ricerca multi-fonte stessa ("può richiedere fino a un minuto" in `SearchResults.jsx`), un semplice indicatore di caricamento con una nota di attesa è coerente con quel precedente invece di introdurre complessità nuova.

**Decisione — frontend.** Bottone "Arricchisci tutti" accanto a "Esporta" nella barra di "Articoli salvati" (stesso contenitore `flex flex-col items-end` per non spostare la riga quando compare il messaggio sotto, stesso trucco già usato per `ExportMenu`). Al completamento, riepilogo testuale ("N di M articoli arricchiti", con "K senza dati trovati" se ce ne sono) e aggiornamento immediato delle card già visibili in pagina — nessun reload, stesso pattern di callback già in uso per il singolo arricchimento.

**Verifica.** Backend con richieste reali contro il `translation-server` locale: tre articoli (due paper arXiv mai toccati in questa sessione, uno senza alcun identificativo) → 2 arricchiti con abstract/DOI/autori/data reali, 1 correttamente in `errors` senza bloccare gli altri due; un secondo giro sugli stessi tre non arricchisce più nulla (idempotente, nessuna sovrascrittura). Frontend via Playwright: nessun link DOI prima su due paper freschi, un solo click su "Arricchisci tutti" → entrambi arricchiti senza reload, messaggio "2 di 2 articoli arricchiti" mostrato. Controllato anche visivamente via screenshot. Dati di prova ripuliti al termine.

**Stato.** Implementato.

---

## 76. Configurazione Docker per il deploy live di `translation-server` (2026-09-07)

**Contesto.** Discusso con l'utente cosa serve perché `translation-server` (avviato a mano in sviluppo, voce 74) diventi un servizio sempre attivo quando l'app andrà live. Concordato Docker con riavvio automatico (`restart: unless-stopped`) come opzione più semplice tra "sempre acceso" e "poco da mantenere", rispetto ad alternative valutate (PM2, systemd, AWS Lambda — quest'ultima disponibile nativamente nel progetto, interessante per traffico basso ma rimandata).

**Decisione — build dal sorgente, non l'immagine pubblica.** Controllata la documentazione ufficiale e l'immagine Docker Hub `zotero/translation-server`: pubblicata al momento **solo per architettura arm64**, non girerebbe su un server x86_64/amd64 comune senza emulazione — scoperto controllando il manifest dell'immagine, non assunto. Il repository ha però un proprio `Dockerfile` (approccio "Docker (development)" nel loro stesso README) pensato per essere costruito in locale: compila per l'architettura di qualunque macchina esegua la build, risolvendo il problema, e clona i translator aggiornati al momento della build invece dei tag amd64 pubblicati su Hub ma fermi al 2021.

**Decisione — file nel nostro repository, sorgente fuori.** Nuovo `docker-compose.yml` alla radice di PapérDex, con `build.context: ../translation-server` — punta alla cartella sibling fuori dal repo dove va clonato (voce 74: codice di terze parti con i propri submodule Git, non vendorizzato qui). Prerequisito documentato nei commenti del file stesso: `git clone --recurse-submodules` prima di `docker compose up` (i submodule sono obbligatori, la build fallisce senza — stesso requisito del percorso "da sorgente" della documentazione ufficiale). `restart: unless-stopped` e porta 1969 esposta invariata, così `ZOTERO_TRANSLATION_SERVER_URL=http://127.0.0.1:1969` nel backend non richiede alcuna modifica quando il container gira sulla stessa macchina.

**Aggiornamento — Docker Desktop installato, bug scoperto e corretto durante la prima build reale.** Installato Docker Desktop via `winget` (richiedeva anche WSL2, non presente: entrambi installati con permessi di amministratore forniti dall'utente, poi riavvio della macchina). Alla prima `docker compose up --build` il container entrava in crash-loop: `exec ./docker-entrypoint.sh: no such file or directory` nonostante il file esistesse davvero. Causa reale, verificata (`file docker-entrypoint.sh` → "with CRLF line terminators"): lo script era stato clonato su Windows con fine-riga CRLF (comportamento di default di Git su Windows), e la shebang `#!/bin/bash\r` non è un percorso valido dentro il container Linux — un problema di interoperabilità Windows/Linux ben noto, non un difetto del Dockerfile stesso. Corretto convertendo il solo file in LF (`sed -i 's/\r$//' docker-entrypoint.sh`) nella copia locale clonata fuori dal repo — nessuna modifica alla configurazione Git globale, nessun file dentro PapérDex toccato.

**Verifica.** Build e avvio reali completati con successo dopo la correzione: container `Up`, log conferma "748 translators loaded" e "Listening on 0.0.0.0:1969" — stessi numeri della copia non containerizzata. Richiesta diretta reale (`POST /search` con un DOI Crossref, il paper "Deep Learning" di LeCun/Bengio/Hinton su Nature) risponde con metadati completi (autori, venue, volume, pagine). Confermato anche end-to-end passando dal vero backend PapérDex (non solo curl diretto): `POST /ricerche/{id}/paper/{id}/enrich` su quello stesso articolo restituisce `filled_fields` corretti con `venue: "Nature"` e i tre autori — la stessa `ZOTERO_TRANSLATION_SERVER_URL=http://127.0.0.1:1969` del backend punta al container senza bisogno di alcuna modifica.

**Stato.** Implementato e verificato dal vivo. Lo stack di sviluppo per backend/frontend resta uvicorn/Vite diretti; solo `translation-server` ora gira in Docker anche in locale (non serve più `npm start` a mano nella cartella clonata).

---

## 77. Scadenza (TTL) e potatura per la cache dei risultati di ricerca (2026-09-07)

**Contesto.** Nel fare il punto su cosa manca al progetto, era emersa una nota già scritta a suo tempo (voce 17): la cache su file (`evaluation_cache.json`, un JSON unico letto/riscritto per intero ad ogni chiamata) non ha mai avuto scadenza né limite di dimensione — una query ripetuta a distanza di mesi restituirebbe per sempre lo stesso snapshot, anche con nuovi paper usciti nel frattempo. Rileggendo il codice è emerso anche un problema imparentato ma distinto: senza scadenza, il file non si riduce mai e ogni scrittura (anche un semplice miss) riscrive l'intero contenuto, quindi la crescita indefinita rallenta via via anche le scritture future, non solo occupa spazio.

**Decisione — TTL a 7 giorni.** Concordato con l'utente: i metadati bibliografici non cambiano ogni minuto, ma nuovi paper vengono indicizzati regolarmente — 7 giorni bilancia risultati ragionevolmente freschi contro il non martellare le fonti esterne per query ripetute nel breve periodo. `CACHE_TTL_DAYS = 7` in `caching.py`, isolato in una costante di modulo.

**Decisione — formato voce con timestamp.** Ogni voce passa da lista grezza a `{"fetched_at": "YYYY-MM-DD", "data": [...]}`. Una voce più vecchia di `CACHE_TTL_DAYS` è trattata come cache miss in lettura (si richiama la fonte, si sovrascrive con dati e timestamp freschi) — la chiave di cache resta invariata (già basata sulla query effettiva, non serve toccarla). Una voce nel **vecchio formato** (lista grezza senza `fetched_at`, quelle già presenti nel file da prima di questa modifica) non ha un'età nota: trattata anch'essa come miss invece di essere letta al buio, si aggiorna da sola al nuovo formato al primo refetch — nessuna migrazione manuale del file esistente necessaria.

**Decisione — potatura opportunistica, non un processo separato.** Per il problema della crescita indefinita: ad ogni `save_cache()` (già chiamato ad ogni miss), le voci più vecchie del doppio del TTL (14 giorni, `CACHE_PRUNE_AFTER_DAYS`) vengono scartate prima di riscrivere il file — agganciata al ciclo di scrittura già esistente invece di un cron/task dedicato solo a questo, coerente con la scala del progetto (nessuna nuova dipendenza, nessuna nuova infrastruttura).

**Decisione — non toccato il formato "singolo file JSON".** Valutato e scartato il passaggio a un motore di storage più scalabile (es. SQLite): il problema reale segnalato era la staleness/crescita, non (ancora) un vero collo di bottiglia di I/O — complessità non giustificata dal problema attuale, rivalutabile se in pratica il file dovesse diventare davvero un problema di performance.

**Verifica.** Script diretto sulla vera `caching.py` (nessuna chiamata di rete, un adapter finto con contatore di chiamate): primo fetch è un miss (chiama la funzione, salva `{fetched_at, data}`); una richiesta identica subito dopo è un hit (non richiama la funzione); la stessa voce retrodatata oltre il TTL torna a essere un miss (richiama la funzione, timestamp aggiornato a oggi); una voce nel vecchio formato (lista grezza) è trattata come miss senza errori; una voce molto vecchia (oltre il doppio del TTL) sparisce dal file al salvataggio successivo, anche se relativa a una chiave diversa da quella appena richiesta. File di cache reale lasciato intatto (nessuna cancellazione manuale: le voci vecchie si aggiornano da sole al nuovo formato quando richieste di nuovo, o vengono potate se abbandonate).

**Stato.** Implementato.

---

## 78. Corrette 5 regressioni nella suite di test (`orchestrator`/`ricerca`), non toccati i fallimenti su rete reale (2026-09-07)

**Contesto.** Girata l'intera suite pytest per fare il punto sul progetto: 14 falliti su 55. Analizzati uno per uno invece di assumere fossero tutti dello stesso tipo — si sono rivelate due categorie completamente diverse.

**Categoria 1 — regressioni vere, corrette.** 5 fallimenti (`orchestrator_test.py::test_merges_results_from_selected_sources`, `::test_one_source_failing_does_not_block_others`, `ricerca_test.py::test_search_returns_results_from_orchestrator`, `::test_search_forwards_sources_to_orchestrator`, `::test_unknown_source_returns_422`) erano causati da test rimasti indietro rispetto a modifiche reali fatte in questa stessa sessione, non da bug applicativi (già verificati dal vivo più volte altrove): `search_all_sources` restituisce una tupla `(risultati, warnings)` dalla voce 64 (avvisi di fallback su chiave API non valida), non più la sola lista; la rotta `search()` accetta ora `current_user: Optional[User] = Depends(get_optional_user)` dalla voce 61 (ricerca rapida pubblica) — chiamandola direttamente nei test (bypassando l'injection di FastAPI) va passato esplicitamente `current_user=None`, altrimenti il parametro riceve l'oggetto `Depends(...)` stesso invece di `None`. Aggiornati i doppi/fake nei test per riflettere le firme reali attuali.

Trovato anche un problema collaterale non nella lista dei falliti ma comunque scorretto: `test_duplicates_across_sources_are_not_removed` continuava a passare, ma per il motivo sbagliato — `len(risultato)` misurava la lunghezza della tupla `(risultati, warnings)` (sempre 2, qualunque fosse il contenuto), non quella dei risultati veri. Corretto lo spacchettamento perché torni a verificare quello che dichiara di verificare.

**Categoria 2 — non toccati: dipendono da stato esterno live, non da un difetto di codice.** I restanti 9 fallimenti (`arxiv_dblp_coverage_test.py::test_adapters_overlap`, e i parametrizzati in `singles/` per arXiv/DBLP/Semantic Scholar) confrontano titoli esatti o soglie di sovrapposizione (es. indice di Jaccard `> 0.75`) contro indici *live* di fonti esterne — per Semantic Scholar, tipicamente per rate limit persistente (già noto e loggato). Non sono regressioni introdotte in questa sessione: dipendono da ranking/indicizzazione che cambia nel tempo su servizi che non controlliamo, e le soglie sono calibrate per la valutazione empirica della tesi (vedi `statistics/indexes.py`), non per la correttezza applicativa — allentarle unilateralmente sarebbe una decisione di metodologia di ricerca, non un bugfix, e non spetta a me deciderla da solo.

**Verifica.** `pytest backend/tests/suites/orchestrator/ backend/tests/suites/routes/ -v`: 10 passati su 10 (i 6 già verdi di `orchestrator_test.py` più i 4 di `ricerca_test.py`, inclusa la correzione del falso positivo).

**Stato.** Implementato (le 5 regressioni). I 9 fallimenti su rete reale restano aperti, per scelta — categoria diversa, non un bug da correggere qui.

---

## 79. Collegata la conferma email (finora pronta ma dormiente) e aggiunta la verifica per le email aggiuntive (2026-09-07)

**Contesto.** Nel punto sul progetto erano rimasti due fili aperti: il cambio password (deciso di lasciarlo solo via email SMTP, voce 68 confermata definitiva — nessuna modifica di codice) e la conferma email, la cui logica (voce 50) era stata scritta completa ma deliberatamente scollegata da ogni flusso reale, per non richiedere una vera casella funzionante ad ogni account di prova creato durante lo sviluppo. Richiesta esplicita dell'utente: collegarla del tutto, ed estenderla anche alla conferma delle email aggiuntive (`additional_emails`), finora accettate senza alcuna prova di possesso.

**Decisione — da bool singolo a lista di email confermate.** `User.email_confirmed: bool` tracciava solo l'email principale, per costruzione non estendibile a indirizzi aggiuntivi indipendenti. Sostituito con `User.confirmed_emails: list[EmailStr]`: contiene ogni indirizzo (principale o aggiuntivo) per cui il proprietario ha cliccato il relativo link. `"email già confermata"` diventa `email in confirmed_emails` ovunque necessario.

**Decisione — email aggiuntiva non entra in `additional_emails` finché non è confermata.** Prima, `POST /users/me/emails` aggiungeva l'indirizzo alla lista subito, senza alcuna verifica — chiunque avrebbe potuto associarsi al proprio account l'email di qualcun altro (es. per intercettare inviti mandati a quell'indirizzo). Ora la richiesta manda solo un'email di conferma al nuovo indirizzo (token con `purpose="email_confirmation_secondary"` e l'email dell'account richiedente come extra claim, dato che il `sub` del token è l'indirizzo da confermare, non quello di chi lo possiede già); l'indirizzo entra in `additional_emails` — e contemporaneamente in `confirmed_emails` — solo al click sul link. Ricontrollata anche l'unicità al momento della conferma (non solo alla richiesta): nel frattempo l'indirizzo potrebbe essere stato preso da un altro account.

**Decisione — un solo endpoint `/confirm-email` per entrambi i casi.** Stesso link/pagina frontend indipendentemente dal fatto che si stia confermando l'email principale o una aggiuntiva; cambia solo il `purpose` codificato nel token, letto lato server per decidere quale ramo eseguire. `decode_action_token_payload` esteso per accettare un insieme di purpose validi oltre alla singola stringa già supportata altrove (invito, reset password), senza toccare le firme esistenti.

**Decisione — email di conferma inviata automaticamente alla registrazione.** `POST /users` ora manda anche l'email di conferma per l'indirizzo principale (via `send_email_safely`, non bloccante: un SMTP momentaneamente giù non deve far fallire la registrazione, l'utente può richiederne un'altra copia dal profilo). Coerente con l'aver ormai un server SMTP reale configurato (voce precedente sul cambio password) — non più necessario tenerla scollegata per non intralciare gli account di prova.

**Decisione — frontend.** Nuova pagina `/conferma-email` (fuori dal ramo autenticato, come `/reset-password`: raggiungibile dal link ricevuto via email anche senza sessione attiva), che legge il token dalla query string e mostra esito. In "Impostazioni profilo", sezione Email: badge "Confermata"/"Da confermare" accanto all'email principale con bottone per rimandare il link se non confermata; il form "Aggiungi un'altra email" non aggiorna più la lista sul posto (l'indirizzo non è ancora associato) ma mostra un messaggio di conferma inviata.

**Verifica.** End-to-end reale contro backend e frontend live (nessun mock): registrazione → email principale non confermata su `/users/me` → conferma via token reale → risulta confermata; richiesta di reinvio su email già confermata risponde correttamente "già confermata"; aggiunta di un'email secondaria → non compare subito in `additional_emails` → conferma via token reale → compare sia in `additional_emails` che in `confirmed_emails`; un secondo account che prova ad aggiungere la stessa email secondaria (non ancora sua) riceve 400. Verificato anche via Playwright contro il frontend vero: badge "Da confermare"/"Confermata" e messaggi di stato controllati a schermo con screenshot. Log del backend controllato per escludere errori di invio SMTP silenziosi. Utenti e dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 80. Deduplicazione estesa agli "Articoli salvati" tra ricerche/sessioni diverse (2026-09-07)

**Contesto.** La deduplicazione (voci 71-73) raggruppa solo i risultati di un'unica ricerca (`group_articles` in `dedup.py`, chiamata sulla risposta di `search_all_sources`): due versioni dello stesso paper trovate in due ricerche fatte in momenti diversi non vengono mai confrontate tra loro. Discusso con l'utente: il meccanismo "salva il gruppo intero con un solo articolo scelto" (`/paper/group`, voce 71) esiste già e risolve il caso all'interno di una singola ricerca; il buco reale era il caso tra ricerche/sessioni diverse.

**Decisione — confronto mirato, non un ricalcolo generale.** Temuto dall'utente un dedup O(n²) da rifare su tutta la storia dei salvati ad ogni aggiunta. Non serve: `group_articles` è O(n²) perché confronta tutti-contro-tutti N risultati nuovi arrivati insieme; qui basta confrontare il singolo articolo (o gruppo) appena aggiunto contro i soli articoli già salvati nella Ricerca (project-wide, non solo i propri) — O(n) contro n salvati esistenti, con la stessa euristica DOI/titolo/autore-anno di `are_duplicates`. Fattorizzato in `find_cross_session_duplicate()` in `routes/ricerche.py`.

**Decisione — un match non crea una seconda voce "salvata".** Coerente con l'invariante già esistente per `/paper/group` (solo l'articolo scelto ottiene un `AddedArticle`, gli altri restano `alternative_ids` in un `DuplicateGroup`): se il nuovo articolo (o l'intero gruppo, per `/paper/group`) risulta duplicato di uno già salvato, non genera un `AddedArticle` proprio — viene agganciato come alternativa al `DuplicateGroup` di quello già salvato (creato al volo se non esisteva), consultabile e scambiabile in seguito nella tab Deduplicazione con lo stesso meccanismo già in uso. Logica di "estendi o crea il gruppo" fattorizzata in `attach_as_duplicate_alternatives()`, riusata sia dal caso cross-sessione sia dal percorso normale di `/paper/group` (che la usava già inline).

**Bug intercettato in verifica.** Prima versione di `attach_as_duplicate_alternatives` derivava l'id dell'articolo "ancora" leggendo `anchor_added.article` tramite lo stesso helper `linked_id()` (che si aspetta un `Link` risolto, con `.ref.id`) usato altrove nel file. Per un `AddedArticle` appena creato nella stessa richiesta (non ancora ricaricato dal database), quel campo è ancora l'oggetto `Article` passato al costruttore, non un `Link` — `AttributeError: 'Article' object has no attribute 'ref'`, scoperto dal terzo scenario del test dal vivo (gruppo nuovo, nessun duplicato incrociato). Corretto passando l'id dell'articolo ancora esplicitamente dal chiamante (già noto in ogni punto di chiamata) invece di ricavarlo da un `Link` potenzialmente non ancora tale.

**Verifica.** Script end-to-end reale contro backend live (nessun mock, tre scenari): (1) singolo articolo salvato, poi un secondo con DOI identico ma fonte/id diversi salvato separatamente → non crea una seconda voce tra i salvati (`count` resta 1), compare come alternativa nel `DuplicateGroup` del primo; (2) un gruppo di due articoli (già mutuamente duplicati tra loro, stesso DOI) aggiunto via `/paper/group` quando un terzo articolo equivalente era già salvato in precedenza → l'intero gruppo diventa alternativa di quello già salvato, nessuna nuova voce primaria; (3) un gruppo genuinamente nuovo (nessun duplicato pregresso) aggiunto normalmente, comportamento invariato. Bug del punto precedente scoperto proprio dallo scenario (3) e corretto prima di considerare la verifica conclusa. Suite `pytest` di `orchestrator`/`routes` (10/10) rilanciata per escludere regressioni sull'import di `dedup.py`. Dati e utenti di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 81. Classifica delle fonti spostata in sidebar nella tab Deduplicazione (2026-09-08)

**Decisione.** Su richiesta dell'utente, `SourcePriorityEditor` non sta più impilato sopra i gruppi di duplicati (voce 73) ma in una sidebar a destra (`w-72 sticky top-8`, così resta visibile scorrendo una lista lunga di gruppi). Sotto una certa soglia le due colonne tornano a impilarsi verticalmente com'era prima (classifica in cima, poi i gruppi), tramite `flex-col-reverse` sul contenitore combinato con `flex-row` alla soglia — evita di duplicare il markup per i due layout.

**Aggiustamento — soglia abbassata da `lg` (1024px) a `md` (768px).** Su richiesta dell'utente, il layout a due colonne si attiva prima (schermi più stretti restano comunque a due colonne), lasciando il fallback impilato solo a chi ha davvero poco spazio orizzontale.

**Verifica.** Playwright contro il frontend live, tre larghezze: desktop (1280px) e una intermedia (850px, sopra `md` ma sotto il vecchio `lg`) → sidebar a destra, sticky, gruppo di duplicati a sinistra in entrambi i casi (prima della modifica la seconda sarebbe stata impilata); stretta (600px, sotto `md`) → classifica impilata sopra i gruppi, nessuna rottura di layout. Controllato a schermo con screenshot. Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 82. Freccia "Torna a X" nelle pagine raggiunte scendendo di un livello (2026-09-08)

**Contesto.** Su richiesta dell'utente: dalle sotto-pagine di una Ricerca (Cerca, Query salvate, Cronologia, Deduplicazione, Team) o del Profilo (API keys, Inviti) non c'era un modo diretto per risalire senza passare dal pulsante "Ricerche"/"Profilo" della barra di navigazione o dal tasto indietro del browser (quest'ultimo esplicitamente escluso: dipende da come si è arrivati alla pagina, non da dove "si dovrebbe" tornare).

**Decisione.** Nuovo componente `BackLink` (`components/BackLink.jsx`): freccia + "Torna a {label}", viola, riusabile. Destinazione fissa e prevedibile in base alla gerarchia della pagina, non la cronologia del browser:
- Sotto-pagine di una Ricerca → Overview della stessa Ricerca; Overview stessa → elenco Ricerche. Un solo punto di inserimento in `ResearchLayout.jsx` (il layout condiviso da tutte queste pagine), condizionato sulla stessa variabile `pageName` già usata per il titolo — copre le 6 pagine senza duplicare markup.
- `/profilo/api-keys` e `/profilo/inviti` → Profilo (non condividono un layout con `ProfilePage`, quindi `BackLink` aggiunto singolarmente in ciascuna).

Posizionato in alto a destra dell'header di pagina (`flex justify-between`), accanto al titolo esistente.

**Verifica.** Playwright contro frontend e backend live: screenshot su Overview ("Torna a Ricerche"), su Cerca e Deduplicazione ("Torna a Overview", nessuna sovrapposizione con la sidebar della classifica fonti aggiunta in voce 81) e su API keys ("Torna a Profilo"); click reale sul link da API keys → atterra su `/profilo` come atteso. Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 83. Corretto uno spostamento di layout quando compare il link di download dell'export (2026-09-08)

**Contesto.** Segnalato dall'utente: nell'Overview, quando l'export genera il link "Scarica…" sotto il bottone "Esporta", il conteggio paper e "Arricchisci tutti" (stessa riga, a sinistra di `ExportMenu`) si spostavano lateralmente.

**Causa.** `ExportMenu` (`components/ExportMenu.jsx`) non aveva una larghezza fissa (`flex flex-col items-end`, a misura di contenuto). Il link di download, con `whitespace-nowrap` e un nome file variabile spesso più largo del bottone "Esporta ▾", allargava la colonna quando appariva. Essendo `ExportMenu` l'ultimo elemento di un gruppo unico (`flex items-start justify-between`) insieme al conteggio paper e al bottone "Arricchisci tutti" nell'Overview (voce 75), l'allargamento della colonna spingeva lateralmente l'intero gruppo, non solo `ExportMenu` stesso.

**Decisione (prima versione).** Larghezza della colonna fissata (`w-36`) invece che a misura di contenuto: il bottone la riempie (`w-full`), il link di download tronca il nome file (`truncate` invece di `whitespace-nowrap`) invece di espanderla.

**Verifica (prima versione).** Playwright contro il frontend live: 0px di spostamento su conteggio paper e "Arricchisci tutti" dopo un export reale. Il link però troncava il nome file ("Scarica ricerca-expo…") — funzionale, ma non quello che l'utente voleva vedere.

**Aggiustamento 2 — bottone più stretto, link a piena dimensione (absolute sotto il bottone).** L'utente preferiva il bottone "Esporta" più stretto (a misura di contenuto, non forzato a `w-36`) e il link di download NON troncato, libero di estendersi a sinistra fin sotto "Arricchisci tutti" invece di tagliare il nome file. Sostituito l'approccio "colonna a larghezza fissa" con "colonna a misura di contenuto + dropdown/errore/link di download tutti fuori dal flusso normale (`absolute`, ancorati sotto il bottone)": un elemento assoluto non contribuisce alla larghezza del contenitore staticamente posizionato, quindi qualunque sia la sua dimensione non sposta più i fratelli nella riga "justify-between" sovrastante.

**Verifica 2.** Playwright, ricerca con nome lungo: 0px di spostamento su conteggio paper e "Arricchisci tutti"; link con nome file per intero, esteso a sinistra sotto "Arricchisci tutti". Funzionava, ma non era ancora l'impaginazione voluta: il link restava ancorato sotto il bottone specifico, non su una riga indipendente dell'intera barra.

**Aggiustamento 3 (finale) — "Esporta" in riga, link su una riga propria sotto, allineata a destra.** Richiesta esplicita dell'utente: "Esporta" deve restare nella stessa riga di conteggio paper/"Arricchisci tutti" (come gli altri elementi della barra), il link va invece su una riga sua sotto l'intera barra, allineata a destra — non più solo sotto il bottone. Per ottenerlo, il link non può più essere gestito internamente da `ExportMenu` (che diventa solo bottone + tendina formati + errore, tutti `absolute`): lo stato "file pronto" viene sollevato al chiamante tramite `onReady(url, filename)`, e `OverviewPage` lo mostra in una `<div className="flex justify-end">` propria, dopo l'intera riga header e prima della lista articoli — stesso principio già in uso altrove nel file per i callback verso il genitore (`onUpdated`, `onEnriched`). La revoca dell'URL blob si sposta di conseguenza da `ExportMenu` a `OverviewPage`, che ora possiede lo stato.

**Verifica 3.** Playwright, stessa ricerca con nome lungo: 0px di spostamento su conteggio paper, "Arricchisci tutti" **e** sul bottone "Esporta" stesso (stessa riga, stessa Y, prima e dopo l'export); il link compare su una riga separata sotto l'intera barra, allineato a destra, nome file per intero senza andare a capo né troncare. Controllato anche a schermo. Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 84. Flusso guidato "sessione" per aggiungere articoli a una Ricerca — prima versione (2026-09-15)

**Contesto.** Richiesta dell'utente: rendere il percorso "cerco → aggiungo → rivedo duplicati → arricchisco con Zotero" più evidente e guidato, invece di richiedere di scoprire da soli le tab Cerca/Deduplicazione/Team separate. Esplicitamente una prima versione ("per ora iniziamo così, poi aggiungiamo e sistemiamo passo dopo passo"): copre l'intero giro richiesto ma con scelte semplici dove possibile, da raffinare in seguito.

**Decisione — terminologia: "sessione".** "Ricerca" indica già l'intero progetto condiviso (Project) e "Query" una combinazione di criteri salvata: usare uno di questi due termini anche per "un giro di ricerca-e-aggiunta" avrebbe creato ambiguità. Scelto "sessione" (bottone "+ Inizia una nuova sessione", che sostituisce "+ Aggiungi articoli" nell'Overview) — un termine diverso da entrambi, comune nel linguaggio applicativo per "ciò che si sta facendo ora".

**Decisione — la sessione è stato React, non persistita.** Serve tracciare "quali articoli sono stati aggiunti da quando è stata premuta 'Inizia una nuova sessione'", per poter poi rivedere duplicati e arricchimento solo su quel sottoinsieme. Per questa prima versione, tenuta come semplice `useState` (lista di Article completi, non solo id) in `ResearchLayout` — il layout condiviso da tutte le pagine di una Ricerca, che non si smonta muovendosi tra Cerca e le nuove pagine di revisione, quindi lo stato sopravvive alla navigazione tra di esse. Esposta via `Outlet context` insieme a `researchId`/`researchName` già presenti. Compromesso esplicito: essendo solo in memoria, un refresh della pagina (o l'uscita dalla Ricerca) la azzera — accettabile per una prima versione, migliorabile in seguito (`sessionStorage`, o un concetto lato server) se in pratica risultasse un problema.

**Decisione — "Cerca" riusata, non duplicata.** Invece di una pagina "Cerca" separata solo per il flusso guidato, la pagina esistente (`SearchPapersPage`, dietro `/ricerche/:id/cerca`) è stata estesa: una barra verde compare sotto il banner di contesto non appena `sessionArticles.length > 0`, con conteggio e due bottoni — "Rivedi duplicati di questa sessione →" e "Arricchisci con Zotero →" — e un pannello "Query salvate" (fetch di `listRicercaQueries`, riuso di `QueryListItem`) compare sempre quando si è dentro una Ricerca e ne esistono. "Usa" su una query qui non naviga più altrove (come da Overview/SavedQueriesPage, che restano invariate per quell'uso): applica i campi direttamente sul form già aperto (`applyQuery`, stessi setter degli inizializzatori di `incomingQuery`).

**Decisione — tracciamento ad ogni aggiunta, non solo alla prima.** Il salvataggio automatico della query (voce precedente, invariato) si ferma al primo articolo aggiunto per ricerca eseguita; la sessione invece va aggiornata ad ogni singola aggiunta (`handleArticleAdded` ora chiama sempre `onSessionAdd`, poi eventualmente `maybeAutoSaveQuery`). `SearchResults.jsx` doveva perciò iniziare a passare l'articolo (o il gruppo) aggiunto al callback (`onAdded?.([article])` / `onAdded?.(articles)`), cosa che prima non faceva (il callback serviva solo come segnale, senza dati).

**Decisione — due nuove pagine, stesso meccanismo di revisione duplicati.** `/ricerche/:id/sessione/duplicati` e `/ricerche/:id/sessione/arricchisci`, entrambe figlie di `ResearchLayout` (stesso `Outlet context`, stessa freccia "Torna a Overview" già esistente — voce 82 — aggiunta automaticamente ai `PAGE_NAMES`). La card di revisione di un gruppo di duplicati (`GroupMember`/scelta/annulla) era definita solo dentro `DeduplicationPage`: estratta in `components/DuplicateGroupReview.jsx` per essere riusata identica dalla pagina di sessione, che si limita a filtrare `listDuplicateGroups` ai gruppi che toccano almeno un id della sessione invece di mostrarli tutti. La pagina di arricchimento è nuova (non esisteva un'interfaccia "scegli quali arricchire", solo "uno alla volta" o "tutti quelli della Ricerca" da voce 75): checkbox per articolo (tutti selezionati di default, spuntabile "Seleziona/Deseleziona tutti"), un ciclo di chiamate a `enrichArticle` (lo stesso endpoint già usato singolarmente) sui soli selezionati — nessuna nuova rotta backend, l'endpoint bulk esistente (`enrich-all`) non è filtrabile per id e non è stato toccato.

**Decisione — fine del giro.** Entrambe le nuove pagine terminano con un bottone "Fine — torna alla Ricerca" verso l'Overview, dove tornano visibili tutte le sidebar già esistenti (Statistiche, Query salvate, Cronologia, Deduplicazione, Team) con lo stato aggiornato.

**Verifica.** Playwright end-to-end contro backend e frontend reali (nessun mock), giro completo: Overview → "+ Inizia una nuova sessione" → Cerca (barra di sessione assente, corretto) → ricerca reale ("attention is all you need", fonti ArXiv/Crossref/OpenAlex — DBLP temporaneamente instabile lato rete esterna, escluso dal test per non dipendere da un problema non nostro) → aggiunto un risultato → barra di sessione compare con conteggio corretto → pannello Query salvate compare (query auto-salvata) → "Rivedi duplicati di questa sessione" carica la pagina filtrata → tornati a Cerca via cronologia del browser (non `page.goto`, che smonterebbe la SPA e azzererebbe la sessione come un reload — verificato che sia proprio così) → "Arricchisci con Zotero" mostra l'articolo preselezionato → arricchimento reale eseguito contro il vero `translation-server`, risultato mostrato ("Nessun nuovo dato trovato", corretto per un record Crossref già completo) → "Fine" riporta su Overview con l'articolo salvato e tutte le sidebar popolate. Controllato anche a schermo con screenshot ad ogni passaggio. Dati di prova ripuliti al termine.

**Aperto per i prossimi passaggi (esplicitamente rimandato dall'utente).** Persistenza della sessione oltre un reload; eventuale scambio automatico della fonte preferita in un duplicato di sessione; possibile filtro/indicazione visiva nell'elenco "Articoli salvati" di cosa è stato aggiunto nella sessione corrente; naming e rifiniture varie via via che l'utente le nota usando il flusso.

**Stato.** Implementato e verificato dal vivo (prima versione).

---

## 85. Percorso guidato reso lineare e forzato, con avanti/indietro senza perdita di stato (2026-09-15)

**Contesto.** Dopo aver provato la prima versione (voce 84), l'utente ha chiesto due correzioni: (1) il percorso Cerca → Duplicati → Zotero deve essere **obbligatorio e lineare** — niente scorciatoie per tornare all'Overview saltando uno dei tre passaggi, e da Cerca si passa SOLO a Duplicati (mai direttamente a Zotero); (2) deve però essere possibile muoversi avanti e indietro **tra** i tre passaggi, con i cambiamenti fatti (caselle spuntate, esiti di un arricchimento già eseguito) preservati quando si torna indietro e poi di nuovo avanti — non azzerati.

**Decisione — un solo passo in avanti da Cerca.** La barra di sessione in `SearchPapersPage` aveva due bottoni ("Rivedi duplicati" e "Arricchisci con Zotero", scelta libera). Ridotta a uno solo: "Continua: rivedi duplicati →". Zotero non è più raggiungibile direttamente da Cerca.

**Decisione — bottoni "Indietro"/"Continua" invece di "Fine" a metà percorso.** `SessionDuplicatesPage` non offre più "Fine — torna alla Ricerca": in fondo alla pagina ora ci sono "← Indietro" (a Cerca) e "Continua: arricchisci con Zotero →" (unico passo successivo possibile). "Fine — torna alla Ricerca" resta solo su `SessionEnrichPage` (ultimo passo), accanto a un nuovo "← Indietro" (a Duplicati).

**Decisione — niente scorciatoia "Torna a Overview" durante il percorso forzato.** La freccia in alto a destra (voce 82) permetteva di saltare direttamente all'Overview da qualunque sotto-pagina, comprese queste tre — la stessa scorciatoia avrebbe vanificato l'obbligo appena introdotto. Nuova condizione in `ResearchLayout` (`inForcedSessionFlow`): nascosta su Duplicati e Arricchisci sempre (raggiungibili solo dall'interno del percorso), e su Cerca solo *dopo* che è stato aggiunto almeno un articolo in sessione — finché la sessione è vuota, si può ancora abbandonare liberamente (non c'è nulla da "forzare" a rivedere).

**Decisione — stato di arricchimento sollevato in `ResearchLayout`, come già la lista degli articoli di sessione.** `SessionEnrichPage` teneva selezione (`selected`) ed esiti (`results`) come stato locale: tornando indietro a Duplicati e poi di nuovo avanti, il componente si sarebbe rimontato da zero perdendo entrambi, contraddicendo il requisito esplicito "mantenendo salvati i cambiamenti anche in caso di ritorno indietro". Spostati in `ResearchLayout` (`enrichResults`, e la selezione — vedi sotto) accanto a `sessionArticles`, esposti allo stesso modo via `Outlet context`.

**Bug intercettato in verifica e corretto — selezione come insieme degli ESCLUSI, non degli inclusi.** Prima versione del sollevamento: `enrichSelected` come insieme degli id selezionati, con una `useEffect` che ad ogni montaggio aggiungeva alla selezione gli id "non ancora visti" (per selezionare di default i nuovi articoli aggiunti dopo un giro indietro-avanti). Bug: quella logica non riusciva a distinguere "mai visto, va selezionato di default" da "deselezionato apposta dall'utente" — entrambi assenti dall'insieme — e riselezionava per errore un articolo appena tolto tornando sulla pagina. Corretto invertendo la rappresentazione: `enrichExcluded`, l'insieme di ciò che l'utente ha *tolto* esplicitamente. Un articolo è selezionato semplicemente perché non vi compare — vale automaticamente anche per uno arrivato dopo, senza bisogno di alcuna sincronizzazione. Scoperto da un test dal vivo mirato proprio a questo scenario (deseleziona → indietro → avanti → deve restare deselezionato), non da un'ispezione del codice.

**Verifica.** Playwright end-to-end contro backend e frontend reali, `/api/search` intercettato con una risposta finta istantanea (la verifica riguardava la navigazione, non le fonti esterne — già testate altrove, ed evita la flakiness di rete incontrata nella voce 84). Percorso completo: BackLink presente su Cerca prima di aggiungere, sparito dopo il primo articolo; un solo bottone "Continua" (non più due) sulla barra di sessione; nessun BackLink su Duplicati né su Arricchisci; "Indietro" da Duplicati riporta a Cerca con la sessione intatta (1 articolo, non azzerata); deselezionata la casella dell'unico articolo su Arricchisci, tornati indietro a Duplicati e di nuovo avanti → **la casella è rimasta deselezionata** (bug sopra confermato e poi corretto); arricchimento reale eseguito (esito reale: "Nessun identificativo (DOI o URL) disponibile", corretto per l'articolo fittizio senza DOI usato nel test) → indietro e di nuovo avanti → **esito identico, non riazzerato**; "Fine" riporta su Overview. Controllata anche in isolamento la pagina Duplicati raggiunta direttamente via URL (rende correttamente il proprio contenuto, non quello di Cerca — un mismatch visto in uno screenshot di un run precedente si è rivelato un artefatto di timing dello script, non un bug dell'app). Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 86. Indicatore visivo di avanzamento sulle tre pagine del percorso guidato (2026-09-17)

**Contesto.** Richiesta dell'utente: sulle tre pagine del percorso forzato (voce 85) serviva un modo per capire visivamente in quale fase ci si trova, non solo dedurlo dal titolo della pagina.

**Decisione.** Nuovo componente `SessionStepper` (`components/SessionStepper.jsx`): tre pallini numerati ("1 Cerca — 2 Duplicati — 3 Zotero") uniti da una linea, passaggio corrente evidenziato in viola pieno, passaggi già visitati in viola chiaro, passaggi futuri in grigio. Inserito una sola volta in `ResearchLayout` (stesso punto di `BackLink`/`PAGE_NAMES`), si nasconde da solo (`return null`) su qualunque pagina diversa dalle tre — nessuna nuova prop da passare alle pagine stesse.

**Decisione — passaggi già visitati cliccabili, quelli futuri no.** Coerente con "avanti e indietro senza perdere lo stato" (voce 85): cliccare su un passaggio *precedente* nello stepper ci riporta direttamente, stesso comportamento del bottone "Indietro" già presente (stato di sessione/arricchimento preservato, sollevato in `ResearchLayout`). I passaggi *futuri* restano testo non cliccabile — l'unico modo per sbloccarli resta avanzare con i bottoni "Continua" di ogni pagina, mai saltando dalla barra.

**Verifica.** Playwright contro frontend e backend live, `/api/search` intercettato (stesso motivo della voce 85: verifica sulla UI, non sulle fonti esterne). Confermato: nessuno stepper su Overview; su Cerca compare con "1" evidenziato; dopo essere passati a Duplicati, "1" diventa visitato (viola chiaro) e "2" evidenziato; su Zotero, "1" e "2" visitati, "3" evidenziato; click sul passaggio "1" dallo step 3 riporta a Cerca con la sessione ancora intatta (1 articolo, non azzerata). Controllato anche a schermo con screenshot ad ogni passaggio. Dati di prova ripuliti al termine.

**Aggiustamento — centrato nella pagina.** Su richiesta dell'utente: `justify-center` sul contenitore flex dello stepper (era allineato a sinistra). Verificato a schermo.

**Stato.** Implementato e verificato dal vivo.

---

## 87. Rimossa la ridondanza nel salvataggio automatico di query identiche (2026-09-17)

**Contesto.** Il salvataggio automatico di una query al primo articolo aggiunto da una ricerca (voce introdotta ben prima di questa sessione, poi riproposta nella barra "Query salvate" del percorso guidato — voce 84) crea una nuova voce ad ogni ricerca eseguita. Ripetendo la stessa identica ricerca in sessioni diverse (stessi criteri, stesse fonti), il pannello si riempiva di doppioni indistinguibili — notato dall'utente e già visibile in alcuni screenshot di verifica di voci precedenti.

**Decisione — controllo lato backend, non solo lato frontend.** `POST /ricerche/{id}/query` (`create_ricerca_query`, routes/ricerche.py) ora confronta i criteri della richiesta (`keyword_include`, `keyword_exclude`, `author`, `year_start`, `year_end`, `journal`, `depth`, `sources` — non `name`, autogenerato dagli stessi criteri e quindi ridondante come chiave di confronto) contro le query già salvate per quella Ricerca. Se una con criteri identici esiste già, la restituisce invece di crearne una nuova — nessun nuovo `Query` inserito. Lato backend (non solo filtrando lato client) perché è l'unico punto che vede tutte le query della Ricerca indipendentemente da chi/come le genera, coerente con l'impostazione già seguita per la deduplicazione degli articoli (voce 80).

**Decisione — confronto esatto, non fuzzy.** A differenza della deduplicazione degli articoli (titolo/DOI/autore con soglie di somiglianza), qui il confronto è un'uguaglianza esatta e diretta tra liste: l'utente ha chiesto di eliminare la ridondanza per "ricerche uguali", non per ricerche solo simili — un problema diverso (e più ambiguo) che non è stato posto.

**Decisione — frontend coerente con la risposta riusata.** `SearchPapersPage.maybeAutoSaveQuery` prependeva sempre la query restituita all'elenco mostrato; ora, ricevendo la stessa query già esistente, la aggiunge solo se il suo id non è già nell'elenco (altrimenti comparirebbe due volte nel pannello pur essendo un solo record).

**Verifica.** Backend: tre chiamate dirette a `POST /ricerche/{id}/query` — stessi criteri due volte → stesso id restituito, nessuna nuova query creata (`GET` successivo conferma 2 query totali, non 3, con la terza chiamata a criteri diversi che ne crea correttamente una nuova). Frontend, Playwright end-to-end (`/api/search` intercettato, stesso motivo delle voci 85-86): due ricerche identiche in due sessioni separate ("Inizia una nuova sessione" in mezzo) → il pannello "Query salvate" mostra una sola card, non due. Controllato anche a schermo. Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo.

---

## 88. Export BibTeX/RIS tramite gli export translator di Zotero, con fallback sul nostro formattatore (2026-09-17)

**Contesto.** L'utente ha chiesto se il `translation-server` (finora usato solo per l'arricchimento, voce 75) potesse essere sfruttato anche per l'export. Verificato empiricamente (non assunto dalla documentazione) contro l'istanza reale: `/export?format=<formato>` esiste davvero, prende un array di item in formato Zotero API JSON via `POST` e restituisce il testo già formattato — confermato con richieste dirette per `bibtex` e `ris`, inclusi casi limite (autore a nome singolo senza first/last name, item quasi vuoto, array vuoto → 400 pulito). JSON e CSV non sono toccati: non sono formati di export nativi di Zotero nello stesso senso (il CSV di Zotero ha un proprio layout di colonne, diverso dal nostro pensato per la nostra struttura dati), e non erano comunque parte della richiesta.

**Decisione — Zotero come tentativo primario, mai un requisito.** Nuova `export_via_translation_server()` in `services/utils/zotero.py`: converte gli `Article` nel formato item di Zotero (`_zotero_item`, l'inverso esatto di cosa `apply_enrichment` legge da un item Zotero — stessi campi: creators, date, publicationTitle, DOI, abstractNote), chiama `/export`, e restituisce `None` (mai un'eccezione) se il servizio non è raggiungibile o risponde con un errore. La rotta `GET /ricerche/{id}/export` la prova per bibtex/ris e ripiega sul formattatore proprio (`services/utils/export.py`, invariato) solo se torna `None` — stesso principio già seguito per l'arricchimento: un servizio Docker opzionale non deve mai poter rompere una funzionalità che finora ha sempre funzionato senza dipendenze esterne.

**Decisione — stesso criterio già in uso per @article/@misc.** L'`itemType` Zotero è `"journalArticle"` se l'articolo ha una venue nota, altrimenti `"preprint"` — che l'export translator di Zotero mappa esattamente su `@misc` in BibTeX, lo stesso criterio già implementato a mano in `to_bibtex`/`to_ris`. Nessuna divergenza di comportamento tra i due percorsi su questo aspetto.

**Verifica.** Contro il translation-server reale (non un doppio): richieste dirette a `/export` con un item costruito a mano confermano il formato e i campi supportati prima di scrivere qualunque codice. Poi end-to-end contro il vero backend: articolo salvato reale esportato in BibTeX e RIS con translation-server attivo → output riconoscibile come generato da Zotero (parole del titolo protette singolarmente tra graffe, campo `month`, tutti tratti distintivi dell'export translator ufficiale, assenti dal nostro formattatore). Fermato il container (`docker stop`) e ripetuto lo stesso export → risposta comunque 200, contenuto questa volta riconoscibile come il nostro formattatore (chiave `cognomeAnno`, graffe semplici) — fallback confermato funzionante, nessun errore esposto all'utente. Container riavviato e ricontrollato operativo al termine. Dati di prova ripuliti.

**Stato.** Implementato e verificato dal vivo.

## 89. Chiave API obbligatoria per OpenAlex, con avviso nel form di ricerca (2026-10-24)

**Contesto.** Da febbraio 2026 l'API di OpenAlex richiede una chiave per ogni richiesta, con 1 $ di credito gratuito al giorno per chiave; senza chiave sono ammesse solo poche chiamate dimostrative (https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/). Il ripiego sulla chiave globale del server (voce 46) avrebbe fatto consumare a tutti gli utenti un unico credito giornaliero.

**Decisione.** OpenAlex si interroga solo con la chiave personale dell'utente o con quella condivisa da un membro del team della Ricerca (voce 63); la chiave del `.env` non viene più usata dall'app, ma solo da test di rete e script di valutazione, che la passano esplicitamente. `BaseAdapter.REQUIRES_API_KEY` marca le fonti in questa situazione: senza chiave l'orchestratore le salta prima della paginazione e restituisce un avviso. Chiave rifiutata (401/403) e credito esaurito (429 persistente) sollevano `SourceUnavailableError`, che non viene ritentata né salvata in cache e diventa anch'essa un avviso; le altre fonti proseguono.

**Interfaccia.** Nuova rotta `GET /api/search/key-status` (nomi delle fonti senza chiave disponibile, mai le chiavi). Il pannello delle sorgenti mostra un avviso quando OpenAlex è selezionata e manca la chiave, con collegamento alla pagina Chiavi API; nella pagina Chiavi API la chiave di OpenAlex è indicata come obbligatoria.

**Ricerca per autore.** Resta `filter=raw_author_name.search:`. La documentazione di OpenAlex considera deprecata la sintassi `filter=campo.search:` in generale, ma indica `raw_author_name.search` come l'unico filtro di ricerca senza equivalente nel parametro `search` e quindi ancora lo strumento giusto per gli autori (https://help.openalex.org/api/searching/). Suggerisce anche di mettere il nome tra virgolette per restringere la corrispondenza a un singolo autore: applicato poi alla voce 95.

**Verifica.** Test aggiornati e aggiunti (orchestratore: fonte saltata senza chiave, errore trasformato in avviso; adapter: nessuna richiesta senza chiave, chiave rifiutata). Non verificato dal vivo contro l'API di OpenAlex.

**Stato.** Implementato.

## 90. Semantic Scholar: rimosso il tetto di 51 articoli per pagina e il parametro `sort` (2026-10-24)

**Contesto.** `_normalize` aveva un contatore `limit = 50` che fermava ogni pagina a 51 articoli. Nessuna voce del registro lo motiva e il file non è mai stato versionato in git. Indizi che sia un retaggio dell'endpoint `/paper/search/bulk`: la fixture dei test ha il campo `token`, tipico delle risposte bulk, e l'adapter chiedeva `sort=citationCount:desc`, parametro che esiste solo su bulk. Bulk restituisce fino a 1000 articoli per chiamata e non accetta `limit`, quindi lì un tetto lato client aveva senso; su `/paper/search` (`limit` fino a 100, voce 10) no. Con la profondità alta la pagina da 100 veniva tagliata a 51, `paginated_fetch` la leggeva come incompleta e smetteva di paginare.

**Decisione.** Rimosso il contatore: la dimensione di pagina resta decisa solo da `paginated_fetch`. Rimosso anche `sort`, che `/paper/search` non prevede (https://api.semanticscholar.org/graph/v1/swagger.json): l'ordine resta per rilevanza.

**Aggiornamento — termini separati da spazi.** La stessa documentazione dice che `/paper/search` non supporta sintassi speciale nella query: il `|` con cui univamo i termini non era un OR vero (già osservato alla voce 7). Su richiesta dell'utente i termini ora vengono mandati separati da spazi, come testo semplice: sono tutti dello stesso gruppo AND (stesso allineamento fatto per arXiv e OpenAlex alla voce 13) e l'AND lo garantisce il filtro interno. Scartato il passaggio a `/paper/search/bulk`, che ha booleani veri ma non ordina per rilevanza: con il budget di pagine per fonte restituirebbe un sottoinsieme quasi casuale.

**Verifica.** Nuovi test di paginazione: una pagina da 100 viene tenuta intera e la paginazione prosegue; i termini arrivano all'API separati da spazi. Non verificato dal vivo.

**Stato.** Implementato.

## 91. Crossref: data di pubblicazione da `issued` invece che da `created` (2026-10-24)

**Contesto.** L'adapter usava `created` come data di pubblicazione, che secondo la documentazione è la "Date on which the DOI was first registered" (https://github.com/CrossRef/rest-api-doc/blob/master/api_format.md): per lavori a cui il DOI è stato assegnato dopo la pubblicazione l'anno risultava sbagliato, con effetto sul filtro per anno e sul criterio "anno ±1" della deduplicazione (voce 72).

**Decisione.** Si usa `issued`, che la documentazione definisce come la prima data tra `published-print` e `published-online` ed è obbligatorio in ogni record. È una data parziale in cui solo l'anno è garantito: mese e giorno mancanti diventano 1, come già per le date "solo anno" di DBLP e Semantic Scholar. `created` resta solo come ripiego se `issued` manca o è vuoto, e un record senza nessuna delle due non viene più scartato ma tiene la data vuota.

**Verifica.** Aggiornato il test di normalizzazione: nella fixture `issued` dice solo 2015, e la data passa da 2015-06-05 (`created`) a 2015-01-01. Nuovo test sui casi data completa, parziale, vuota e assente. Non verificato dal vivo.

**Stato.** Implementato.

## 92. Deduplicazione: DOI diversi non escludono più il duplicato (2026-10-24)

**Contesto.** Con la voce 72, se entrambi gli articoli avevano un DOI decideva solo l'uguaglianza del DOI. Il contesto di quella stessa voce motivava però il criterio di riserva proprio con il caso preprint/versione pubblicata, che spesso hanno DOI **diversi**, non solo mancanti: il commento in `dedup.py` ("quando manca o non coincide") e il codice non dicevano la stessa cosa. Il caso è frequente:
- arXiv assegna a ogni articolo un proprio DOI con prefisso 10.48550, registrato presso DataCite (https://info.arxiv.org/help/doi.html). Nella cache locale (`evaluation_cache.json`, 598 articoli distinti) lo riportano 27 record di OpenAlex e 35 di Semantic Scholar.
- Lo stesso succede con altri server di preprint e working paper: SSRN (10.2139), bioRxiv (10.1101), NBER (10.3386), TechRxiv (10.36227), Research Square (10.21203).
- Nella cache ci sono 26 titoli normalizzati identici con DOI diversi, per esempio "Attention via synaptic plasticity…" con DOI SSRN su Crossref e DOI arXiv su Semantic Scholar.

**Decisione.** Il DOI uguale resta sufficiente. Con DOI diversi si passa comunque al confronto titolo + primo autore + anno, ma più severo, perché due DOI diversi restano un indizio contrario:
1. **Prefissi diversi obbligatori.** Il prefisso (la parte prima di "/") identifica chi ha registrato il DOI. Stesso prefisso con DOI diversi vuol dire che lo stesso ente ha registrato due oggetti distinti: non si uniscono. Così si perdono le versioni successive dello stesso preprint su un repository (Zenodo, TechRxiv, Authorea), che restano separate, ma si evitano falsi positivi gravi (sotto).
2. **Titolo con `token_sort_ratio` ≥ 90** (`DIFFERENT_DOI_TITLE_THRESHOLD`) invece di `token_set_ratio`. Quest'ultimo dà 100 quando un titolo è contenuto nell'altro: "Correction to: Attention Is All You Need" contro "Attention Is All You Need" vale 100 con `token_set_ratio` e 78 con `token_sort_ratio` (verificato con rapidfuzz 3.14.6).
3. **Cognome del primo autore presente su entrambi.** Nel ramo senza DOI due articoli senza autori risultano "stesso autore" (`None == None`); con DOI diversi no.
4. Anno entro ±1, come prima.

Se a uno dei due articoli manca il DOI il comportamento è invariato rispetto alla voce 72.

**Alternative valutate sulla cache locale.** Confronto a coppie dei 598 articoli tra il criterio vecchio e diverse varianti:
- Solo `token_sort_ratio` ≥ 90, senza la regola dei prefissi: 25 nuovi gruppi, di cui 2 enormi (109 e 42 record) di pagine spam di ResearchHub (prefisso 10.55277) che differiscono solo per un codice d'esame ("Skillfully PSD Exam Dumps All You Need to Pass Exam", "Skillfully CBA Exam Dumps…"), stesso "autore", stesso anno.
- Soglia 95, oppure obbligo che le parole con cifre coincidano: i gruppi spam si riducono ma non spariscono, perché molti codici sono solo lettere e si collegano a catena tramite Union-Find.
- Regola dei prefissi (scelta): 16 nuovi gruppi, tutti coppie plausibili preprint/pubblicato o working paper/pubblicato, per esempio arXiv con ACL, IEEE o ACM, bioRxiv con IEEE, SSRN con NBER. Nessuna coppia che prima era duplicata smette di esserlo. Con `token_set_ratio` al posto di `token_sort_ratio` il risultato sulla cache è identico: si tiene `token_sort_ratio` per il caso degli errata, che la cache non contiene.

**Verifica.** Nuovo `tests/suites/dedup/dedup_test.py` (7 casi: DOI uguale, DOI arXiv contro DOI dell'editore, stesso prefisso, erratum, autori mancanti, DOI mancante su un lato, primo autore diverso). Suite offline: 37 test passati. Non verificato dal vivo nell'interfaccia.

**Stato.** Implementato.

## 93. Deduplicazione: primo autore obbligatorio su entrambi gli articoli, anche senza DOI (2026-10-24)

**Contesto.** Nel ramo senza DOI della voce 72 il controllo sul primo autore era `author_a != author_b`: se a entrambi gli articoli mancavano gli autori, `None == None` lo faceva passare, e due articoli senza autori, con titoli simili e anni vicini, risultavano duplicati senza alcuna prova sull'autore. Con la voce 92 l'obbligo valeva già nel ramo con DOI diversi.

**Decisione.** Su indicazione dell'utente l'obbligo vale ora in entrambi i rami: se a uno dei due articoli manca il cognome del primo autore, non sono duplicati (salvo DOI uguale, che resta sufficiente da solo). Il codice si semplifica: un solo controllo `author_a is None or author_b is None or author_a != author_b`.

**Effetto sulla cache locale.** Dei 598 articoli 61 non hanno autori, ma nessuna coppia riconosciuta come duplicata dalla voce 92 viene persa.

**Verifica.** Nuovo caso in `tests/suites/dedup/dedup_test.py` (due "Editorial" senza autori né DOI non sono duplicati). Suite offline: 38 test passati.

**Stato.** Implementato.

## 94. DBLP: attesa effettiva su 429/503, rispettando Retry-After (2026-10-24)

**Contesto.** Il ciclo di `DBLPAdapter.fetch` chiamava `raise_for_status()` dentro il `try`: anche 429 e 503 diventavano un'eccezione, l'`except` passava subito al mirror successivo e il ramo con l'attesa (5s/10s/15s) non veniva mai raggiunto. Con entrambi i mirror limitati si facevano 6 richieste di fila senza pause, cioè proprio il comportamento che un limite di frequenza chiede di evitare. DBLP documenta che oltre il limite risponde "429 Too Many Requests" con un header "Retry-After" che indica i secondi da attendere, e che aspettare uno o due secondi tra richieste consecutive basta sempre (https://dblp1.uni-trier.de/faq/1474706.html).

**Decisione.** Ciclo riscritto senza `raise_for_status()`, guardando direttamente lo stato:
- errore di rete o timeout, oppure 5xx diverso da 503: si passa subito al mirror successivo, come prima;
- 429 o 503: si prova comunque l'altro mirror; se nessun mirror risponde, alla fine del giro si attende e si riprova. L'attesa è quella indicata da `Retry-After`, limitata a 60 secondi (`MAX_RETRY_AFTER_SECONDS`) per non bloccare a lungo la ricerca multi-fonte; senza header resta 5s, 10s, 15s come negli altri adapter. Dopo l'ultimo giro non si attende;
- altri errori 4xx: lista vuota, come prima (dalla voce 98 un'eccezione con avviso).

**Verifica.** Due nuovi test in `tests/suites/pagination/other_adapters_pagination_test.py`: 429 con `Retry-After: 7` su entrambi i mirror, poi risposta valida (una sola attesa di 7 secondi e terza richiesta riuscita); 500 sul primo mirror (nessuna attesa, risultato dal secondo). Suite offline: 40 test passati. Non verificato dal vivo.

**Stato.** Implementato.

## 95. OpenAlex: nomi degli autori tra virgolette nel filtro `raw_author_name.search` (2026-10-24)

**Contesto.** Nelle ricerche solo per autore, `_build_query` mandava `raw_author_name.search:` con i nomi senza virgolette, uniti da `|`. La documentazione di OpenAlex spiega che senza virgolette il filtro cerca le singole parole su tutti gli autori del lavoro, non dentro una sola firma: `john smith` trova anche un lavoro firmato da "John Doe" e "Alice Smith" (93.304 risultati contro 2.727 con `"john smith"`). Per le varianti del nome indica di unire frasi tra virgolette con `OR`, per esempio `"jason priem" OR "priem jason"` per le firme invertite come "Priem, Jason" (https://help.openalex.org/api/searching/). Il filtro interno (`_matches_authors`) richiede comunque il nome intero come sottostringa del nome di un autore, quindi i lavori trovati solo per parole sparse venivano scaricati e poi scartati.

**Decisione.** Nuovo `OpenAlexAdapter._author_phrases(name)`: ogni nome va tra virgolette, e se ha più di una parola si aggiunge la variante con l'ultima parola in testa (cognome-nome). Tutte le frasi, di tutti gli autori, sono unite con ` OR `, la forma documentata, al posto della `|`. Dal nome si tolgono virgolette e virgole, che chiuderebbero la frase o separerebbero il filtro: "Ferrara, Alfio" diventa `"Ferrara Alfio" OR "Alfio Ferrara"`. Scartato `~N` (parole intermedie, per secondi nomi e iniziali): il filtro interno scarterebbe comunque "Alfio M. Ferrara" cercando "alfio ferrara", e la documentazione avverte che porta rumore sui nomi comuni.

**Verifica.** Due nuovi test in `tests/suites/normalization/openAlex_norm_test.py` (filtro costruito per due autori; virgolette e virgole tolte, nome di una sola parola). Suite offline: 42 test passati. Verificato dal vivo contro l'API (24 ottobre 2026, con `topics.field.id:17`, 50 risultati per pagina, contando quelli che superano il filtro interno):

| Filtro | Totale OpenAlex | Prima pagina che supera il filtro interno |
|---|---|---|
| `alfio ferrara` (prima) | 159 | 50 su 50 |
| `"alfio ferrara"` | 135 | 50 su 50 |
| `"alfio ferrara" OR "ferrara alfio"` (ora) | 159 | 50 su 50 |
| `alfio ferrara\|ernesto damiani` (prima) | 1061 | 50 su 50 |
| le quattro frasi unite con `OR` (ora) | 1060 | 50 su 50 |

Per un nome poco comune il risultato non cambia: le virgolette da sole perdono le firme invertite (135 contro 159), che la variante cognome-nome recupera. Anche la `|` funzionava come OR.

**Misura sui nomi comuni.** Stessi parametri; in ogni cella il totale su OpenAlex e quanti dei primi 50 superano il filtro interno (allora ancora per sottostringa, vedi voce 96).

| Nome | Senza virgolette | Tra virgolette | Virgolette + cognome-nome |
|---|---|---|---|
| john smith | 3783 / 28 | 310 / 27 | 463 / 29 |
| wei wang | 84386 / 50 | 15709 / 50 | 18404 / 50 |
| yang liu | 92443 / 49 | 12016 / 49 | 15553 / 47 |
| david brown | 2942 / 33 | 460 / 35 | 520 / 33 |
| marco rossi | 775 / 49 | 91 / 49 | 109 / 46 |

Le virgolette riducono il totale da 5 a 10 volte, ma la prima pagina resta quasi uguale: l'ordinamento per rilevanza mette già in cima le firme che contengono il nome per intero. L'effetto atteso è sulle pagine successive (profondità media e alta), non misurato. I risultati scartati erano in gran parte autori giusti con un secondo nome o un'iniziale ("John A. Smith", "David J. Brown") o in forma "Cognome, Nome" ("Rossi, Marco", "Liu, Yang"): il limite era il filtro interno, non la query, e la variante cognome-nome portava proprio risultati di questo tipo, che poi venivano scartati. Da qui la voce 96. Un `display_name` conteneva più autori concatenati ("WANG Wei,LIU Yang,LIU Jing,LI Ji").

**Stato.** Implementato.

## 96. Filtro autore interno: confronto per parole invece che per sottostringa (2026-10-24)

**Contesto.** `_matches_authors` (`services/utils/filtering.py`) teneva un articolo solo se il nome cercato compariva come sottostringa esatta del nome di un autore. La misura della voce 95 ha mostrato che così si scartano autori quasi certamente giusti: "John A. Smith" e "Dr. John Brewster Smith" cercando "John Smith", e i nomi in forma "Cognome, Nome", che OpenAlex usa spesso nel `display_name` ("Rossi, Marco", "Brown, David"; anche il fixture `openAlexEx.json` ha "Duckham, Matt"). Il filtro vale per tutte le sorgenti.

**Decisione.** Nuovo `_matches_author_name`: nomi divisi in parole (minuscolo, punteggiatura come separatore); ogni parola del nome cercato deve comparire tra quelle dell'autore, in qualsiasi ordine. Una parola di una sola lettera vale come iniziale ("A. Ferrara" trova "Alfio Ferrara"); il contrario no, "Alfio Ferrara" non trova "A. Ferrara", per non allargare troppo sui nomi comuni. Ogni parola dell'autore si usa una volta sola ("Li Li" non trova "Li Wang"). Parole intere, non pezzi: "John Smith" non trova più "John Smithson", che con la sottostringa passava. Il numero di omonimia di DBLP ("Wei Wang 0001") resta una parola in più e non disturba. `_contains_term` resta per le venue.

**Limiti.** Non si normalizzano gli accenti ("José" e "Jose" restano diversi, come prima). Un `display_name` con più autori concatenati può dare un falso positivo. I report di `statistics/` rigenerati il 24 ottobre usano ancora il filtro precedente: le query con autore potrebbero cambiare se rigenerate.

**Verifica.** Nuova suite `tests/suites/filtering/filtering_test.py` (10 test: secondo nome, ordine invertito con e senza virgola, maiuscole, parole intere, iniziale, nome per esteso contro iniziale, parola ripetuta, numero di omonimia DBLP). Suite offline: 52 test passati. Non verificato dal vivo.

**Stato.** Implementato e confermato dall'utente (scartata l'alternativa di togliere da OpenAlex la variante cognome-nome e tenere il filtro per sottostringa).

## 97. DBLP: entità XML decodificate in titoli, autori e venue (2026-10-24)

**Contesto.** Nella prova dal vivo del 24 ottobre un titolo di DBLP è arrivato come "When Large Language Models contradict humans? Large Language Models&apos; Sycophantic Behaviour.": l'API JSON di DBLP lascia le entità XML del suo formato d'origine e `DBLPAdapter._normalize` le salvava così. Restavano nel titolo mostrato, negli export e nel confronto tra titoli della deduplicazione (in quel caso il duplicato con arXiv era stato trovato comunque).

**Decisione.** `html.unescape` su titolo, nomi degli autori e venue in `_normalize`. Una sola decodifica: "&amp;apos;" scritto due volte resterebbe "&apos;", ma non è il caso osservato.

**Verifica.** Nuovo test `test_dblp_xml_entities_are_decoded` in `tests/suites/normalization/dblp_norm_test.py` (titolo con `&apos;`, autore "O&apos;Brien", venue con `&amp;`). Suite offline: 59 test passati. Da ricontrollare dal vivo sullo stesso titolo.

**Stato.** Implementato.

## 98. Avviso all'utente per le sorgenti che non rispondono (2026-10-24)

**Contesto.** Quando una sorgente falliva, l'utente non lo sapeva. Gli errori HTTP e i limiti di richieste che persistevano dopo i tentativi diventavano una lista vuota in ogni adapter, indistinguibile da "nessun risultato", e quella lista finiva anche in cache per 7 giorni (lo stesso problema trovato rigenerando i report: `evaluation_cache.json` conteneva risposte vuote di tentativi falliti). Gli errori di rete invece risalivano fino all'orchestratore, che li scriveva solo nel log. Nella prova dal vivo del 24 ottobre Crossref e Semantic Scholar, bloccati dal proxy dell'ambiente, sono spariti dai risultati senza alcun avviso. Un errore a metà paginazione, infine, faceva perdere anche le pagine già scaricate da quella sorgente.

**Decisione.**
- Messaggi in `adapters/base.py`, scritti per essere letti dopo il nome della sorgente, come li mostra il frontend ("DBLP: ..."): `UNREACHABLE_MESSAGE`, `TOO_MANY_REQUESTS_MESSAGE`, `PARTIAL_RESULTS_MESSAGE` e `http_error_message(status)`.
- Negli adapter (arXiv, Crossref, DBLP, OpenAlex, Semantic Scholar) le risposte con stato diverso da 200 e il limite di richieste persistente sollevano `SourceUnavailableError` invece di restituire `[]`: non vengono ritentate da `cached_raw_fetch`, non finiscono in cache e diventano un avviso. OpenAlex tiene il suo messaggio sul credito esaurito (voce 89). DBLP, se nessun mirror risponde per tre giri, distingue tra limite di richieste e sorgente irraggiungibile. Una risposta 200 senza risultati resta una lista vuota.
- Semantic Scholar: `/paper/search` restituisce al massimo i primi 1000 risultati ("Can only return up to 1,000 relevance-ranked results", https://api.semanticscholar.org/graph/v1/swagger.json). Oltre quel limite l'adapter restituisce `[]` senza fare la richiesta, perché è la fine dei risultati e non un guasto da segnalare (con profondità alta si arrivava a chiedere l'offset 1000).
- `paginated_fetch`: se una pagina fallisce dopo che altre hanno già dato risultati, solleva `PartialResultsError` con i risultati raccolti; se non ce n'è ancora nessuno, l'errore risale così com'è.
- Orchestratore: `PartialResultsError` tiene i risultati e aggiunge l'avviso di risultati parziali; un errore imprevisto (per esempio di rete) ora produce `UNREACHABLE_MESSAGE` oltre alla riga nel log. Tutti gli avvisi passano dal campo `warnings` già esistente, quindi il banner del frontend li mostra senza modifiche.

**Conseguenza per gli script di `statistics/`.** Passano anch'essi da `cached_raw_fetch`: un errore di una sorgente ora interrompe lo script con un'eccezione, invece di contare come zero risultati e falsare Jaccard e copertura.

**Verifica.** Sette nuovi test: `tests/suites/pagination/source_errors_test.py` (errore HTTP sollevato e non salvato in cache; mirror DBLP irraggiungibili; Semantic Scholar oltre i 1000 risultati senza richiesta; errore dopo la prima pagina con i risultati conservati; errore sulla prima pagina sollevato così com'è) e `orchestrator_test.py` (risultati parziali con avviso; il test sulla sorgente che fallisce ora controlla anche l'avviso). Suite offline: 59 test passati. Non verificato dal vivo.

**Stato.** Implementato.

## 99. DBLP: 100 risultati per richiesta invece di 1000 (2026-10-24)

**Contesto.** La voce 10 fissava per DBLP `MAX_PAGE_SIZE = 1000`, il massimo indicato dalla FAQ (https://dblp.org/faq/How+to+use+the+dblp+search+API.html). Nella prova dal vivo del 24 ottobre entrambi i mirror hanno mandato al massimo 100 risultati anche con `h=150` e `h=1000` (`@sent` 100 su 2060 per "causal inference"), mentre `f=100` dava correttamente i successivi. Con la profondità alta `paginated_fetch` chiedeva 150, riceveva 100 e leggeva la pagina come l'ultima: 84 articoli invece di proseguire.

**Decisione.** `DBLPAdapter.MAX_PAGE_SIZE = 100`. Con la profondità alta DBLP pagina a 100 alla volta, entro il tetto di pagine aggiuntive.

**Verifica.** Nuovo test `test_dblp_page_size_is_100_and_pagination_continues` (fallisce sul codice precedente). Dal vivo, "causal inference" a profondità alta: due pagine da 100 (`f=0`, `f=100`) e 155 articoli dopo il filtro interno, contro 84.

**Stato.** Implementato.

## 100. Semantic Scholar: una ricerca senza risultati non è un errore (2026-10-24)

**Contesto.** Quando `/paper/search` non trova nulla risponde `{"total": 0, "offset": 0}`, senza il campo `data`. `_normalize` leggeva `items['data']`: KeyError, che `cached_raw_fetch` ritentava dopo 5 secondi e l'orchestratore trasformava in un avviso (voce 98). Nella prova dal vivo una ricerca senza risultati ha impiegato 56 secondi e ha mostrato "Troppe richieste rifiutate" invece di zero risultati.

**Decisione.** `items.get('data', [])`: una risposta senza `data` è una pagina vuota.

**Verifica.** Nuovo test `test_semantic_scholar_without_results_returns_empty_list` (una sola richiesta, lista vuota). Dal vivo la stessa ricerca restituisce 0 risultati senza avviso; i 16,5 secondi della prova sono le attese su due 429 (voce 104).

**Stato.** Implementato.

## 101. Crossref: `query.author` nelle ricerche solo per autore (2026-10-24)

**Contesto.** Alla voce 14 la ricerca generica di Crossref risultava includere gli autori, quindi anche le ricerche solo per autore mandavano il nome in `query.bibliographic`. Con i nomi completi non funziona: per "Alfio Ferrara" nessuno dei primi 50 risultati è suo (in cima titoli come "Castelli, Alfio" e "Grasso, Alfio"), e in una ricerca a profondità media Crossref ha scaricato 5 pagine, 249 record, senza nessun articolo che superasse il filtro interno. Con "Elisabetta Rocchetti" nessun suo lavoro tra i primi 50. Con `query.author` i primi 50 sono tutti dell'autore cercato.

**Decisione.** Su indicazione dell'utente, nelle ricerche solo per autore (nessuna keyword) l'adapter usa `query.author`, come `au:` per arXiv e il filtro dedicato per OpenAlex (voce 14). Con le keyword resta `query.bibliographic` con i soli termini, e l'autore resta al filtro interno come per le altre fonti. Più autori vanno nella stessa `query.author`: l'ordine è per rilevanza, quindi i più prolifici occupano le prime pagine (per "Alfio Ferrara" ed "Ernesto Damiani", 7 e 43 dei primi 50).

**Effetto sul test `singles`.** Il caso solo-cognome di `single_crossref_test.py` ("Rocchetti") era tarato su `query.bibliographic`, dove il paper atteso compariva in posizione 64. Con `query.author` i lavori dei molti Rocchetti hanno lo stesso punteggio e il paper non compare nei primi 300, mentre con il nome completo è in posizione 20: il caso ora usa "Elisabetta Rocchetti".

**Verifica.** Nuovo test `test_crossref_author_only_search_uses_query_author` (solo autore: `query.author`; keyword + autore: `query.bibliographic` con le sole keyword). Dal vivo "Alfio Ferrara" dà 50 articoli su 50, contro 0. Test `singles` di Crossref: 6 passati.

**Stato.** Implementato.

## 102. Paginazione: contano i record mandati dalla fonte, non gli articoli normalizzati (2026-10-24)

**Contesto.** `paginated_fetch` considera finita una fonte quando la pagina ha meno elementi della dimensione chiesta, ma contava gli articoli rimasti dopo `_normalize`, che in Crossref e OpenAlex scarta i record senza titolo o identificativo. Dal vivo una pagina Crossref da 150 per "causal inference" conteneva un record senza titolo (DOI 10.61686/ddpuz06393): 149 articoli, paginazione ferma, 98 risultati invece di proseguire verso il target di 150.

**Decisione.** Nuova classe `ArticlePage` in `adapters/base.py`: una lista di articoli con in più `received`, il numero di record mandati dalla fonte. Crossref e OpenAlex la restituiscono da `_normalize`; le altre fonti non scartano record e restano liste semplici, per cui vale il numero di articoli. `paginated_fetch` decide su `received`. La cache su file salva `received` accanto ai dati e lo ripristina, altrimenti la stessa ricerca ripetuta dalla cache si fermerebbe di nuovo; le voci in cache senza questo campo valgono come prima.

**Verifica.** Due nuovi test: una pagina piena con un record scartato fa proseguire la paginazione; `received` resta uguale quando la pagina arriva dalla cache. Dal vivo la stessa ricerca fa due pagine (149 e 148 articoli su 150 record) e dà 183 risultati contro 98; ripetuta subito, le due pagine arrivano dalla cache con lo stesso risultato.

**Stato.** Implementato.

## 103. Nessuna attesa dopo l'ultimo tentativo su 429/503 (2026-10-24)

**Contesto.** arXiv, Crossref, OpenAlex e Semantic Scholar, su 429 o 503, attendevano 5, 10 e 15 secondi riprovando, e i 15 secondi venivano attesi anche dopo il terzo tentativo, quando la fonte stava per essere saltata comunque. DBLP non lo fa dalla voce 94.

**Decisione.** Al terzo 429/503 il ciclo esce subito e solleva `SourceUnavailableError` (voce 98). Le attese tra un tentativo e l'altro restano 5 e 10 secondi.

**Verifica.** Nuovo test `test_no_wait_after_last_rate_limited_attempt` (arXiv: 3 richieste, attese di 5 e 10 secondi). Suite offline: 65 test passati.

**Stato.** Implementato.

## 104. Semantic Scholar: 429 indipendenti dal ritmo delle richieste (2026-10-24)

**Contesto.** Nella prova dal vivo del 24 ottobre Semantic Scholar ha rifiutato con 429 (`TooManyRequestsException`, senza `Retry-After`) molte richieste fatte con la chiave del `.env`. La chiave è valida: una chiave inventata riceve 403. Secondo la pagina ufficiale dell'API una chiave nuova ha un limite iniziale di 1 richiesta al secondo; la pagina non era raggiungibile dall'ambiente della prova, il dato viene da una ricerca web e va ricontrollato.

**Misura.** Richieste in sequenza dal cloud, nel pomeriggio del 24 ottobre:

| Endpoint | Chiave | Intervallo | Riuscite |
|---|---|---|---|
| `/paper/search` | sì | 10 s | 1 su 8 |
| `/paper/search` | sì | 3 s | 1 su 15 |
| `/paper/search` | sì | 1,2 s | 2 su 20 |
| `/paper/{id}` | sì | 1,2 s | 5 su 20 |
| `/paper/search` | no | 10 s | 0 su 6 |

Un'ora prima, con una richiesta ogni 6 secondi, ne riusciva circa la metà. I rifiuti non dipendono dall'intervallo né dall'endpoint, quindi non vengono dal ritmo di PapérDex, che dentro una ricerca manda una pagina ogni 3 secondi o più. Le cause possibili sono un sovraccarico di Semantic Scholar, un limite della chiave più basso di quello documentato, o un limite per indirizzo IP sul cloud: dalla VM del PC di Luca l'API non era raggiungibile, quindi il confronto non è stato possibile.

**Decisione.** Nessuna modifica all'adapter oltre alla voce 103: rallentare non servirebbe.

**Verifica dal PC (2026-10-26).** Luca ha fatto 5 ricerche di fila dall'app, da casa, con solo Semantic Scholar: una completa, tre saltate con "Troppe richieste rifiutate" e una con risultati parziali. I 429 restano anche fuori dal cloud, quindi il limite per indirizzo IP del cloud non li spiega.

**Stato.** Da chiedere a Semantic Scholar lo stato e il limite della chiave.

## 105. Cache su file: le richieste parallele non si cancellano più le voci a vicenda (2026-10-24)

**Contesto.** `file_cache` (`services/utils/caching.py`) leggeva l'intero file all'inizio della chiamata, aspettava la risposta della sorgente e poi riscriveva il file con la copia letta all'inizio più la nuova voce. Le sorgenti sono interrogate in parallelo (`asyncio.gather` nell'orchestratore), quindi ogni salvataggio cancellava le voci scritte dalle altre durante l'attesa: nella prova dal vivo del 24 ottobre restavano in cache 3 pagine su 7. Inoltre la scrittura avveniva direttamente sul file: un altro processo che leggeva in quel momento (per esempio uno script di `statistics/` con il server acceso) poteva trovare un JSON a metà, che `load_cache` tratta come cache vuota, e il suo salvataggio successivo avrebbe svuotato davvero il file.

**Decisione.**
- Nuova `save_cache_entry(chiave, voce)`: rilegge il file subito prima di scrivere e aggiunge solo la propria voce. Tra lettura e scrittura non c'è nessun `await`, quindi nello stesso processo nessun'altra richiesta può inserirsi nel mezzo; non serve un lock.
- `save_cache` scrive su un file temporaneo (`evaluation_cache.json.<pid>.tmp`) e lo sostituisce con `os.replace`, che è atomico: chi legge trova il file vecchio o quello nuovo, mai uno scritto a metà. Su Windows la sostituzione può fallire se un altro processo ha il file aperto in quell'istante: in quel caso si perde solo quella scrittura (la pagina verrà riscaricata) e il file temporaneo viene cancellato.
- Resta possibile, tra due processi diversi che salvano nello stesso istante, che una delle due voci vada persa: per una cache il costo è una richiesta in più, e un lock tra processi portabile su Windows non valeva la complessità.

**Verifica.** Nuova suite `tests/suites/caching/caching_test.py`: due chiamate in parallelo che attendono insieme la rete lasciano entrambe la loro voce (il test fallisce con il codice precedente: 1 voce invece di 2), e il salvataggio non lascia file temporanei. Suite offline: 73 test passati.

**Stato.** Implementato.

## 106. Test per la pagina anti-bot di DBLP e per la copertura con il punto finale (2026-10-24)

**Contesto.** Le due correzioni fatte il 24 ottobre rigenerando i report (DBLP bloccato da Anubis; copertura DBLP→arXiv sempre 0 per il punto finale dei titoli DBLP) non avevano test.

**Decisione.** In `tests/suites/pagination/source_errors_test.py`: pagina anti-bot (202, HTML) su entrambi i mirror, con `SourceUnavailableError`, un solo giro di richieste e niente in cache; pagina anti-bot con 200 su un mirror e risultati dall'altro; parametro `app=PaperDex_0.1` presente nella richiesta. Nuova suite `tests/suites/statistics/indexes_test.py`: `true_coverage` trova "Attention is all you need" cercando "Attention Is All You Need." e conta come assente un titolo diverso. Il test sostituisce solo il nome `cached_raw_fetch` dentro `indexes.py`: se la copertura tornasse a passare dal filtro interno, il test fallirebbe.

**Verifica.** Suite offline: 73 test passati.

**Stato.** Implementato.

## 107. Nuove query di valutazione, uguali per arXiv–OpenAlex e arXiv–DBLP (2026-10-24)

**Contesto.** Nel report del 24 ottobre 4 query su 10 davano 0 risultati su entrambe le sorgenti: erano tutte keyword + autore. L'autore accanto alle keyword non arriva alla sorgente e viene filtrato dopo, sulla sola pagina che usano le metriche, quindi quelle query misuravano questo limite e non la sovrapposizione. Altre query avevano gruppi OR (alla sorgente arriva solo il primo gruppo), un filtro sull'anno applicato dopo, oppure termini poco realistici ("Boarding difference public" o "kangaroo model"). I `limit` erano diversi (10 o 50), e le due coppie di sorgenti usavano query diverse, quindi non si potevano confrontare tra loro.

**Decisione.** Nuovo `statistics/queries.py` con `EVALUATION_QUERIES`, usato da entrambi gli script, tutte con `limit=50`:
- solo keyword, da un tema molto ampio a uno di nicchia: "large language models", "federated learning", "causal inference" (già nei report precedenti, utile per confrontare), "systematic literature review" (vicino al tema della tesi), "argument mining";
- solo autore, dove il nome arriva davvero alla sorgente (`au:` su arXiv, `raw_author_name.search` su OpenAlex, testo libero su DBLP): Alfio Ferrara, Elisabetta Rocchetti, Martin Ruskov.

Tutto resta nel dominio informatico, a cui sono già limitati arXiv (`cat:cs.*`) e OpenAlex (`topics.field.id:17`); DBLP lo è per natura. Un test (`tests/suites/statistics/queries_test.py`) controlla che ogni query sia solo keyword o solo autore, con un solo gruppo, senza anno e con lo stesso limit.

**Costo e durata.** Ogni articolo di una sorgente viene cercato per titolo sull'altra, con 2 secondi di attesa: fino a 100 ricerche per query e coppia, quindi un'esecuzione completa può superare l'ora. Su OpenAlex una ricerca costa 0,001 $ e il credito gratuito è di 1 $ al giorno per chiave (https://blog.openalex.org/openalex-api-new-features-and-usage-based-pricing/): la copertura arXiv→OpenAlex resta sotto i 0,40 $.

**Report.** Il report del 24 ottobre con le query precedenti è stato rinominato `evaluation_report_2026-10-24.json` (come quello del 3 agosto), perché `save_metrics_to_json` aggiunge in coda al file. Il nuovo report va generato lanciando i due script.

**Stato.** Implementato; report da rigenerare.

## 108. Script di valutazione: il 429 di arXiv non ferma più l'intera valutazione (2026-10-25)

**Contesto.** Rigenerando il report del 24 ottobre, arXiv ha risposto 429 tre volte di fila sull'ultima query di `arxiv_openalex.py` (Martin Ruskov). L'adapter, dopo i suoi tre tentativi, solleva `SourceUnavailableError`, che nel ciclo delle query non era gestita: lo script si fermava e le query successive non venivano valutate. In più `true_coverage` cercava i titoli con 2 secondi di attesa, mentre le condizioni d'uso di arXiv chiedono al massimo una richiesta ogni 3 secondi (https://info.arxiv.org/help/api/tou.html).

**Decisione.**
- `statistics/indexes.py`: nuova `evaluate_query_with_retries`, usata da `arxiv_openalex.py` e `arxiv_dblp.py` al posto di `evaluate_query_metrics`. Su `SourceUnavailableError` rifà la query dopo 60 secondi e poi dopo 180 (`QUERY_RETRY_WAITS`); le pagine già scaricate sono in cache, quindi la query riparte da dove si era fermata. Se fallisce ancora, restituisce una `SkippedEvaluation` (`skipped: true`, motivo, tentativi), che `save_metrics_to_json` aggiunge al report come le altre, e lo script passa alla query successiva. Gli altri errori non vengono ritentati, perché sarebbero bug.
- `ArXivAdapter`: rispetta l'header `Retry-After` se arXiv lo manda, con un tetto di 60 secondi come per DBLP; senza header resta l'attesa di 5 e 10 secondi. Nuovo `MIN_REQUEST_INTERVAL = 3.0`, che `true_coverage` usa come attesa tra le ricerche per titolo su arXiv; le altre sorgenti restano a 2 secondi.

Le pause lunghe sono solo negli script: nella ricerca dal vivo l'adapter continua a fermarsi dopo i suoi tre tentativi, perché l'utente non deve aspettare minuti (voce 103).

**Verifica.** Nuova suite `tests/suites/statistics/evaluation_retry_test.py` (query rifatta dopo l'errore, query saltata e registrata nel report, errori generici non ritentati, attesa di arXiv pari a `Retry-After` con il tetto). Suite offline: 78 test passati.

**Stato.** Implementato.

## 109. Testi dell'interfaccia: "sorgente" invece di "fonte", "articolo" invece di "paper" (2026-10-25)

**Contesto.** Il 2026-10-08 si è deciso, su consiglio del relatore, di usare nella tesi **articolo** per gli elementi aggregati e **sorgente** per i servizi interrogati. L'interfaccia usava ancora "fonte" e "paper", quindi tesi e applicazione non coincidevano.

**Decisione.** Sostituiti i termini in tutti i testi visibili, con articoli e accordi adattati ("i paper trovati" → "gli articoli trovati", "N paper salvati" → "N articoli salvati", "1 articolo salvato"):
- frontend: titolo del pannello "Sorgenti" (`SourcesPanel.jsx`), "Classifica delle sorgenti" e relative spiegazioni (`SourcePriorityEditor.jsx`), legenda delle profondità (`SearchForm.jsx`), gruppi di duplicati (`SearchResults.jsx`), pagina Chiavi API, home, Overview, pagina di ricerca (errore "Seleziona almeno una sorgente." e i due riquadri introduttivi), avviso per chi abbandona una Ricerca (`TeamPage.jsx`);
- messaggi del backend che arrivano all'utente: `routes/ricerche.py` ("Articolo aggiunto alla ricerca", classifica delle sorgenti, rimozione di articoli salvati), `routes/utenti.py` ("Sorgente non riconosciuta"), `services/utils/orchestrator.py` ("Sorgenti sconosciute" e l'avviso sulla chiave non valida).

In un primo momento erano rimasti invariati i nomi nel codice, gli URL e i commenti, perché non sono testo visibile; sono stati allineati subito dopo (voce 110).

**Verifica.** Nessuna occorrenza di "fonte/fonti" o "paper" rimasta nei testi visibili (ricerca nel frontend e nei messaggi del backend). Suite offline: 78 test passati; sintassi dei 9 file del frontend controllata con esbuild. Non guardato a schermo.

**Stato.** Implementato.

## 110. Codice: "sorgente" e "articolo" anche in nomi, commenti, URL e test (2026-10-25)

**Contesto.** Dopo la voce 109 i testi visibili usavano "sorgente" e "articolo", mentre il codice alternava ancora "fonte" e "sorgente" nei commenti, e "paper" e "article" nei nomi. Luca ha chiesto la stessa coerenza anche nel codice, per renderlo più leggibile.

**Decisione.**
- Commenti e docstring di backend, frontend e test: "fonte/fonti" → "sorgente/sorgenti", "paper" → "articolo/articoli".
- Nomi: il componente `SearchPapersPage` diventa `SearchArticlesPage` (file rinominato, import aggiornati in `PublicSearchPage.jsx`, `QuickSearchPage.jsx` e `ResearchSearchPage.jsx`); la funzione `searchPapers` diventa `searchArticles` (`api/search.js`); la variabile di ciclo `paper` diventa `article` in `statistics/indexes.py`. Nei test cambiano i titoli d'esempio ("Paper A" → "Article A", "Same Paper" → "Same Article" e simili), l'helper `_s2_paper` → `_s2_article` e il test `test_paper_found_in_all_sources` → `test_article_found_in_all_sources`.
- API: le rotte `/ricerche/{ricerca_id}/paper...` diventano `/ricerche/{ricerca_id}/articoli...` (elenco, aggiunta, gruppo, arricchimento singolo e completo, rimozione), in linea con `/ricerche` e `/cronologia`. Le usa solo il frontend (`api/ricerche.js`), aggiornato insieme, quindi non serve tenere il vecchio percorso.
- Frontend: l'indirizzo della pagina di ricerca passa da `/ricerca/paper` a `/ricerca/articoli` (rotte in `App.jsx`, link in `AppLayout.jsx` e `HomePage.jsx`). Il vecchio indirizzo resta come reindirizzamento (`<Navigate replace>`), sia nella parte pubblica sia in quella con accesso, così i collegamenti già salvati continuano a funzionare.

Restano invariati, di proposito:
- il nome del progetto, PaperDex (database `PaperDex`, `APP_ID = "PaperDex_0.1"` per DBLP, chiave `paperdex_token` nel browser, mittente `no-reply@paperdex.local`, link a GitHub): non è un termine dell'interfaccia, e cambiarlo sposterebbe il database e farebbe scadere gli accessi salvati;
- i percorsi di Semantic Scholar (`/paper/search`, `semanticscholar.org/paper/...`), che appartengono all'API esterna;
- "working paper" in `services/utils/dedup.py`, che è un tipo di pubblicazione;
- l'espressione "fonte di verità" (`routes/utenti.py`, `services/llm/base.py`, `services/utils/export.py`), che è un modo di dire e non indica una sorgente;
- le voci precedenti di questo documento, che restano come storico.

**Verifica.** Ricerca in `backend/app`, `backend/tests` e `frontend/src`: restano solo le eccezioni elencate e le due rotte di reindirizzamento, e nessun import di `SearchPapersPage` o `searchPapers`. Suite offline: 78 test passati; pyflakes non segnala nomi non definiti; sintassi dei file del frontend modificati controllata con esbuild. Non guardato a schermo; le suite `singles` e `coverage`, che richiedono la rete, non sono state eseguite.

**Stato.** Implementato.

## 111. Valutazione: coppie OpenAlex–DBLP e Crossref–DBLP (2026-10-25)

**Contesto.** I 16 confronti della voce 107 hanno tutti arXiv da un lato (arXiv–OpenAlex e arXiv–DBLP). Bastano per dire che, sulle query per argomento, sorgenti diverse mettono in cima articoli diversi pur avendo cataloghi sovrapposti, ma non dicono nulla su come si sovrappongono le altre sorgenti tra loro. Luca ha chiesto di aggiungere le coppie mancanti che gli avevo proposto: OpenAlex–DBLP e una coppia con Crossref.

**Decisione.** Due nuovi script, uguali a `arxiv_openalex.py` e `arxiv_dblp.py`:
- `statistics/openalex_dblp.py`: OpenAlex (con la chiave del `.env`) contro DBLP;
- `statistics/crossref_dblp.py`: Crossref contro DBLP.

Entrambi usano le stesse 8 query (`statistics/queries.py`, voce 107) e aggiungono i risultati allo stesso `evaluation_report.json`, quindi il report passa da 16 a 32 confronti.

Perché DBLP come secondo termine in entrambe:
- DBLP è la bibliografia di riferimento dell'informatica e compare già in arXiv–DBLP, quindi la colonna "copertura verso DBLP" si legge allo stesso modo per arXiv, OpenAlex e Crossref;
- per Crossref, una coppia con OpenAlex misurerebbe soprattutto il filtro sul campo informatica di OpenAlex (`topics.field.id:17`), perché OpenAlex importa i metadati di Crossref; Crossref–DBLP invece mette a confronto una sorgente generalista, che in PapérDex non ha filtri di dominio, con una solo informatica;
- Crossref e DBLP non consumano il credito giornaliero di OpenAlex. OpenAlex–DBLP lo usa per cercare su OpenAlex i titoli trovati da DBLP: al massimo 8 × 50 ricerche, circa 0,40 $ sul dollaro gratuito al giorno.

Semantic Scholar resta fuori per ora, per i 429 della voce 104. Si aggiunge allo stesso modo, con uno script in più.

`queries.py` ora elenca i quattro script nel commento iniziale, e nella parte sulle query per autore indica anche `query.author` per Crossref (voce 101).

**Test.** Nuovo `tests/suites/statistics/scripts_test.py`: per ciascuno dei quattro script controlla che valuti tutte le query di `EVALUATION_QUERIES`, con gli adapter e i nomi giusti, e che scriva in `backend/app/statistics/evaluation_report.json`. Rete, database e `.env` sono sostituiti. Suite offline: 82 test passati (78 + 4).

**Risultati.** Generati il 2026-10-25 nel cloud, uno script dopo l'altro: report a 32 voci, nessuna query saltata (Crossref ha risposto 429 otto volte, sempre superato al primo nuovo tentativo). Le risposte di DBLP venivano dalla cache del giorno prima, quindi coincidono con quelle di arXiv–DBLP. Sulle query solo-keyword il Jaccard resta tra 0 e 7% anche senza arXiv, DBLP→altra è tra 57 e 89%, Crossref→DBLP tra 0 e 14% (tranne "argument mining", 64%). Tabelle e lettura in `tesi/Statistiche di sovrapposizione.md`.

**Stato.** Implementato.

## 112. Valutazione: 15 query per argomento, ripresa delle esecuzioni e riepilogo con mediana e intervallo (2026-10-25)

**Contesto.** Con 5 query per argomento per coppia si può dire che le sorgenti mettono in cima articoli diversi (voci 107 e 111), ma non si possono dare numeri tipici: cinque valori singoli non bastano per una mediana credibile. Luca ha chiesto di aggiungere le query che servono.

**Decisione.**
- `statistics/queries.py`: 10 query solo keyword in più ("graph neural networks", "reinforcement learning", "differential privacy", "knowledge graphs", "recommender systems", "sentiment analysis", "named entity recognition", "topic modeling", "software testing", "blockchain"). In tutto sono 15 per argomento e 3 per autore. Vengono da aree diverse dell'informatica, e tre sono temi condivisi con altre discipline, come "causal inference". Le query per autore restano 3: con gli omonimi sono comunque indicative e non entrano nei numeri tipici.
- Ripresa delle esecuzioni: ogni script legge le query già presenti nel report (`evaluated_queries` in `statistics/saving.py`) e salta quelle già valutate per la propria coppia. Una query saltata (`"skipped": true`) viene invece rifatta, e il nuovo record prende il suo posto. Il motivo è il credito di OpenAlex: le 10 query nuove costano circa 1 $ sulle due coppie con OpenAlex (circa 50 ricerche per titolo per query e per coppia, 0,001 $ l'una), più del dollaro gratuito al giorno. Quando il credito finisce, le query vengono saltate, e basta rilanciare lo script il giorno dopo. Le 32 voci già nel report non si ricalcolano; per rifare tutto da capo si rinomina prima il report, come per i report precedenti.
- `EVALUATION_REPORT` in `saving.py` contiene il percorso del report, prima ripetuto nei quattro script.
- Nuovo `statistics/summary.py` (`python -m backend.app.statistics.summary`): stampa una tabella Markdown con, per ogni coppia e tipo di query, il numero di query e la mediana con l'intervallo (minimo–massimo) di Jaccard e coperture. Le query saltate non entrano nel conto. Il tipo si ricava da `query_description`: "keyword_include=None" vuol dire solo autore.

**Test.** Nuovi `tests/suites/statistics/saving_test.py` (una query rifatta sostituisce quella saltata; `evaluated_queries` ignora le saltate) e `summary_test.py` (mediana e intervallo per coppia e tipo, query saltate escluse, decimali con la virgola). In `scripts_test.py`, ogni script salta le query già valutate per la propria coppia. Suite offline: 90 test passati.

**Risultati.** Valutazione completata il 2026-10-26 nel cloud: report a 72 voci (18 query × 4 coppie), nessuna saltata. Il credito di OpenAlex è finito la sera del 25 su 6 query di OpenAlex–DBLP, riprese dopo la mezzanotte UTC; altre due interruzioni venivano da bug degli adapter, corretti nelle voci 113 e 114. Sulle 15 query per argomento la mediana del Jaccard va da 0 a 3,41% secondo la coppia, con un massimo di 7,25% su tutti i 60 confronti. La copertura verso DBLP ha mediana 88% da arXiv, 57,45% da OpenAlex e 13,64% da Crossref. Tabella di `summary` e lettura in `tesi/Statistiche di sovrapposizione.md`.

**Stato.** Implementato.

## 113. DBLP: campi mandati come lista, non solo 'venue' (2026-10-25)

**Contesto.** Durante la valutazione della voce 112, arXiv–DBLP si è fermato su "software testing": cercando su DBLP il titolo di un articolo di arXiv per la copertura, un record aveva `year` come lista e `year_val.isdigit()` sollevava `AttributeError`. Non essendo una `SourceUnavailableError`, l'errore ha fermato lo script (come previsto, voce 108) e mancavano "software testing" e "blockchain". Nell'applicazione lo stesso record faceva perdere l'intera pagina di DBLP.

**Decisione.** DBLP manda un campo come stringa se ha un solo valore e come lista se ne ha di più. L'adapter lo gestiva già per `venue` e per gli autori; ora il nuovo metodo `_first` (in `services/adapters/dblp.py`) tiene il primo valore anche per `year`, `ee` (l'identificativo dell'articolo, che in `Article.id` è una stringa) e `doi`, e sostituisce il blocco che faceva la stessa cosa per `venue`. L'anno viene usato solo se è una stringa di cifre, e un record con DOI ma senza `ee` usa l'URL di DBLP invece di sollevare `KeyError`.

Gli errori inattesi continuano a fermare la valutazione invece di far saltare la query: è così che il bug è emerso (`test_other_errors_are_not_retried`). Jaccard e coperture confrontano solo i titoli, quindi le voci già nel report non cambiano.

**Test.** `test_dblp_fields_sent_as_lists_take_the_first_value` in `tests/suites/normalization/dblp_norm_test.py`: un record con `year`, `venue` ed `ee` come liste. Suite offline: 91 test passati.

**Stato.** Implementato.

## 114. OpenAlex: niente caratteri jolly né virgolette dentro le frasi di ricerca (2026-10-26)

**Contesto.** Nella valutazione della voce 112, OpenAlex–DBLP ha saltato "topic modeling". Per la copertura DBLP→OpenAlex si cerca su OpenAlex il titolo di ogni articolo di DBLP, e uno inizia con `"Are the current topic modeling evaluation metrics enough?" Mitigating…`. L'adapter mette ogni termine tra virgolette nel parametro `search`, e OpenAlex ha risposto HTTP 400: "Wildcards (* or ?) require exact (no-stem) search". Il `?` viene letto come carattere jolly, e le virgolette interne chiudevano la frase prima del tempo. L'errore è deterministico, quindi rilanciare non serviva. Nell'applicazione, una keyword con `?`, `*` o virgolette faceva saltare OpenAlex con un avviso.

**Decisione.** Il nuovo metodo `_search_phrase` (in `services/adapters/openAlex.py`) toglie `?`, `*` e `"` da ogni termine prima di metterlo tra virgolette, come già faceva `_author_phrases` per i nomi. Un termine che resta vuoto viene scartato. Della frase si perde solo la punteggiatura. I termini senza questi caratteri producono la stessa query di prima, quindi le voci in cache e nel report non cambiano.

Alternativa scartata: `search.exact` per le ricerche per titolo. Accetterebbe i caratteri jolly, ma disattiva lo stemming e si comporterebbe in modo diverso dalla ricerca normale dell'applicazione.

**Test.** `test_openalex_search_phrase_drops_wildcards_and_inner_quotes` in `tests/suites/normalization/openAlex_norm_test.py`, con il titolo che dava l'errore più un termine fatto solo di `?`. Suite offline: 92 test passati.

**Stato.** Implementato.

## 115. Autori vuoti: la deduplicazione non fa più fallire la ricerca (2026-10-26)

**Contesto.** Durante le prove sul PC, una ricerca anonima su "causal inference" ha restituito "Failed to fetch". Nel backend c'era un `IndexError` in `services/utils/dedup.py`: `_first_author_surname` prendeva l'ultima parola del primo autore con `article.authors[0].split()[-1]`, e per un nome vuoto (`""`) `split()` non dà nessuna parola. L'eccezione non era gestita, quindi la risposta era un 500 senza intestazioni CORS, e il browser mostrava solo "Failed to fetch". La stessa euristica, in `services/utils/export.py`, avrebbe fatto fallire l'export BibTeX dello stesso articolo.

Origine probabile, dedotta dal codice e non verificata sul record: in Crossref gli autori collettivi (consorzi, gruppi di lavoro) arrivano con `name` al posto di `given` e `family`, e l'adapter li trasformava in `""`.

**Decisione.**
- `dedup.py`: `_first_author_surname` usa il primo autore con un nome non vuoto, e restituisce `None` se non ce n'è nessuno (come per gli articoli senza autori, voce 93).
- `export.py`: `_authors_or_empty` toglie i nomi vuoti, quindi chiave BibTeX, CSV e RIS non li vedono più.
- `crossref.py`: per un autore senza `given` e `family` si usa `name`; un autore senza nessuno dei tre campi viene scartato.

**Test.** `test_blank_author_names_are_skipped` (`tests/suites/dedup/dedup_test.py`), `test_crossref_collective_and_empty_authors` (`tests/suites/normalization/crossref_norm_test.py`) e il nuovo `tests/suites/export/export_test.py`. Suite offline: 95 test passati.

**Stato.** Implementato. Riprovato da Luca dall'app il 2026-10-26: la stessa ricerca dà risultati.

---

## 116. Controllo manuale di nuove versioni per un articolo salvato (2026-10-27)

**Contesto.** Prima parte del monitoraggio discusso in `docs/monitoraggio-versioni-e-query.md`: dato un articolo già salvato, scoprire se ne esiste una versione più recente nelle fonti. Vincolo esplicito ricevuto dall'utente (richiesta a lui fatta da terzi): solo controllo **manuale** per ora, niente scheduler né ripartizione a bucket — quella parte del design resta sulla carta.

**Decisione — due passi in cascata, non uno solo.** Verificato dal vivo prima di scrivere codice (non assunto): ri-interrogare la stessa fonte con lo stesso identificativo (`fetch_zotero_metadata`, già esistente per l'arricchimento) rileva le revisioni — confermato su "Attention Is All You Need" via arXiv, la cui data di record cambia da una richiesta all'altra riflettendo le revisioni del preprint. Non rileva però il passaggio da preprint a pubblicato: il DOI che arXiv assegna da solo (`10.48550/arXiv.*`, dal 2022) è identico prima e dopo la pubblicazione altrove, e non è un segnale utilizzabile. Per quel caso, nuovo passo 2: ricerca mirata titolo+cognome del primo autore su Crossref (bassa profondità, un'unica richiesta), attivata solo se l'articolo non ha ancora un DOI di editore.

**Bug trovato in verifica e corretto — soglia aggiuntiva più severa per il passo 2.** Primo giro di test con un autore prolifico (Yann LeCun, titolo "Deep learning"): `are_duplicates` ha accettato come duplicato un suo lavoro completamente diverso ("Deep learning & convolutional networks", un talk IEEE) perché, quando l'articolo salvato non ha DOI, usa `fuzz.token_set_ratio` — che per design dà punteggio massimo a un titolo interamente contenuto in un altro (pensato per tollerare sottotitoli diversi tra fonti dello stesso lavoro). Lì ha senso, confronta pochi risultati della stessa ricerca; qui il pool è una ricerca per titolo apposta più ampia, dove la collisione è concreta. Aggiunta una soglia supplementare solo per questo contesto (`fuzz.ratio`, che non perdona parole extra — 52 contro i 100 di token_set_ratio sullo stesso caso), senza toccare `are_duplicates` stesso. Aggiunto anche il cognome dell'autore alla query mandata a Crossref (prima finiva solo nel filtro successivo, mai nella query vera): senza, il titolo generico non faceva emergere il paper giusto tra i primi risultati.

**Decisione — l'esito non completato non è "trovato nulla".** Durante la verifica, una chiamata a Crossref ha incontrato un 429 dopo i tentativi: senza distinzione, sarebbe sembrato un controllo riuscito senza novità. Il passo 2 ora distingue `kind: "unavailable"` da "niente trovato", e la rotta lo traduce in un 502 invece di una risposta 200 silenziosa — stessa filosofia degli avvisi per sorgente già usata da `search_all_sources`.

**Decisione — esiti diversi, trattamento diverso.** Una revisione della stessa fonte aggiorna l'articolo sul posto con la stessa politica non distruttiva di `apply_enrichment` (riempie solo campi vuoti). Una versione trovata su un'altra fonte diventa un'alternativa nel `DuplicateGroup` dell'articolo (riusa `attach_as_duplicate_alternatives`, introdotta per la deduplicazione tra sessioni), da rivedere nella tab Deduplicazione come un duplicato qualunque — niente di nuovo da costruire lì.

Nuovo modulo `services/utils/versioning.py`; nuova rotta `POST /ricerche/{id}/articoli/{article_id}/check-version`. Non ancora collegata al frontend (richiesto esplicitamente solo il codice di controllo per ora).

**Verifica.** Dal vivo contro backend e translation-server reali, nessun mock. Revisione: stesso articolo arXiv ri-controllato due volte, data del record diversa da quella salvata rilevata correttamente entrambe le volte. Nuova fonte: prima un falso positivo (lavoro diverso dello stesso autore) scartato dopo il fix, poi il vero paper Nature trovato con DOI, venue e abstract corretti, verificato sia come valore di ritorno della funzione sia end-to-end sulla rotta HTTP, con il `DuplicateGroup` risultante controllato via API. Fonte non raggiungibile: riprodotto un 429 reale di Crossref, confermato che la rotta risponde 502 invece di un falso "niente trovato". Dati di prova ripuliti al termine.

**Stato.** Implementato e verificato dal vivo. Collegamento al frontend e ricerca incrementale delle query (la seconda metà del monitoraggio) restano da fare.

## 117. Controllo di nuove versioni in blocco su tutta la Ricerca (2026-11-07)

**Contesto.** Il punto 116 copre solo un articolo alla volta. Durante il redesign del frontend (fuori da questo documento, in un canvas di design separato) era emersa la necessità di una versione "tutti insieme" da agganciare a un'azione di massa in Overview ("Aggiorna tutti"), simmetrica a `enrich_all_articles` — che già esiste per l'arricchimento Zotero ma non aveva un equivalente per il controllo versioni.

**Decisione.** Nuova rotta `POST /ricerche/{id}/articoli/check-version-all`, stessa forma di `enrich_all_articles`: raccoglie tutti gli `AddedArticle` della Ricerca (project-wide, non solo dell'utente corrente — stessa query di `export_ricerca_articles`), deduplica per articolo (un articolo salvato da più membri non va controllato due volte), e chiama `check_for_new_version` su ciascuno. Un esito per articolo, non interrotto dagli altri: una revisione trovata applica i campi sul posto (stessa politica non distruttiva del punto 116); una versione su un'altra fonte diventa un'alternativa nel `DuplicateGroup`, da rivedere in Deduplicazione; una fonte irraggiungibile finisce in `errors` invece di sembrare "niente trovato", stessa distinzione del punto 116. Risposta: `{total, revised[], new_sources[], errors[]}`.

Nessuna novità logica rispetto al punto 116: è lo stesso `check_for_new_version` chiamato in loop con lo stesso trattamento per `kind`, sul modello letterale di come `enrich_all_articles` itera su `enrich_article`/`apply_enrichment`.

**Non verificato dal vivo** (a differenza del punto 116): il file `.env` di questo progetto punta a un database MongoDB di **produzione**, non a un'istanza locale/di test — girare questa rotta contro dati reali per collaudarla avrebbe modificato articoli e `DuplicateGroup` veri. Verificato solo per lettura attenta rispetto al codice gemello già collaudato (`check_article_version`, `enrich_all_articles`). Da verificare dal vivo quando sarà disponibile un ambiente non di produzione, o con un test mockato — nessuna rotta di `ricerche.py` ne ha oggi (richiederebbero una connessione Mongo reale nel lifespan di `main.py`, stesso gap già annotato al punto 18).

**Collegamento al frontend.** `checkAllArticlesVersion` in `api/ricerche.js`; voce "Aggiorna tutti" nel menu "Manutenzione" di `OverviewPage.jsx` (vedi punto 118 per il redesign completo di questa pagina, successivo a questa voce). A differenza di `handleEnrichAll`, qui un esito possibile (`new_sources`) tocca anche i `DuplicateGroup`: se la risposta ne contiene almeno uno, la sidebar "Deduplicazione" viene ricaricata, altrimenti resterebbe con un conteggio stantio dopo l'azione.

**Stato.** Implementato (rotta + collegamento frontend), non verificato dal vivo (vedi nota sopra sul database di produzione).

---

## 118. Redesign completo del frontend secondo il sistema di design del canvas (2026-11-07)

**Contesto.** L'intero sistema di design costruito in sessione in un canvas di design Claude.ai (~20 board: palette scura `#030407`/`#2B7CFF`/`#D4FF24`, logo ottagonale, font Baloo 2, pattern card+ribbon+sigillo, lista-semplice-no-card, la "ruota" rotante per le collezioni di articoli, menu "Manutenzione" chiuso di default + toast) è stato portato nel codice reale su richiesta esplicita dell'utente ("implementa tutto"), sostituendo l'esecuzione attuale (Tailwind a palette violetta di default, font "Luckiest Guy" via Google Fonts, supporto chiaro/scuro).

**Decisione — l'app diventa sempre scura.** Confermato con l'utente: nessun mockup del canvas ha mai previsto una variante chiara, quindi il toggle chiaro/scuro di Tailwind viene rimosso del tutto invece di progettare una variante chiara mai discussa. `index.css`: `color-scheme: dark` fisso (non più `light dark`), `body` in `--color-bg`/`--color-ink-1`.

**Decisione — CSS proprio invece di tradurre tutto in utility Tailwind.** I mockup del canvas sono CSS scritto a mano (classi come `.card`, `.ribbon-flat`, `.pill-btn`, `.ball-oct`, il meccanismo della ruota), non utility Tailwind — tradurre ogni clip-path/animazione/posizionamento assoluto nel vocabolario di Tailwind avrebbe rischiato di reintrodurre bug già risolti dal vivo nel canvas (saldatura del clip-path dell'ottagono, box-shadow tagliato dal clip-path, cascata CSS sul sigillo, sincronia della rotazione della ruota). Nuovo `frontend/src/styles/brand.css` (importato da `index.css`), con le classi del canvas pressoché verbatim, parametrizzate con le CSS var di palette definite nel blocco `@theme` di `index.css`. Il JSX continua a usare le utility Tailwind per il layout (flex/grid/spaziature) esattamente come già faceva, con le classi di `brand.css` per tutto ciò che è visivamente distintivo — stesso stile misto che il codice aveva già adottato per il wordmark (Tailwind + `style={}` inline).

**Nuovi componenti condivisi.**
- `components/Logo.jsx` — il sigillo ottagonale come componente reale (`size` prop) più `Wordmark` (il testo "PapérDex" in Baloo 2), sostituendo lo stile Luckiest-Guy ripetuto identico in 7 file diversi. Verificato nel canvas che sovrapporre le due cose in un solo marchio fuso peggiora la leggibilità alla scala piccola — restano due elementi modulari.
- `components/ArticleDial.jsx` — la ruota rotante + scroll nativo sincronizzato, estratta dallo script del mockup `OverviewFull.dc.html` e generalizzata (`items`/`renderItem`/`selectedId`/`onSelect` invece dell'array demo statico). Riusata da `OverviewPage` (articoli salvati); vedi sotto per il perché *non* è riusata da `SearchResults`.

**Deviazione dal mockup — `SearchResults` non usa la ruota.** Il board Y del canvas applicava la ruota anche ai risultati di ricerca, ma lì solo su dati statici di esempio. Il componente reale (`SearchResults.jsx`) ha una complessità che il mockup non copriva: gruppi di duplicati con una propria azione "aggiungi tutto il gruppo", stati per-articolo (idle/adding/added/error), abstract espandibile — non riconducibile allo stesso modello "una riga, una selezione" della ruota senza un adattamento mai progettato e quindi mai verificato visivamente. Scelta: tenere `SearchResults` come lista restilizzata (stessi colori/pillole/card) ma senza la ruota, riservata esclusivamente a `OverviewPage` dov'è stata validata a fondo con l'utente — coerente con la regola stabilita a metà sessione ("solo vere collezioni di articoli, mai come vezzo ripetuto ovunque").

**Deviazione dal mockup — pagine reali non coperte dal canvas.** `ResearchLayout` (titolo della Ricerca + "+ Inizia una nuova sessione"/BackLink, condiviso da tutte le sotto-pagine) e `ProfileMenu` (tendina account con Profilo/API keys/Inviti/Esci) non erano mai stati disegnati nel canvas (i mockup avevano un header semplificato solo "Ricerche"/"Profilo"). Restilizzati nello stesso sistema mantenendo la funzionalità reale intatta, invece di ridurli all'header semplificato del mockup. La card "Articoli salvati" di `OverviewPage` non ripete più il nome della Ricerca (lo mostra già `ResearchLayout` sopra), a differenza del mockup standalone che non aveva quella barra condivisa sopra di sé.

**Bug reale corretto durante il port — selezione del logo delle fonti.** `SourceIcon.jsx` scelta tra l'asset `light`/`dark` di ogni fonte (`sourceLogos.js`) tramite le classi `dark:hidden`/`hidden dark:block` di Tailwind, che seguono `prefers-color-scheme` del sistema operativo — indipendente dal nostro `color-scheme` forzato. Con l'app sempre scura, un utente con l'OS in tema chiaro avrebbe continuato a vedere la variante `light` di OpenAlex/Semantic Scholar. Corretto scegliendo `logo.dark ?? logo.light` direttamente in JS, senza alternanza CSS. Rimosso anche il chip scuro che incorniciava il logo arXiv (serviva solo a restare leggibile quando l'app poteva essere in tema chiaro, ora ridondante).

**Segnalazione, non corretta.** Il wordmark DBLP (testo grigio chiaro fisso, nessuna variante scura) era già noto poco leggibile in tema scuro — l'utente lo aveva accettato esplicitamente quando era un'alternativa dietro un toggle (punto 20). Ora che il tema scuro è l'unico possibile, quella scarsa leggibilità è permanente, non più un caso tra due. Lasciato com'è per non prendere una decisione di branding (sostituire l'asset) non richiesta, ma da rivedere.

**Non verificato dal vivo.** Nessun accesso a un browser in questa sessione: verificati solo `npm run build` e `npm run lint` (entrambi puliti) dopo ogni fase. La matematica della ruota (angolo di rotazione, sincronia con lo scroll nativo) era stata tarata nel canvas guardando il rendering reale — il port qui non ha avuto lo stesso riscontro visivo e merita un collaudo in un browser vero prima di considerarlo definitivo.

**Stato.** Implementato (build + lint puliti). Da verificare dal vivo (vedi nota sopra) e da valutare se riportare la variante restilizzata di `SearchResults` sulla ruota in un secondo momento, con un adattamento progettato apposta per i gruppi di duplicati.

---

## 119. Logo da `<div>` con clip-path a SVG (2026-11-07)

**Contesto.** Collaudando dal vivo il redesign (punto 118), l'utente ha segnalato piccole lineette verdoline visibili al centro della ruota (`ArticleDial`) durante la rotazione. Causa: il logo era costruito da più `<div>` sovrapposti, ciascuno con un proprio `clip-path` a ottagono (il contorno, le due metà blu/scura, l'anello, il pallino) dentro un unico contenitore ruotato via `transform:rotate()`. Ogni `clip-path` viene rasterizzato per conto proprio dal browser prima che la rotazione del genitore venga applicata: a angoli non multipli di 45° questo lascia visibili sottili artefatti di anti-aliasing ai bordi tra i livelli sovrapposti — lo stesso genere di problema (seam tra livelli clippati separatamente) già incontrato più volte nel canvas con questa tecnica, ma mai verificato dal vivo per il caso "ruotato in continuo" (il canvas verificava solo stati fermi).

**Decisione.** Suggerito all'utente (che ha confermato: "è la scelta corretta") di ricostruire il logo come un singolo SVG — `components/Logo.jsx` ora esporta un `<svg>` con le stesse forme (ottagono esterno, ottagono interno con margine per il contorno lime, anello, pallino) come `<polygon>` nello stesso albero vettoriale, invece di `<div>` indipendenti. Un SVG compone le forme in un'unica rasterizzazione; la rotazione della ruota (`rotate` prop, nuovo) ruota un `<g>` *interno* all'SVG attorno al proprio centro, non il contenitore DOM — niente più livelli clippati separatamente da ruotare insieme.

Risolto anche un difetto di manutenibilità collaterale: il markup del logo era duplicato (una copia in `Logo.jsx`, una incollata a mano dentro `ArticleDial.jsx`, altre due nei sigilli di `OverviewPage`/`ProfilePage`) invece di essere un solo componente riusato ovunque — ora tutti i punti d'uso passano per `<Logo/>` (con `size` numerico per le dimensioni fisse, o `size="100%"` per riempire il contenitore nella ruota, dove la dimensione segue i breakpoint CSS di `.dial`).

Rimosse da `brand.css` le classi `.ball-oct`/`.logo-outline`/`.logo`/`.logo .top/.bot/.ring/.dot`, ora morte. Tolto anche l'`!important` su `.card-seal` (serviva a vincere un conflitto di cascata con `.logo-outline` sullo stesso elemento, che non esiste più).

**Non verificato dal vivo** il risultato di questa correzione specifica (nessun accesso a un browser in questa sessione) — da confermare che le lineette siano davvero sparite.

**Stato.** Implementato (build + lint puliti). Da confermare dal vivo.

## 120. Card espandibili per gli articoli (Overview e risultati di ricerca) (2026-11-08)

**Contesto.** L'utente ha chiesto card "espandibili" sul modello del componente Expandable Card di Aceternity UI: l'anteprima di un articolo mostra poche informazioni, e un click la apre in una card più grande al centro dello schermo con il dettaglio (in primis l'abstract). Serve anche come base per il restyling della pagina della query.

**Decisione.** Un componente unico, `components/ExpandedArticleCard.jsx` (titolo, fonte, autori/venue/anno, abstract completo, DOI, più uno slot `children` per le azioni del contesto), usato in due punti:
- **Overview**: il click su una riga della ruota (`ArticleDial`) apre la card espansa, che sostituisce la vecchia striscia di dettaglio sotto la ruota (rimosse da `brand.css` `.detail-strip`/`.detail-title`); Arricchisci / Controlla versione / Rimuovi e il loro messaggio d'esito si sono spostati nella card.
- **Risultati di ricerca** (`SearchResults`): l'anteprima non mostra più abstract, "Mostra tutto" e DOI; il click sull'anteprima (o sul titolo da tastiera) apre la card espansa. "Aggiungi alla ricerca" resta sia nell'anteprima, per un salvataggio veloce, sia nella card.

Il componente di Aceternity si appoggia alla libreria `motion` (layout animation con `layoutId`). Qui l'effetto è ottenuto **senza nuove dipendenze**: un `<dialog>` modale nativo (focus, Esc, blocco dello scroll gestiti dal browser) e le **View Transitions** native (`document.startViewTransition`), con l'hook `components/useArticleMorph.js` che assegna un `view-transition-name` condiviso all'elemento cliccato e alla card espansa, così il browser anima l'una nell'altra in apertura e in chiusura. Nei browser senza View Transitions, o con `prefers-reduced-motion`, la card si apre/chiude uguale ma senza animazione.

**Non verificato dal vivo** (nessun login nel browser in questa sessione): da collaudare l'animazione in entrambe le pagine.

**Stato.** Implementato (build + lint puliti). Da confermare dal vivo.

## 121. Selezione degli articoli in Overview e manutenzione solo sui selezionati (2026-11-08)

**Contesto.** Nella ruota dell'Overview il click su una riga apriva la card espansa (voce 120) e il pallino era solo decorativo (sempre pieno). L'utente ha chiesto di separare le due cose: il pallino diventa una checkbox, e le azioni del menu Manutenzione devono agire solo sugli articoli spuntati invece che sull'intera Ricerca.

**Decisione.**
- `ArticleDial`: il pallino è un `<button role="checkbox">` (`onToggle(id)`); il resto della riga, dal numero in poi, apre la card espansa. Riga spuntata: pallino pieno e sfondo lime tenue; non spuntata: pallino vuoto e sfondo blu tenue (stessa trasparenza).
- La selezione è solo stato locale dell'Overview (`checkedIds`), vuota all'apertura della pagina e non persistita.
- "Arricchisci tutti" / "Aggiorna tutti" diventano "Arricchisci selezionati (N)" / "Aggiorna selezionati (N)", disabilitati con 0 spuntati.
- Backend: `enrich-all` e `check-version-all` accettano un body opzionale `{ "article_ids": [...] }` (`ArticleSelectionIn` + `only_selected` in `routes/ricerche.py`) che restringe gli articoli della Ricerca a quelli indicati. Body assente o `article_ids: null` = comportamento di prima (tutta la Ricerca), quindi nessuna rottura per altri chiamanti. Scelto questo invece di un ciclo lato frontend sugli endpoint per articolo singolo per tenere una sola richiesta e la stessa forma di risposta: il toast e le pagine "Vedi dettagli" restano invariati.

Test: `backend/tests/suites/routes/ricerche_selection_test.py` (filtro, assenza di selezione, lista vuota).

**Stato.** Implementato (test, build e lint puliti). Non verificato dal vivo.

**Aggiornamento (2026-11-08) — "Seleziona tutti".** Aggiunto un controllo "Seleziona tutti / Deseleziona tutti" (con stato parziale e conteggio) nella fascia "Articoli salvati", accanto al titolo. Provato prima sopra la ruota, allineato ai pallini delle righe: scartato, all'utente non piaceva la posizione. Nemmeno la fascia convince del tutto l'utente, ma per ora resta lì.

**Idea aperta, da rivalutare dopo qualche giorno d'uso:** una *barra contestuale* (stile Gmail/Google Foto) che compare sopra la ruota appena si spunta il primo articolo — `N selezionati · Seleziona tutti · Arricchisci · Aggiorna · ✕` — così selezione e azioni stanno nello stesso punto e "Arricchisci/Aggiorna selezionati" potrebbero uscire dal menu Manutenzione. Motivo: oggi la selezione serve solo a quelle due azioni, che però vivono lontano (menu in alto a destra), ed è probabilmente questo il disagio percepito, più della posizione del controllo in sé.

## 122. Risultati di ricerca sulla ruota (ArticleDial) (2026-11-08)

**Contesto.** Con la card espansa (voce 120) l'anteprima di un risultato non deve più portare abstract e dettagli: l'utente ha chiesto di riusare nella pagina di ricerca il layout a ruota dell'Overview.

**Decisione.** `SearchResults` ora mostra i risultati in `ArticleDial` (righe: numero, titolo, autori • anno, fonte) invece della lista di card. Scelte dell'utente, tra le opzioni proposte:
- **Pallino = "Aggiungi alla ricerca"**: vuoto/sfondo blu tenue = non salvato; click = aggiunta, il pallino diventa pieno/lime. Fuori da una Ricerca (ricerca rapida/pubblica) il pallino è solo un indicatore non cliccabile (`ArticleDial` senza `onToggle`). Errore di aggiunta mostrato nella riga, al posto degli autori, con invito a riprovare.
- **Una riga per gruppo di duplicati**: riga con l'articolo preferito e badge `×N fonti`; il pallino aggiunge l'intero gruppo (come il vecchio "Aggiungi tutto il gruppo"); la card espansa elenca sotto l'abstract le versioni (fonte, venue/anno, DOI, quale è la preferita), tramite la nuova prop `extra` di `ExpandedArticleCard`.

Persa rispetto a prima: l'aggiunta di una *singola* versione di un gruppo. Si aggiunge il gruppo intero e la scelta della versione avviene in Deduplicazione. Aggiunta anche una correzione minore: un risultato senza `group_key` fa gruppo a sé, invece di finire raggruppato con tutti gli altri senza chiave sotto `undefined`.

**Verificato dal vivo** (Playwright, ricerca pubblica "cable management", 96 risultati): ruota, badge dei gruppi, card espansa centrata, elenco versioni. **Non verificato** il pallino che aggiunge davvero alla Ricerca (serve il login).

**Stato.** Implementato (build + lint puliti).

## 123. Semantic Scholar limitato all'informatica + fine risultati con HTTP 400 (2026-11-08)

**Contesto.** Tre test dal vivo di Semantic Scholar fallivano in modo stabile. Indagato contro l'API reale (senza cache né filtro interno):
- "Accelerating A/B-Tests with Counterfactual Estimation…" e "Cellular Plasticity Model for Bottom-Up Robotic Design" esistono ancora su S2 (`/paper/search/match` li trova), ma con le query minime dei test ("Counterfactual Estimation", "Cellular Plasticity") non comparivano nei primi 200 risultati: con ~2,2 milioni di risultati per keyword generiche, la rilevanza di S2 li schiaccia sotto paper di altri campi (es. biologia oncologica), oltre le pagine che la paginazione legge.
- "Chess_db…" arriva primo, ma lo scarta il filtro venue: S2 ora restituisce la venue per esteso ("Electronic Proceedings in Theoretical Computer Science") e il test filtra per la sigla "EPTCS". Problema separato, non affrontato qui.

**Decisione 1 — scope.** Aggiunto `fieldsOfStudy=Computer Science` alle query di `/paper/search`, lo stesso scope già usato per OpenAlex (`topics.field.id:17`). Verificato dal vivo: i due target passano a posizione 33 e 2 (risultati totali da ~2,2 milioni a 822 mila e 203 mila); tutti e 7 i target dei test S2 risultano classificati "Computer Science". Costo misurato: su tre query di informatica, l'1–8% dei primi 100 risultati non ha alcun campo assegnato (spesso paper recenti o con metadati poveri) e viene ora escluso — stesso limite noto del filtro di OpenAlex (vedi la nota sui target sostituiti nei test OpenAlex).

**Decisione 2 — fine dei risultati.** Con lo scope ridotto i totali diventano piccoli, ed è emerso un bug latente: con `offset >= total` S2 risponde **HTTP 400** ("Requested data for this limit and/or offset is not available") invece di una pagina vuota — verificato dal vivo (total=250: offset 240 ok, offset 250 → 400). `paginated_fetch` smette di paginare solo dopo una pagina incompleta, quindi quando il totale è multiplo esatto della pagina chiedeva una pagina in più, riceveva il 400 e la sorgente risultava fallita (`PartialResultsError`). Ora un 400 con `offset > 0` è trattato come fine dei risultati (`[]`), come già il tetto dei 1000; a `offset 0` resta un errore vero. Test: `source_errors_test.py` (400 oltre la fine → `[]`; 400 alla prima pagina → errore).

**Stato.** Implementato. Test S2 dal vivo: 6 su 7 (resta "Chess_db", problema della venue).

## 124. Filtro venue: sigle ↔ nomi estesi (2026-11-08)

**Contesto.** Il test "Chess_db" (filtro journal "EPTCS") falliva perché Semantic Scholar restituisce la venue per esteso, "Electronic Proceedings in Theoretical Computer Science", e il filtro cercava la sigla come sottostringa. Verificato dal vivo su 20 paper noti: S2 usa sempre il nome esteso nel campo `venue` (es. "Neural Information Processing Systems", "Annual Meeting of the Association for Computational Linguistics"), mentre DBLP usa di solito la sigla. Chi filtra per sigla perdeva quindi i risultati S2 (e, per lo più, OpenAlex/Crossref), e chi filtra per nome esteso quelli DBLP.

**Decisione.** Scelta dell'utente tra le opzioni proposte: un elenco statico di sigle → nomi estesi delle venue più note dell'informatica (`services/utils/venue_aliases.py`, ~65 venue tra AI/ML, visione, NLP, dati/IR, ingegneria del software, sistemi, sicurezza, teoria, HCI e collane come EPTCS/LIPIcs/LNCS). Stesso approccio e stessi limiti del dizionario statico delle keyword (voce sull'espansione delle keyword): copertura volutamente limitata, da estendere a mano.

`_matches_journal` prova prima il testo cercato così com'è (sottostringa, comportamento invariato) e poi, se il testo è una sigla o un nome esteso dell'elenco (uguaglianza esatta, senza maiuscole), le altre forme della stessa venue. Le forme alternative si cercano come parole intere e non seguite da "and"/"&", per evitare falsi positivi verificati sui nomi reali: "ACL" non trova "NAACL", "International Conference on Machine Learning" non trova "... Machine Learning and Applications" (ICMLA). Limite noto lasciato con un commento `shortcut:`: il nome esteso di KDD è contenuto in quello di PAKDD.

Scartata per ora l'alternativa di usare gli `alternate_names` che S2 espone per ogni venue (`publicationVenue`): darebbe una copertura vera, ma solo per i risultati S2 e con un campo in più da richiedere e salvare per ogni articolo.

Test: `filtering_test.py` (sigla → nome esteso, nome esteso → sigla, variante NIPS/NeurIPS, niente falsi positivi NAACL/ICMLA, venue sconosciuta invariata). "Chess_db" torna a passare: test S2 dal vivo 7 su 7.

**Stato.** Implementato.

**Aggiornamento (2026-11-08) — rimosso `arxiv_dblp_coverage_test.py`.** Su decisione dell'utente. Il test non verificava nulla: passava a `normalize_title` una stringa invece di un `Article` e falliva con `TypeError` prima di confrontare i titoli; anche corretto, chiedeva un indice di Jaccard > 0.75 tra arXiv e DBLP dal vivo, una soglia esplorativa (vedi la "Categoria 2" della voce sui test falliti) più che una verifica di correttezza. La misura della sovrapposizione tra fonti resta compito degli script di valutazione in `backend/app/statistics/`.
