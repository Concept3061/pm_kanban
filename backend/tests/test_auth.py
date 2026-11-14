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
