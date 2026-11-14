from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.auth import CurrentUser, Db
from app.board import BoardId, OwnedBoardId, board_role

router = APIRouter(prefix="/api/boards/{board_id}/members")


class Membership(BaseModel):
    role: Literal["editor", "viewer"]


@router.get("")
def list_members(board_id: BoardId, db: Db) -> list[dict]:
    """The owner first, then everyone the board is shared with."""
    owner = db.execute(
        "SELECT users.username FROM boards JOIN users ON users.id = boards.user_id WHERE boards.id = ?",
        (board_id,),
    ).fetchone()
    members = db.execute(
        "SELECT users.username, m.role FROM board_members m JOIN users ON users.id = m.user_id"
        " WHERE m.board_id = ? ORDER BY users.username COLLATE NOCASE",
        (board_id,),
    )
    return [{"username": owner["username"], "role": "owner"}, *[dict(row) for row in members]]


@router.put("/{username}")
def share(username: str, body: Membership, board_id: OwnedBoardId, user: CurrentUser, db: Db) -> dict:
    """Share the board with a user, or change their role."""
    target = db.execute("SELECT id, username FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
    if target is None:
        raise HTTPException(status_code=404, detail="No user with that username")
    if target["id"] == user["id"]:
        raise HTTPException(status_code=409, detail="You already own this board")
    with db:
        db.execute(
            "INSERT INTO board_members (board_id, user_id, role) VALUES (?, ?, ?)"
            " ON CONFLICT (board_id, user_id) DO UPDATE SET role = excluded.role",
            (board_id, target["id"], body.role),
        )
    return {"username": target["username"], "role": body.role}


@router.delete("/{username}", status_code=204)
def unshare(username: str, board_id: BoardId, user: CurrentUser, db: Db):
    """The owner can remove anyone; a member can only remove themselves (leave the board)."""
    target = db.execute("SELECT id FROM users WHERE username = ? COLLATE NOCASE", (username,)).fetchone()
    if target is None or board_role(db, target["id"], board_id) in (None, "owner"):
        raise HTTPException(status_code=404, detail="That user is not a member of this board")
    if target["id"] != user["id"] and board_role(db, user["id"], board_id) != "owner":
        raise HTTPException(status_code=403, detail="You do not have permission to do that")
    with db:
        db.execute("DELETE FROM board_members WHERE board_id = ? AND user_id = ?", (board_id, target["id"]))
