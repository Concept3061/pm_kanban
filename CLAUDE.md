# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is the source of truth for requirements; read it and `docs/PLAN.md` before starting work.

## Target architecture (per AGENTS.md)

- NextJS frontend (`frontend/`), statically built and served by a Python FastAPI backend (`backend/`) at `/`
- Single Docker container; Python deps managed with `uv`
- SQLite database, created if missing; users register with a password (scrypt hashed) and own any number of boards. The seeded demo user is `user` / `password`
- AI chat sidebar via OpenRouter, model `openai/gpt-oss-120b`, key in `OPENROUTER_API_KEY` in `.env` at the project root. The AI receives the board JSON plus the user question and history, and returns Structured Outputs containing a reply and an optional board update; the UI refreshes when the board changes
- Start/stop scripts for Mac, PC and Linux in `scripts/`

## Current state

All 10 parts in `docs/PLAN.md` are implemented. The schema is in `docs/schema.json` and the approach in `docs/DATABASE.md`. Each of `frontend/`, `backend/` and `scripts/` has an `AGENTS.md` describing its code and how to test it; backend tests run in Docker, so `uv` is not needed on the host. Planning/working docs go in `docs/`.

## Frontend (`frontend/`)

Next.js 16 / React 19, Tailwind v4, `@dnd-kit` for drag and drop (pointer and keyboard: focus a card, Space to pick up, arrows to move, Space to drop). Pointer drops are decided by the pointer position (`src/lib/dragCollision.ts`), not the dragged card's rectangle, which depends on where it was grabbed; keep `tests/drag.spec.ts` passing when changing this. Client-rendered; `@/` aliases `src/`.

- `src/lib/kanban.ts` - board data model (`BoardData` = ordered `columns` each holding `cardIds`, plus a `cards` record keyed by id; a card has `title`, `details`, `priority`, `dueDate` and `assignee`), `initialData` seed board (5 columns) used by tests, the pure `moveCard` reorder logic, and `createId`
- `src/lib/api.ts` - typed client for the backend API
- `src/components/AuthGate.tsx` - shows `LoginForm` (sign in or register) or `Workspace` based on the session
- `src/components/Workspace.tsx` - loads the board list, renders `BoardSwitcher` (select/create/rename/delete boards) and the active `KanbanBoard`
- `src/components/AccountSettings.tsx` - change password and delete account panel, rendered by `Workspace`
- `src/components/CardFieldInputs.tsx` - priority select and due date input shared by the new-card and edit-card forms
- `src/components/Overview.tsx` - summary of every accessible board, opened from `Workspace` instead of a board
- `src/components/CardComments.tsx` and `CommentsContext.tsx` - per-card comments, loaded when a card's comments are opened; the context carries the board id, user, permissions and per-card counts from `KanbanBoard`
- `src/components/ActivityLog.tsx` - recent changes to the board, fetched when opened
- `src/components/ShareBoard.tsx` - owners manage members; other members get a Leave button. Viewers get a read-only `KanbanBoard` (`readOnly` prop)
- `src/components/KanbanBoard.tsx` - owns the state of one board, including its search/priority/overdue filter, which is a view only and never saved (`boardId` prop; cards and columns can be added, edited, moved and deleted) and the `DndContext`, loads from the API and saves each change in order; column/card components are presentational apart from local form state
- `src/components/ChatSidebar.tsx` - AI chat; history stays in the browser

Commands (run in `frontend/`):

```bash
npm install
npm run dev            # http://localhost:3000; proxies /api to the container on port 8000
npm run build
npm run lint
npm run test:unit      # vitest (jsdom), src/**/*.test.ts(x)
npx vitest run src/lib/kanban.test.ts   # single unit test file
npx vitest run -t "test name"           # single test by name
npm run test:e2e       # playwright, tests/*.spec.ts; starts the container on 127.0.0.1:8001 with its own volume
npx playwright test tests/kanban.spec.ts
npm run test:all
```

## Backend (`backend/`)

FastAPI + built-in `sqlite3`. Requires `DATABASE_PATH`; AI routes also need `OPENROUTER_API_KEY`. Sessions live in the database and are tracked by an HTTP-only cookie.

- `app/main.py` (setup, `/api/health`, static mount), `db.py` (schema, seed, connections), `passwords.py` (scrypt), `auth.py` (register/login/logout/me/password/delete account, `CurrentUser`), `board.py` (`/api/boards` list/create/rename/delete and `GET`/`PUT /api/boards/{id}`, whole-board writes; the `BoardId`, `EditableBoardId` and `OwnedBoardId` dependencies enforce access: 404 with none, 403 with too little), `activity.py` (`GET /api/boards/{id}/activity`; changes are recorded by `write_board` in `board.py`), `overview.py` (`GET /api/overview`: per-board and total card, overdue and high-priority counts, with cards per column), `comments.py` (card comments: `/api/boards/{id}/cards/{card}/comments`, `/comments/{id}`, `/comment-counts`; owners and editors write, anyone with access reads, authors and the owner delete), `members.py` (`/api/boards/{id}/members`: list, share by username with an editor or viewer role, remove or leave), `ai.py` (OpenRouter client), `chat.py` (`POST /api/boards/{id}/chat`)
- The board is always read and written as a whole. The model returns a reply plus either the full updated board or null; an invalid response returns 502 and never changes the board
- `ai.py` deliberately excludes the OpenRouter providers CoreWeave (truncates boards) and DeepInfra (ignores the schema); do not remove those exclusions without re-measuring

Tests run in Docker from the project root in Git Bash (`uv` not needed on the host):

```bash
MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W):/repo" -w /repo/backend \
  -e UV_PROJECT_ENVIRONMENT=/tmp/venv --env-file .env \
  ghcr.io/astral-sh/uv:python3.14-trixie-slim uv run --frozen pytest
```

Add `-m live` after `pytest` to call the real model. On Mac/Linux use `$(pwd)` and drop `MSYS_NO_PATHCONV=1`.

## Running the app

`scripts\start.bat` / `scripts\stop.bat` (PC) or `sh scripts/start.sh` / `sh scripts/stop.sh` (Mac/Linux) wrap Docker Compose; the app is at http://localhost:8000 (`PORT` overrides) and data persists in a Docker volume.

## Coding standards

- Use latest library versions and idiomatic approaches
- Keep it simple: never over-engineer, no unnecessary defensive programming, no extra features
- Be concise; keep READMEs minimal. No emojis, ever
- When hitting issues, find and prove the root cause with evidence before fixing; do not guess
- Accessibility: `tests/accessibility.spec.ts` runs axe (WCAG 2.1 A/AA) on the main views and must stay clean. Because of contrast, supporting gray text uses `#666666` instead of `#888888`, and blue text, or blue behind white text, uses `--primary-blue-text` (`#0c6f9c`); `#209dd7` is for decoration and borders only
- Color scheme: accent yellow `#ecad0a` (accent lines, highlights), blue primary `#209dd7` (links, key sections), purple secondary `#753991` (submit buttons, important actions), dark navy `#032147` (main headings), gray `#888888` (supporting text, labels)
