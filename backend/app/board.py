import sqlite3
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.auth import CurrentUser, Db
from app.db import create_board

router = APIRouter(prefix="/api/boards")


class Card(BaseModel):
    id: str
    title: str = Field(min_length=1)
    details: str


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


def owned_board(board_id: int, user: CurrentUser, db: Db) -> int:
    """The id of the board in the path, if the signed-in user owns it."""
    if not db.execute("SELECT 1 FROM boards WHERE id = ? AND user_id = ?", (board_id, user["id"])).fetchone():
        raise HTTPException(status_code=404, detail="Board not found")
    return board_id


BoardId = Annotated[int, Depends(owned_board)]


def read_board(db: sqlite3.Connection, board_id: int) -> BoardData:
    columns = {
        row["id"]: Column(id=row["id"], title=row["title"], cardIds=[])
        for row in db.execute("SELECT id, title FROM board_columns WHERE board_id = ? ORDER BY position", (board_id,))
    }
    cards = {}
    for row in db.execute(
        "SELECT id, column_id, title, details FROM cards WHERE board_id = ? ORDER BY position", (board_id,)
    ):
        cards[row["id"]] = Card(id=row["id"], title=row["title"], details=row["details"])
        columns[row["column_id"]].cardIds.append(row["id"])
    return BoardData(columns=list(columns.values()), cards=cards)


def validate_board(board: BoardData) -> None:
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


def write_board(db: sqlite3.Connection, board_id: int, board: BoardData) -> None:
    validate_board(board)
    with db:
        db.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        db.execute("DELETE FROM board_columns WHERE board_id = ?", (board_id,))
        db.executemany(
            "INSERT INTO board_columns (board_id, id, title, position) VALUES (?, ?, ?, ?)",
            [(board_id, column.id, column.title, position) for position, column in enumerate(board.columns)],
        )
        db.executemany(
            "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (board_id, card_id, column.id, board.cards[card_id].title, board.cards[card_id].details, position)
                for column in board.columns
                for position, card_id in enumerate(column.cardIds)
            ],
        )


@router.get("")
def list_boards(user: CurrentUser, db: Db) -> list[dict]:
    rows = db.execute("SELECT id, name FROM boards WHERE user_id = ? ORDER BY id", (user["id"],))
    return [dict(row) for row in rows]


@router.post("", status_code=201)
def create(body: BoardName, user: CurrentUser, db: Db) -> dict:
    return {"id": create_board(db, user["id"], body.name), "name": body.name}


@router.patch("/{board_id}")
def rename(body: BoardName, board_id: BoardId, db: Db) -> dict:
    with db:
        db.execute("UPDATE boards SET name = ? WHERE id = ?", (body.name, board_id))
    return {"id": board_id, "name": body.name}


@router.delete("/{board_id}", status_code=204)
def delete(board_id: BoardId, user: CurrentUser, db: Db):
    if db.execute("SELECT COUNT(*) FROM boards WHERE user_id = ?", (user["id"],)).fetchone()[0] == 1:
        raise HTTPException(status_code=409, detail="You cannot delete your only board")
    with db:
        db.execute("DELETE FROM boards WHERE id = ?", (board_id,))


@router.get("/{board_id}")
def get_board(board_id: BoardId, db: Db) -> BoardData:
    return read_board(db, board_id)


@router.put("/{board_id}")
def put_board(board: BoardData, board_id: BoardId, db: Db) -> BoardData:
    try:
        write_board(db, board_id, board)
    except InvalidBoard as error:
        raise HTTPException(status_code=422, detail=str(error))
    return read_board(db, board_id)
