# Project Management MVP

A Kanban board with an AI assistant, running in one Docker container. FastAPI serves both the API and the built frontend, so there is nothing else to start.

## Requirements

- Docker Desktop, running
- A `.env` file in the project root containing `OPENROUTER_API_KEY`

## Run

Run these from the project root:

- Mac and Linux: `sh scripts/start.sh`, `sh scripts/stop.sh`
- PC: `scripts\start.bat`, `scripts\stop.bat`

Open http://localhost:8000 and sign in with `user` / `password`.

The start script rebuilds the image each time, so it always includes the latest code. Set `PORT` to use a different port.

Always start the app with the script rather than the Run button in Docker Desktop. The Run button skips the settings in `docker-compose.yml`, so the app would have no port mapping, no OpenRouter key and no `pm_data` volume.

## Data

The board is stored in a SQLite database on a Docker volume called `pm_data`, so it survives restarts and rebuilds. The volume and database are created on first start. Deleting the volume resets the board.

## Docker Desktop

- `pm-app` - the app's image
- `pm-e2e-app` - the image used by the browser tests, which run on port 8001 with their own data. It is safe to delete; `npm run test:e2e` rebuilds it when needed.

## Tests

See `frontend/AGENTS.md` and `backend/AGENTS.md`.
