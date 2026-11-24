import os
from dataclasses import replace
from unittest.mock import patch

from fastapi.testclient import TestClient

from app.config import PROJECT_ROOT, load_settings
from app.main import create_app


PREVIEW_ORIGIN = "http://127.0.0.1:5500"
API_ORIGIN = "http://127.0.0.1:8000"


def main() -> None:
    # Keep the demonstration independent of any local .env or shell settings.
    env = {"SESSION_SECRET": "reproduction-only-signing-placeholder", "CORS_ORIGINS": PREVIEW_ORIGIN}
    with patch.dict(os.environ, env, clear=True):
        settings = load_settings(PROJECT_ROOT / ".env.example")

    # Isolate the CORS method check by supplying the origin directly.
    preview_settings = replace(settings, cors_origins=(PREVIEW_ORIGIN,))
    with TestClient(create_app(preview_settings), base_url=API_ORIGIN) as client:
        preflight = client.options(
            "/api/login",
            headers={
                "Origin": PREVIEW_ORIGIN,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )
    methods = preflight.headers.get("access-control-allow-methods", "<missing>")
    print(f"BUG1 | JSON login preflight returned {preflight.status_code}, allowed methods: {methods}")

    with TestClient(create_app(settings), base_url=API_ORIGIN) as client:
        login = client.post(
            "/api/login",
            json={"email": "ava@northwind.example", "password": settings.demo_user_password},
        )
        me = client.get("/api/me")
    print(f"BUG2 | Login returned {login.status_code} {login.json()}, then /api/me returned {me.status_code}")

    print(f"BUG3 | CORS_ORIGINS={PREVIEW_ORIGIN}, effective origins: {', '.join(settings.cors_origins)}")


if __name__ == "__main__":
    main()
