from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.routes.utenti import get_current_user
from backend.app.schemas.models import User
from backend.app.services.llm import LLM_PROVIDERS
from backend.app.services.llm.base import LLMProviderError
from backend.app.services.utils.keyword_dictionary import expand_via_dictionary

router = APIRouter()


class ExpandIn(BaseModel):
    terms: List[str]


@router.post("/keywords/expand")
async def expand_keywords(payload: ExpandIn, current_user: User = Depends(get_current_user)):
    terms = [t.strip() for t in payload.terms if t.strip()]
    if not terms:
        raise HTTPException(status_code=400, detail="Nessun termine da espandere")

    # Con un provider LLM personale configurato, si usa quello: una chiave
    # rotta deve dare un errore visibile, non ripiegare in silenzio sul
    # dizionario (altrimenti l'utente non si accorgerebbe che la chiave non
    # funziona più). Senza alcun provider configurato, si usa il dizionario.
    if current_user.llm_provider and current_user.llm_api_key:
        provider_cls = LLM_PROVIDERS.get(current_user.llm_provider)
        if provider_cls is None:
            raise HTTPException(status_code=400, detail="Provider LLM non riconosciuto")
        try:
            suggestions = await provider_cls().expand(terms, current_user.llm_api_key)
        except LLMProviderError as e:
            raise HTTPException(status_code=502, detail=str(e))
        return {"suggestions": suggestions, "source": "llm"}

    return {"suggestions": expand_via_dictionary(terms), "source": "dictionary"}
