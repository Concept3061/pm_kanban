import secrets
import sqlite3
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from pydantic import BaseModel, Field

from app.db import create_user, get_db
from app.passwords import hash_password, verify_password

COOKIE_NAME = "session"

router = APIRouter(prefix="/api/auth")

Db = Annotated[sqlite3.Connection, Depends(get_db)]


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: str = Field(pattern=r"^[A-Za-z0-9_.-]{3,32}$")
    password: str = Field(min_length=8, max_length=128)


class Password(BaseModel):
    password: str


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8, max_length=128)


def current_user(db: Db, session: Annotated[str | None, Cookie()] = None) -> sqlite3.Row:
    user = db.execute(
        "SELECT users.* FROM users JOIN sessions ON sessions.user_id = users.id WHERE sessions.token = ?",
        (session,),
    ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


CurrentUser = Annotated[sqlite3.Row, Depends(current_user)]


def start_session(db: sqlite3.Connection, response: Response, user_id: int) -> None:
    token = secrets.token_urlsafe(32)
    with db:
        db.execute("INSERT INTO sessions (token, user_id) VALUES (?, ?)", (token, user_id))
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax")


@router.post("/register", status_code=201)
def register(registration: Registration, response: Response, db: Db):
    if db.execute("SELECT 1 FROM users WHERE username = ? COLLATE NOCASE", (registration.username,)).fetchone():
        raise HTTPException(status_code=409, detail="That username is taken")
    user_id = create_user(db, registration.username, registration.password)
    start_session(db, response, user_id)
    return {"username": registration.username}


@router.post("/login")
def login(credentials: Credentials, response: Response, db: Db):
    user = db.execute("SELECT * FROM users WHERE username = ?", (credentials.username,)).fetchone()
    if user is None or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    start_session(db, response, user["id"])
    return {"username": user["username"]}


@router.post("/logout", status_code=204)
def logout(response: Response, db: Db, session: Annotated[str | None, Cookie()] = None):
    with db:
        db.execute("DELETE FROM sessions WHERE token = ?", (session,))
    response.delete_cookie(COOKIE_NAME)


@router.get("/me")
def me(user: CurrentUser):
    return {"username": user["username"]}


@router.post("/password", status_code=204)
def change_password(
    change: PasswordChange, user: CurrentUser, db: Db, session: Annotated[str | None, Cookie()] = None
):
    if not verify_password(change.current_password, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Current password is incorrect")
    with db:
        db.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(change.new_password), user["id"]))
        # Sign out every other device.
        db.execute("DELETE FROM sessions WHERE user_id = ? AND token != ?", (user["id"], session))


@router.delete("/me", status_code=204)
def delete_account(confirm: Password, response: Response, user: CurrentUser, db: Db):
    if not verify_password(confirm.password, user["password_hash"]):
        raise HTTPException(status_code=403, detail="Password is incorrect")
    with db:
        db.execute("UPDATE cards SET assignee = '' WHERE assignee = ?", (user["username"],))
        db.execute("DELETE FROM users WHERE id = ?", (user["id"],))
    response.delete_cookie(COOKIE_NAME)
