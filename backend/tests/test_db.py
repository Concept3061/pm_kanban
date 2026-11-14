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
