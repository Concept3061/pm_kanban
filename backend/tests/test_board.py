import copy

import pytest
from fastapi.testclient import TestClient

from app.db import connect, create_user
from app.main import app


def test_board_requires_session(anonymous):
    assert anonymous.get("/api/boards/1").status_code == 401
    assert anonymous.put("/api/boards/1", json={"columns": [], "cards": {}}).status_code == 401


def test_reads_seeded_board_in_order(client):
    board = client.get("/api/boards/1").json()
    assert [column["title"] for column in board["columns"]] == [
        "Backlog",
        "Discovery",
        "In Progress",
        "Review",
        "Done",
    ]
    assert board["columns"][0]["cardIds"] == ["card-1", "card-2"]
    assert board["cards"]["card-1"]["title"] == "Align roadmap themes"


def test_write_round_trip(client):
    board = client.get("/api/boards/1").json()
    board["columns"][0]["title"] = "Renamed"
    board["columns"][0]["cardIds"] = ["card-2"]
    board["columns"][1]["cardIds"] = ["card-1", "card-3"]
    board["cards"]["card-1"]["details"] = "Edited"
    board["cards"]["card-new"] = {"id": "card-new", "title": "New", "details": "", "priority": "none", "dueDate": "", "assignee": ""}
    board["columns"][4]["cardIds"].insert(0, "card-new")
    del board["cards"]["card-6"]
    board["columns"][3]["cardIds"] = []

    response = client.put("/api/boards/1", json=board)
    assert response.status_code == 200
    assert response.json() == board
    assert client.get("/api/boards/1").json() == board


def test_changes_survive_restart(client):
    board = client.get("/api/boards/1").json()
    board["columns"][0]["title"] = "Persisted"
    client.put("/api/boards/1", json=board)
    token = client.cookies["session"]

    with TestClient(app) as restarted:
        restarted.cookies.set("session", token)
        assert restarted.get("/api/boards/1").json() == board


def test_users_have_separate_boards(client):
    board = client.get("/api/boards/1").json()
    board["columns"][0]["title"] = "Only mine"
    del board["cards"]["card-1"]
    board["columns"][0]["cardIds"].remove("card-1")
    client.put("/api/boards/1", json=board)

    conn = connect()
    other_id = create_user(conn, "other", "password", demo=True)
    with conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES ('other-token', ?)", (other_id,))
    conn.close()

    with TestClient(app) as other:
        other.cookies.set("session", "other-token")
        other_board = other.get("/api/boards/2").json()
        assert other_board["columns"][0]["title"] == "Backlog"
        assert "card-1" in other_board["cards"]
        other_board["columns"][1]["title"] = "Theirs"
        assert other.put("/api/boards/2", json=other_board).status_code == 200
        # Neither user can reach the other board.
        assert other.get("/api/boards/1").status_code == 404
        assert other.put("/api/boards/1", json=other_board).status_code == 404
        assert client.get("/api/boards/2").status_code == 404

    assert client.get("/api/boards/1").json() == board


def duplicate_column_id(board):
    board["columns"][1]["id"] = board["columns"][0]["id"]


def blank_column_title(board):
    board["columns"][0]["title"] = ""


def blank_card_title(board):
    board["cards"]["card-1"]["title"] = ""


def unknown_card_in_column(board):
    board["columns"][0]["cardIds"].append("card-missing")


def card_in_two_columns(board):
    board["columns"][1]["cardIds"].append("card-1")


def card_twice_in_one_column(board):
    board["columns"][0]["cardIds"].append("card-1")


def orphaned_card(board):
    board["columns"][0]["cardIds"].remove("card-1")


def mismatched_card_key(board):
    board["cards"]["card-1"]["id"] = "card-other"


@pytest.mark.parametrize(
    "corrupt",
    [
        duplicate_column_id,
        blank_column_title,
        blank_card_title,
        unknown_card_in_column,
        card_in_two_columns,
        card_twice_in_one_column,
        orphaned_card,
        mismatched_card_key,
    ],
)
def test_rejects_invalid_board_and_keeps_stored_one(client, corrupt):
    original = client.get("/api/boards/1").json()
    board = copy.deepcopy(original)
    corrupt(board)
    assert client.put("/api/boards/1", json=board).status_code == 422
    assert client.get("/api/boards/1").json() == original


def test_columns_can_be_added_removed_and_reordered(client):
    board = client.get("/api/boards/1").json()
    board["columns"].append({"id": "col-extra", "title": "Extra", "cardIds": []})
    board["columns"].reverse()
    assert client.put("/api/boards/1", json=board).status_code == 200
    stored = client.get("/api/boards/1").json()
    assert [column["id"] for column in stored["columns"]][:2] == ["col-extra", "col-done"]
    assert stored == board

    # Removing a column removes it for good, once its cards are moved or deleted.
    board["columns"] = [column for column in board["columns"] if column["id"] != "col-done"]
    board["cards"] = {k: v for k, v in board["cards"].items() if k not in ("card-7", "card-8")}
    assert client.put("/api/boards/1", json=board).status_code == 200
    assert client.get("/api/boards/1").json() == board


def test_card_priority_and_due_date_round_trip(client):
    board = client.get("/api/boards/1").json()
    assert board["cards"]["card-1"]["priority"] == "high"
    assert board["cards"]["card-3"] == {
        "id": "card-3",
        "title": "Prototype analytics view",
        "details": "Sketch initial dashboard layout and key drill-downs.",
        "priority": "none",
        "dueDate": "",
        "assignee": "",
    }
    board["cards"]["card-3"]["priority"] = "low"
    board["cards"]["card-3"]["dueDate"] = "2030-02-28"
    assert client.put("/api/boards/1", json=board).status_code == 200
    assert client.get("/api/boards/1").json() == board


def test_card_fields_default_when_omitted(client):
    board = client.get("/api/boards/1").json()
    board["cards"]["card-new"] = {"id": "card-new", "title": "Bare", "details": ""}
    board["columns"][0]["cardIds"].append("card-new")
    stored = client.put("/api/boards/1", json=board).json()
    assert stored["cards"]["card-new"]["priority"] == "none"
    assert stored["cards"]["card-new"]["dueDate"] == ""


@pytest.mark.parametrize(
    "field,value",
    [
        ("priority", "urgent"),
        ("priority", ""),
        ("dueDate", "tomorrow"),
        ("dueDate", "2030-02-30"),
        ("dueDate", "2030-2-3"),
    ],
)
def test_rejects_invalid_card_fields(client, field, value):
    original = client.get("/api/boards/1").json()
    board = copy.deepcopy(original)
    board["cards"]["card-1"][field] = value
    assert client.put("/api/boards/1", json=board).status_code == 422
    assert client.get("/api/boards/1").json() == original
