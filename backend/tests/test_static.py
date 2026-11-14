def test_serves_frontend_at_root(anonymous):
    response = anonymous.get("/")
    assert response.status_code == 200
    assert "Static index" in response.text


def test_api_is_not_shadowed_by_static_files(anonymous):
    assert anonymous.get("/api/health").json() == {"status": "ok"}


def test_unknown_path_is_not_found(anonymous):
    assert anonymous.get("/missing").status_code == 404
