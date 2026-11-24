from dataclasses import replace

from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, load_settings
from app.main import create_app


PREVIEW_ORIGIN = "http://127.0.0.1:5500"
API_ORIGIN = "http://127.0.0.1:8000"
LOGIN_BODY = {"email": "ava@northwind.example", "password": "demo-password-only"}


def test_login_returns_demo_user(settings):
    with TestClient(create_app(settings), base_url=API_ORIGIN) as client:
        response = client.post("/api/login", json=LOGIN_BODY)

    assert response.status_code == 200
    assert response.json() == {
        "user": {
            "email": "ava@northwind.example",
            "name": "Ava Chen",
            "studio": "Northwind Studio",
        }
    }


def test_bug2_session_not_preserved(settings):
    with TestClient(create_app(settings), base_url=API_ORIGIN) as client:
        login = client.post("/api/login", json=LOGIN_BODY)
        me = client.get("/api/me")
        projects = client.get("/api/projects")

    assert login.status_code == 200
    cookie_attributes = login.headers["set-cookie"].lower().split("; ")
    assert "httponly" in cookie_attributes
    assert "path=/api/login" in cookie_attributes
    assert "cookie" not in me.request.headers
    assert me.status_code == 401
    assert projects.status_code == 401


def test_bug3_documented_cors_origins_are_ignored(monkeypatch, settings):
    monkeypatch.setenv("SESSION_SECRET", settings.session_secret)
    monkeypatch.setenv("DEMO_USER_PASSWORD", settings.demo_user_password)
    monkeypatch.setenv("APP_PORT", "8000")
    monkeypatch.setenv("CORS_ORIGINS", PREVIEW_ORIGIN)
    monkeypatch.delenv("CORS_ORIGIN", raising=False)

    loaded = load_settings(PROJECT_ROOT / ".env.example")

    assert PREVIEW_ORIGIN not in loaded.cors_origins
    assert loaded.cors_origins == (API_ORIGIN, "http://localhost:8000")


def test_bug1_cors_preflight_rejects_json_login(settings):
    # Supply the preview origin directly to isolate the method policy from BUG3.
    settings = replace(settings, cors_origins=(PREVIEW_ORIGIN,))
    with TestClient(create_app(settings), base_url=API_ORIGIN) as client:
        response = client.options(
            "/api/login",
            headers={
                "Origin": PREVIEW_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert response.headers["access-control-allow-origin"] == PREVIEW_ORIGIN
    assert response.headers["access-control-allow-credentials"] == "true"
    assert "POST" not in response.headers["access-control-allow-methods"].split(", ")
    assert response.status_code == 400
