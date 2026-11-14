import json
import re
import sqlite3
from pathlib import Path

from fastapi.testclient import TestClient

from app.db import SEED_CARDS, SEED_COLUMNS, connect, init_db
from app.main import app


def count(path, table):
    conn = sqlite3.connect(path)
    try:
        return conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        conn.close()


def test_creates_database_and_directory_if_missing(db_path):
    assert not db_path.exists()
    with TestClient(app):
        assert db_path.exists()
    assert count(db_path, "users") == 1
    assert count(db_path, "boards") == 1
    assert count(db_path, "board_columns") == len(SEED_COLUMNS)
    assert count(db_path, "cards") == len(SEED_CARDS)


def test_seed_runs_only_once(db_path):
    init_db()
    init_db()
    assert count(db_path, "users") == 1
    assert count(db_path, "cards") == len(SEED_CARDS)


def test_database_matches_documented_schema(db_path):
    init_db()
    documented = json.loads((Path(__file__).parents[2] / "docs" / "schema.json").read_text())["tables"]
    conn = connect()
    actual = {
        row["name"]: row["sql"]
        for row in conn.execute("SELECT name, sql FROM sqlite_master WHERE type = 'table'")
    }
    assert set(actual) == set(documented)
    for table, spec in documented.items():
        columns = conn.execute(f"PRAGMA table_info({table})").fetchall()
        assert [column["name"] for column in columns] == list(spec["columns"])
        for name, definition in spec["columns"].items():
            assert re.search(rf"\b{name} {re.escape(definition)}", actual[table]), (table, name)
        for key in spec.get("foreign_keys", []):
            assert key in actual[table]
        if "primary_key" in spec:
            assert f"PRIMARY KEY ({', '.join(spec['primary_key'])})" in actual[table]
    conn.close()


OLD_SCHEMA = """
CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT NOT NULL UNIQUE);
CREATE TABLE sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE boards (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE);
CREATE TABLE board_columns (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    id TEXT NOT NULL, title TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (board_id, id));
CREATE TABLE cards (
    board_id INTEGER NOT NULL, id TEXT NOT NULL, column_id TEXT NOT NULL, title TEXT NOT NULL,
    details TEXT NOT NULL, position INTEGER NOT NULL, PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id, column_id) REFERENCES board_columns(board_id, id) ON DELETE CASCADE);
INSERT INTO users VALUES (1, 'user');
INSERT INTO sessions VALUES ('old-token', 1);
INSERT INTO boards VALUES (1, 1);
INSERT INTO board_columns VALUES (1, 'col-a', 'Mine', 0);
INSERT INTO cards VALUES (1, 'c1', 'col-a', 'Kept', '', 0);
"""


def test_migrates_single_board_database(db_path):
    db_path.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(OLD_SCHEMA)
    conn.close()

    with TestClient(app) as client:
        client.cookies.set("session", "old-token")
        assert client.get("/api/boards").json() == [{"id": 1, "name": "My Board", "owner": "user", "role": "owner"}]
        assert client.get("/api/boards/1").json()["cards"]["c1"]["title"] == "Kept"
        assert client.post("/api/boards", json={"name": "Second"}).status_code == 201
        client.cookies.clear()
        login = client.post("/api/auth/login", json={"username": "user", "password": "password"})
        assert login.status_code == 200


def test_migrates_cards_to_priority_and_due_date(db_path):
    db_path.parent.mkdir(parents=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(OLD_SCHEMA)
    conn.close()
    with TestClient(app) as client:
        client.cookies.set("session", "old-token")
        card = client.get("/api/boards/1").json()["cards"]["c1"]
        assert (card["priority"], card["dueDate"]) == ("none", "")
        board = client.get("/api/boards/1").json()
        board["cards"]["c1"].update(priority="high", dueDate="2030-01-01")
        assert client.put("/api/boards/1", json=board).status_code == 200
    with TestClient(app) as restarted:
        restarted.cookies.set("session", "old-token")
        assert restarted.get("/api/boards/1").json() == board
    assert sqlite3.connect(db_path).execute("PRAGMA user_version").fetchone()[0] == 4
