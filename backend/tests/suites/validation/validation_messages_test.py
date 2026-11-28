from pydantic import BaseModel, EmailStr, Field, ValidationError

from backend.app.schemas.models import UserCreate
from backend.app.services.utils.validation_messages import validation_message


def errors_of(model, data):
    try:
        model(**data)
    except ValidationError as e:
        # Come FastAPI, che premette "body" alla posizione del campo.
        return [{**err, "loc": ("body", *err["loc"])} for err in e.errors()]
    raise AssertionError("nessun errore di validazione")


def test_registrazione_email_non_valida_e_campo_mancante():
    errors = errors_of(UserCreate, {"first_name": "Luca", "email": "non-una-email", "password": "x"})
    assert validation_message(errors) == "Cognome: campo obbligatorio. Email: indirizzo non valido."


def test_lunghezze_numeri_e_campo_sconosciuto():
    class Esempio(BaseModel):
        password: str = Field(min_length=8)
        year_start: int = Field(ge=1900)
        page_size: int

    errors = errors_of(Esempio, {"password": "abc", "year_start": "mille", "page_size": 10})
    assert validation_message(errors) == "Password: troppo corto (almeno 8 caratteri). Anno iniziale: deve essere un numero."
    errors = errors_of(Esempio, {"password": "abcdefgh", "year_start": 1800, "page_size": "x"})
    assert validation_message(errors) == "Anno iniziale: deve essere almeno 1900. Page size: deve essere un numero."


def test_corpo_mancante_e_tipo_non_previsto():
    assert validation_message([{"type": "missing", "loc": ("body",), "msg": "Field required"}]) == "Richiesta non valida."
    assert validation_message([{"type": "strano", "loc": ("body", "email"), "msg": "?"}]) == "Dati non validi nel campo Email."


async def test_registrazione_password_corta():
    import pytest
    from fastapi import HTTPException

    from backend.app.routes.utenti import subscribe

    with pytest.raises(HTTPException) as exc_info:
        await subscribe(UserCreate(first_name="Luca", last_name="Rossi", email="a@b.it", password="corta"))
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "La password deve avere almeno 8 caratteri"
