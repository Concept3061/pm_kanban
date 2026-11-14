#!/bin/sh
cd "$(dirname "$0")/.." || exit 1
docker compose up --build -d || exit 1
echo "Running at http://localhost:${PORT:-8000}"
