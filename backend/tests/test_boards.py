def test_boards_require_session(anonymous):
    assert anonymous.get("/api/boards").status_code == 401
    assert anonymous.post("/api/boards", json={"name": "X"}).status_code == 401
    assert anonymous.patch("/api/boards/1", json={"name": "X"}).status_code == 401
    assert anonymous.delete("/api/boards/1").status_code == 401


def test_lists_the_seeded_board(client):
    assert client.get("/api/boards").json() == [{"id": 1, "name": "My Board", "owner": "user", "role": "owner"}]


def test_create_board_has_default_empty_columns(client):
    response = client.post("/api/boards", json={"name": "Launch"})
    assert response.status_code == 201
    created = response.json()
    assert created["name"] == "Launch"
    board = client.get(f"/api/boards/{created['id']}").json()
    assert [column["title"] for column in board["columns"]] == ["To Do", "In Progress", "Done"]
    assert board["cards"] == {}
    assert [b["name"] for b in client.get("/api/boards").json()] == ["My Board", "Launch"]


def test_boards_are_independent(client):
    second = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    board = client.get(f"/api/boards/{second}").json()
    board["cards"]["c1"] = {"id": "c1", "title": "Only here", "details": ""}
    board["columns"][0]["cardIds"].append("c1")
    assert client.put(f"/api/boards/{second}", json=board).status_code == 200
    assert "c1" not in client.get("/api/boards/1").json()["cards"]


def test_rename_board(client):
    assert client.patch("/api/boards/1", json={"name": "Renamed"}).json() == {"id": 1, "name": "Renamed"}
    assert client.get("/api/boards").json() == [{"id": 1, "name": "Renamed", "owner": "user", "role": "owner"}]


def test_board_name_must_not_be_empty(client):
    assert client.post("/api/boards", json={"name": ""}).status_code == 422
    assert client.patch("/api/boards/1", json={"name": ""}).status_code == 422


def test_delete_board_removes_its_cards(client):
    second = client.post("/api/boards", json={"name": "Second"}).json()["id"]
    assert client.delete(f"/api/boards/{second}").status_code == 204
    assert client.get(f"/api/boards/{second}").status_code == 404
    assert [b["id"] for b in client.get("/api/boards").json()] == [1]
    assert client.get("/api/boards/1").status_code == 200


def test_cannot_delete_only_board(client):
    assert client.delete("/api/boards/1").status_code == 409
    assert client.get("/api/boards/1").status_code == 200


def test_unknown_board_is_not_found(client):
    assert client.get("/api/boards/99").status_code == 404
    assert client.patch("/api/boards/99", json={"name": "X"}).status_code == 404
    assert client.delete("/api/boards/99").status_code == 404
    assert client.post("/api/boards/99/chat", json={"message": "Hi"}).status_code == 404


def test_other_users_cannot_see_or_change_my_boards(client, anonymous):
    client.post("/api/auth/logout")
    anonymous.post("/api/auth/register", json={"username": "newbie", "password": "password1"})
    assert anonymous.get("/api/boards").json() == [{"id": 2, "name": "My Board", "owner": "newbie", "role": "owner"}]
    for response in (
        anonymous.get("/api/boards/1"),
        anonymous.patch("/api/boards/1", json={"name": "Mine now"}),
        anonymous.delete("/api/boards/1"),
        anonymous.post("/api/boards/1/chat", json={"message": "Hi"}),
    ):
        assert response.status_code == 404
