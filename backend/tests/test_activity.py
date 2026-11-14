import copy

from fastapi.testclient import TestClient

from app.board import BoardData, describe_changes
from app.main import app
from tests.test_chat import model, nested_board, with_update  # noqa: F401


def activity(client, board=1):
    return client.get(f"/api/boards/{board}/activity").json()


def messages(client, board=1):
    return [entry["message"] for entry in activity(client, board)]


def test_activity_requires_session(anonymous):
    assert anonymous.get("/api/boards/1/activity").status_code == 401


def test_new_board_has_no_activity(client):
    assert activity(client) == []


def test_unchanged_save_records_nothing(client):
    client.put("/api/boards/1", json=client.get("/api/boards/1").json())
    assert activity(client) == []


def test_records_who_changed_what_newest_first(client):
    board = client.get("/api/boards/1").json()
    board["cards"]["card-1"]["title"] = "Renamed card"
    client.put("/api/boards/1", json=board)
    board["columns"][0]["cardIds"].remove("card-1")
    board["columns"][4]["cardIds"].append("card-1")
    client.put("/api/boards/1", json=board)

    entries = activity(client)
    assert [entry["message"] for entry in entries] == [
        'moved "Renamed card" from Backlog to Done',
        'edited card "Align roadmap themes"',
    ]
    assert entries[0]["username"] == "user"
    assert entries[0]["viaAi"] is False
    assert entries[0]["createdAt"].startswith("20")


def test_describes_every_kind_of_change():
    old = BoardData.model_validate(
        {
            "columns": [
                {"id": "a", "title": "A", "cardIds": ["1", "2"]},
                {"id": "b", "title": "B", "cardIds": ["3"]},
                {"id": "c", "title": "C", "cardIds": []},
            ],
            "cards": {k: {"id": k, "title": f"Card {k}", "details": ""} for k in "123"},
        }
    )
    new = copy.deepcopy(old).model_dump()
    new["columns"][0]["title"] = "Alpha"
    new["columns"][0]["cardIds"] = ["1"]
    new["columns"][1]["cardIds"] = ["3", "2"]
    new["columns"].pop()
    new["columns"].append({"id": "d", "title": "D", "cardIds": ["4"]})
    new["cards"]["4"] = {"id": "4", "title": "Card 4", "details": ""}
    new["cards"]["1"]["priority"] = "high"
    del new["cards"]["3"]
    new["columns"][1]["cardIds"].remove("3")

    assert describe_changes(old, BoardData.model_validate(new)) == [
        'renamed column "A" to "Alpha"',
        'added column "D"',
        'deleted column "C"',
        'edited card "Card 1"',
        'moved "Card 2" from A to B',
        'added card "Card 4" to D',
        'deleted card "Card 3"',
    ]


def test_reordering_within_a_column_is_not_an_event(client):
    board = client.get("/api/boards/1").json()
    board["columns"][0]["cardIds"].reverse()
    client.put("/api/boards/1", json=board)
    assert activity(client) == []


def test_rejected_save_records_nothing(client):
    board = client.get("/api/boards/1").json()
    board["cards"]["card-1"]["title"] = ""
    assert client.put("/api/boards/1", json=board).status_code == 422
    assert activity(client) == []


def test_ai_changes_are_marked(client, model):  # noqa: F811
    update = nested_board(client)
    update["columns"][0]["cards"].append(
        {"id": "card-ai-1", "title": "From AI", "details": "", "priority": "none", "dueDate": "", "assignee": ""}
    )
    model.response = with_update(update)
    client.post("/api/boards/1/chat", json={"message": "Add a card"})
    entries = activity(client)
    assert entries == [{**entries[0], "message": 'added card "From AI" to Backlog', "viaAi": True, "username": "user"}]


def test_members_see_activity_and_are_named(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "friend", "password": "password1"})
    client.put("/api/boards/1/members/friend", json={"role": "editor"})
    board = other.get("/api/boards/1").json()
    board["cards"]["card-1"]["details"] = "Changed"
    other.put("/api/boards/1", json=board)
    entries = activity(client)
    assert [(e["username"], e["message"]) for e in entries] == [("friend", 'edited card "Align roadmap themes"')]


def test_activity_is_private_to_members(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "stranger", "password": "password1"})
    assert other.get("/api/boards/1/activity").status_code == 404


def test_activity_is_limited_to_the_latest_entries(client):
    board = client.get("/api/boards/1").json()
    for i in range(55):
        board["cards"]["card-1"]["title"] = f"Title {i}"
        client.put("/api/boards/1", json=board)
    entries = activity(client)
    assert len(entries) == 50
    assert entries[0]["message"] == 'edited card "Title 53"'


def test_deleted_user_activity_remains_without_a_name(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "gone", "password": "password1"})
    client.put("/api/boards/1/members/gone", json={"role": "editor"})
    board = other.get("/api/boards/1").json()
    board["cards"]["card-1"]["details"] = "Changed"
    other.put("/api/boards/1", json=board)
    other.request("DELETE", "/api/auth/me", json={"password": "password1"})
    assert [(e["username"], e["message"]) for e in activity(client)] == [(None, 'edited card "Align roadmap themes"')]
