import asyncio
import re
from datetime import date
from typing import Any, Dict, List, Optional

from beanie.operators import Or
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, EmailStr

from backend.app.routes.utenti import create_action_token, get_current_user
from backend.app.schemas.models import AddedArticle, Article, DuplicateGroup, Invite, Project, Query, Research, User
from backend.app.services.utils.dedup import DEFAULT_SOURCE_PRIORITY, are_duplicates, pick_preferred
from backend.app.services.utils.email import EmailSendError, FRONTEND_URL, build_invite_email, send_email
from backend.app.services.utils.export import EXPORT_FORMATS, EXPORTERS
from backend.app.services.utils.zotero import (
    EnrichmentError,
    apply_enrichment,
    export_via_translation_server,
    fetch_zotero_metadata,
)

router = APIRouter()


class RicercaCreate(BaseModel):
    name: str
    description: str = ""


def serialize_project(project: Project) -> dict:
    return {
        "id": str(project.id),
        "name": project.name,
        "description": project.description,
        "creation_date": str(project.creation_date),
    }


# `fetch_links=True` sulle query qui sotto va in errore con la combinazione
# beanie/pymongo installata (TypeError su un cursore di aggregate() non
# awaitabile). Confrontiamo quindi gli id tramite `link.ref.id`, disponibile
# senza risolvere il link (una query in meno, oltretutto).
def linked_id(link) -> str:
    return str(link.ref.id)


async def find_my_research(project_id: str, user_id: str) -> Optional[Research]:
    """Research (partecipazione) dell'utente in un progetto, o None se non ne
    fa parte. Fattorizzato perché usato da più endpoint del flusso di
    deduplicazione, oltre che qui sotto."""
    all_researches = await Research.find_all().to_list()
    return next(
        (r for r in all_researches if linked_id(r.project) == project_id and linked_id(r.user) == user_id),
        None,
    )


async def find_cross_session_duplicate(
    project_id: str, candidates: List[Article], exclude_ids: set[str]
) -> Optional[tuple[Article, AddedArticle]]:
    """Cerca, tra gli articoli GIÀ salvati in questa Ricerca (project-wide: a
    prescindere da quale membro li abbia aggiunti o in quale sessione di
    ricerca), uno che risulti duplicato (are_duplicates) di uno dei
    `candidates` appena aggiunti. Il dedup "normale" raggruppa solo i
    risultati di un'unica ricerca (services/utils/dedup.group_articles): due
    versioni dello stesso articolo trovate in ricerche diverse, mai confrontate
    tra loro, finirebbero salvate come voci distinte senza questo controllo.
    Confronto O(n) contro i soli articoli già salvati (non O(n²) su tutta la
    storia, che servirebbe solo per riraggruppare tutto da capo): economico
    anche per Ricerche con molti salvati, eseguibile ad ogni aggiunta."""
    all_researches = await Research.find_all().to_list()
    related_research_ids = {str(r.id) for r in all_researches if linked_id(r.project) == project_id}

    all_added = await AddedArticle.find_all().to_list()
    project_added = [a for a in all_added if linked_id(a.research) in related_research_ids]

    seen_ids: set[str] = set()
    for added in project_added:
        article_id = linked_id(added.article)
        if article_id in seen_ids or article_id in exclude_ids:
            continue
        seen_ids.add(article_id)

        saved_article = await Article.get(article_id)
        if saved_article is None:
            continue
        if any(are_duplicates(candidate, saved_article) for candidate in candidates):
            return saved_article, added

    return None


async def attach_as_duplicate_alternatives(
    project: Project, anchor_added: AddedArticle, anchor_article_id: str, new_alternative_ids: List[str]
) -> None:
    """Aggiunge `new_alternative_ids` come alternative del DuplicateGroup
    ancorato a `anchor_added` (lo crea se non esiste ancora), consultabili in
    seguito nella tab Deduplicazione. Fattorizzata da add_article_group_to_ricerca
    perché la stessa logica di "estendi o crea il gruppo" serve anche quando
    il duplicato viene scoperto tra ricerche diverse, non solo tra i membri
    di uno stesso gruppo appena calcolato.

    `anchor_article_id` va passato esplicitamente dal chiamante (che lo
    conosce già) invece di essere derivato da `anchor_added.article`: per un
    AddedArticle appena creato in questa stessa richiesta (non ancora
    ricaricato dal database), quel campo è ancora l'oggetto Article passato al
    costruttore, non un Link risolvibile con `.ref.id` come `linked_id` si
    aspetta."""
    new_alternative_ids = [aid for aid in new_alternative_ids if aid != anchor_article_id]
    if not new_alternative_ids:
        return

    all_groups = await DuplicateGroup.find_all().to_list()
    existing_group = next(
        (
            g
            for g in all_groups
            if linked_id(g.project) == str(project.id) and linked_id(g.added_article) == str(anchor_added.id)
        ),
        None,
    )
    if existing_group is not None:
        existing_group.alternative_ids = list(dict.fromkeys(existing_group.alternative_ids + new_alternative_ids))
        await existing_group.save()
    else:
        await DuplicateGroup(project=project, added_article=anchor_added, alternative_ids=new_alternative_ids).insert()


@router.post("/ricerche")
async def create_ricerca(data: RicercaCreate, current_user: User = Depends(get_current_user)):
    project = Project(
        name=data.name,
        description=data.description,
        creation_date=date.today(),
        owner=current_user,
    )
    await project.insert()

    # Il creatore partecipa automaticamente alla propria ricerca.
    research = Research(user=current_user, project=project, date=date.today())
    await research.insert()

    return serialize_project(project)


@router.get("/ricerche")
async def list_ricerche(current_user: User = Depends(get_current_user)):
    my_id = str(current_user.id)

    all_projects = await Project.find_all().to_list()
    mine = [p for p in all_projects if linked_id(p.owner) == my_id]

    all_researches = await Research.find_all().to_list()
    my_project_ids = {linked_id(r.project) for r in all_researches if linked_id(r.user) == my_id}
    participating = [p for p in all_projects if str(p.id) in my_project_ids and linked_id(p.owner) != my_id]

    return {
        "mine": [serialize_project(p) for p in mine],
        "participating": [serialize_project(p) for p in participating],
    }


async def require_access(project: Project, current_user: User) -> None:
    if linked_id(project.owner) == str(current_user.id):
        return
    all_researches = await Research.find_all().to_list()
    participates = any(
        linked_id(r.project) == str(project.id) and linked_id(r.user) == str(current_user.id)
        for r in all_researches
    )
    if not participates:
        raise HTTPException(status_code=403, detail="Non partecipi a questa ricerca")


@router.get("/ricerche/{ricerca_id}")
async def get_ricerca(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    return serialize_project(project)


# Limite di pagina fisso: una ricerca bibliografica realisticamente raccoglie
# decine o al più qualche centinaio di articoli, non decine di migliaia — 20 per
# pagina restano scorribili a colpo d'occhio senza appesantire risposta/resa.
DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 50


@router.get("/ricerche/{ricerca_id}/articoli")
async def list_ricerca_articles(
    ricerca_id: str,
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    all_researches = await Research.find_all().to_list()
    related_research_ids = {str(r.id) for r in all_researches if linked_id(r.project) == str(project.id)}

    all_added = await AddedArticle.find_all().to_list()
    my_added = [a for a in all_added if linked_id(a.research) in related_research_ids]
    # Gli ObjectId di Mongo sono monotonicamente crescenti nel tempo: bastano
    # per ordinare dal più recente senza un campo timestamp dedicato.
    my_added.sort(key=lambda a: str(a.id), reverse=True)

    total = len(my_added)
    start = (page - 1) * page_size
    page_items = my_added[start : start + page_size]

    articles = []
    for added in page_items:
        article = await Article.get(added.article.ref.id)
        if article is not None:
            articles.append(article)

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total + page_size - 1) // page_size, 1),
        "articles": [a.model_dump() for a in articles],
    }


@router.get("/ricerche/{ricerca_id}/export")
async def export_ricerca_articles(
    ricerca_id: str, format: str, current_user: User = Depends(get_current_user)
):
    if format not in EXPORT_FORMATS:
        raise HTTPException(
            status_code=422, detail=f"Formato sconosciuto: {format!r}. Disponibili: {list(EXPORT_FORMATS)}"
        )

    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    all_researches = await Research.find_all().to_list()
    related_research_ids = {str(r.id) for r in all_researches if linked_id(r.project) == str(project.id)}

    all_added = await AddedArticle.find_all().to_list()
    my_added = [a for a in all_added if linked_id(a.research) in related_research_ids]

    articles = []
    for added in my_added:
        article = await Article.get(added.article.ref.id)
        if article is not None:
            articles.append(article)

    content_type, extension = EXPORT_FORMATS[format]

    # BibTeX/RIS: prova prima gli export translator di Zotero (più maturi
    # dei nostri sui casi limite), con il nostro formattatore come fallback
    # se il translation-server è irraggiungibile o in errore — mai far
    # dipendere l'export, sempre disponibile finora, da un servizio Docker
    # opzionale che potrebbe essere giù.
    content = None
    if format in ("bibtex", "ris"):
        content = await export_via_translation_server(articles, format)
    if content is None:
        content = EXPORTERS[format](articles)

    # Slug dal nome della Ricerca per un nome file leggibile, invece del solo
    # id Mongo: non deve contenere caratteri che rompano l'header o il
    # filesystem di chi lo scarica.
    slug = re.sub(r"[^a-z0-9]+", "-", project.name.lower()).strip("-") or "ricerca"
    filename = f"{slug}.{extension}"

    return Response(
        content=content,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/ricerche/{ricerca_id}/cronologia")
async def list_ricerca_cronologia(
    ricerca_id: str,
    current_user: User = Depends(get_current_user),
    page: int = 1,
    page_size: int = DEFAULT_PAGE_SIZE,
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    page = max(page, 1)
    page_size = min(max(page_size, 1), MAX_PAGE_SIZE)

    all_researches = await Research.find_all().to_list()
    related_researches = {str(r.id): r for r in all_researches if linked_id(r.project) == str(project.id)}

    all_added = await AddedArticle.find_all().to_list()
    my_added = [a for a in all_added if linked_id(a.research) in related_researches]
    # Stesso trucco di /articoli: gli ObjectId sono monotonicamente crescenti nel
    # tempo, quindi bastano sia per ordinare dal più recente sia per ricavare
    # un timestamp reale (`generation_time`) senza un campo dedicato — e "chi"
    # ha aggiunto l'articolo è già ricavabile da `research.user`, la Research
    # con cui è stato inserito (una Research è la partecipazione di un
    # singolo utente a una Ricerca), senza bisogno di un campo separato.
    my_added.sort(key=lambda a: str(a.id), reverse=True)

    total = len(my_added)
    start = (page - 1) * page_size
    page_items = my_added[start : start + page_size]

    entries = []
    for added in page_items:
        article = await Article.get(added.article.ref.id)
        research = related_researches.get(linked_id(added.research))
        added_by = await User.get(research.user.ref.id) if research is not None else None
        entries.append(
            {
                "id": str(added.id),
                "article_title": article.title if article is not None else None,
                "added_by": added_by.name if added_by is not None else "Utente rimosso",
                "added_at": added.id.generation_time.isoformat(),
            }
        )

    return {
        "count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max((total + page_size - 1) // page_size, 1),
        "entries": entries,
    }


def serialize_query(query: Query) -> dict:
    return {
        "id": str(query.id),
        "name": query.name,
        "keyword_include": query.keyword_include,
        "keyword_exclude": query.keyword_exclude,
        "author": query.author,
        "year_start": query.year_start,
        "year_end": query.year_end,
        "journal": query.journal,
        "depth": query.depth,
        "sources": query.sources,
    }


@router.get("/ricerche/{ricerca_id}/query")
async def list_ricerca_queries(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    all_queries = await Query.find_all().to_list()
    my_queries = [q for q in all_queries if linked_id(q.project) == str(project.id)]
    # Più recenti prima, stesso trucco ObjectId usato altrove in questo file.
    my_queries.sort(key=lambda q: str(q.id), reverse=True)

    return {"queries": [serialize_query(q) for q in my_queries]}


class QueryCreate(BaseModel):
    name: str
    keyword_include: Optional[List[List[str]]] = None
    keyword_exclude: Optional[List[str]] = None
    author: Optional[List[str]] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    journal: Optional[List[str]] = None
    depth: str = "media"
    sources: Optional[List[str]] = None


def _query_criteria(obj) -> tuple:
    """Solo i campi che definiscono la ricerca vera e propria (non `name`,
    autogenerato dagli stessi criteri e quindi ridondante come chiave di
    confronto): due query con questi campi identici rappresentano la stessa
    ricerca ripetuta."""
    return (
        obj.keyword_include,
        obj.keyword_exclude,
        obj.author,
        obj.year_start,
        obj.year_end,
        obj.journal,
        obj.depth,
        obj.sources,
    )


@router.post("/ricerche/{ricerca_id}/query")
async def create_ricerca_query(
    ricerca_id: str, data: QueryCreate, current_user: User = Depends(get_current_user)
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    # Chiunque partecipi (non solo il proprietario) può salvare una query: è
    # condivisa con tutta la Ricerca, coerente con Team/Cronologia.
    await require_access(project, current_user)

    name = data.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Il nome della query è obbligatorio")

    # Ripetere la stessa ricerca (es. il salvataggio automatico alla prima
    # aggiunta di un articolo, in routes/ricerca.py lato frontend) non deve
    # accumulare doppioni identici in "Query salvate": se una query con
    # esattamente questi criteri esiste già per la Ricerca, si riusa quella
    # invece di crearne una nuova.
    all_queries = await Query.find_all().to_list()
    existing = next(
        (
            q
            for q in all_queries
            if linked_id(q.project) == str(project.id) and _query_criteria(q) == _query_criteria(data)
        ),
        None,
    )
    if existing is not None:
        return serialize_query(existing)

    query = Query(
        project=project,
        name=name,
        keyword_include=data.keyword_include,
        keyword_exclude=data.keyword_exclude,
        author=data.author,
        year_start=data.year_start,
        year_end=data.year_end,
        journal=data.journal,
        depth=data.depth,
        sources=data.sources,
    )
    await query.insert()

    return serialize_query(query)


@router.get("/ricerche/{ricerca_id}/team")
async def list_ricerca_team(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    # Il proprietario fa sempre parte del team, anche se per qualche motivo
    # non avesse (più) una Research propria collegata alla Ricerca.
    members = {}
    owner = await User.get(project.owner.ref.id)
    if owner is not None:
        members[str(owner.id)] = {
            "id": str(owner.id),
            "name": owner.name,
            "email": owner.email,
            "is_owner": True,
        }

    all_researches = await Research.find_all().to_list()
    for r in all_researches:
        if linked_id(r.project) != str(project.id):
            continue
        user_id = linked_id(r.user)
        if user_id in members:
            continue
        user = await User.get(user_id)
        if user is not None:
            members[user_id] = {"id": str(user.id), "name": user.name, "email": user.email, "is_owner": False}

    return {
        "members": list(members.values()),
        # Così il frontend sa se mostrare il form di invito senza dover
        # ricavarlo confrontando la propria identità con la lista dei membri.
        "is_owner": linked_id(project.owner) == str(current_user.id),
    }


@router.delete("/ricerche/{ricerca_id}/team/{user_id}")
async def remove_team_member(ricerca_id: str, user_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può rimuovere membri")
    if user_id == linked_id(project.owner):
        raise HTTPException(status_code=400, detail="Il proprietario non può rimuovere se stesso")

    all_researches = await Research.find_all().to_list()
    to_remove = [
        r for r in all_researches if linked_id(r.project) == str(project.id) and linked_id(r.user) == user_id
    ]
    if not to_remove:
        raise HTTPException(status_code=404, detail="Utente non nel team di questa ricerca")

    # Gli articoli già aggiunti da questo membro restano nella Ricerca (sono un
    # contributo condiviso, non suoi personalmente, coerente con "Query
    # salvate"): si rimuove solo la sua partecipazione (Research), non gli
    # AddedArticle che vi fanno riferimento — la Cronologia mostra già
    # "Utente rimosso" per un added_by che punta a una Research sparita.
    for r in to_remove:
        await r.delete()

    return {"message": "Membro rimosso dal team"}


@router.post("/ricerche/{ricerca_id}/leave")
async def leave_ricerca(ricerca_id: str, current_user: User = Depends(get_current_user)):
    """Azione self-service simmetrica a remove_team_member: un membro (non il
    proprietario) può abbandonare una Ricerca di propria iniziativa, senza
    passare dal proprietario."""
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) == str(current_user.id):
        raise HTTPException(status_code=400, detail="Il proprietario non può abbandonare la propria Ricerca")

    all_researches = await Research.find_all().to_list()
    my_researches = [
        r
        for r in all_researches
        if linked_id(r.project) == str(project.id) and linked_id(r.user) == str(current_user.id)
    ]
    if not my_researches:
        raise HTTPException(status_code=403, detail="Non partecipi a questa ricerca")

    # Stessa scelta di remove_team_member: gli articoli già aggiunti restano nella
    # Ricerca come contributo condiviso, si rimuove solo la partecipazione.
    for r in my_researches:
        await r.delete()

    return {"message": "Hai abbandonato la Ricerca"}


class InviteCreate(BaseModel):
    email: EmailStr


@router.post("/ricerche/{ricerca_id}/invite")
async def invite_to_ricerca(ricerca_id: str, data: InviteCreate, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può invitare nuovi membri")

    email = data.email.strip()
    if email == current_user.email:
        raise HTTPException(status_code=400, detail="Non puoi invitare te stesso")

    existing_user = await User.find_one(Or(User.email == email, User.additional_emails == email))
    if existing_user is not None:
        if linked_id(project.owner) == str(existing_user.id):
            raise HTTPException(status_code=400, detail="È già il proprietario di questa ricerca")
        all_researches = await Research.find_all().to_list()
        already_participant = any(
            linked_id(r.project) == str(project.id) and linked_id(r.user) == str(existing_user.id)
            for r in all_researches
        )
        if already_participant:
            raise HTTPException(status_code=400, detail="È già nel team di questa ricerca")

    # Un invito pendente esistente per la stessa combinazione viene riusato
    # (rimandando l'email con un token fresco) invece di accumularne uno
    # nuovo ad ogni click su "Invita".
    all_invites = await Invite.find_all().to_list()
    invite = next(
        (
            i
            for i in all_invites
            if linked_id(i.project) == str(project.id) and i.receiver_email == email and i.state == "pending"
        ),
        None,
    )
    if invite is None:
        invite = Invite(sender=current_user, receiver_email=email, project=project, state="pending", date_sent=date.today())
        await invite.insert()

    token = create_action_token(email, "invite", expires_hours=24 * 7, invite_id=str(invite.id))
    accept_url = f"{FRONTEND_URL}/inviti/accetta?token={token}"
    subject, html = build_invite_email(current_user.name, project.name, accept_url)
    # A differenza delle notifiche di cambio password, qui l'invio è l'intera
    # azione richiesta: se fallisce, chi invita deve saperlo con un errore
    # leggibile (non un log silenzioso, ma nemmeno un 500 grezzo).
    try:
        await asyncio.to_thread(send_email, email, subject, html)
    except EmailSendError as e:
        raise HTTPException(status_code=502, detail=f"Invio dell'invito fallito: {e}")

    return {"message": "Invito inviato"}


@router.get("/ricerche/{ricerca_id}/invites")
async def list_ricerca_invites(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può vedere gli inviti mandati")

    all_invites = await Invite.find_all().to_list()
    related = [i for i in all_invites if linked_id(i.project) == str(project.id)]
    # Più recenti prima, stesso trucco ObjectId usato altrove in questo file.
    related.sort(key=lambda i: str(i.id), reverse=True)

    return {
        "invites": [
            {
                "id": str(i.id),
                "receiver_email": i.receiver_email,
                "state": i.state,
                "date_sent": i.date_sent.isoformat(),
            }
            for i in related
        ]
    }


@router.delete("/ricerche/{ricerca_id}")
async def delete_ricerca(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può eliminare questa ricerca")

    all_researches = await Research.find_all().to_list()
    related_researches = [r for r in all_researches if linked_id(r.project) == str(project.id)]

    if related_researches:
        related_ids = {str(r.id) for r in related_researches}
        all_added = await AddedArticle.find_all().to_list()
        for added in all_added:
            if linked_id(added.research) in related_ids:
                await added.delete()
        for research in related_researches:
            await research.delete()

    all_queries = await Query.find_all().to_list()
    for query in all_queries:
        if linked_id(query.project) == str(project.id):
            await query.delete()

    all_invites = await Invite.find_all().to_list()
    for invite in all_invites:
        if linked_id(invite.project) == str(project.id):
            await invite.delete()

    await project.delete()
    return {"message": "Ricerca eliminata"}


class AddArticleIn(BaseModel):
    article: Dict[str, Any]


@router.post("/ricerche/{ricerca_id}/articoli")
async def add_article_to_ricerca(
    ricerca_id: str, data: AddArticleIn, current_user: User = Depends(get_current_user)
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    all_researches = await Research.find_all().to_list()
    my_research = next(
        (
            r
            for r in all_researches
            if linked_id(r.project) == str(project.id) and linked_id(r.user) == str(current_user.id)
        ),
        None,
    )
    if my_research is None:
        raise HTTPException(status_code=403, detail="Non partecipi a questa ricerca")

    article = await Article.get(data.article.get("id"))
    if article is None:
        article = Article(**data.article)
        await article.insert()

    all_added = await AddedArticle.find_all().to_list()
    already_added = any(
        linked_id(a.research) == str(my_research.id) and linked_id(a.article) == str(article.id)
        for a in all_added
    )
    if already_added:
        return {"message": "Articolo aggiunto alla ricerca"}

    cross_match = await find_cross_session_duplicate(str(project.id), [article], exclude_ids={article.id})
    if cross_match is None:
        await AddedArticle(research=my_research, article=article).insert()
        return {"message": "Articolo aggiunto alla ricerca"}

    # Un articolo equivalente (sorgente diversa, stesso articolo) risulta già
    # salvato da una ricerca precedente: non diventa una seconda voce
    # "primaria" tra i salvati, ma un'alternativa nel suo DuplicateGroup —
    # stessa scelta già fatta per i duplicati trovati dentro un'unica ricerca.
    duplicate_of, duplicate_added = cross_match
    await attach_as_duplicate_alternatives(project, duplicate_added, duplicate_of.id, [article.id])

    return {
        "message": "Un articolo equivalente era già salvato in questa Ricerca: aggiunto come alternativa nella tab Deduplicazione",
        "duplicate_of": duplicate_of.id,
    }


# `:path` per accettare l'id articolo così com'è: per molte sorgenti è una URL
# intera (es. "http://arxiv.org/abs/..."), con "/" che altrimenti verrebbe
# spezzata su più segmenti di path (stesso motivo di remove_article_from_ricerca).
@router.post("/ricerche/{ricerca_id}/articoli/{article_id:path}/enrich")
async def enrich_article(ricerca_id: str, article_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    # Non distruttiva (riempie solo campi vuoti, non sovrascrive nulla):
    # aperta a chiunque partecipi, non solo al proprietario — stessa apertura
    # di add_article_to_ricerca.
    await require_access(project, current_user)

    article = await Article.get(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    try:
        item = await fetch_zotero_metadata(article)
    except EnrichmentError as e:
        raise HTTPException(status_code=502, detail=str(e))

    filled_fields = apply_enrichment(article, item)
    if filled_fields:
        await article.save()

    return {"article": article.model_dump(), "filled_fields": filled_fields}


@router.post("/ricerche/{ricerca_id}/articoli/enrich-all")
async def enrich_all_articles(ricerca_id: str, current_user: User = Depends(get_current_user)):
    """Come enrich_article, ma per tutti gli articoli salvati della Ricerca
    in un colpo solo — non solo la pagina corrente di /articoli (che è
    paginata): stessa query "tutti gli AddedArticle della Ricerca" già usata
    da export_ricerca_articles. Un articolo che fallisce (nessun
    identificativo, dato non trovato...) non deve bloccare gli altri, stessa
    filosofia resiliente di search_all_sources — l'errore viene raccolto e
    restituito, non propagato."""
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    all_researches = await Research.find_all().to_list()
    related_research_ids = {str(r.id) for r in all_researches if linked_id(r.project) == str(project.id)}
    all_added = await AddedArticle.find_all().to_list()
    my_added = [a for a in all_added if linked_id(a.research) in related_research_ids]

    enriched = []
    errors = []
    seen_article_ids = set()
    for added in my_added:
        article_id = linked_id(added.article)
        if article_id in seen_article_ids:
            # Stesso articolo aggiunto da più membri separatamente (un
            # AddedArticle a testa, come già gestito da remove_article_from_ricerca):
            # arricchirlo due volte nello stesso giro non serve a nulla.
            continue
        seen_article_ids.add(article_id)

        article = await Article.get(article_id)
        if article is None:
            continue
        try:
            item = await fetch_zotero_metadata(article)
        except EnrichmentError as e:
            errors.append({"article_id": article.id, "title": article.title, "detail": str(e)})
            continue

        filled_fields = apply_enrichment(article, item)
        if filled_fields:
            await article.save()
            enriched.append({"article": article.model_dump(), "filled_fields": filled_fields})

    return {
        "total": len(seen_article_ids),
        "enriched": enriched,
        "errors": errors,
    }


class AddArticleGroupIn(BaseModel):
    # Stessa forma di AddArticleIn.article, ma un gruppo intero: tutti i
    # membri considerati duplicati tra loro nei risultati di ricerca (vedi
    # group_key in services/utils/dedup.py).
    articles: List[Dict[str, Any]]


@router.post("/ricerche/{ricerca_id}/articoli/group")
async def add_article_group_to_ricerca(
    ricerca_id: str, data: AddArticleGroupIn, current_user: User = Depends(get_current_user)
):
    if not data.articles:
        raise HTTPException(status_code=400, detail="Nessun articolo nel gruppo")

    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    my_research = await find_my_research(str(project.id), str(current_user.id))
    if my_research is None:
        raise HTTPException(status_code=403, detail="Non partecipi a questa ricerca")

    # Upsert di ogni articolo del gruppo nella cache globale (stesso pattern
    # di add_article_to_ricerca), non solo di quello scelto: le alternative
    # scartate devono comunque esistere come Article per poter essere
    # mostrate più tardi nella tab Deduplicazione.
    articles = []
    for raw in data.articles:
        article = await Article.get(raw.get("id"))
        if article is None:
            article = Article(**raw)
            await article.insert()
        articles.append(article)

    group_ids = {a.id for a in articles}

    # Duplicato incrociato: uno di questi articoli corrisponde a un articolo
    # già salvato da una ricerca/sessione precedente (mai confrontato con
    # questo gruppo, dato che il dedup normale gira solo sui risultati della
    # ricerca corrente). In quel caso l'intero gruppo diventa alternativa
    # dell'articolo già salvato, invece di creare una seconda voce
    # "primaria" per lo stesso articolo tra i salvati.
    cross_match = await find_cross_session_duplicate(str(project.id), articles, exclude_ids=group_ids)
    if cross_match is not None:
        anchor_article, anchor_added = cross_match
        await attach_as_duplicate_alternatives(project, anchor_added, anchor_article.id, [a.id for a in articles])
        return {
            "message": "Gruppo aggiunto come alternativa a un articolo già salvato in questa Ricerca",
            "chosen_article_id": anchor_article.id,
        }

    chosen = pick_preferred(articles, project.source_priority)
    alternative_ids = [a.id for a in articles if a.id != chosen.id]

    all_added = await AddedArticle.find_all().to_list()
    added = next(
        (
            a
            for a in all_added
            if linked_id(a.research) == str(my_research.id) and linked_id(a.article) == str(chosen.id)
        ),
        None,
    )
    if added is None:
        added = AddedArticle(research=my_research, article=chosen)
        await added.insert()

    # Se questo stesso articolo scelto ha già un gruppo in questa Ricerca
    # (es. lo stesso gruppo aggiunto due volte, o due gruppi diversi che
    # condividono la preferenza), estende le alternative invece di crearne
    # uno nuovo — niente doppioni nella tab Deduplicazione.
    if alternative_ids:
        await attach_as_duplicate_alternatives(project, added, chosen.id, alternative_ids)

    return {"message": "Gruppo aggiunto alla ricerca", "chosen_article_id": chosen.id}


@router.get("/ricerche/{ricerca_id}/duplicate-groups")
async def list_duplicate_groups(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    all_groups = await DuplicateGroup.find_all().to_list()
    my_groups = [g for g in all_groups if linked_id(g.project) == str(project.id)]

    groups = []
    for g in my_groups:
        added = await AddedArticle.get(g.added_article.ref.id)
        if added is None:
            # L'articolo scelto è stato rimosso dai salvati (es. con
            # "Rimuovi" in Overview): il gruppo non ha più senso da mostrare.
            continue
        chosen_article = await Article.get(added.article.ref.id)
        if chosen_article is None:
            continue

        alternatives = []
        for alt_id in g.alternative_ids:
            alt = await Article.get(alt_id)
            if alt is not None:
                alternatives.append(alt)
        if not alternatives:
            continue

        groups.append(
            {
                "id": str(g.id),
                "chosen": chosen_article.model_dump(),
                "alternatives": [a.model_dump() for a in alternatives],
            }
        )

    return {"groups": groups}


class ChooseDuplicateIn(BaseModel):
    article_id: str


@router.post("/ricerche/{ricerca_id}/duplicate-groups/{group_id}/choose")
async def choose_duplicate(
    ricerca_id: str, group_id: str, data: ChooseDuplicateIn, current_user: User = Depends(get_current_user)
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    my_research = await find_my_research(str(project.id), str(current_user.id))
    if my_research is None:
        raise HTTPException(status_code=403, detail="Non partecipi a questa ricerca")

    group = await DuplicateGroup.get(group_id)
    if group is None or linked_id(group.project) != str(project.id):
        raise HTTPException(status_code=404, detail="Gruppo non trovato")

    current_added = await AddedArticle.get(group.added_article.ref.id)
    if current_added is None:
        raise HTTPException(status_code=404, detail="Articolo attualmente salvato non trovato")
    current_article_id = linked_id(current_added.article)

    if data.article_id == current_article_id:
        return {"message": "Nessuna modifica", "chosen_article_id": current_article_id}

    if data.article_id not in group.alternative_ids:
        raise HTTPException(status_code=400, detail="L'articolo scelto non fa parte di questo gruppo")

    new_article = await Article.get(data.article_id)
    if new_article is None:
        raise HTTPException(status_code=404, detail="Articolo non trovato")

    # Lo scambio è un'azione di chi la effettua ora, non di chi aveva
    # originariamente aggiunto il gruppo: stessa logica di attribuzione già
    # in uso altrove (es. remove_team_member).
    await current_added.delete()
    new_added = await AddedArticle(research=my_research, article=new_article).insert()

    group.added_article = new_added
    group.alternative_ids = [aid for aid in group.alternative_ids if aid != data.article_id] + [current_article_id]
    await group.save()

    return {"message": "Scelta aggiornata", "chosen_article_id": new_article.id}


@router.get("/ricerche/{ricerca_id}/source-priority")
async def get_source_priority(ricerca_id: str, current_user: User = Depends(get_current_user)):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    await require_access(project, current_user)

    return {
        "sources": project.source_priority or DEFAULT_SOURCE_PRIORITY,
        # Così il frontend sa distinguere "non ancora personalizzata" (mostra
        # comunque l'ordine di default, pronto per essere trascinato) da
        # "personalizzata esplicitamente", senza doverlo indovinare.
        "is_custom": project.source_priority is not None,
    }


class SourcePriorityIn(BaseModel):
    sources: List[str]


@router.put("/ricerche/{ricerca_id}/source-priority")
async def set_source_priority(
    ricerca_id: str, data: SourcePriorityIn, current_user: User = Depends(get_current_user)
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può modificare la classifica delle sorgenti")

    if set(data.sources) != set(DEFAULT_SOURCE_PRIORITY) or len(data.sources) != len(DEFAULT_SOURCE_PRIORITY):
        raise HTTPException(
            status_code=422, detail=f"La classifica deve contenere esattamente: {DEFAULT_SOURCE_PRIORITY}"
        )

    project.source_priority = data.sources
    await project.save()

    return {"sources": project.source_priority, "is_custom": True}


# `:path` per accettare l'id articolo così com'è: per molte sorgenti è una URL
# intera (es. "http://arxiv.org/abs/..."), con "/" che altrimenti verrebbe
# spezzata su più segmenti di path.
@router.delete("/ricerche/{ricerca_id}/articoli/{article_id:path}")
async def remove_article_from_ricerca(
    ricerca_id: str, article_id: str, current_user: User = Depends(get_current_user)
):
    project = await Project.get(ricerca_id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")
    if linked_id(project.owner) != str(current_user.id):
        raise HTTPException(status_code=403, detail="Solo il proprietario può rimuovere articoli salvati")

    all_researches = await Research.find_all().to_list()
    related_research_ids = {str(r.id) for r in all_researches if linked_id(r.project) == str(project.id)}

    all_added = await AddedArticle.find_all().to_list()
    # Rimuove tutte le istanze salvate di questo articolo nella Ricerca, anche
    # se più membri lo avessero aggiunto separatamente (un AddedArticle a
    # testa): dal punto di vista dell'utente è un solo articolo da togliere
    # dalla collezione condivisa, non una per partecipante.
    to_remove = [
        a
        for a in all_added
        if linked_id(a.research) in related_research_ids and linked_id(a.article) == article_id
    ]
    if not to_remove:
        raise HTTPException(status_code=404, detail="Articolo non trovato tra quelli salvati")

    removed_ids = {str(a.id) for a in to_remove}
    for a in to_remove:
        await a.delete()

    # Pulizia: un DuplicateGroup il cui added_article è appena sparito non ha
    # più senso (list_duplicate_groups lo salterebbe comunque in silenzio, ma
    # non c'è motivo di lasciarlo in giro indefinitamente nel database).
    all_groups = await DuplicateGroup.find_all().to_list()
    for g in all_groups:
        if linked_id(g.project) == str(project.id) and linked_id(g.added_article) in removed_ids:
            await g.delete()

    return {"message": "Articolo rimosso dalla ricerca"}
