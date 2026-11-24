import os
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, load_settings
from app.main import create_app


API_ORIGIN = "http://127.0.0.1:8000"
EXAMPLE_ENV = PROJECT_ROOT / ".env.example"
LOGIN_BODY = {"email": "ava@northwind.example", "password": "demo-password-only"}
DEMO_PROFILE = {
    "user": {
        "email": "ava@northwind.example",
        "name": "Ava Chen",
        "studio": "Northwind Studio",
    }
}
PROJECT_TITLES = ["Atlas Brand Refresh", "Harbor Launch Kit"]


def test_same_origin_session_persists_until_logout(settings):
    with TestClient(create_app(settings), base_url=API_ORIGIN) as client:
        assert client.get("/api/me").status_code == 401

        login = client.post("/api/login", json=LOGIN_BODY)
        assert login.status_code == 200
        assert login.json() == DEMO_PROFILE
        cookie = login.headers["set-cookie"].lower().split("; ")
        assert {"httponly", "path=/api", "samesite=lax"}.issubset(cookie)
        assert "secure" not in cookie

        me = client.get("/api/me")
        assert me.status_code == 200
        assert me.json() == DEMO_PROFILE

        projects = client.get("/api/projects")
        assert projects.status_code == 200
        assert [project["title"] for project in projects.json()["projects"]] == PROJECT_TITLES

        assert client.post("/api/logout").status_code == 200
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/projects").status_code == 401


@pytest.mark.parametrize("host", ["127.0.0.1", "localhost"])
def test_credentialed_preview_loads_profile_and_projects(settings, host):
    origin = f"http://{host}:5500"
    with TestClient(create_app(settings), base_url=f"http://{host}:8000") as client:
        # The frontend supplies a JSON Content-Type even on GET requests.
        for path, method in (("/api/login", "POST"), ("/api/me", "GET")):
            preflight = client.options(
                path,
                headers={
                    "Origin": origin,
                    "Access-Control-Request-Method": method,
                    "Access-Control-Request-Headers": "content-type",
                },
            )
            assert preflight.status_code == 200
            assert preflight.headers["access-control-allow-origin"] == origin
            assert preflight.headers["access-control-allow-credentials"] == "true"
            assert method in preflight.headers["access-control-allow-methods"].split(", ")
            assert "content-type" in preflight.headers["access-control-allow-headers"].lower()

        headers = {"Origin": origin, "Content-Type": "application/json"}
        login = client.post("/api/login", json=LOGIN_BODY, headers=headers)
        me = client.get("/api/me", headers=headers)
        projects = client.get("/api/projects", headers=headers)

    for response in (login, me, projects):
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
        assert response.headers["access-control-allow-credentials"] == "true"
    assert me.json() == DEMO_PROFILE
    assert [project["title"] for project in projects.json()["projects"]] == PROJECT_TITLES


def test_example_file_supplies_demo_settings():
    with patch.dict(os.environ, {"SESSION_SECRET": "example-test-signing-key"}, clear=True):
        loaded = load_settings(EXAMPLE_ENV)

    assert (loaded.host, loaded.port) == ("127.0.0.1", 8000)
    assert loaded.demo_user_password == LOGIN_BODY["password"]
    assert loaded.cors_origins == (
        "http://127.0.0.1:8000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://localhost:5500",
    )


def test_documented_environment_values_override_example_and_drive_api():
    preview = "http://localhost:6600"
    env = {
        "APP_HOST": "localhost",
        "APP_PORT": "9000",
        "SESSION_SECRET": "override-test-signing-key",
        "CORS_ORIGINS": f" {preview} , http://127.0.0.1:6600 ",
        "DEMO_USER_PASSWORD": "configured-test-password",
    }
    with patch.dict(os.environ, env, clear=True):
        loaded = load_settings(EXAMPLE_ENV)

    assert (loaded.host, loaded.port) == ("localhost", 9000)
    assert loaded.session_secret == env["SESSION_SECRET"]
    assert loaded.demo_user_password == env["DEMO_USER_PASSWORD"]
    assert loaded.cors_origins == (preview, "http://127.0.0.1:6600")

    with TestClient(create_app(loaded), base_url="http://localhost:9000") as client:
        assert client.post("/api/login", json=LOGIN_BODY).status_code == 401
        login = client.post(
            "/api/login",
            json={**LOGIN_BODY, "password": loaded.demo_user_password},
            headers={"Origin": preview},
        )
        rejected = client.options(
            "/api/login",
            headers={
                "Origin": "http://localhost:5500",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

    assert login.status_code == 200
    assert login.headers["access-control-allow-origin"] == preview
    assert rejected.status_code == 400
    assert "access-control-allow-origin" not in rejected.headers


def test_missing_session_secret_fails_clearly():
    with patch.dict(os.environ, clear=True):
        with pytest.raises(ValueError, match="Set SESSION_SECRET"):
            load_settings(EXAMPLE_ENV)


def test_wildcard_origin_is_rejected_with_credentials():
    env = {"SESSION_SECRET": "wildcard-test-signing-key", "CORS_ORIGINS": "*"}
    with patch.dict(os.environ, env, clear=True):
        loaded = load_settings(EXAMPLE_ENV)

    with pytest.raises(ValueError, match="CORS_ORIGINS must list explicit origins"):
        create_app(loaded)
