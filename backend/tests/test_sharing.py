import pytest
from fastapi.testclient import TestClient

from app.main import app


def sign_up(username):
    """A separate client signed in as a new user."""
    other = TestClient(app)
    other.__enter__()
    assert other.post("/api/auth/register", json={"username": username, "password": "password1"}).status_code == 201
    return other


@pytest.fixture
def friend(client):
    other = sign_up("friend")
    yield other
    other.__exit__(None, None, None)


def share(client, username="friend", role="editor", board=1):
    return client.put(f"/api/boards/{board}/members/{username}", json={"role": role})


def test_members_require_session(anonymous):
    assert anonymous.get("/api/boards/1/members").status_code == 401
    assert anonymous.put("/api/boards/1/members/friend", json={"role": "editor"}).status_code == 401
    assert anonymous.delete("/api/boards/1/members/friend").status_code == 401


def test_unshared_board_is_invisible(client, friend):
    assert friend.get("/api/boards/1").status_code == 404
    assert friend.get("/api/boards/1/members").status_code == 404
    assert friend.get("/api/boards").json() == [{"id": 2, "name": "My Board", "owner": "friend", "role": "owner"}]


def test_owner_lists_members(client, friend):
    assert client.get("/api/boards/1/members").json() == [{"username": "user", "role": "owner"}]
    share(client)
    assert client.get("/api/boards/1/members").json() == [
        {"username": "user", "role": "owner"},
        {"username": "friend", "role": "editor"},
    ]


def test_shared_board_appears_in_list_with_role_and_owner(client, friend):
    assert share(client, role="viewer").json() == {"username": "friend", "role": "viewer"}
    assert friend.get("/api/boards").json() == [
        {"id": 1, "name": "My Board", "owner": "user", "role": "viewer"},
        {"id": 2, "name": "My Board", "owner": "friend", "role": "owner"},
    ]


def test_editor_can_read_edit_and_chat_but_not_manage(client, friend, monkeypatch):
    share(client, role="editor")
    board = friend.get("/api/boards/1").json()
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"
    board["cards"]["card-1"]["title"] = "Edited by friend"
    assert friend.put("/api/boards/1", json=board).status_code == 200
    assert client.get("/api/boards/1").json()["cards"]["card-1"]["title"] == "Edited by friend"

    assert friend.get("/api/boards/1/members").status_code == 200
    assert friend.patch("/api/boards/1", json={"name": "Mine"}).status_code == 403
    assert friend.delete("/api/boards/1").status_code == 403
    assert share(friend, "user", "viewer").status_code == 403
    assert share(friend, "someone", "viewer").status_code == 403


def test_viewer_can_read_but_not_change(client, friend):
    share(client, role="viewer")
    board = friend.get("/api/boards/1").json()
    assert board["cards"]
    board["cards"]["card-1"]["title"] = "Nope"
    assert friend.put("/api/boards/1", json=board).status_code == 403
    assert friend.post("/api/boards/1/chat", json={"message": "Hi"}).status_code == 403
    assert friend.patch("/api/boards/1", json={"name": "Mine"}).status_code == 403
    assert friend.delete("/api/boards/1").status_code == 403
    assert client.get("/api/boards/1").json()["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_changing_a_role_takes_effect(client, friend):
    share(client, role="viewer")
    board = friend.get("/api/boards/1").json()
    assert friend.put("/api/boards/1", json=board).status_code == 403
    share(client, role="editor")
    assert friend.put("/api/boards/1", json=board).status_code == 200
    assert len(client.get("/api/boards/1/members").json()) == 2


def test_username_lookup_ignores_case(client, friend):
    assert share(client, "FRIEND").json()["username"] == "friend"


def test_cannot_share_with_unknown_user_yourself_or_with_a_bad_role(client, friend):
    assert share(client, "nobody").status_code == 404
    assert share(client, "user").status_code == 409
    assert share(client, "friend", "owner").status_code == 422
    assert share(client, "friend", "admin").status_code == 422
    assert client.get("/api/boards/1/members").json() == [{"username": "user", "role": "owner"}]


def test_owner_removes_a_member(client, friend):
    share(client)
    assert client.delete("/api/boards/1/members/friend").status_code == 204
    assert friend.get("/api/boards/1").status_code == 404
    assert client.delete("/api/boards/1/members/friend").status_code == 404
    assert client.delete("/api/boards/1/members/user").status_code == 404


def test_member_can_leave_but_not_remove_others(client, friend):
    third = sign_up("third")
    share(client, "friend")
    share(client, "third")
    assert friend.delete("/api/boards/1/members/third").status_code == 403
    assert friend.delete("/api/boards/1/members/friend").status_code == 204
    assert friend.get("/api/boards/1").status_code == 404
    assert third.get("/api/boards/1").status_code == 200
    third.__exit__(None, None, None)


def test_non_members_cannot_manage_members(client, friend):
    assert share(friend, "user", "editor", board=1).status_code == 404
    assert friend.delete("/api/boards/1/members/user").status_code == 404


def test_deleting_a_board_removes_its_memberships(client, friend):
    second = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    share(client, board=second)
    assert friend.get(f"/api/boards/{second}").status_code == 200
    client.delete(f"/api/boards/{second}")
    assert friend.get(f"/api/boards/{second}").status_code == 404
    assert [b["id"] for b in friend.get("/api/boards").json()] == [2]


def test_deleting_a_member_account_removes_their_access(client, friend):
    share(client)
    assert friend.request("DELETE", "/api/auth/me", json={"password": "password1"}).status_code == 204
    assert client.get("/api/boards/1/members").json() == [{"username": "user", "role": "owner"}]


def test_member_can_keep_their_own_boards_independent(client, friend):
    share(client)
    created = friend.post("/api/boards", json={"name": "Friend only"}).json()
    assert client.get(f"/api/boards/{created['id']}").status_code == 404
    assert friend.delete("/api/boards/2").status_code == 204
