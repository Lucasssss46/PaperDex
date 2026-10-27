import asyncio
import logging
from beanie.operators import Or
from datetime import date, datetime, timedelta, timezone
import os
import uuid
from pathlib import Path

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel, EmailStr
from pymongo.errors import DuplicateKeyError
from typing import Optional

from backend.app.schemas.models import DEFAULT_PROFILE_IMG, Invite, Project, Research, UserCreate, User
from backend.app.services.llm import LLM_PROVIDERS
from backend.app.services.utils.email import (
    EmailSendError,
    FRONTEND_URL,
    build_confirmation_email,
    build_password_changed_email,
    build_password_reset_email,
    send_email,
)
from backend.app.services.utils.orchestrator import ADAPTER_REGISTRY
from jose import JWTError, jwt

# Vedi database.py: ancorato alla posizione del file per lo stesso motivo.
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

router = APIRouter()

AVATAR_DIR = Path(__file__).resolve().parent.parent / "static" / "avatars"
AVATAR_DIR.mkdir(parents=True, exist_ok=True)
ALLOWED_AVATAR_TYPES = {"image/png", "image/jpeg", "image/gif", "image/webp"}
MAX_AVATAR_SIZE = 5 * 1024 * 1024  # 5 MB

# Sorgenti che supportano una chiave API personale per aumentare i propri limiti
# di frequenza, derivate da ADAPTER_REGISTRY (single source of truth: ogni
# adapter dichiara il proprio API_KEY_SOURCE_ID, None se non ne supporta
# una). Le altre sorgenti (arXiv, Crossref, DBLP) non compaiono qui, e non è
# quindi possibile registrarne una.
API_KEY_SOURCES = {
    adapter_cls.API_KEY_SOURCE_ID: display_name
    for display_name, adapter_cls in ADAPTER_REGISTRY.items()
    if adapter_cls.API_KEY_SOURCE_ID
}

# Provider LLM disponibili per l'espansione semantica delle keyword, derivati
# da LLM_PROVIDERS (stessa idea di API_KEY_SOURCES sopra: una sola fonte di
# verità, il nome mostrato vive sul provider stesso).
LLM_PROVIDER_NAMES = {key: cls.DISPLAY_NAME for key, cls in LLM_PROVIDERS.items()}

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login")
# auto_error=False: non solleva 401 da solo se manca l'header Authorization,
# per gli endpoint accessibili anche da anonimi (es. ricerca rapida pubblica).
oauth2_scheme_optional = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)


async def get_current_user(token: str = Depends(oauth2_scheme)) -> User:
    credentials_exception = HTTPException(status_code=401, detail="Credenziali non valide")
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
        email = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await User.find_one(User.email == email)
    if user is None:
        raise credentials_exception
    return user


async def get_optional_user(token: Optional[str] = Depends(oauth2_scheme_optional)) -> Optional[User]:
    """Come get_current_user, ma restituisce None se non c'è alcun token
    (visitatore anonimo), invece di sollevare 401. Un token presente ma non
    valido/scaduto resta un errore esplicito (propagato da get_current_user),
    non viene inghiottito in silenzio."""
    if token is None:
        return None
    return await get_current_user(token)


def create_action_token(email: str, purpose: str, expires_hours: int = 24, **extra_claims) -> str:
    """Token firmato per un'azione via link email (conferma, reset password,
    invito): stesso meccanismo del token di login (jose + SECRET_KEY), ma con
    uno `purpose` per evitare che un token pensato per un'azione venga
    riusato per un'altra, e una scadenza indipendente da quella di sessione.
    `extra_claims` porta dati aggiuntivi specifici dell'azione (es. l'id
    dell'invito, per non doverlo riderivare da email+progetto)."""
    to_encode = {"sub": email, "purpose": purpose, **extra_claims}
    expire = datetime.now(timezone.utc) + timedelta(hours=expires_hours)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))


def decode_action_token_payload(token: str, expected_purpose) -> dict:
    """Ritorna il payload completo del token se valido, non scaduto e per lo
    scopo atteso; solleva altrimenti un errore leggibile lato client.
    `expected_purpose` è di solito una singola stringa, ma può essere un
    insieme quando uno stesso endpoint deve accettare token emessi per scopi
    diversi (es. conferma email principale vs. secondaria)."""
    try:
        payload = jwt.decode(token, os.getenv("SECRET_KEY"), algorithms=[os.getenv("ALGORITHM")])
    except JWTError:
        raise HTTPException(status_code=400, detail="Link non valido o scaduto")

    expected = {expected_purpose} if isinstance(expected_purpose, str) else set(expected_purpose)
    if payload.get("purpose") not in expected:
        raise HTTPException(status_code=400, detail="Link non valido")
    if not payload.get("sub"):
        raise HTTPException(status_code=400, detail="Link non valido")
    return payload


def decode_action_token(token: str, expected_purpose: str) -> str:
    """Ritorna solo l'email codificata nel token (vedi decode_action_token_payload
    per i casi che servono anche altri claim, es. l'invito)."""
    return decode_action_token_payload(token, expected_purpose)["sub"]


async def send_email_safely(to: str, subject: str, html: str) -> None:
    """Invio email in un thread separato (smtplib è bloccante) che non fa
    fallire la richiesta chiamante se l'SMTP non è configurato o non
    risponde: chi chiama decide se quell'invio è critico o no."""
    try:
        await asyncio.to_thread(send_email, to, subject, html)
    except EmailSendError as e:
        logging.warning(f"Invio email a {to} fallito: {e}")


@router.post("/users")
async def subscribe(data: UserCreate):
    invite = None
    if data.invite_token:
        payload = decode_action_token_payload(data.invite_token, "invite")
        invite = await Invite.get(payload.get("invite_id"))
        if invite is None or invite.state != "pending" or invite.receiver_email != payload["sub"]:
            raise HTTPException(status_code=400, detail="Invito non valido o già utilizzato")
        # L'email arriva dal token firmato, non da quella scritta nel form:
        # impedisce di registrarsi con un indirizzo diverso da quello invitato.
        data = data.model_copy(update={"email": invite.receiver_email})

    # Factory Method
    new_user = User.toDocument(data)

    # Salvataggio. Il controllo di unicità vero e proprio è l'indice univoco
    # su `email` a livello di database (vedi models.py): qui intercettiamo
    # solo il suo errore per restituire un messaggio leggibile invece del
    # 500 grezzo di una violazione di indice.
    try:
        await new_user.insert()
    except DuplicateKeyError:
        raise HTTPException(status_code=400, detail="Email già in uso da un altro account")

    if invite is not None:
        project = await Project.get(invite.project.ref.id)
        if project is not None:
            await Research(user=new_user, project=project, date=date.today()).insert()
        invite.state = "accepted"
        await invite.save()

    # Non deve far fallire la registrazione se l'invio non va a buon fine
    # (vedi send_email_safely): l'utente può sempre richiederne un'altra
    # copia in seguito dalle impostazioni del profilo.
    token = create_action_token(new_user.email, "email_confirmation")
    confirm_url = f"{FRONTEND_URL}/conferma-email?token={token}"
    subject, html = build_confirmation_email(confirm_url)
    await send_email_safely(new_user.email, subject, html)

    return {"message": f"Utente {new_user.name} creato con successo!"}



@router.post("/login")
async def login(form_data: OAuth2PasswordRequestForm = Depends()):
    # 1. Trova l'utente (per email o per username)
    user = await User.find_one(Or(User.email == form_data.username, User.username == form_data.username))
    
    # 2. Verifica utente e password
    if not user or not user.verify_password(form_data.password):
      raise HTTPException(status_code=400, detail="Email o password errati")
    
    # 3. Crea il Token (semplificato)
    to_encode = {"sub": user.email}
    expire = datetime.now(timezone.utc) + timedelta(hours=2)
    to_encode.update({"exp": expire})
    
    token = jwt.encode(to_encode, os.getenv("SECRET_KEY"), algorithm=os.getenv("ALGORITHM"))

    return {"access_token": token, "token_type": "bearer"}


@router.get("/users/me")
async def get_me(current_user: User = Depends(get_current_user)):
    return {
        "name": current_user.name,
        "username": current_user.username,
        "institution": current_user.institution,
        "email": current_user.email,
        "additional_emails": current_user.additional_emails,
        "confirmed_emails": current_user.confirmed_emails,
        "profile_img": current_user.profile_img,
    }


class ProfileUpdate(BaseModel):
    # Nome e cognome sono preimpostati alla registrazione e non modificabili
    # dalle impostazioni: qui restano solo i campi che l'utente può cambiare.
    username: Optional[str] = None
    institution: Optional[str] = None
    profile_img: Optional[str] = None


@router.patch("/users/me")
async def update_profile(data: ProfileUpdate, current_user: User = Depends(get_current_user)):
    if data.username is not None and data.username != current_user.username:
        existing = await User.find_one(User.username == data.username)
        if existing is not None and str(existing.id) != str(current_user.id):
            raise HTTPException(status_code=400, detail="Username già in uso")
        current_user.username = data.username

    if data.institution is not None:
        current_user.institution = data.institution
    if data.profile_img is not None:
        # Un campo vuoto ripristina l'immagine di default invece di salvare
        # una stringa vuota come URL.
        current_user.profile_img = data.profile_img.strip() or DEFAULT_PROFILE_IMG

    await current_user.save()

    return {
        "name": current_user.name,
        "username": current_user.username,
        "institution": current_user.institution,
        "profile_img": current_user.profile_img,
    }


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


@router.post("/users/me/password")
async def change_password(data: PasswordChange, current_user: User = Depends(get_current_user)):
    if not current_user.verify_password(data.current_password):
        raise HTTPException(status_code=400, detail="Password attuale errata")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nuova password deve avere almeno 8 caratteri")

    current_user.password = User.hash_password(data.new_password)
    await current_user.save()

    # Notifica di sicurezza: non deve far fallire il cambio password se
    # l'invio non va a buon fine (vedi send_email_safely).
    subject, html = build_password_changed_email()
    await send_email_safely(current_user.email, subject, html)

    return {"message": "Password aggiornata"}


class PasswordResetRequest(BaseModel):
    email: EmailStr


@router.post("/password-reset/request")
async def request_password_reset(data: PasswordResetRequest):
    user = await User.find_one(User.email == data.email)
    if user is not None:
        token = create_action_token(user.email, "password_reset", expires_hours=1)
        reset_url = f"{FRONTEND_URL}/reset-password?token={token}"
        subject, html = build_password_reset_email(reset_url)
        await send_email_safely(user.email, subject, html)

    # Risposta identica indipendentemente dal fatto che l'email esista: non
    # deve rivelare quali indirizzi sono registrati sulla piattaforma.
    return {"message": "Se l'indirizzo è registrato, riceverai un'email con le istruzioni per reimpostare la password."}


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


@router.post("/password-reset/confirm")
async def confirm_password_reset(data: PasswordResetConfirm):
    email = decode_action_token(data.token, "password_reset")
    user = await User.find_one(User.email == email)
    if user is None:
        raise HTTPException(status_code=404, detail="Utente non trovato")
    if len(data.new_password) < 8:
        raise HTTPException(status_code=400, detail="La nuova password deve avere almeno 8 caratteri")

    user.password = User.hash_password(data.new_password)
    await user.save()

    subject, html = build_password_changed_email()
    await send_email_safely(user.email, subject, html)

    return {"message": "Password aggiornata"}


# --- Conferma email -----------------------------------------------------
# Un'email (principale o aggiuntiva) risulta confermata solo dopo che chi
# possiede quella casella ha cliccato il link mandatole: la registrazione
# manda già il link per l'email principale (vedi subscribe sopra), e
# l'aggiunta di un'email aggiuntiva (add_email sotto) non la rende
# utilizzabile finché non viene confermata allo stesso modo.


@router.post("/users/me/confirm-email/request")
async def request_email_confirmation(current_user: User = Depends(get_current_user)):
    if current_user.email in current_user.confirmed_emails:
        return {"message": "Email già confermata"}

    token = create_action_token(current_user.email, "email_confirmation")
    confirm_url = f"{FRONTEND_URL}/conferma-email?token={token}"
    subject, html = build_confirmation_email(confirm_url)
    try:
        await asyncio.to_thread(send_email, current_user.email, subject, html)
    except EmailSendError as e:
        raise HTTPException(status_code=502, detail=f"Invio email fallito: {e}")

    return {"message": "Email di conferma inviata"}


class ConfirmEmailIn(BaseModel):
    token: str


@router.post("/confirm-email")
async def confirm_email(data: ConfirmEmailIn):
    # Un solo endpoint per entrambi i casi (email principale ed email
    # aggiuntiva): il link è identico dal punto di vista del frontend, cambia
    # solo il "purpose" codificato nel token da chi lo ha emesso.
    payload = decode_action_token_payload(data.token, {"email_confirmation", "email_confirmation_secondary"})
    email = payload["sub"]

    if payload["purpose"] == "email_confirmation":
        user = await User.find_one(User.email == email)
        if user is None:
            raise HTTPException(status_code=404, detail="Utente non trovato")
    else:
        # L'email confermata qui non è quella dell'account che ha fatto la
        # richiesta (current_user al momento di add_email), quindi il token
        # porta separatamente l'email dell'account a cui va associata.
        account_email = payload.get("account_email")
        user = await User.find_one(User.email == account_email)
        if user is None:
            raise HTTPException(status_code=404, detail="Utente non trovato")

        if email != user.email and email not in user.additional_emails:
            # Ricontrollata solo ora, non al momento della richiesta: nel
            # frattempo l'indirizzo potrebbe essere stato preso da un altro
            # account (registrato lì o aggiunto e confermato lì per primo).
            taken = await User.find_one(Or(User.email == email, User.additional_emails == email))
            if taken is not None:
                raise HTTPException(status_code=400, detail="Email nel frattempo associata a un altro account")
            user.additional_emails.append(email)

    if email not in user.confirmed_emails:
        user.confirmed_emails.append(email)
        await user.save()

    return {"message": "Email confermata"}


class EmailAdd(BaseModel):
    email: EmailStr


@router.post("/users/me/emails")
async def add_email(data: EmailAdd, current_user: User = Depends(get_current_user)):
    if data.email == current_user.email or data.email in current_user.additional_emails:
        raise HTTPException(status_code=400, detail="Email già presente su questo account")

    existing = await User.find_one(Or(User.email == data.email, User.additional_emails == data.email))
    if existing is not None:
        raise HTTPException(status_code=400, detail="Email già in uso da un altro account")

    # Non aggiunta subito ad additional_emails: prima va dimostrato il
    # possesso della casella, altrimenti si potrebbe associare al proprio
    # account l'indirizzo di qualcun altro (es. per ricevere al posto suo
    # inviti mandati a quell'indirizzo).
    token = create_action_token(data.email, "email_confirmation_secondary", account_email=current_user.email)
    confirm_url = f"{FRONTEND_URL}/conferma-email?token={token}"
    subject, html = build_confirmation_email(confirm_url)
    try:
        await asyncio.to_thread(send_email, data.email, subject, html)
    except EmailSendError as e:
        raise HTTPException(status_code=502, detail=f"Invio email fallito: {e}")

    return {"message": "Email di conferma inviata al nuovo indirizzo: sarà aggiunta all'account dopo la conferma"}


@router.get("/users/me/invites")
async def list_my_invites(current_user: User = Depends(get_current_user)):
    """Inviti ricevuti dall'utente, su qualunque Ricerca (non solo quella
    principale: conta anche se arrivati su una delle additional_emails)."""
    all_invites = await Invite.find_all().to_list()
    mine = [
        i
        for i in all_invites
        if i.receiver_email == current_user.email or i.receiver_email in current_user.additional_emails
    ]
    mine.sort(key=lambda i: str(i.id), reverse=True)

    results = []
    for invite in mine:
        sender = await User.get(invite.sender.ref.id)
        project = await Project.get(invite.project.ref.id)
        entry = {
            "id": str(invite.id),
            "sender_name": sender.name if sender is not None else None,
            "project_name": project.name if project is not None else None,
            "state": invite.state,
            "date_sent": invite.date_sent.isoformat(),
        }
        if invite.state == "pending":
            # Stesso token che verrebbe rimandato via email: permette al
            # frontend di linkare direttamente alla stessa InvitePage già
            # usata dal link ricevuto per posta, senza duplicare la UI di
            # accetta/rifiuta qui.
            entry["token"] = create_action_token(
                invite.receiver_email, "invite", expires_hours=24 * 7, invite_id=str(invite.id)
            )
        results.append(entry)

    return {"invites": results}


async def my_owned_project_ids(current_user: User) -> set[str]:
    """Id delle Ricerche di cui l'utente è proprietario. Solo il proprietario
    può decidere di condividere una chiave con l'intero team di una Ricerca —
    un semplice partecipante non ha voce in capitolo su questo, anche se ne fa
    parte (stessa asimmetria di "invita"/"rimuovi membro"/"elimina Ricerca",
    tutte azioni riservate al proprietario in routes/ricerche.py)."""
    my_id = str(current_user.id)
    all_projects = await Project.find_all().to_list()
    return {str(p.id) for p in all_projects if str(p.owner.ref.id) == my_id}


@router.get("/users/me/api-keys")
async def get_api_keys(current_user: User = Depends(get_current_user)):
    my_ids = await my_owned_project_ids(current_user)
    all_projects = await Project.find_all().to_list()
    my_researches = [{"id": str(p.id), "name": p.name} for p in all_projects if str(p.id) in my_ids]

    # Non viene mai restituita la chiave salvata, solo se è impostata o meno
    # (stesso principio della password: si può sovrascrivere, non rileggere).
    return {
        "researches": my_researches,
        "sources": [
            {
                "id": source_id,
                "name": name,
                "is_set": source_id in current_user.api_keys,
                # Senza chiave (propria o condivisa) la sorgente viene saltata.
                "required": ADAPTER_REGISTRY[name].REQUIRES_API_KEY,
                # Filtrato contro my_ids: se l'utente non è più proprietario
                # di una Ricerca dopo avervi attivato la condivisione, non la
                # mostriamo più come attiva (anche se il dato grezzo resta in
                # DB finché non viene sovrascritto dal prossimo salvataggio).
                "shared_with": [
                    pid for pid in current_user.api_key_shared_with.get(source_id, []) if pid in my_ids
                ],
            }
            for source_id, name in API_KEY_SOURCES.items()
        ],
    }


class ApiKeySet(BaseModel):
    api_key: str


@router.put("/users/me/api-keys/{source_id}")
async def set_api_key(source_id: str, data: ApiKeySet, current_user: User = Depends(get_current_user)):
    if source_id not in API_KEY_SOURCES:
        raise HTTPException(status_code=404, detail="Sorgente non riconosciuta")

    value = data.api_key.strip()
    if value:
        current_user.api_keys[source_id] = value
    else:
        # Stringa vuota rimuove la chiave invece di salvarne una vuota.
        current_user.api_keys.pop(source_id, None)
    await current_user.save()

    return {"is_set": source_id in current_user.api_keys}


class ApiKeySharingSet(BaseModel):
    project_ids: list[str]


@router.put("/users/me/api-keys/{source_id}/sharing")
async def set_api_key_sharing(
    source_id: str, data: ApiKeySharingSet, current_user: User = Depends(get_current_user)
):
    if source_id not in API_KEY_SOURCES:
        raise HTTPException(status_code=404, detail="Sorgente non riconosciuta")

    # Solo Ricerche di cui l'utente è proprietario: non deve poter attivare la
    # condivisione verso una Ricerca a cui partecipa soltanto, né verso una a
    # cui non partecipa affatto.
    my_ids = await my_owned_project_ids(current_user)
    valid_ids = [pid for pid in dict.fromkeys(data.project_ids) if pid in my_ids]

    current_user.api_key_shared_with[source_id] = valid_ids
    await current_user.save()

    return {"shared_with": valid_ids}


@router.get("/users/me/llm")
async def get_llm_config(current_user: User = Depends(get_current_user)):
    return {
        "providers": [{"id": key, "name": name} for key, name in LLM_PROVIDER_NAMES.items()],
        "provider": current_user.llm_provider,
        "is_set": bool(current_user.llm_api_key),
    }


class LlmConfigSet(BaseModel):
    provider: str
    api_key: str


@router.put("/users/me/llm")
async def set_llm_config(data: LlmConfigSet, current_user: User = Depends(get_current_user)):
    value = data.api_key.strip()
    if not value:
        # Stringa vuota rimuove la configurazione invece di salvare una
        # chiave vuota (stesso principio di /api-keys/{source_id}).
        current_user.llm_provider = None
        current_user.llm_api_key = None
    else:
        if data.provider not in LLM_PROVIDER_NAMES:
            raise HTTPException(status_code=400, detail="Provider non riconosciuto")
        current_user.llm_provider = data.provider
        current_user.llm_api_key = value
    await current_user.save()

    return {"provider": current_user.llm_provider, "is_set": bool(current_user.llm_api_key)}


@router.post("/users/me/avatar")
async def upload_avatar(
    request: Request,
    current_user: User = Depends(get_current_user),
    file: UploadFile = File(...),
):
    if file.content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(status_code=400, detail="Formato immagine non supportato")

    contents = await file.read()
    if len(contents) > MAX_AVATAR_SIZE:
        raise HTTPException(status_code=400, detail="Immagine troppo grande (max 5 MB)")

    extension = Path(file.filename).suffix or ".png"
    filename = f"{current_user.id}-{uuid.uuid4().hex}{extension}"
    (AVATAR_DIR / filename).write_bytes(contents)

    # URL assoluto: frontend (5173) e backend (8000) hanno origini diverse in
    # sviluppo, quindi un path relativo verrebbe risolto contro l'origine sbagliata.
    current_user.profile_img = f"{str(request.base_url).rstrip('/')}/api/static/avatars/{filename}"
    await current_user.save()

    return {"profile_img": current_user.profile_img}