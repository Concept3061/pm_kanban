import os
import tempfile
from pathlib import Path

import pytest

# The static mount reads this when app.main is imported.
static_dir = Path(tempfile.mkdtemp())
(static_dir / "index.html").write_text("<h1>Static index</h1>")
os.environ["STATIC_DIR"] = str(static_dir)
os.environ["DATABASE_PATH"] = str(static_dir / "unused.db")

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture
def db_path(tmp_path, monkeypatch):
    path = tmp_path / "nested" / "test.db"
    monkeypatch.setenv("DATABASE_PATH", str(path))
    return path


@pytest.fixture
def anonymous(db_path):
    with TestClient(app) as client:
        yield client


@pytest.fixture
def client(anonymous):
    response = anonymous.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    return anonymous
