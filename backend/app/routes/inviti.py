from datetime import date

from beanie.operators import Or
from fastapi import APIRouter, HTTPException

from backend.app.routes.utenti import decode_action_token_payload
from backend.app.schemas.models import Invite, Project, Research, User

router = APIRouter()


# Stesso trucco usato in ricerche.py: `fetch_links=True` va in errore con la
# combinazione beanie/pymongo installata, quindi si confrontano gli id
# tramite `link.ref.id` invece di risolvere i Link.
def linked_id(link) -> str:
    return str(link.ref.id)


async def _get_invite(token: str) -> Invite:
    payload = decode_action_token_payload(token, "invite")
    invite = await Invite.get(payload.get("invite_id"))
    if invite is None:
        raise HTTPException(status_code=404, detail="Invito non trovato")
    return invite


@router.get("/inviti/{token}")
async def get_invite(token: str):
    invite = await _get_invite(token)
    project = await Project.get(invite.project.ref.id)
    sender = await User.get(invite.sender.ref.id)
    # Conta anche se l'email invitata è una additional_email di un account
    # esistente, non solo l'email principale.
    existing_user = await User.find_one(Or(User.email == invite.receiver_email, User.additional_emails == invite.receiver_email))

    return {
        "state": invite.state,
        "receiver_email": invite.receiver_email,
        "sender_name": sender.name if sender is not None else None,
        "project_name": project.name if project is not None else None,
        "project_description": project.description if project is not None else None,
        "user_exists": existing_user is not None,
    }


@router.post("/inviti/{token}/accept")
async def accept_invite(token: str):
    invite = await _get_invite(token)
    if invite.state != "pending":
        raise HTTPException(status_code=400, detail="Questo invito è già stato gestito")

    user = await User.find_one(Or(User.email == invite.receiver_email, User.additional_emails == invite.receiver_email))
    if user is None:
        # Chi non ha ancora un account passa dalla registrazione (che, con
        # l'invite_token, crea da sola la partecipazione): vedi POST /users.
        raise HTTPException(status_code=404, detail="Nessun account registrato con questa email: registrati per accettare")

    project = await Project.get(invite.project.ref.id)
    if project is None:
        raise HTTPException(status_code=404, detail="Ricerca non trovata")

    all_researches = await Research.find_all().to_list()
    already_participant = any(
        linked_id(r.project) == str(project.id) and linked_id(r.user) == str(user.id) for r in all_researches
    )
    if not already_participant and linked_id(project.owner) != str(user.id):
        await Research(user=user, project=project, date=date.today()).insert()

    invite.state = "accepted"
    await invite.save()

    # Restituito per permettere al frontend di linkare direttamente alla
    # Ricerca appena accettata, invece che genericamente al login.
    return {"message": "Invito accettato", "project_id": str(project.id)}


@router.post("/inviti/{token}/decline")
async def decline_invite(token: str):
    invite = await _get_invite(token)
    if invite.state != "pending":
        raise HTTPException(status_code=400, detail="Questo invito è già stato gestito")

    invite.state = "declined"
    await invite.save()

    return {"message": "Invito rifiutato"}
