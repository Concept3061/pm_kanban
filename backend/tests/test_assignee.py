import copy

import pytest
from fastapi.testclient import TestClient

from app.main import app
from tests.test_chat import model, nested_board, with_update  # noqa: F401


@pytest.fixture
def friend(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "friend", "password": "password1"})
    yield other


def assign(client, card="card-1", assignee="user", board=1):
    data = client.get(f"/api/boards/{board}").json()
    data["cards"][card]["assignee"] = assignee
    return client.put(f"/api/boards/{board}", json=data), data


def test_cards_start_unassigned(client):
    assert all(card["assignee"] == "" for card in client.get("/api/boards/1").json()["cards"].values())


def test_owner_can_assign_to_self_and_unassign(client):
    response, data = assign(client, assignee="user")
    assert response.status_code == 200
    assert client.get("/api/boards/1").json() == data
    assert data["cards"]["card-1"]["assignee"] == "user"
    response, _ = assign(client, assignee="")
    assert response.json()["cards"]["card-1"]["assignee"] == ""


def test_can_assign_to_a_member_but_not_a_stranger(client, friend):
    assert assign(client, assignee="friend")[0].status_code == 422
    client.put("/api/boards/1/members/friend", json={"role": "viewer"})
    assert assign(client, assignee="friend")[0].status_code == 200
    assert assign(client, assignee="nobody")[0].status_code == 422
    assert assign(client, assignee="FRIEND")[0].status_code == 422  # must be the exact username


def test_rejected_assignment_leaves_the_board_alone(client):
    before = client.get("/api/boards/1").json()
    assert assign(client, assignee="nobody")[0].status_code == 422
    assert client.get("/api/boards/1").json() == before


def test_removing_a_member_unassigns_their_cards(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    assign(client, "card-1", "friend")
    assign(client, "card-2", "user")
    client.delete("/api/boards/1/members/friend")
    cards = client.get("/api/boards/1").json()["cards"]
    assert (cards["card-1"]["assignee"], cards["card-2"]["assignee"]) == ("", "user")


def test_leaving_a_board_unassigns_their_cards(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    assign(client, "card-1", "friend")
    friend.delete("/api/boards/1/members/friend")
    assert client.get("/api/boards/1").json()["cards"]["card-1"]["assignee"] == ""


def test_deleting_an_account_unassigns_their_cards(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    assign(client, "card-1", "friend")
    friend.request("DELETE", "/api/auth/me", json={"password": "password1"})
    data = client.get("/api/boards/1").json()
    assert data["cards"]["card-1"]["assignee"] == ""
    # The board can still be saved afterwards.
    assert client.put("/api/boards/1", json=data).status_code == 200


def test_assignment_is_recorded_in_activity(client):
    assign(client, assignee="user")
    assign(client, assignee="")
    messages = [e["message"] for e in client.get("/api/boards/1/activity").json()]
    assert messages == ['unassigned "Align roadmap themes"', 'assigned "Align roadmap themes" to user']


def test_model_is_told_who_can_be_assigned(client, friend, model):  # noqa: F811
    client.put("/api/boards/1/members/friend", json={"role": "viewer"})
    client.post("/api/boards/1/chat", json={"message": "Hi"})
    assert "People who can be assigned cards: friend, user" in model.calls[0][0][0]["content"]


def test_ai_can_assign_cards(client, friend, model):  # noqa: F811
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    update = nested_board(client)
    update["columns"][0]["cards"][0]["assignee"] = "friend"
    model.response = with_update(update)
    board = client.post("/api/boards/1/chat", json={"message": "Give card 1 to friend"}).json()["board"]
    assert board["cards"]["card-1"]["assignee"] == "friend"


def test_ai_cannot_assign_to_an_invented_user(client, model):  # noqa: F811
    before = client.get("/api/boards/1").json()
    update = copy.deepcopy(nested_board(client))
    update["columns"][0]["cards"][0]["assignee"] = "ghost"
    model.response = with_update(update)
    assert client.post("/api/boards/1/chat", json={"message": "Assign"}).status_code == 502
    assert client.get("/api/boards/1").json() == before


def test_migrates_cards_to_assignees(db_path):
    import sqlite3

    from tests.test_db import OLD_SCHEMA

    db_path.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(OLD_SCHEMA)
    conn.close()
    with TestClient(app) as client:
        client.cookies.set("session", "old-token")
        assert client.get("/api/boards/1").json()["cards"]["c1"]["assignee"] == ""
