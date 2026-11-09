from backend.app.schemas.models import Article
from backend.app.services.utils.export import to_bibtex, to_csv


def test_blank_author_names_are_left_out():
    # Voce 115: la chiave BibTeX prende l'ultima parola del primo autore,
    # che per un nome vuoto non esiste (IndexError).
    article = Article(id="a", title="Editorial", authors=["", " ", "Ada Lovelace"])

    assert "lovelacend" in to_bibtex([article])
    csv = to_csv([article])
    assert "Ada Lovelace" in csv and "; Ada" not in csv
