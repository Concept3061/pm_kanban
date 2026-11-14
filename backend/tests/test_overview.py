from fastapi.testclient import TestClient

from app.main import app


def test_overview_requires_session(anonymous):
    assert anonymous.get("/api/overview").status_code == 401


def test_overview_of_the_seeded_board(client):
    data = client.get("/api/overview").json()
    assert data["totals"] == {"boards": 1, "cards": 8, "overdue": 0, "highPriority": 1}
    board = data["boards"][0]
    assert (board["id"], board["name"], board["role"], board["owner"]) == (1, "My Board", "owner", "user")
    assert [(c["title"], c["count"]) for c in board["columns"]] == [
        ("Backlog", 2),
        ("Discovery", 1),
        ("In Progress", 2),
        ("Review", 1),
        ("Done", 2),
    ]
    assert (board["cards"], board["overdue"], board["highPriority"]) == (8, 0, 1)


def test_counts_overdue_and_high_priority(client):
    board = client.get("/api/boards/1").json()
    board["cards"]["card-1"]["dueDate"] = "2000-01-01"
    board["cards"]["card-2"].update(dueDate="2999-01-01", priority="high")
    board["cards"]["card-3"]["dueDate"] = "2000-06-01"
    client.put("/api/boards/1", json=board)
    stats = client.get("/api/overview").json()["boards"][0]
    assert (stats["overdue"], stats["highPriority"]) == (2, 2)


def test_empty_board_and_empty_columns_count_zero(client):
    second = client.post("/api/boards", json={"name": "Empty"}).json()["id"]
    data = client.get("/api/overview").json()
    empty = next(b for b in data["boards"] if b["id"] == second)
    assert (empty["cards"], empty["overdue"], empty["highPriority"]) == (0, 0, 0)
    assert [c["count"] for c in empty["columns"]] == [0, 0, 0]
    assert data["totals"]["boards"] == 2
    assert data["totals"]["cards"] == 8


def test_includes_shared_boards_but_not_others(client):
    other = TestClient(app)
    other.post("/api/auth/register", json={"username": "friend", "password": "password1"})
    assert [b["id"] for b in other.get("/api/overview").json()["boards"]] == [2]
    client.put("/api/boards/1/members/friend", json={"role": "viewer"})
    data = other.get("/api/overview").json()
    assert [(b["id"], b["role"]) for b in data["boards"]] == [(1, "viewer"), (2, "owner")]
    assert data["totals"]["cards"] == 8
    assert [b["id"] for b in client.get("/api/overview").json()["boards"]] == [1]
