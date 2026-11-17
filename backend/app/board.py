import sqlite3
from datetime import UTC, date, datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.auth import CurrentUser, Db
from app.db import create_board

router = APIRouter(prefix="/api/boards")


Priority = Literal["none", "low", "medium", "high"]


class Card(BaseModel):
    id: str
    title: str = Field(min_length=1)
    details: str
    priority: Priority = "none"
    # A YYYY-MM-DD date, or empty for no due date.
    dueDate: str = ""
    # The username of a member of the board, or empty if unassigned.
    assignee: str = ""

    @field_validator("dueDate")
    @classmethod
    def check_due_date(cls, value: str) -> str:
        if value:
            date.fromisoformat(value)
        return value


class Column(BaseModel):
    id: str
    title: str = Field(min_length=1)
    cardIds: list[str]


class BoardData(BaseModel):
    columns: list[Column]
    cards: dict[str, Card]


class InvalidBoard(ValueError):
    pass


class BoardName(BaseModel):
    name: str = Field(min_length=1, max_length=100)


def board_role(db: sqlite3.Connection, user_id: int, board_id: int) -> str | None:
    """The user's role on a board: owner, editor or viewer; None if they have no access."""
    row = db.execute(
        "SELECT boards.user_id AS owner_id, m.role FROM boards"
        " LEFT JOIN board_members m ON m.board_id = boards.id AND m.user_id = ? WHERE boards.id = ?",
        (user_id, board_id),
    ).fetchone()
    if row is None:
        return None
    return "owner" if row["owner_id"] == user_id else row["role"]


def require_role(*allowed: str):
    """A dependency giving the board id in the path. 404 without access, 403 with too little."""

    def dependency(board_id: int, user: CurrentUser, db: Db) -> int:
        role = board_role(db, user["id"], board_id)
        if role is None:
            raise HTTPException(status_code=404, detail="Board not found")
        if role not in allowed:
            raise HTTPException(status_code=403, detail="You do not have permission to do that")
        return board_id

    return Depends(dependency)


BoardId = Annotated[int, require_role("owner", "editor", "viewer")]
EditableBoardId = Annotated[int, require_role("owner", "editor")]
OwnedBoardId = Annotated[int, require_role("owner")]


def read_board(db: sqlite3.Connection, board_id: int) -> BoardData:
    columns = {
        row["id"]: Column(id=row["id"], title=row["title"], cardIds=[])
        for row in db.execute("SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY position", (board_id,))
    }
    cards = {}
    for row in db.execute(
        "SELECT id, column_id, title, details, priority, due_date, assignee FROM cards WHERE board_id = ? ORDER BY position", (board_id,)
    ):
        cards[row["id"]] = Card(
            id=row["id"],
            title=row["title"],
            details=row["details"],
            priority=row["priority"],
            dueDate=row["due_date"],
            assignee=row["assignee"],
        )
        columns[row["column_id"]].cardIds.append(row["id"])
    return BoardData(columns=list(columns.values()), cards=cards)


def board_usernames(db: sqlite3.Connection, board_id: int) -> list[str]:
    """The owner and everyone the board is shared with: the people cards can be assigned to."""
    rows = db.execute(
        "SELECT users.username FROM boards JOIN users ON users.id = boards.user_id WHERE boards.id = ?"
        " UNION SELECT users.username FROM board_members m JOIN users ON users.id = m.user_id WHERE m.board_id = ?"
        " ORDER BY 1 COLLATE NOCASE",
        (board_id, board_id),
    )
    return [row["username"] for row in rows]


def validate_board(board: BoardData, usernames: list[str]) -> None:
    column_ids = [column.id for column in board.columns]
    if len(column_ids) != len(set(column_ids)):
        raise InvalidBoard("Column ids must be unique")
    placed = [card_id for column in board.columns for card_id in column.cardIds]
    if len(placed) != len(set(placed)):
        raise InvalidBoard("A card can only appear once on the board")
    if set(placed) != set(board.cards):
        raise InvalidBoard("Every card must be in exactly one column")
    if any(key != card.id for key, card in board.cards.items()):
        raise InvalidBoard("Card keys must match card ids")
    if any(card.assignee and card.assignee not in usernames for card in board.cards.values()):
        raise InvalidBoard("Cards can only be assigned to the owner or members of the board")


def describe_changes(old: BoardData, new: BoardData) -> list[str]:
    """Human-readable events for the difference between two versions of a board."""
    events = []
    old_columns = {column.id: column for column in old.columns}
    new_columns = {column.id: column for column in new.columns}
    for column in new.columns:
        if column.id not in old_columns:
            events.append(f'added column "{column.title}"')
        elif column.title != old_columns[column.id].title:
            events.append(f'renamed column "{old_columns[column.id].title}" to "{column.title}"')
    for column in old.columns:
        if column.id not in new_columns:
            events.append(f'deleted column "{column.title}"')

    old_places = {card_id: column for column in old.columns for card_id in column.cardIds}
    new_places = {card_id: column for column in new.columns for card_id in column.cardIds}
    for card_id, card in new.cards.items():
        if card_id not in old.cards:
            events.append(f'added card "{card.title}" to {new_places[card_id].title}')
            continue
        before = old.cards[card_id]
        if card.assignee != before.assignee:
            events.append(
                f'assigned "{card.title}" to {card.assignee}' if card.assignee else f'unassigned "{card.title}"'
            )
        if card.model_dump(exclude={"assignee"}) != before.model_dump(exclude={"assignee"}):
            events.append(f'edited card "{before.title}"')
        if old_places[card_id].id != new_places[card_id].id:
            events.append(f'moved "{card.title}" from {old_places[card_id].title} to {new_places[card_id].title}')
    for card_id, card in old.cards.items():
        if card_id not in new.cards:
            events.append(f'deleted card "{card.title}"')
    return events


def write_board(
    db: sqlite3.Connection, board_id: int, board: BoardData, user_id: int, via_ai: bool = False
) -> None:
    validate_board(board, board_usernames(db, board_id))
    events = describe_changes(read_board(db, board_id), board)
    with db:
        db.executemany(
            "INSERT INTO activity (board_id, user_id, via_ai, message, created_at) VALUES (?, ?, ?, ?, ?)",
            [(board_id, user_id, via_ai, event, datetime.now(UTC).isoformat(timespec="seconds")) for event in events],
        )
        db.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        db.execute("DELETE FROM board_columns WHERE board_id = ?", (board_id,))
        db.executemany(
            "INSERT INTO board_columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            [(board_id, column.id, column.title, position) for position, column in enumerate(board.columns)],
        )
        db.executemany(
            "INSERT INTO cards (board_id, id, column_id, title, details, priority, due_date, assignee, position)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                (board_id, card.id, column.id, card.title, card.details, card.priority, card.dueDate, card.assignee, position)
                for column in board.columns
                for position, card in enumerate(board.cards[card_id] for card_id in column.cardIds)
            ],
        )
        db.execute(
            "DELETE FROM comments WHERE board_id = ? AND card_id NOT IN (SELECT id FROM cards WHERE board_id = ?)",
            (board_id, board_id),
        )


@router.get("")
def list_boards(user: CurrentUser, db: Db) -> list[dict]:
    """Boards the user owns or is a member of, with their role and the owner's name."""
    rows = db.execute(
        "SELECT boards.id, boards.name, users.username AS owner,"
        " CASE WHEN boards.user_id = :user THEN 'owner' ELSE m.role END AS role"
        " FROM boards JOIN users ON users.id = boards.user_id"
        " LEFT JOIN board_members m ON m.board_id = boards.id AND m.user_id = :user"
        " WHERE boards.user_id = :user OR m.user_id = :user ORDER BY boards.id",
        {"user": user["id"]},
    )
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create(body: BoardName, user: CurrentUser, db: Db) -> dict:
    board_id = create_board(db, user["id"], body.name)
    return {"id": board_id, "name": body.name, "owner": user["username"], "role": "owner"}


@router.patch("/{board_id}")
def rename(body: BoardName, board_id: OwnedBoardId, db: Db) -> dict:
    with db:
        db.execute("UPDATE boards SET name = ? WHERE id = ?", (body.name, board_id))
    return {"id": board_id, "name": body.name}


@router.delete("/{board_id}", status_code=204)
def delete(board_id: OwnedBoardId, user: CurrentUser, db: Db):
    if db.execute("SELECT COUNT(*) FROM boards WHERE user_id = ?", (user["id"],)).fetchone()[0] == 1:
        raise HTTPException(status_code=409, detail="You cannot delete your only board")
    with db:
        db.execute("DELETE FROM boards WHERE id = ?", (board_id,))


@router.get("/{board_id}")
def get_board(board_id: BoardId, db: Db) -> BoardData:
    return read_board(db, board_id)


@router.put("/{board_id}")
def put_board(board: BoardData, board_id: EditableBoardId, user: CurrentUser, db: Db) -> BoardData:
    try:
        write_board(db, board_id, board, user["id"])
    except InvalidBoard as error:
        raise HTTPException(status_code=422, detail=str(error))
    return read_board(db, board_id)
