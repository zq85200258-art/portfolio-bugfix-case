# LumenDesk Client Portal

LumenDesk is a fictional client portal with one demo account and two sample projects. This is the **BEFORE** version of a bugfix case study. The three known bugs are documented in [BUGS.md](docs/BUGS.md).

## Run locally

Use Python 3.12. From the repo root in PowerShell, create a virtual environment and a local config file.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
.\.venv\Scripts\python.exe -c "import secrets; print(secrets.token_urlsafe(32))"
```

Paste the generated value into `SESSION_SECRET` in `.env`, then start the API.

```powershell
.\.venv\Scripts\python.exe -m app
```

The default address is `http://127.0.0.1:8000`. Try `GET /api/health` or open `/docs` for the API reference. The demo email is `ava@northwind.example` and the example password is `demo-password-only`.

The UI will live in `frontend/`. Once `frontend/index.html` exists, the API server will serve it at `/`.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Check that the API is running |
| POST | `/api/login` | Sign in with `email` and `password` |
| POST | `/api/logout` | Sign out |
| GET | `/api/me` | Read the signed-in user's profile |
| GET | `/api/projects` | List the signed-in user's projects |

## Verify the before state

After the dependencies are installed, run these commands from the repo root. Both use an in-process test client and can run offline without a server or a local `.env`.

```powershell
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m scripts.reproduce
```

The baseline tests pass when the current symptoms reproduce.
