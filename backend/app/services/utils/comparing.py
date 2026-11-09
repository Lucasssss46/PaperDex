from backend.app.schemas.models import Article

def normalize_title(article:Article) -> str:
    """Normalizza il titolo rimuovendo punteggiatura e spazi superflui per il confronto."""
    if not article.title:
        return ""
    return "".join(c.lower() for c in article.title if c.isalnum() or c.isspace()).strip()