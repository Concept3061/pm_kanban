from datetime import date

from fastapi import APIRouter

from app.auth import CurrentUser, Db
from app.board import list_boards

router = APIRouter(prefix="/api/overview")


@router.get("")
def overview(user: CurrentUser, db: Db) -> dict:
    """Card counts for every board the user can open, and totals across them."""
    today = date.today().isoformat()
    boards = []
    for board in list_boards(user, db):
        columns = [
            dict(row)
            for row in db.execute(
                "SELECT board_columns.title, COUNT(cards.id) AS count FROM board_columns"
                " LEFT JOIN cards ON cards.board_id = board_columns.board_id AND cards.column_id = board_columns.id"
                " WHERE board_columns.board_id = ? GROUP BY board_columns.id ORDER BY board_columns.position",
                (board["id"],),
            )
        ]
        counts = db.execute(
            "SELECT COALESCE(SUM(due_date != '' AND due_date < ?), 0) AS overdue,"
            " COALESCE(SUM(priority = 'high'), 0) AS high FROM cards WHERE board_id = ?",
            (today, board["id"]),
        ).fetchone()
        boards.append(
            {
                **board,
                "cards": sum(column["count"] for column in columns),
                "overdue": counts["overdue"],
                "highPriority": counts["high"],
                "columns": columns,
            }
        )
    totals = {
        "boards": len(boards),
        "cards": sum(board["cards"] for board in boards),
        "overdue": sum(board["overdue"] for board in boards),
        "highPriority": sum(board["highPriority"] for board in boards),
    }
    return {"totals": totals, "boards": boards}
