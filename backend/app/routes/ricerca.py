from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.app.routes.utenti import get_optional_user
from backend.app.schemas.models import Project, Research, User
from backend.app.schemas.search import SearchRequest
from backend.app.services.utils.dedup import annotate_with_group_key
from backend.app.services.utils.orchestrator import ADAPTER_REGISTRY, search_all_sources

router = APIRouter()


class SearchRequestIn(BaseModel):
    keyword_include: Optional[List[List[str]]] = None
    keyword_exclude: Optional[List[str]] = None
    author: Optional[List[str]] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    journal: Optional[List[str]] = None
    depth: str = "media"
    # Nomi sorgente tra quelli in orchestrator.ADAPTER_REGISTRY; None = tutte.
    sources: Optional[List[str]] = None
    # Presente solo per una ricerca fatta da dentro una Ricerca specifica (non
    # per la ricerca rapida, pubblica o autenticata): usato solo per risolvere
    # le chiavi API condivise dagli altri membri del team, vedi resolve_api_keys.
    ricerca_id: Optional[str] = None


async def resolve_api_keys(current_user: Optional[User], ricerca_id: Optional[str]) -> dict:
    """La chiave personale di chi cerca ha sempre priorità. Per le sorgenti in
    cui non ne ha una propria, si ripiega sulla chiave di un altro membro
    della stessa Ricerca che l'abbia condivisa esplicitamente per questo
    progetto (impostazione per-Ricerca, disattivata di default — vedi
    ApiKeysPage/set_api_key_sharing). Un ricerca_id mancante, inesistente o a
    cui l'utente non ha accesso non è un errore: si prosegue con le sole
    chiavi personali (la condivisione è un bonus, non un requisito)."""
    resolved = dict(current_user.api_keys) if current_user else {}
    if not ricerca_id or current_user is None:
        return resolved

    project = await Project.get(ricerca_id)
    if project is None:
        return resolved

    my_id = str(current_user.id)
    teammate_ids = {str(project.owner.ref.id)}
    all_researches = await Research.find_all().to_list()
    for r in all_researches:
        if str(r.project.ref.id) == str(project.id):
            teammate_ids.add(str(r.user.ref.id))

    if my_id not in teammate_ids:
        return resolved

    for teammate_id in teammate_ids - {my_id}:
        teammate = await User.get(teammate_id)
        if teammate is None:
            continue
        for source_id, key in teammate.api_keys.items():
            if source_id in resolved:
                continue
            if str(project.id) in teammate.api_key_shared_with.get(source_id, []):
                resolved[source_id] = key

    return resolved


@router.get("/search/key-status")
async def key_status(ricerca_id: Optional[str] = None, current_user: Optional[User] = Depends(get_optional_user)):
    """Sorgenti che richiedono una chiave API (REQUIRES_API_KEY) per cui chi
    cerca non ne ha una, né propria né condivisa dal team di `ricerca_id`:
    serve al form per avvisare prima di lanciare la ricerca. Non restituisce
    mai le chiavi, solo i nomi delle sorgenti."""
    keys = await resolve_api_keys(current_user, ricerca_id)
    return {
        "logged_in": current_user is not None,
        "missing_keys": [
            name
            for name, adapter_cls in ADAPTER_REGISTRY.items()
            if adapter_cls.REQUIRES_API_KEY and adapter_cls.API_KEY_SOURCE_ID not in keys
        ],
    }


@router.post("/search")
async def search(payload: SearchRequestIn, current_user: Optional[User] = Depends(get_optional_user)):
    # Accessibile anche da anonimi (ricerca rapida pubblica, fuori dal sito):
    # senza un utente autenticato si ripiega sulle chiavi API globali del
    # server, se impostate, tranne per le sorgenti con REQUIRES_API_KEY (OpenAlex),
    # che senza chiave personale o condivisa vengono saltate con un avviso.
    try:
        search_request = SearchRequest(
            keyword_include=payload.keyword_include,
            keyword_exclude=payload.keyword_exclude,
            author=payload.author,
            year_start=payload.year_start,
            year_end=payload.year_end,
            journal=payload.journal,
            depth=payload.depth,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    try:
        results, warnings = await search_all_sources(
            search_request,
            sources=payload.sources,
            api_keys=await resolve_api_keys(current_user, payload.ricerca_id),
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return {
        "count": len(results),
        # Ogni articolo porta anche "group_key": stesso valore per articoli
        # considerati duplicati tra loro (vedi services/utils/dedup.py), così
        # il frontend può raggrupparli senza bisogno di restrutturare
        # l'elenco piatto dei risultati.
        "results": annotate_with_group_key(results),
        "warnings": warnings,
    }
