import os
import sqlite3
from collections.abc import Iterator
from pathlib import Path

from app.passwords import hash_password

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL
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
SEED_PASSWORD = "password"

# Columns of a board created by the user.
DEFAULT_COLUMNS = [("col-todo", "To Do"), ("col-progress", "In Progress"), ("col-done", "Done")]

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


def create_board(conn: sqlite3.Connection, user_id: int, name: str, demo: bool = False) -> int:
    """Create a board and return its id. A demo board has the sample columns and cards."""
    columns = SEED_COLUMNS if demo else DEFAULT_COLUMNS
    with conn:
        board_id = conn.execute("INSERT INTO boards (user_id, name) VALUES (?, ?)", (user_id, name)).lastrowid
        conn.executemany(
            "INSERT INTO board_columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            [(board_id, id, title, position) for position, (id, title) in enumerate(columns)],
        )
        if demo:
            conn.executemany(
                "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
                [(board_id, *card, position) for position, card in enumerate(SEED_CARDS)],
            )
    return board_id


def create_user(conn: sqlite3.Connection, username: str, password: str, demo: bool = False) -> int:
    """Create a user with a first board and return the user id."""
    with conn:
        user_id = conn.execute(
            "INSERT INTO users (username, password_hash) VALUES (?, ?)", (username, hash_password(password))
        ).lastrowid
    create_board(conn, user_id, "My Board", demo)
    return user_id


def migrate_v0(conn: sqlite3.Connection) -> None:
    """Databases from the single-board MVP: add passwords and drop the one-board-per-user limit."""
    conn.executescript(
        """
        PRAGMA foreign_keys = OFF;
        BEGIN;
        ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
        CREATE TABLE boards_new (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name TEXT NOT NULL
        );
        INSERT INTO boards_new SELECT id, user_id, 'My Board' FROM boards;
        DROP TABLE boards;
        ALTER TABLE boards_new RENAME TO boards;
        COMMIT;
        PRAGMA foreign_keys = ON;
        """
    )
    conn.execute("UPDATE users SET password_hash = ? WHERE username = ?", (hash_password(SEED_PASSWORD), SEED_USERNAME))
    conn.commit()


def init_db() -> None:
    Path(os.environ["DATABASE_PATH"]).parent.mkdir(parents=True, exist_ok=True)
    conn = connect()
    try:
        has_users = conn.execute("SELECT 1 FROM sqlite_master WHERE name = 'users'").fetchone()
        if has_users and conn.execute("PRAGMA user_version").fetchone()[0] == 0:
            migrate_v0(conn)
        conn.executescript(SCHEMA)
        conn.execute("PRAGMA user_version = 1")
        if not conn.execute("SELECT 1 FROM users WHERE username = ?", (SEED_USERNAME,)).fetchone():
            create_user(conn, SEED_USERNAME, SEED_PASSWORD, demo=True)
    finally:
        conn.close()
