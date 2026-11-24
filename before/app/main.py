from secrets import compare_digest
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from starlette.middleware.sessions import SessionMiddleware

from .config import PROJECT_ROOT, Settings, load_settings


DEMO_USER = {
    "email": "ava@northwind.example",
    "name": "Ava Chen",
    "studio": "Northwind Studio",
}
DEMO_PROJECTS = [
    {"title": "Atlas Brand Refresh", "status": "In progress"},
    {"title": "Harbor Launch Kit", "status": "Delivered"},
]


class LoginBody(BaseModel):
    email: str
    password: str


def require_user(request: Request) -> dict[str, str]:
    if request.session.get("user_email") != DEMO_USER["email"]:
        raise HTTPException(status_code=401, detail="Sign in required")
    return DEMO_USER


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings if settings is not None else load_settings()
    app = FastAPI(title="LumenDesk Client Portal")

    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret,
        session_cookie="lumendesk_session",
        # BUG2 (intentional, see docs/BUGS.md): Cookie is scoped to the sign-in URL.
        path="/api/login",
    )
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=True,
        # BUG1 (intentional, see docs/BUGS.md): JSON login's POST is missing from preflight policy.
        allow_methods=["GET"],
        allow_headers=["Content-Type"],
    )

    @app.get("/api/health")
    def health():
        return {"status": "ok"}

    @app.post("/api/login")
    def login(body: LoginBody, request: Request):
        email = body.email.strip().casefold()
        valid_password = compare_digest(
            body.password.encode("utf-8"), settings.demo_user_password.encode("utf-8")
        )
        if email != DEMO_USER["email"] or not valid_password:
            raise HTTPException(status_code=401, detail="Invalid email or password")

        request.session["user_email"] = DEMO_USER["email"]
        return {"user": DEMO_USER}

    @app.post("/api/logout")
    def logout(request: Request):
        request.session.clear()
        return {"status": "ok"}

    @app.get("/api/me")
    def me(user: Annotated[dict[str, str], Depends(require_user)]):
        return {"user": user}

    @app.get("/api/projects", dependencies=[Depends(require_user)])
    def projects():
        return {"projects": DEMO_PROJECTS}

    app.mount("/", StaticFiles(directory=PROJECT_ROOT / "frontend", html=True), name="frontend")
    return app
