import pytest


def test_login_sets_http_only_cookie(anonymous):
    response = anonymous.post("/api/auth/login", json={"username": "user", "password": "password"})
    assert response.status_code == 200
    assert response.json() == {"username": "user"}
    cookie = response.headers["set-cookie"].lower()
    assert "httponly" in cookie
    assert "samesite=lax" in cookie


@pytest.mark.parametrize(
    "username,password",
    [("user", "wrong"), ("wrong", "password"), ("", "")],
)
def test_login_rejects_bad_credentials(anonymous, username, password):
    response = anonymous.post("/api/auth/login", json={"username": username, "password": password})
    assert response.status_code == 401
    assert "set-cookie" not in response.headers


def test_login_requires_both_fields(anonymous):
    assert anonymous.post("/api/auth/login", json={"username": "user"}).status_code == 422


def test_me_requires_session(anonymous):
    assert anonymous.get("/api/auth/me").status_code == 401


def test_me_returns_signed_in_user(client):
    assert client.get("/api/auth/me").json() == {"username": "user"}


def test_forged_session_is_rejected(anonymous):
    anonymous.cookies.set("session", "forged")
    assert anonymous.get("/api/auth/me").status_code == 401


def test_logout_ends_session_on_the_server(client):
    token = client.cookies["session"]
    assert client.post("/api/auth/logout").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    # The old token must not work even if a client kept it.
    client.cookies.set("session", token)
    assert client.get("/api/auth/me").status_code == 401


def test_logout_without_session_succeeds(anonymous):
    assert anonymous.post("/api/auth/logout").status_code == 204


def register(client, username="newbie", password="password1"):
    return client.post("/api/auth/register", json={"username": username, "password": password})


def login(client, username, password):
    return client.post("/api/auth/login", json={"username": username, "password": password})


def test_register_signs_in_and_creates_an_empty_board(anonymous):
    assert register(anonymous).status_code == 201
    assert anonymous.get("/api/auth/me").json() == {"username": "newbie"}
    boards = anonymous.get("/api/boards").json()
    assert len(boards) == 1
    assert anonymous.get(f"/api/boards/{boards[0]['id']}").json()["cards"] == {}


def test_registered_user_can_log_in_again(anonymous):
    register(anonymous)
    anonymous.post("/api/auth/logout")
    assert login(anonymous, "newbie", "password1").status_code == 200
    assert login(anonymous, "newbie", "wrong").status_code == 401


def test_register_rejects_taken_username_ignoring_case(anonymous):
    assert register(anonymous, "USER").status_code == 409
    assert register(anonymous).status_code == 201
    assert register(anonymous, "NewBie").status_code == 409


@pytest.mark.parametrize(
    "username,password",
    [("ab", "password1"), ("has space", "password1"), ("x" * 33, "password1"), ("okname", "short")],
)
def test_register_validates_input(anonymous, username, password):
    response = register(anonymous, username, password)
    assert response.status_code == 422
    assert "set-cookie" not in response.headers


def test_passwords_are_not_stored_in_plain_text(anonymous):
    from app.db import connect

    register(anonymous)
    conn = connect()
    stored = conn.execute("SELECT password_hash FROM users WHERE username = 'newbie'").fetchone()[0]
    conn.close()
    assert "password1" not in stored


def test_change_password(anonymous):
    register(anonymous)
    change = lambda current, new: anonymous.post(  # noqa: E731
        "/api/auth/password", json={"current_password": current, "new_password": new}
    )
    assert change("nope", "password2").status_code == 403
    assert change("password1", "short").status_code == 422
    assert change("password1", "password2").status_code == 204
    assert anonymous.get("/api/auth/me").status_code == 200
    anonymous.post("/api/auth/logout")
    assert login(anonymous, "newbie", "password1").status_code == 401
    assert login(anonymous, "newbie", "password2").status_code == 200


def test_change_password_signs_out_other_sessions_of_the_same_user(anonymous):
    register(anonymous)
    first = anonymous.cookies["session"]
    login(anonymous, "newbie", "password1")
    second = anonymous.cookies["session"]
    anonymous.post("/api/auth/password", json={"current_password": "password1", "new_password": "password2"})
    anonymous.cookies.clear()
    anonymous.cookies.set("session", first)
    assert anonymous.get("/api/auth/me").status_code == 401
    anonymous.cookies.clear()
    anonymous.cookies.set("session", second)
    assert anonymous.get("/api/auth/me").status_code == 200


def test_delete_account_removes_user_boards_and_sessions(anonymous):
    from app.db import connect

    register(anonymous)
    assert anonymous.request("DELETE", "/api/auth/me", json={"password": "wrong"}).status_code == 403
    assert anonymous.request("DELETE", "/api/auth/me", json={"password": "password1"}).status_code == 204
    assert anonymous.get("/api/auth/me").status_code == 401
    conn = connect()
    assert conn.execute("SELECT COUNT(*) FROM users WHERE username = 'newbie'").fetchone()[0] == 0
    assert conn.execute("SELECT COUNT(*) FROM boards").fetchone()[0] == 1  # only the seeded user
    conn.close()
    assert login(anonymous, "newbie", "password1").status_code == 401
