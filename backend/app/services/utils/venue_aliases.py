import re
from typing import List, Optional

# Sigla → nomi estesi delle venue più note dell'informatica, per il filtro
# "journal/venue": le fonti non scrivono la stessa venue allo stesso modo
# (verificato dal vivo: Semantic Scholar usa il nome esteso, es. "Electronic
# Proceedings in Theoretical Computer Science", DBLP di solito la sigla,
# "EPTCS"), quindi chi filtra per sigla perdeva i risultati col nome esteso e
# viceversa. Nomi estesi presi da Semantic Scholar (campo `venue`), scelti in
# modo da essere contenuti anche nelle varianti delle altre fonti (es.
# "Advances in Neural Information Processing Systems" contiene il nome di
# NeurIPS). Copertura volutamente limitata, come keyword_dictionary.py:
# shortcut: elenco statico e incompleto, da estendere a mano quando una venue
# manca (o da sostituire con gli alternate_names di Semantic Scholar se servisse
# una copertura vera).
VENUE_ALIASES: dict[str, list[str]] = {
    # AI / Machine Learning
    "NeurIPS": ["NIPS", "Neural Information Processing Systems"],
    "ICML": ["International Conference on Machine Learning"],
    "ICLR": ["International Conference on Learning Representations"],
    "AAAI": ["AAAI Conference on Artificial Intelligence"],
    "IJCAI": ["International Joint Conference on Artificial Intelligence"],
    "ECAI": ["European Conference on Artificial Intelligence"],
    "AAMAS": ["Autonomous Agents and Multiagent Systems", "Autonomous Agents and Multi-Agent Systems"],
    "UAI": ["Uncertainty in Artificial Intelligence"],
    "AISTATS": ["Artificial Intelligence and Statistics"],
    "COLT": ["Conference on Learning Theory", "Computational Learning Theory"],
    "JMLR": ["Journal of Machine Learning Research"],
    "TPAMI": ["Transactions on Pattern Analysis and Machine Intelligence"],
    # Computer vision / robotica
    "CVPR": ["Computer Vision and Pattern Recognition"],
    "ICCV": ["International Conference on Computer Vision"],
    "ECCV": ["European Conference on Computer Vision"],
    "ICRA": ["International Conference on Robotics and Automation"],
    "IROS": ["Intelligent Robots and Systems"],
    # NLP
    "ACL": ["Meeting of the Association for Computational Linguistics"],
    "EMNLP": ["Empirical Methods in Natural Language Processing"],
    "NAACL": ["North American Chapter of the Association for Computational Linguistics"],
    "EACL": ["European Chapter of the Association for Computational Linguistics"],
    "COLING": ["International Conference on Computational Linguistics"],
    "TACL": ["Transactions of the Association for Computational Linguistics"],
    # Dati, web, information retrieval
    # shortcut: il nome esteso di KDD è contenuto anche in quello di PAKDD (Pacific-Asia ...).
    "KDD": ["SIGKDD", "Knowledge Discovery and Data Mining"],
    "SIGIR": ["Research and Development in Information Retrieval"],
    "WWW": ["The Web Conference", "World Wide Web Conference"],
    "WSDM": ["Web Search and Data Mining"],
    "CIKM": ["Conference on Information and Knowledge Management"],
    "RecSys": ["Conference on Recommender Systems"],
    "SIGMOD": ["International Conference on Management of Data"],
    "VLDB": ["Very Large Data Bases", "VLDB Endowment"],
    "ICDE": ["International Conference on Data Engineering"],
    "EDBT": ["Extending Database Technology"],
    # Ingegneria del software, linguaggi
    "ICSE": ["International Conference on Software Engineering"],
    "FSE": ["Foundations of Software Engineering"],
    "ASE": ["Automated Software Engineering"],
    "ISSTA": ["International Symposium on Software Testing and Analysis"],
    "TSE": ["IEEE Transactions on Software Engineering"],
    "PLDI": ["Programming Language Design and Implementation"],
    "POPL": ["Principles of Programming Languages"],
    "OOPSLA": ["Object-Oriented Programming, Systems, Languages, and Applications"],
    # Sistemi, reti, sicurezza
    "OSDI": ["Operating Systems Design and Implementation"],
    "SOSP": ["Symposium on Operating Systems Principles"],
    "NSDI": ["Networked Systems Design and Implementation"],
    "CCS": ["Conference on Computer and Communications Security"],
    "NDSS": ["Network and Distributed System Security"],
    # Teoria, logica, verifica
    "STOC": ["Symposium on the Theory of Computing"],
    "FOCS": ["Foundations of Computer Science"],
    "SODA": ["Symposium on Discrete Algorithms"],
    "ICALP": ["International Colloquium on Automata, Languages and Programming"],
    "LICS": ["Logic in Computer Science"],
    "CAV": ["Computer Aided Verification"],
    "TACAS": ["Tools and Algorithms for the Construction and Analysis of Systems"],
    # Interazione uomo-macchina
    "CHI": ["Human Factors in Computing Systems"],
    "UIST": ["User Interface Software and Technology"],
    # Collane e riviste generaliste
    "EPTCS": ["Electronic Proceedings in Theoretical Computer Science"],
    "LIPIcs": ["Leibniz International Proceedings in Informatics"],
    "LNCS": ["Lecture Notes in Computer Science"],
    "CEUR": ["CEUR Workshop Proceedings"],
    "CACM": ["Communications of the ACM"],
}

# Ogni gruppo = sigla + nomi estesi, tutti intercambiabili tra loro.
_GROUPS: List[List[str]] = [[acronym, *names] for acronym, names in VENUE_ALIASES.items()]


def venue_alternatives(term: str) -> List[str]:
    """Le altre forme della venue cercata, se `term` è una sigla o un nome
    esteso dell'elenco (uguaglianza esatta, senza distinzione di maiuscole)."""
    key = term.strip().lower()
    for group in _GROUPS:
        if any(form.lower() == key for form in group):
            return [form for form in group if form.lower() != key]
    return []


def venue_mentions(venue: Optional[str], form: str) -> bool:
    """`form` compare in `venue` come parole intere, e non come inizio di un
    nome più lungo con "and"/"&": così "ACL" non trova "NAACL", e "International
    Conference on Machine Learning" non trova "... Machine Learning and
    Applications" (ICMLA)."""
    if not venue:
        return False
    pattern = r"(?<!\w)" + re.escape(form) + r"(?!\w)(?!\s*(?:and|&)\b)"
    return re.search(pattern, venue, flags=re.IGNORECASE) is not None
