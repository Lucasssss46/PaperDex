"""Errori di validazione (422) di FastAPI/Pydantic in italiano.

Pydantic li produce in inglese ("Field required", "value is not a valid email
address…"): l'handler in main.py li trasforma qui in una sola frase leggibile,
così ogni client riceve già `detail` come testo italiano.
"""

# Nomi dei campi come li vede l'utente; per gli altri si usa il nome tecnico
# con gli spazi al posto dei trattini bassi.
FIELD_LABELS = {
    "email": "Email",
    "password": "Password",
    "new_password": "Nuova password",
    "current_password": "Password attuale",
    "first_name": "Nome",
    "last_name": "Cognome",
    "name": "Nome",
    "username": "Nome utente",
    "institution": "Istituzione",
    "description": "Descrizione",
    "api_key": "Chiave API",
    "provider": "Fornitore",
    "token": "Codice del link",
    "terms": "Termini",
    "sources": "Sorgenti",
    "depth": "Profondità",
    "year_start": "Anno iniziale",
    "year_end": "Anno finale",
}

LOCATIONS = {"body", "query", "path", "header", "cookie"}


def _field_label(loc) -> str:
    parts = [p for p in loc if p not in LOCATIONS and not isinstance(p, int)]
    if not parts:
        return ""
    name = str(parts[-1])
    return FIELD_LABELS.get(name, name.replace("_", " ").capitalize())


def _problem(error: dict) -> str:
    kind = error.get("type", "")
    ctx = error.get("ctx") or {}
    msg = str(error.get("msg", "")).lower()
    if kind == "missing":
        return "campo obbligatorio"
    if kind == "string_too_short":
        return f"troppo corto (almeno {ctx.get('min_length')} caratteri)"
    if kind == "string_too_long":
        return f"troppo lungo (al massimo {ctx.get('max_length')} caratteri)"
    if kind == "value_error" and "email" in msg:
        return "indirizzo non valido"
    if kind in ("int_parsing", "int_type", "float_parsing", "float_type"):
        return "deve essere un numero"
    if kind in ("greater_than", "greater_than_equal", "less_than", "less_than_equal"):
        limit = ctx.get("gt", ctx.get("ge", ctx.get("lt", ctx.get("le"))))
        word = {"greater_than": "maggiore di", "greater_than_equal": "almeno",
                "less_than": "minore di", "less_than_equal": "al massimo"}[kind]
        return f"deve essere {word} {limit}"
    if kind in ("string_type", "list_type", "bool_parsing", "bool_type", "literal_error", "enum"):
        return "valore non ammesso"
    return ""


def validation_message(errors: list[dict]) -> str:
    phrases = []
    for error in errors:
        label = _field_label(error.get("loc", ()))
        problem = _problem(error)
        if not label:
            phrase = "Richiesta non valida."
        elif problem:
            phrase = f"{label}: {problem}."
        else:
            phrase = f"Dati non validi nel campo {label}."
        if phrase not in phrases:
            phrases.append(phrase)
    return " ".join(phrases) or "Richiesta non valida."
