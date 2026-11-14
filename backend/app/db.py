import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS board_columns (
    board_id INTEGER NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (board_id, id)
);
CREATE TABLE IF NOT EXISTS cards (
    board_id INTEGER NOT NULL,
    id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    title TEXT NOT NULL,
    details TEXT NOT NULL,
    position INTEGER NOT NULL,
    PRIMARY KEY (board_id, id),
    FOREIGN KEY (board_id, column_id) REFERENCES board_columns(board_id, id) ON DELETE CASCADE
);
"""

SEED_USERNAME = "user"

SEED_COLUMNS = [
    ("col-backlog", "Backlog"),
    ("col-discovery", "Discovery"),
    ("col-progress", "In Progress"),
    ("col-review", "Review"),
    ("col-done", "Done"),
]

# (id, column_id, title, details), in display order within each column.
SEED_CARDS = [
    ("card-1", "col-backlog", "Align roadmap themes", "Draft quarterly themes with impact statements and metrics."),
    ("card-2", "col-backlog", "Gather customer signals", "Review support tags, sales notes, and churn feedback."),
    ("card-3", "col-discovery", "Prototype analytics view", "Sketch initial dashboard layout and key drill-downs."),
    ("card-4", "col-progress", "Refine status language", "Standardize column labels and tone across the board."),
    ("card-5", "col-progress", "Design card layout", "Add hierarchy and spacing for scanning dense lists."),
    ("card-6", "col-review", "QA micro-interactions", "Verify hover, focus, and loading states."),
    ("card-7", "col-done", "Ship marketing page", "Final copy approved and asset pack delivered."),
    ("card-8", "col-done", "Close onboarding sprint", "Document release notes and share internally."),
]


def connect() -> sqlite3.Connection:
    # FastAPI may run a request's dependency and endpoint on different threads.
    conn = sqlite3.connect(os.environ["DATABASE_PATH"], check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def get_db() -> Iterator[sqlite3.Connection]:
    conn = connect()
    try:
        yield conn
    finally:
        conn.close()


def create_user(conn: sqlite3.Connection, username: str) -> int:
    """Create a user with a seeded board and return the user id."""
    with conn:
        user_id = conn.execute("INSERT INTO users (username) VALUES (?)", (username,)).lastrowid
        board_id = conn.execute("INSERT INTO boards (user_id) VALUES (?)", (user_id,)).lastrowid
        conn.executemany(
            "INSERT INTO board_columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            [(board_id, id, title, position) for position, (id, title) in enumerate(SEED_COLUMNS)],
        )
        conn.executemany(
            "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
            [(board_id, *card, position) for position, card in enumerate(SEED_CARDS)],
        )
    return user_id


def init_db() -> None:
    Path(os.environ["DATABASE_PATH"]).parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        conn.executescript(SCHEMA)
        if not conn.execute("SELECT 1 FROM users WHERE username = ?", (SEED_USERNAME,)).fetchone():
            create_user(conn, SEED_USERNAME)
    finally:
        conn.close()
