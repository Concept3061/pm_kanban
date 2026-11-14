import pytest

from app import ai

pytestmark = pytest.mark.live


def test_two_plus_two():
    assert "4" in ai.ask("What is 2+2? Reply with only the number.")


def all_cards(board):
    return {card["title"]: card for card in board["cards"].values()}


def test_reply_only_question_does_not_change_board(client):
    before = client.get("/api/board").json()
    response = client.post("/api/chat", json={"message": "How many columns does my board have?"})
    assert response.status_code == 200
    assert response.json()["reply"]
    assert client.get("/api/board").json() == before


def test_creates_card(client):
    response = client.post(
        "/api/chat",
        json={"message": "Add a card titled 'Write launch plan' to the Review column."},
    )
    assert response.status_code == 200
    board = response.json()["board"]
    card = all_cards(board)["Write launch plan"]
    review = next(column for column in board["columns"] if column["title"] == "Review")
    assert card["id"] in review["cardIds"]
    assert len(board["cards"]) == 9


def test_moves_and_edits_card_using_history(client):
    history = [
        {"role": "user", "content": "Which card is about analytics?"},
        {"role": "assistant", "content": "The card 'Prototype analytics view' is about analytics."},
    ]
    response = client.post(
        "/api/chat",
        json={
            "message": "Move that card to Done and change its details to 'Finished'.",
            "history": history,
        },
    )
    assert response.status_code == 200
    board = response.json()["board"]
    done = next(column for column in board["columns"] if column["title"] == "Done")
    assert "card-3" in done["cardIds"]
    assert board["cards"]["card-3"]["details"] == "Finished"
    assert len(board["cards"]) == 8
