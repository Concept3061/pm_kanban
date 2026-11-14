# Database

The app uses a SQLite file through Python's built-in `sqlite3` module, with no ORM. In Docker the file is `/data/pm.db`, on a named volume, so it survives container rebuilds. The tables and seed data are created at startup if they are missing.

The full schema is in [schema.json](schema.json), and a backend test checks that the real database matches it.

## Tables

- `users` - people who can sign in. The MVP has one seeded user, `user`. The password is hardcoded in the backend, not stored.
- `sessions` - maps a session cookie token to a user. Sessions do not expire; logging out deletes the row.
- `boards` - one per user, enforced by a unique constraint. Removing that constraint would allow several boards per user.
- `board_columns` - the fixed columns of a board, with renameable titles.
- `cards` - cards with their column and their position within it.

Column and card ids are only unique within a board, so each user's seeded board can use the same ids.

## Reads and writes

The API exchanges the whole board as one JSON document, in the frontend's `BoardData` shape. A write runs in one transaction: it validates the board, updates the column titles, then replaces all of the board's cards. Whole-board writes keep the frontend and the AI update path simple, and are fast enough at this scale.

A board is rejected unless:

- its columns have the same ids, in the same order, as the stored board
- every card is in exactly one column, and every card id in a column exists
- each card's `id` matches its key in `cards`
- column and card titles are not empty

## Concurrency

The last write wins. If you change the board while the AI is working on a reply, an AI update replaces that change.
