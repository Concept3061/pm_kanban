import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app import activity, auth, board, chat, comments, members, overview
from app.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="Project Management MVP", lifespan=lifespan)
app.include_router(auth.router)
app.include_router(board.router)
app.include_router(activity.router)
app.include_router(comments.router)
app.include_router(overview.router)
app.include_router(members.router)
app.include_router(chat.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# Registered last so it does not shadow the API routes.
app.mount(
    "/",
    StaticFiles(directory=os.environ.get("STATIC_DIR", "static"), html=True, check_dir=False),
)
