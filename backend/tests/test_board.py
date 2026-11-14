import copy

import pytest
from fastapi.testclient import TestClient

from app.db import connect, create_user
from app.main import app


def test_board_requires_session(anonymous):
    assert anonymous.get("/api/board").status_code == 401
    assert anonymous.put("/api/board", json={"columns": [], "cards": {}}).status_code == 401


def test_reads_seeded_board_in_order(client):
    board = client.get("/api/board").json()
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
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Renamed"
    board["columns"][0]["cardIds"] = ["card-2"]
    board["columns"][1]["cardIds"] = ["card-1", "card-3"]
    board["cards"]["card-1"]["details"] = "Edited"
    board["cards"]["card-new"] = {"id": "card-new", "title": "New", "details": ""}
    board["columns"][4]["cardIds"].insert(0, "card-new")
    del board["cards"]["card-6"]
    board["columns"][3]["cardIds"] = []

    response = client.put("/api/board", json=board)
    assert response.status_code == 200
    assert response.json() == board
    assert client.get("/api/board").json() == board


def test_changes_survive_restart(client):
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Persisted"
    client.put("/api/board", json=board)
    token = client.cookies["session"]

    with TestClient(app) as restarted:
        restarted.cookies.set("session", token)
        assert restarted.get("/api/board").json() == board


def test_users_have_separate_boards(client):
    board = client.get("/api/board").json()
    board["columns"][0]["title"] = "Only mine"
    del board["cards"]["card-1"]
    board["columns"][0]["cardIds"].remove("card-1")
    client.put("/api/board", json=board)

    conn = connect()
    other_id = create_user(conn, "other")
    with conn:
        conn.execute("INSERT INTO sessions (token, user_id) VALUES ('other-token', ?)", (other_id,))
    conn.close()

    with TestClient(app) as other:
        other.cookies.set("session", "other-token")
        other_board = other.get("/api/board").json()
        assert other_board["columns"][0]["title"] == "Backlog"
        assert "card-1" in other_board["cards"]
        other_board["columns"][1]["title"] = "Theirs"
        assert other.put("/api/board", json=other_board).status_code == 200

    assert client.get("/api/board").json() == board


def add_column(board):
    board["columns"].append({"id": "col-extra", "title": "Extra", "cardIds": []})


def remove_column(board):
    board["columns"].pop()


def reorder_columns(board):
    board["columns"].reverse()


def rename_column_id(board):
    board["columns"][0]["id"] = "col-other"


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
        add_column,
        remove_column,
        reorder_columns,
        rename_column_id,
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
    original = client.get("/api/board").json()
    board = copy.deepcopy(original)
    corrupt(board)
    assert client.put("/api/board", json=board).status_code == 422
    assert client.get("/api/board").json() == original
