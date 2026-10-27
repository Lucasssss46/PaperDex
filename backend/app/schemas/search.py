from dataclasses import dataclass
from typing import Optional

# Livello di profondità di ricerca -> (target risultati filtrati, pagine
# aggiuntive massime per sorgente). Valori di partenza, vedi docs/decisioni-implementative.md.
SEARCH_DEPTH_LEVELS: dict[str, tuple[int, int]] = {
    "bassa": (15, 2),
    "media": (50, 5),
    "alta": (150, 10),
}

@dataclass
class SearchRequest:
    keyword_include: Optional[list[list[str]]] = None
    keyword_exclude: Optional[list[str]] = None
    author: Optional[list[str]] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    journal: Optional[list[str]] = None
    limit: int = 50
    depth: str = "media"

    def __post_init__(self):
        if not self.keyword_include and not self.author and not self.journal:
            raise ValueError("La ricerca richiede almeno una keyword, un autore o una venue.")
        if self.depth not in SEARCH_DEPTH_LEVELS:
            raise ValueError(f"depth deve essere una tra {list(SEARCH_DEPTH_LEVELS)}, ricevuto {self.depth!r}.")

    def query_terms(self) -> list[str]:
        """Termini grezzi da mandare alle sorgenti: solo il primo gruppo di
        keyword_include (query mantenuta semplice), o gli autori come fallback
        se non ci sono keyword. Gli altri gruppi, autore, journal, anno ed
        exclude vengono comunque applicati internamente sui risultati normalizzati."""
        if self.keyword_include:
            return list(dict.fromkeys(self.keyword_include[0]))
        if self.author:
            return list(dict.fromkeys(self.author))
        return []

    def depth_targets(self) -> tuple[int, int]:
        """(target risultati filtrati, pagine aggiuntive massime per sorgente)."""
        return SEARCH_DEPTH_LEVELS[self.depth]