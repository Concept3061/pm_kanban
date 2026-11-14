from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.auth import CurrentUser, Db
from app.board import BoardId, EditableBoardId, board_role

router = APIRouter(prefix="/api/boards/{board_id}")


class NewComment(BaseModel):
    body: str = Field(min_length=1, max_length=2000)


def card_title(db, board_id: int, card_id: str) -> str:
    row = db.execute("SELECT title FROM cards WHERE board_id = ? AND id = ?", (board_id, card_id)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Card not found")
    return row["title"]


def comment_json(row) -> dict:
    return {"id": row["id"], "username": row["username"], "body": row["body"], "createdAt": row["created_at"]}


@router.get("/comment-counts")
def comment_counts(board_id: BoardId, db: Db) -> dict[str, int]:
    """Comments per card, for the cards that have any."""
    rows = db.execute("SELECT card_id, COUNT(*) AS count FROM comments WHERE board_id = ? GROUP BY card_id", (board_id,))
    return {row["card_id"]: row["count"] for row in rows}


@router.get("/cards/{card_id}/comments")
def list_comments(card_id: str, board_id: BoardId, db: Db) -> list[dict]:
    card_title(db, board_id, card_id)
    rows = db.execute(
        "SELECT comments.id, users.username, comments.body, comments.created_at FROM comments"
        " LEFT JOIN users ON users.id = comments.user_id WHERE comments.board_id = ? AND comments.card_id = ?"
        " ORDER BY comments.id",
        (board_id, card_id),
    )
    return [comment_json(row) for row in rows]


@router.post("/cards/{card_id}/comments", status_code=201)
def add_comment(card_id: str, body: NewComment, board_id: EditableBoardId, user: CurrentUser, db: Db) -> dict:
    title = card_title(db, board_id, card_id)
    now = datetime.now(UTC).isoformat(timespec="seconds")
    with db:
        comment_id = db.execute(
            "INSERT INTO comments (board_id, card_id, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
            (board_id, card_id, user["id"], body.body, now),
        ).lastrowid
        db.execute(
            "INSERT INTO activity (board_id, user_id, via_ai, message, created_at) VALUES (?, ?, 0, ?, ?)",
            (board_id, user["id"], f'commented on "{title}"', now),
        )
    return {"id": comment_id, "username": user["username"], "body": body.body, "createdAt": now}


@router.delete("/comments/{comment_id}", status_code=204)
def delete_comment(comment_id: int, board_id: BoardId, user: CurrentUser, db: Db):
    """Authors can delete their own comments, and the board owner can delete any."""
    row = db.execute("SELECT user_id FROM comments WHERE id = ? AND board_id = ?", (comment_id, board_id)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found")
    if row["user_id"] != user["id"] and board_role(db, user["id"], board_id) != "owner":
        raise HTTPException(status_code=403, detail="You do not have permission to do that")
    with db:
        db.execute("DELETE FROM comments WHERE id = ?", (comment_id,))
