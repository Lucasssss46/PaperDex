from datetime import date
import re
from typing import Optional

from beanie import Document, Link
from pydantic import BaseModel, EmailStr, Field
from pymongo import IndexModel
import bcrypt


class UserCreate(BaseModel):
    first_name: str
    last_name: str
    email: EmailStr
    password: str
    # Presente solo arrivando da un link di invito per un indirizzo non
    # ancora registrato: la rotta ignora `email` sopra e usa quella
    # codificata nel token, per impedire di registrarsi con un indirizzo
    # diverso da quello a cui è stato mandato l'invito.
    invite_token: Optional[str] = None

# Esposta come costante (non solo come default del campo) così le rotte
# possono ripristinarla esplicitamente quando l'utente rimuove la propria
# immagine profilo.
DEFAULT_PROFILE_IMG = "https://cdn-icons-png.flaticon.com/512/149/149071.png"

class User(Document):
    email: EmailStr
    password: str
    # Nome e cognome, raccolti separatamente in fase di registrazione ma
    # salvati concatenati in un unico campo (non più modificabile dalle
    # impostazioni profilo).
    name: str = ""
    # Usato per il login in alternativa all'email; valorizzato di default con
    # la parte locale dell'email in fase di registrazione, poi modificabile
    # dalle impostazioni del profilo.
    username: str = ""
    # L'email principale non è modificabile dalle impostazioni; qui si
    # accumulano indirizzi aggiuntivi che l'utente può associare al proprio
    # account (per ora senza un vero flusso di verifica).
    additional_emails: list[EmailStr] = Field(default_factory=list)
    profile_img: str = Field(default=DEFAULT_PROFILE_IMG)
    institution: str = ""
    # Chiavi API personali dell'utente, solo per le sorgenti che le supportano
    # (vedi API_KEY_SOURCES in routes/utenti.py). Chiave = identificativo
    # della sorgente, valore = la chiave inserita dall'utente.
    api_keys: dict[str, str] = Field(default_factory=dict)
    # Ricerche (Project) a cui l'utente ha scelto di condividere
    # trasparentemente la propria chiave di una data sorgente con gli altri
    # membri del team: chiave = source_id, valore = lista di id di Project.
    # Disattivata di default (liste vuote/assenti): va attivata esplicitamente
    # ricerca per ricerca dalle impostazioni API keys. La chiave personale di
    # chi cerca ha comunque sempre priorità su una condivisa (vedi
    # resolve_api_keys in routes/ricerca.py).
    api_key_shared_with: dict[str, list[str]] = Field(default_factory=dict)
    # Provider LLM personale dell'utente per l'espansione semantica delle
    # keyword (vedi services/llm/ e LLM_PROVIDER_NAMES in routes/utenti.py):
    # un solo provider alla volta, a scelta dell'utente, non una chiave per
    # provider come per api_keys — evita di dover scegliere per lui quale
    # LLM usare. Se assente, l'espansione ripiega su un dizionario statico.
    llm_provider: Optional[str] = None
    llm_api_key: Optional[str] = None
    # Email confermate tramite link (routes/utenti.py): sia l'email
    # principale che eventuali additional_emails vi finiscono solo dopo che
    # il proprietario dell'account ha cliccato il link mandato a quel
    # preciso indirizzo. Una lista (non un semplice bool sulla sola email
    # principale) perché ogni email aggiuntiva richiede la propria prova di
    # possesso, indipendente da quella delle altre.
    confirmed_emails: list[EmailStr] = Field(default_factory=list)

    @classmethod
    def hash_password(cls, password: str) -> str:
        # Crea salt e hash della password
        pwd_bytes = password.encode('utf-8')
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw(pwd_bytes, salt)
        return hashed.decode('utf-8')

    def verify_password(self, password: str) -> bool:
        # Verifica la password
        pwd_bytes = password.encode('utf-8')
        hashed_bytes = self.password.encode('utf-8')
        return bcrypt.checkpw(pwd_bytes, hashed_bytes)

    @classmethod
    def toDocument(cls, input: UserCreate):
        full_name = f"{input.first_name.strip()} {input.last_name.strip()}".strip()
        return cls(
            email=input.email,
            password=cls.hash_password(input.password),
            name=full_name,
            username=input.email.split("@")[0],
        )

    class Settings:
        name = "users"
        # Indice univoco a livello di database: impedisce due account con la
        # stessa email anche in caso di richieste di registrazione concorrenti
        # (un controllo solo applicativo, prima dell'insert, avrebbe comunque
        # una finestra di corsa critica tra il controllo e la scrittura).
        indexes = [IndexModel("email", unique=True)]

class Article(Document):
    id: str = Field(alias="_id")
    title: str
    doi: Optional[str] = None
    authors: Optional[list[str]] = None
    publication_date: Optional[date] = None
    abstract: Optional[str] = None
    source: Optional[str] = None
    region: Optional[list[str]] = None
    venue: Optional[str] = None
    institution_author: Optional[list[str]] = None
    deleted: bool = Field(default=False)

    def pulisci_titolo(self) -> str:
        if not self.title:
            return ""
        title = self.title.lower()
        title = re.sub(r'[^\w\s]', '', title)
        return " ".join(title.split())

    class Settings:
        name = "articles"

class Query(Document):
    # Una query salvata riproduce esattamente i parametri di SearchRequest
    # (schemas/search.py) / SearchRequestIn (routes/ricerca.py), così da poter
    # essere reimpostata tale e quale nel form di ricerca tramite "Usa".
    # Condivisa da tutta la Ricerca (il Project), non da una singola
    # partecipazione: chiunque vi partecipi la vede e può riusarla.
    project: Link["Project"]
    name: str
    keyword_include: Optional[list[list[str]]] = None
    keyword_exclude: Optional[list[str]] = None
    author: Optional[list[str]] = None
    year_start: Optional[int] = None
    year_end: Optional[int] = None
    journal: Optional[list[str]] = None
    depth: str = "media"
    sources: Optional[list[str]] = None

    class Settings:
        name = "queries"

class Project(Document):
    name: str
    description: str
    creation_date: date
    closed: bool = Field(default=False)
    owner: Link["User"]
    # Classifica delle sorgenti (nomi come in Article.source) per la scelta
    # automatica in un gruppo di duplicati, dalla più preferita: modificabile
    # a blocchi trascinabili nella tab Deduplicazione. None = non ancora
    # impostata per questa Ricerca, si ripiega su DEFAULT_SOURCE_PRIORITY
    # (services/utils/dedup.py) — non importato qui per evitare un import
    # circolare (dedup.py importa già Article da questo stesso modulo).
    source_priority: Optional[list[str]] = None

    class Settings:
        name = "projects"

class Invite(Document):
    sender: Link["User"]
    # Per email, non per Link[User]: al momento dell'invito il destinatario
    # potrebbe non essere ancora registrato (vedi POST /users con
    # invite_token). Un utente già registrato conta come destinatario anche
    # se questa email è una delle sue additional_emails, non solo la principale.
    receiver_email: EmailStr
    project: Link["Project"]
    state: str = Field(default="pending")  # pending | accepted | declined
    date_sent: date

    class Settings:
        name = "invites"

class Research(Document):
    user: Link["User"]
    project: Link["Project"]
    date: date

    class Settings:
        name = "researches"

class AddedArticle(Document):
    research: Link["Research"]
    article: Link["Article"]

    class Settings:
        name = "added_articles"

class DuplicateGroup(Document):
    # Creato quando si sceglie "Aggiungi tutto il gruppo" nei risultati di
    # ricerca: solo un articolo (added_article) finisce davvero tra quelli
    # salvati, gli altri restano qui come alternative — consultabili e
    # selezionabili in un secondo momento nella tab "Deduplicazione" della
    # Ricerca, senza dover rifare la ricerca per ritrovarli.
    project: Link["Project"]
    added_article: Link["AddedArticle"]
    # Id di Article (non Link): sono record già presenti nella cache globale
    # di Article (inseriti al momento dell'aggiunta di gruppo) ma senza un
    # AddedArticle proprio, quindi non compaiono tra i "salvati".
    alternative_ids: list[str] = Field(default_factory=list)

    class Settings:
        name = "duplicate_groups"