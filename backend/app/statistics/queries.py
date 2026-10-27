from backend.app.schemas.search import SearchRequest

# Query di valutazione condivise da arxiv_openalex.py, arxiv_dblp.py,
# openalex_dblp.py e crossref_dblp.py: le stesse per tutte le coppie di
# sorgenti, così i risultati si confrontano anche tra coppie. Solo keyword
# oppure solo autore, mai le due insieme: l'autore accanto alle keyword non
# arriva alla sorgente e viene filtrato dopo, su una sola pagina, e le query
# così davano 0 risultati su entrambe le sorgenti (report del 24 ottobre
# 2026). Niente gruppi OR né filtri sull'anno, per lo stesso motivo: alla
# sorgente arriva solo il primo gruppo di keyword.
# Stesso limit per tutte, perché Jaccard e copertura dipendono da quanti
# risultati si confrontano.
EVALUATION_LIMIT = 50

EVALUATION_QUERIES = [
    # Solo keyword, da un tema molto ampio a uno di nicchia. "causal
    # inference" c'era già nei report precedenti e permette un confronto.
    SearchRequest(keyword_include=[["large language models"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["federated learning"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["causal inference"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["systematic literature review"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["argument mining"]], limit=EVALUATION_LIMIT),
    # Altre 10 query solo keyword (voce 112), per riportare mediana e
    # intervallo invece di cinque valori singoli. Aree diverse
    # dell'informatica (apprendimento automatico, linguaggio naturale, dati,
    # ingegneria del software); "reinforcement learning", "sentiment
    # analysis" e "blockchain" sono temi condivisi con altre discipline, come
    # "causal inference".
    SearchRequest(keyword_include=[["graph neural networks"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["reinforcement learning"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["differential privacy"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["knowledge graphs"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["recommender systems"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["sentiment analysis"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["named entity recognition"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["topic modeling"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["software testing"]], limit=EVALUATION_LIMIT),
    SearchRequest(keyword_include=[["blockchain"]], limit=EVALUATION_LIMIT),
    # Solo autore: qui il nome arriva alla sorgente (au: su arXiv,
    # raw_author_name.search su OpenAlex, testo libero su DBLP,
    # query.author su Crossref).
    SearchRequest(author=["Alfio Ferrara"], limit=EVALUATION_LIMIT),
    SearchRequest(author=["Elisabetta Rocchetti"], limit=EVALUATION_LIMIT),
    SearchRequest(author=["Martin Ruskov"], limit=EVALUATION_LIMIT),
]
