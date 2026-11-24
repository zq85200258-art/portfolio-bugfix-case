import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import dotenv_values


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_CORS_ORIGINS = ("http://127.0.0.1:8000", "http://localhost:8000")


@dataclass(frozen=True, slots=True)
class Settings:
    session_secret: str
    demo_user_password: str
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = DEFAULT_CORS_ORIGINS


def load_settings(env_file: Path = PROJECT_ROOT / ".env") -> Settings:
    values = {**dotenv_values(env_file), **os.environ}

    session_secret = values.get("SESSION_SECRET")
    if not session_secret:
        raise ValueError("Set SESSION_SECRET in .env or the process environment.")

    demo_user_password = values.get("DEMO_USER_PASSWORD")
    if not demo_user_password:
        raise ValueError("Set DEMO_USER_PASSWORD in .env or the process environment.")

    # BUG3 (intentional, see docs/BUGS.md): Reads a different key than the example config.
    origins = values.get("CORS_ORIGIN") or ",".join(DEFAULT_CORS_ORIGINS)

    return Settings(
        session_secret=session_secret,
        demo_user_password=demo_user_password,
        host=values.get("APP_HOST") or "127.0.0.1",
        port=int(values.get("APP_PORT") or "8000"),
        cors_origins=tuple(origin.strip() for origin in origins.split(",") if origin.strip()),
    )
