import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel

from app.db import SEED_USERNAME, get_db

# The MVP has one hardcoded login.
PASSWORD = "password"
COOKIE_NAME = "session"

router = APIRouter(prefix="/api/auth")

Db = Annotated[sqlite3.Connection, Depends(get_db)]


class Credentials(BaseModel):
    username: str
    password: str


def current_user(db: Db, session: Annotated[str | None, Cookie()] = None) -> sqlite3.Row:
    user = db.execute(
        "SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token = ?",
        (session,),
    ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


CurrentUser = Annotated[sqlite3.Row, Depends(current_user)]


@router.post("/login")
def login(credentials: Credentials, response: Response, db: Db):
    if credentials.username != SEED_USERNAME or credentials.password != PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid username or password")
    user = db.execute("SELECT id FROM users WHERE username = ?", (credentials.username,)).fetchone()
    token = secrets.token_urlsafe(32)
    with db:
        db.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user["id"]))
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax")
    return {"username": credentials.username}


@router.post("/logout", status_code=204)
def logout(response: Response, db: Db, session: Annotated[str | None, Cookie()] = None):
    with db:
        db.execute("DELETE FROM sessions WHERE token = ?", (session,))
    response.delete_cookie(COOKIE_NAME)


@router.get("/me")
def me(user: CurrentUser):
    return {"username": user["username"]}
