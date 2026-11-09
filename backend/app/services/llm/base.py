import re
from abc import ABC, abstractmethod
from typing import List


class LLMProviderError(Exception):
    """Sollevata quando il provider LLM risponde con un errore (chiave non
    valida, rate limit, timeout, ecc.): propagata come 502 dalla rotta,
    invece di ripiegare in silenzio sul dizionario statico — una chiave
    configurata ma rotta deve essere visibile all'utente, non nascosta."""


class BaseLLMProvider(ABC):
    #: Nome mostrato nel menu a tendina del provider (ApiKeysPage) e derivato
    #: in LLM_PROVIDER_NAMES (routes/utenti.py): unica fonte di verità, come
    #: già fatto per API_KEY_SOURCES/ADAPTER_REGISTRY.
    DISPLAY_NAME: str = ""

    @abstractmethod
    async def expand(self, terms: List[str], api_key: str) -> List[str]:
        """Restituisce fino a qualche variante/sinonimo/forma estesa (se
        acronimi) per i termini dati, usando l'API del provider con la
        chiave personale dell'utente."""


def build_prompt(terms: List[str]) -> str:
    joined = ", ".join(terms)
    return (
        "Sei un assistente per la ricerca bibliografica scientifica. Dati i "
        f'seguenti termini di ricerca: "{joined}". Suggerisci fino a 4 varianti '
        "utili per aumentare la recall di una ricerca bibliografica: sinonimi, "
        "forma estesa se sono acronimi, o termini strettamente correlati "
        "comunemente usati in letteratura scientifica. Rispondi SOLO con un "
        "elenco separato da virgole, senza numerazione, spiegazioni o altro testo."
    )


def parse_suggestions(text: str, exclude: List[str], limit: int = 4) -> List[str]:
    exclude_lower = {t.strip().lower() for t in exclude}
    seen = set()
    suggestions = []
    for item in re.split(r"[,\n]", text):
        cleaned = item.strip().strip(".-•* ").strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in exclude_lower or key in seen:
            continue
        seen.add(key)
        suggestions.append(cleaned)
        if len(suggestions) >= limit:
            break
    return suggestions
