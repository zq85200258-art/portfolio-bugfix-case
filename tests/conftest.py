import pytest

from app.config import Settings


@pytest.fixture
def settings() -> Settings:
    return Settings(
        session_secret="test-only-session-signing-placeholder",
        demo_user_password="demo-password-only",
    )
