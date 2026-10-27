import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

from dotenv import load_dotenv

# Vedi database.py: ancorato alla posizione del file per lo stesso motivo.
load_dotenv(Path(__file__).resolve().parent.parent.parent.parent / ".env")

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")


class EmailSendError(Exception):
    """Sollevata quando l'invio via SMTP fallisce: server non configurato,
    credenziali errate, connessione rifiutata, ecc."""


def send_email(to: str, subject: str, html_body: str, text_body: str = "") -> None:
    """Invio sincrono e bloccante (smtplib non ha API asyncio): dalle rotte
    va sempre chiamata tramite `asyncio.to_thread`, per non bloccare il
    event loop mentre si parla col server SMTP."""
    host = os.getenv("SMTP_HOST")
    if not host:
        raise EmailSendError("SMTP_HOST non configurato: impossibile inviare email")

    port = int(os.getenv("SMTP_PORT", "587"))
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASSWORD")
    sender = os.getenv("SMTP_FROM") or user or "no-reply@paperdex.local"
    use_tls = os.getenv("SMTP_USE_TLS", "true").strip().lower() != "false"

    message = MIMEMultipart("alternative")
    message["Subject"] = subject
    message["From"] = sender
    message["To"] = to
    if text_body:
        message.attach(MIMEText(text_body, "plain"))
    message.attach(MIMEText(html_body, "html"))

    try:
        with smtplib.SMTP(host, port, timeout=10) as server:
            if use_tls:
                server.starttls()
            if user and password:
                server.login(user, password)
            server.sendmail(sender, [to], message.as_string())
    except (smtplib.SMTPException, OSError) as e:
        raise EmailSendError(f"Invio email fallito: {e}") from e


def _wrap(title: str, body_html: str) -> str:
    return (
        f'<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">'
        f'<h2 style="color: #7c3aed;">{title}</h2>'
        f"{body_html}"
        f'<p style="color: #9ca3af; font-size: 12px; margin-top: 32px;">PapérDex</p>'
        f"</div>"
    )


def build_confirmation_email(confirm_url: str) -> tuple[str, str]:
    subject = "Conferma la tua email — PapérDex"
    html = _wrap(
        "Conferma la tua email",
        f'<p>Clicca sul link qui sotto per confermare il tuo indirizzo email su PapérDex.</p>'
        f'<p><a href="{confirm_url}">{confirm_url}</a></p>'
        f'<p>Se non hai richiesto tu questa conferma, ignora questa email.</p>',
    )
    return subject, html


def build_password_reset_email(reset_url: str) -> tuple[str, str]:
    subject = "Reimposta la tua password — PapérDex"
    html = _wrap(
        "Reimposta la password",
        f"<p>Hai richiesto di reimpostare la password del tuo account PapérDex. Il link è valido per 1 ora.</p>"
        f'<p><a href="{reset_url}">{reset_url}</a></p>'
        f"<p>Se non sei stato tu a richiederlo, ignora questa email: la tua password resterà invariata.</p>",
    )
    return subject, html


def build_password_changed_email() -> tuple[str, str]:
    subject = "La tua password è stata modificata — PapérDex"
    html = _wrap(
        "Password modificata",
        "<p>La password del tuo account PapérDex è stata cambiata. Se sei stato tu, non devi fare nulla.</p>"
        "<p>Se non riconosci questa modifica, contatta il prima possibile chi gestisce la piattaforma.</p>",
    )
    return subject, html


def build_invite_email(sender_name: str, project_name: str, accept_url: str) -> tuple[str, str]:
    subject = f"{sender_name} ti ha invitato su PapérDex"
    html = _wrap(
        "Sei stato invitato",
        f"<p><strong>{sender_name}</strong> ti ha invitato a partecipare alla ricerca "
        f'<strong>{project_name}</strong> su PapérDex.</p>'
        f'<p><a href="{accept_url}">{accept_url}</a></p>'
        f"<p>Se non ti aspettavi questo invito, puoi ignorare questa email.</p>",
    )
    return subject, html
