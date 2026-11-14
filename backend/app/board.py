import sqlite3

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auth import CurrentUser, Db

router = APIRouter(prefix="/api/board")


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


def board_id_for(db: sqlite3.Connection, user_id: int) -> int:
    return db.execute("SELECT id FROM boards WHERE user_id = ?", (user_id,)).fetchone()["id"]


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


def validate_board(db: sqlite3.Connection, board_id: int, board: BoardData) -> None:
    stored = db.execute("SELECT id FROM board_columns WHERE board_id = ? ORDER BY position", (board_id,))
    if [column.id for column in board.columns] != [row["id"] for row in stored]:
        raise InvalidBoard("Columns cannot be added, removed or reordered")
    placed = [card_id for column in board.columns for card_id in column.cardIds]
    if len(placed) != len(set(placed)):
        raise InvalidBoard("A card can only appear once on the board")
    if set(placed) != set(board.cards):
        raise InvalidBoard("Every card must be in exactly one column")
    if any(key != card.id for key, card in board.cards.items()):
        raise InvalidBoard("Card keys must match card ids")


def write_board(db: sqlite3.Connection, board_id: int, board: BoardData) -> None:
    validate_board(db, board_id, board)
    with db:
        db.executemany(
            "UPDATE board_columns SET title = ? WHERE board_id = ? AND id = ?",
            [(column.title, board_id, column.id) for column in board.columns],
        )
        db.execute("DELETE FROM cards WHERE board_id = ?", (board_id,))
        db.executemany(
            "INSERT INTO cards (board_id, id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?, ?)",
            [
                (board_id, card_id, column.id, board.cards[card_id].title, board.cards[card_id].details, position)
                for column in board.columns
                for position, card_id in enumerate(column.cardIds)
            ],
        )


@router.get("")
def get_board(user: CurrentUser, db: Db) -> BoardData:
    return read_board(db, board_id_for(db, user["id"]))


@router.put("")
def put_board(board: BoardData, user: CurrentUser, db: Db) -> BoardData:
    board_id = board_id_for(db, user["id"])
    try:
        write_board(db, board_id, board)
    except InvalidBoard as error:
        raise HTTPException(status_code=422, detail=str(error))
    return read_board(db, board_id)
