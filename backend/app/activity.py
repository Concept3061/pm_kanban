from fastapi import APIRouter

from app.auth import Db
from app.board import BoardId

router = APIRouter(prefix="/api/boards/{board_id}/activity")

LIMIT = 50


@router.get("")
def list_activity(board_id: BoardId, db: Db) -> list[dict]:
    """The most recent changes to the board, newest first."""
    rows = db.execute(
        "SELECT users.username, activity.via_ai, activity.message, activity.created_at FROM activity"
        " LEFT JOIN users ON users.id = activity.user_id WHERE activity.board_id = ?"
        " ORDER BY activity.id DESC LIMIT ?",
        (board_id, LIMIT),
    )
    return [
        {"username": row["username"], "viaAi": bool(row["via_ai"]), "message": row["message"], "createdAt": row["created_at"]}
        for row in rows
    ]
