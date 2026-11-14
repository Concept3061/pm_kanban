# Database

The app uses a SQLite file through Python's built-in `sqlite3` module, with no ORM. In Docker the file is `/data/pm.db`, on a named volume, so it survives container rebuilds. The tables and seed data are created at startup if they are missing.

The full schema is in [schema.json](schema.json), and a backend test checks that the real database matches it.

## Tables

- `users` - people who can sign in, with a scrypt `password_hash`. Usernames are unique, compared case-insensitively on registration. The seeded demo user is `user` / `password`.
- `sessions` - maps a session cookie token to a user. Sessions do not expire; logging out deletes the row.
- `boards` - any number per user, each with a name.
- `board_members` - users a board is shared with, besides its owner, with an `editor` or `viewer` role. Rows disappear with the board or the user.
- `activity` - one row per change to a board (card added, edited, moved or deleted; column added, renamed or deleted), with who made it and whether the AI did. Derived by comparing the stored board with each write; reordering within a column is not recorded. The latest 50 are served.
- `board_columns` - the columns of a board, in order. They can be added, removed, renamed and reordered.
- `cards` - cards with their column, position within it, `priority` (none, low, medium, high) and `due_date` (YYYY-MM-DD, or empty).

Column and card ids are only unique within a board.

Databases from the single-board MVP (`PRAGMA user_version` 0) are migrated at startup: passwords are added and the one-board-per-user limit is dropped. Version 1 databases gain the card priority and due date columns. The current version is 4; the shared-boards and activity tables are created by the schema script, so they need no migration.

## Reads and writes

The API exchanges the whole board as one JSON document, in the frontend's `BoardData` shape. A write runs in one transaction: it validates the board, updates the column titles, then replaces all of the board's cards. Whole-board writes keep the frontend and the AI update path simple, and are fast enough at this scale.

A board is rejected unless:

- its column ids are unique
- every card is in exactly one column, and every card id in a column exists
- each card's `id` matches its key in `cards`
- column and card titles are not empty
- each card's priority is one of the four values and its `dueDate` is empty or a real YYYY-MM-DD date

## Access

The owner can do everything. An editor can read and edit the board and use the AI chat. A viewer can only read. Only the owner can rename or delete the board and manage its members; a member can remove themselves. A user with no access gets 404, so board ids are not revealed; a member with too little access gets 403.

## Concurrency

The last write wins. If you change the board while the AI is working on a reply, an AI update replaces that change.
