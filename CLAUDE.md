# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

`AGENTS.md` is the source of truth for requirements; read it and `docs/PLAN.md` before starting work.

## Target architecture (per AGENTS.md)

- NextJS frontend (`frontend/`), statically built and served by a Python FastAPI backend (`backend/`) at `/`
- Single Docker container; Python deps managed with `uv`
- SQLite database, created if missing; schema supports multiple users, but MVP has one hardcoded login (`user` / `password`) and one board per user
- AI chat sidebar via OpenRouter, model `openai/gpt-oss-120b`, key in `OPENROUTER_API_KEY` in `.env` at the project root. The AI receives the board JSON plus the user question and history, and returns Structured Outputs containing a reply and an optional board update; the UI refreshes when the board changes
- Start/stop scripts for Mac, PC and Linux in `scripts/`

## Current state

All 10 parts in `docs/PLAN.md` are implemented. The schema is in `docs/schema.json` and the approach in `docs/DATABASE.md`. Each of `frontend/`, `backend/` and `scripts/` has an `AGENTS.md` describing its code and how to test it; backend tests run in Docker, so `uv` is not needed on the host. Planning/working docs go in `docs/`.

## Frontend (`frontend/`)

Next.js 16 / React 19, Tailwind v4, `@dnd-kit` for drag and drop. Client-rendered; `@/` aliases `src/`.

- `src/lib/kanban.ts` - board data model (`BoardData` = ordered `columns` each holding `cardIds`, plus a `cards` record keyed by id), `initialData` seed board (5 columns) used by tests, the pure `moveCard` reorder logic, and `createId`
- `src/lib/api.ts` - typed client for the backend API
- `src/components/AuthGate.tsx` - shows `LoginForm` or `KanbanBoard` based on the session
- `src/components/KanbanBoard.tsx` - owns board state and the `DndContext`, loads from the API and saves each change in order; column/card components are presentational apart from local form state
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

## Coding standards

- Use latest library versions and idiomatic approaches
- Keep it simple: never over-engineer, no unnecessary defensive programming, no extra features
- Be concise; keep READMEs minimal. No emojis, ever
- When hitting issues, find and prove the root cause with evidence before fixing; do not guess
- Color scheme: accent yellow `#ecad0a` (accent lines, highlights), blue primary `#209dd7` (links, key sections), purple secondary `#753991` (submit buttons, important actions), dark navy `#032147` (main headings), gray `#888888` (supporting text, labels)
