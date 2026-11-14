import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def friend(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "friend", "password": "password1"})
    return other


def url(card="card-1", board=1):
    return f"/api/boards/{board}/cards/{card}/comments"


def comment(client, body="Looks good", card="card-1", board=1):
    return client.post(url(card, board), json={"body": body})


def test_comments_require_session(anonymous):
    assert anonymous.get(url()).status_code == 401
    assert anonymous.post(url(), json={"body": "x"}).status_code == 401
    assert anonymous.delete("/api/boards/1/comments/1").status_code == 401
    assert anonymous.get("/api/boards/1/comment-counts").status_code == 401


def test_a_card_starts_with_no_comments(client):
    assert client.get(url()).json() == []
    assert client.get("/api/boards/1/comment-counts").json() == {}


def test_add_and_list_comments_oldest_first(client):
    first = comment(client, "First")
    assert first.status_code == 201
    assert first.json()["username"] == "user"
    assert first.json()["body"] == "First"
    comment(client, "Second")
    listed = client.get(url()).json()
    assert [c["body"] for c in listed] == ["First", "Second"]
    assert listed[0] == first.json()
    assert listed[0]["createdAt"].startswith("20")


def test_comments_belong_to_their_card(client):
    comment(client, "On one", "card-1")
    comment(client, "On two", "card-2")
    comment(client, "More on two", "card-2")
    assert [c["body"] for c in client.get(url("card-1")).json()] == ["On one"]
    assert client.get("/api/boards/1/comment-counts").json() == {"card-1": 1, "card-2": 2}


@pytest.mark.parametrize("body", ["", "x" * 2001])
def test_rejects_empty_and_oversized_comments(client, body):
    assert comment(client, body).status_code == 422
    assert client.get(url()).json() == []


def test_unknown_card_is_not_found(client):
    assert client.get(url("nope")).status_code == 404
    assert comment(client, card="nope").status_code == 404


def test_comments_are_recorded_in_activity(client):
    comment(client)
    assert client.get("/api/boards/1/activity").json()[0]["message"] == 'commented on "Align roadmap themes"'


def test_viewers_can_read_but_not_comment(client, friend):
    comment(client, "Hello")
    client.put("/api/boards/1/members/friend", json={"role": "viewer"})
    assert [c["body"] for c in friend.get(url()).json()] == ["Hello"]
    assert friend.get("/api/boards/1/comment-counts").json() == {"card-1": 1}
    assert comment(friend, "Nope").status_code == 403
    assert len(client.get(url()).json()) == 1


def test_editors_can_comment(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    assert comment(friend, "From friend").json()["username"] == "friend"
    assert [c["username"] for c in client.get(url()).json()] == ["friend"]


def test_strangers_cannot_see_or_add_comments(client, friend):
    comment(client)
    assert friend.get(url()).status_code == 404
    assert comment(friend).status_code == 404
    assert friend.get("/api/boards/1/comment-counts").status_code == 404
    assert friend.delete("/api/boards/1/comments/1").status_code == 404


def test_authors_and_the_owner_can_delete_but_others_cannot(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    third = TestClient(app)
    third.post("/api/auth/register", json={"username": "third", "password": "password1"})
    client.put("/api/boards/1/members/third", json={"role": "editor"})

    own = comment(client, "Owner's").json()["id"]
    theirs = comment(friend, "Friend's").json()["id"]
    other = comment(third, "Third's").json()["id"]

    assert friend.delete(f"/api/boards/1/comments/{own}").status_code == 403
    assert friend.delete(f"/api/boards/1/comments/{theirs}").status_code == 204
    assert client.delete(f"/api/boards/1/comments/{other}").status_code == 204  # the owner removes anyone's
    assert [c["body"] for c in client.get(url()).json()] == ["Owner's"]
    assert client.delete(f"/api/boards/1/comments/{theirs}").status_code == 404


def test_comment_ids_cannot_be_used_across_boards(client):
    second = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    board = client.get(f"/api/boards/{second}").json()
    board["cards"]["c"] = {"id": "c", "title": "C", "details": ""}
    board["columns"][0]["cardIds"].append("c")
    client.put(f"/api/boards/{second}", json=board)
    other = comment(client, "On second", "c", second).json()["id"]
    assert client.delete(f"/api/boards/1/comments/{other}").status_code == 404
    assert client.get(url("c", second)).json()[0]["body"] == "On second"


def test_comments_survive_board_saves(client):
    comment(client)
    board = client.get("/api/boards/1").json()
    board["cards"]["card-1"]["title"] = "Renamed"
    board["columns"][0]["cardIds"].reverse()
    client.put("/api/boards/1", json=board)
    assert len(client.get(url()).json()) == 1


def test_deleting_a_card_deletes_its_comments(client):
    comment(client, card="card-1")
    comment(client, card="card-2")
    board = client.get("/api/boards/1").json()
    del board["cards"]["card-1"]
    board["columns"][0]["cardIds"].remove("card-1")
    client.put("/api/boards/1", json=board)
    assert client.get("/api/boards/1/comment-counts").json() == {"card-2": 1}
    assert client.get(url("card-1")).status_code == 404


def test_deleting_a_board_deletes_its_comments(client):
    from app.db import connect

    second = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    board = client.get(f"/api/boards/{second}").json()
    board["cards"]["c"] = {"id": "c", "title": "C", "details": ""}
    board["columns"][0]["cardIds"].append("c")
    client.put(f"/api/boards/{second}", json=board)
    comment(client, card="c", board=second)
    client.delete(f"/api/boards/{second}")
    conn = connect()
    assert conn.execute("SELECT COUNT(*) FROM comments").fetchone()[0] == 0
    conn.close()


def test_comments_stay_after_their_author_deletes_their_account(client, friend):
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    comment(friend, "Parting words")
    friend.request("DELETE", "/api/auth/me", json={"password": "password1"})
    listed = client.get(url()).json()
    assert [(c["username"], c["body"]) for c in listed] == [(None, "Parting words")]
    assert client.delete(f"/api/boards/1/comments/{listed[0]['id']}").status_code == 204
