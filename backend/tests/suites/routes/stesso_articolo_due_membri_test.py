"""Lo stesso articolo aggiunto da due membri della stessa Ricerca non diventa
due voci, e l'export non lo ripete (voce 132)."""
from datetime import date

import mongomock_motor
import pytest
from beanie import init_beanie

from backend.app.routes import ricerche
from backend.app.routes.ricerche import (
    AddArticleGroupIn,
    AddArticleIn,
    add_article_group_to_ricerca,
    add_article_to_ricerca,
    export_ricerca_articles,
)
from backend.app.schemas.models import AddedArticle, Article, DuplicateGroup, Participation, Research, User

ARTICLE = {"id": "http://arxiv.org/abs/2610.17458v1", "title": "Selective Inference for Clustering", "source": "ArXiv"}
OTHER = {"id": "https://doi.org/10.1/altra", "title": "Selective Inference for Clustering", "source": "Crossref"}


@pytest.fixture
async def team(monkeypatch):
    client = mongomock_motor.AsyncMongoMockClient()
    await init_beanie(
        database=client.db_name,
        document_models=[User, Research, Participation, AddedArticle, Article, DuplicateGroup],
    )
    # L'export non deve dipendere dal translation-server di Zotero.
    async def no_zotero(*args, **kwargs):
        return None

    monkeypatch.setattr(ricerche, "export_via_translation_server", no_zotero)

    owner = await User(email="luca@example.com", password="x").insert()
    member = await User(email="amico@example.com", password="x").insert()
    research = await Research(name="Prova", description="", creation_date=date.today(), owner=owner).insert()
    for user in (owner, member):
        await Participation(user=user, research=research, date=date.today()).insert()
    return research, owner, member


async def test_second_member_adding_same_article_gets_already_present(team):
    research, owner, member = team
    first = await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), owner)
    second = await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), member)

    assert not first.get("already_present")
    assert second["already_present"] is True
    assert len(await AddedArticle.find_all().to_list()) == 1


async def test_same_member_adding_again_in_a_later_session_gets_already_present(team):
    research, owner, _ = team
    await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), owner)
    again = await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), owner)

    assert again["already_present"] is True
    assert len(await AddedArticle.find_all().to_list()) == 1


async def test_same_member_adding_a_group_with_the_saved_article_later(team):
    # Il gruppo sceglierebbe la versione Crossref (prima nella classifica),
    # creando una seconda voce per lo stesso lavoro già salvato da arXiv.
    research, owner, _ = team
    await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), owner)
    result = await add_article_group_to_ricerca(str(research.id), AddArticleGroupIn(articles=[OTHER, ARTICLE]), owner)

    assert result["already_present"] is True
    assert len(await AddedArticle.find_all().to_list()) == 1


async def test_group_containing_saved_article_becomes_alternative(team):
    research, owner, member = team
    await add_article_to_ricerca(str(research.id), AddArticleIn(article=ARTICLE), owner)
    result = await add_article_group_to_ricerca(str(research.id), AddArticleGroupIn(articles=[OTHER, ARTICLE]), member)

    assert result["already_present"] is True
    assert result["chosen_article_id"] == ARTICLE["id"]
    assert len(await AddedArticle.find_all().to_list()) == 1
    groups = await DuplicateGroup.find_all().to_list()
    assert len(groups) == 1 and groups[0].alternative_ids == [OTHER["id"]]


async def test_export_lists_article_once_even_if_saved_twice(team):
    research, owner, member = team
    article = await Article(**ARTICLE).insert()
    # Dati salvati prima della correzione: due voci per lo stesso articolo.
    for participation in await Participation.find_all().to_list():
        await AddedArticle(participation=participation, article=article).insert()

    response = await export_ricerca_articles(str(research.id), "bibtex", owner)
    assert response.body.decode().count("Selective Inference for Clustering") == 1
