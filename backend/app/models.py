from beanie import Document, Link
from pydantic import BaseModel, EmailStr, Field, NameEmail, PastDate
import bcrypt


class UserCreate(BaseModel):
    email: NameEmail
    password: str

class User(Document):
    email: EmailStr
    password: str
    name: str
    profile_img: str = Field(default="https://cdn-icons-png.flaticon.com/512/149/149071.png")

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
    def toDocument(cls, input: UserCreate ):
        return cls(
            email = input.email.email,
            password = cls.hash_password(input.password),
            name = input.email.name
        )

    
    class Settings:
        name = "users"

class Article(Document):
    title: str
    doi: str
    authors: list[str]
    publication_date: PastDate
    abstract: str
    source: str
    region: str
    editor: str
    institution_author: str
    deleted: bool = Field(default=False)

    class Settings:
        name = "articles"

class Filter(Document):
    title: str
    authors: list[str]
    date_range: list[PastDate]
    abstract: str
    source: list[str]
    region: list[str]
    editor: list[str]
    institution_author: list[str]
    
    class Settings:
        name = "filters"

class Project(Document):
    name: str
    description: str
    creation_date: PastDate
    closed: bool = Field(default=False)

    class Settings:
        name = "projects"

class Invite(Document):
    sender: Link["User"]
    receiver: Link["User"]
    project: Link["Project"]
    state: str = Field(default="pending")
    date_sent: PastDate

    class Settings:
        name = "invites"

class Research(Document):
    user: Link["User"]
    project: Link["Project"]
    filter: Link["Filter"]
    date: PastDate

    class Settings:
        name = "researches"

class AddedArticle(Document):
    research: Link["Research"]
    article: Link["Article"]

    class Settings:
        name = "added_articles"