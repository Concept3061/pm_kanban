# Backend

FastAPI app, managed with `uv`, that serves the API and the static frontend export. Requires `DATABASE_PATH`; the AI routes also require `OPENROUTER_API_KEY`.

## Code

- `app/main.py` - app setup, `GET /api/health`, and the static mount at `/`
- `app/db.py` - schema, seed data and connections, using the built-in `sqlite3` (see `docs/DATABASE.md`)
- `app/passwords.py` - scrypt password hashing
- `app/auth.py` - `/api/auth/` register, login, logout, me, password (change; signs out other sessions) and `DELETE me` (delete account), plus the `CurrentUser` dependency; sessions are stored in the database and identified by an HTTP-only cookie
- `app/board.py` - `/api/boards`: list, create, rename, delete (never the last board), and `GET`/`PUT /{id}` for whole-board reads, validation and writes. Columns can be added, removed and reordered. Every `/{id}` route goes through `BoardId`, which returns 404 unless the user owns the board
- `app/ai.py` - OpenRouter client
- `app/chat.py` - `POST /api/boards/{id}/chat`; sends the board, history and question to the model, and validates and saves any board update

## AI

The model returns a reply and either the complete updated board or null. `ai.py` excludes two OpenRouter providers because measured responses showed CoreWeave truncating boards and DeepInfra replying in plain text despite the schema. An invalid response returns 502 and never changes the board.

A response that drops a card but is otherwise valid cannot be told apart from a requested deletion. This was not seen in testing.

## Tests

`uv` is not needed on the host. From the project root, in Git Bash:

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" -w /repo/backend \
  -e UV_PROJECT_ENVIRONMENT=/tmp/venv --env-file .env \
  ghcr.io/astral-sh/uv:python3.14-trixie-slim uv run --frozen pytest
```

Mac and Linux are the same, using `$(pwd)` and without `MSYS_NO_PATHCONV=1`. Add `-m live` after `pytest` to call the real model.
