# Project plan

## Status

All 10 parts are implemented and tested, and the user has approved the plan and the database schema. Nothing is committed.

## Decisions confirmed by the user

- Card editing is in scope (added in Part 7).
- "Saving as JSON" in Part 5 means writing the proposed schema to a JSON file (`docs/schema.json`).
- Sign-in is enforced by the backend.
- Work continues through all parts without pausing, and nothing is committed.

## Design decisions made during implementation

These were not specifically confirmed by the user.

Infrastructure:

- Backend tooling runs in Docker, so `uv` is not needed on the host.
- The app runs on port 8000, or `PORT` if set. Its data is on the `pm_data` Docker volume, so it survives rebuilds.
- PC scripts are `.bat` files, because Windows can block `.ps1` scripts by default. `.gitattributes` keeps `.sh` files on LF line endings so they run in Linux.
- Next.js uses a static export in production builds. `next dev` proxies `/api` to the container on port 8000 instead, because rewrites are not available with a static export.

Sign-in and database:

- Sessions are random tokens stored in the database and sent in an HTTP-only cookie. They last until logout and do not expire.
- The password is hardcoded in the backend, not stored in the database.
- The database uses regular tables through the built-in `sqlite3` module, with no ORM.
- Column and card ids are unique per board, not globally, so each user's seeded board can use the same ids.

Board API and frontend:

- The API reads and writes the whole board as one JSON document. A write replaces all of the board's cards in one transaction.
- Saves run one at a time, in order, so an older board cannot overwrite a newer one.
- The set and order of columns are fixed and enforced by the backend. Only titles can change.
- Column renames save on blur or Enter rather than on each keystroke. A blank rename restores the previous title.

AI:

- The model returns a reply and either the complete updated board or null, rather than a list of individual changes.
- The model sees and returns each column with its cards nested inside it, because strict Structured Outputs cannot describe the free-form keys of `BoardData.cards`. The backend converts between this and `BoardData`.
- The AI can also delete cards and rename columns, because it returns the whole board. The system prompt limits these to explicit requests.
- OpenRouter is set to use only providers that support the requested parameters, and CoreWeave and DeepInfra are excluded. Measured responses showed CoreWeave truncating boards on 4 of 4 calls, and DeepInfra replying in plain text despite the schema.
- An invalid AI response returns 502 and does not change the board.
- Chat history is kept in the browser only. It survives closing the sidebar and is cleared by a reload or logout.
- The sidebar is closed by default, and the board tightens its columns while it is open.
- Live model tests are excluded from the default test run. Browser tests mock the chat route so they do not depend on the model.

Testing:

- Browser tests run against the real container as a separate Compose project on port 8001, with a volume that is removed afterwards, so they cannot touch real data.

## Known limitations

- A response that drops a card but is otherwise valid looks the same as a requested deletion, so the card is deleted. This was not seen in testing.
- The last write wins. Changing the board while the AI is working on a reply can be overwritten by the AI's update.
- Below about 1,400px wide with the sidebar open, the board scrolls sideways.

## Part 1: Plan

- [x] Enrich this document with substeps, tests and success criteria
- [x] Create `frontend/AGENTS.md` describing the existing code
- [x] Confirm open questions with the user
- [x] User approval of this plan

Success: the user has answered the open questions and approved the plan, and every part below has a checklist.

## Part 2: Scaffolding

- [x] `Dockerfile`, `docker-compose.yml` and `.dockerignore` at the project root
- [x] FastAPI project in `backend/` managed with `uv`, with `GET /api/health`
- [x] Serve a hello world HTML page at `/` (replaced by the frontend in Part 3)
- [x] Start and stop scripts for Mac and Linux (`.sh`) and PC (`.bat`)
- [x] Stop tracking `frontend/test-results/`

Tests: run the start script, request `/` and `/api/health`, run the stop script. The scripts were run from `sh` and `cmd` on Windows, but not on an actual Mac or Linux machine.

Success: the container serves both the page and the API call.

## Part 3: Add in Frontend

- [x] Configure Next.js for static export
- [x] Multi-stage Docker build that serves the export at `/`
- [x] Backend test for static serving
- [x] Point Playwright at the container, on a separate port with its own data volume

Tests: existing unit tests, static serving test, Playwright against the container.

Success: the demo board displays at `/` from the container.

## Part 4: Fake sign in

- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] HTTP-only session cookie
- [x] Login form shown until signed in, and a log out button

Tests: backend tests for valid login, wrong credentials, logout and unauthenticated access. Unit tests for the form. Playwright for login, rejected login, logout and staying signed in after reload.

Success: the board cannot be seen without logging in, and logging out returns to the form.

## Part 5: Database modeling

- [x] Write the schema to `docs/schema.json`
- [x] Document the approach in `docs/DATABASE.md`
- [x] Flag the schema for user review in the final summary
- [x] User sign-off on the schema

Tests: a backend test checks that the real database matches `docs/schema.json`.

Success: the schema supports multiple users, and the document explains it.

## Part 6: Backend

- [x] Create the database and seed the user and board if missing
- [x] `GET /api/board` and `PUT /api/board` for the signed-in user
- [x] Reject invalid boards: changed columns, unknown or duplicate cards, orphaned cards

Tests: database creation, seed runs once, read and write round trip, persistence across restart, isolation between users, each validation rule, 401 without a session.

Success: all backend tests pass.

## Part 7: Frontend + Backend

- [x] API client in `src/lib/api.ts`
- [x] Load the board from the API and save every change, in order
- [x] Commit column renames on blur rather than on each keystroke
- [x] Add card editing
- [x] Show load and save errors, and return to login on a 401

Tests: unit tests with a mocked API. Playwright for persistence after reload of add, edit, delete, move and rename, plus persistence across a container restart.

Success: all board changes survive a reload and a container restart.

## Part 8: AI connectivity

- [x] OpenRouter client in `backend/app/ai.py`
- [x] Live "2+2" test, excluded from the default test run
- [x] Confirm that the model supports Structured Outputs

Tests: the live test against OpenRouter.

Success: the model answers 4 through the backend's client.

## Part 9: Structured Outputs

- [x] `POST /api/chat` taking a message and history
- [x] Send the board, the history and the question to the model
- [x] Structured response with a reply and an optional complete updated board
- [x] Validate any update before saving, and return 502 without saving if it is invalid

Tests: mocked model tests for the prompt contents, reply only, valid update, invalid update, upstream failure and 401. Live tests for a reply with no update, creating a card, and moving and editing a card using history.

Success: the model can create, edit and move cards, and a bad response never changes the board.

## Part 10: AI sidebar

- [x] Collapsible chat sidebar in the project colors
- [x] Send history with each request, kept in the browser only
- [x] Refresh the board automatically when the AI updates it

Tests: unit tests for sending, history, errors and board refresh. Playwright with a mocked chat route, plus a live manual run against the model with screenshots.

Success: a chat message can change the board, and the change appears without a reload.
