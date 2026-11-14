# Database

The app uses a SQLite file through Python's built-in `sqlite3` module, with no ORM. In Docker the file is `/data/pm.db`, on a named volume, so it survives container rebuilds. The tables and seed data are created at startup if they are missing.

The full schema is in [schema.json](schema.json), and a backend test checks that the real database matches it.

## Tables

- `users` - people who can sign in, with a scrypt `password_hash`. Usernames are unique, compared case-insensitively on registration. The seeded demo user is `user` / `password`.
- `sessions` - maps a session cookie token to a user. Sessions do not expire; logging out deletes the row.
- `boards` - any number per user, each with a name.
- `board_columns` - the columns of a board, in order. They can be added, removed, renamed and reordered.
- `cards` - cards with their column and their position within it.

Column and card ids are only unique within a board.

Databases from the single-board MVP (`PRAGMA user_version` 0) are migrated at startup: passwords are added and the one-board-per-user limit is dropped.

## Reads and writes

The API exchanges the whole board as one JSON document, in the frontend's `BoardData` shape. A write runs in one transaction: it validates the board, updates the column titles, then replaces all of the board's cards. Whole-board writes keep the frontend and the AI update path simple, and are fast enough at this scale.

A board is rejected unless:

- its column ids are unique
- every card is in exactly one column, and every card id in a column exists
- each card's `id` matches its key in `cards`
- column and card titles are not empty

## Concurrency

The last write wins. If you change the board while the AI is working on a reply, an AI update replaces that change.
