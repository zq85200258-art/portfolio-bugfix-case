# Repairing the LumenDesk sign-in flow

LumenDesk is a small FastAPI client portal with one demo account and two studio projects. The existing UI can run on the API server or from a static preview on port 5500. Three errors typical of AI-generated web apps broke the handoff between the browser, authentication middleware, and startup configuration. The login endpoint could return HTTP 200 while the portal stayed signed out.

The pre-fix source, UI, and tests are preserved in [`before/`](before/). The demo uses the existing frontend.

## Reproduce the demo

Install the Python dependencies as shown in the [README](README.md). From the repository root, run these PowerShell commands to start the original API with the documented preview origins.

```powershell
$env:SESSION_SECRET = & .\.venv\Scripts\python.exe -c 'import secrets; print(secrets.token_urlsafe(32))'
$env:DEMO_USER_PASSWORD = 'demo-password-only'
$env:CORS_ORIGINS = 'http://127.0.0.1:5500,http://localhost:5500'
Push-Location before
try { ..\.venv\Scripts\python.exe -m app } finally { Pop-Location }
```

In a second terminal at the repository root, start the static preview.

```powershell
.\.venv\Scripts\python.exe -m http.server 5500 --bind 127.0.0.1 --directory frontend
```

Use a fresh browser session for each comparison. To switch to the repaired API, stop the original API with `Ctrl+C` and run `.\.venv\Scripts\python.exe -m app` from the repository root in the same terminal. The preview can stay running.

## BUG1 — The browser blocked sign-in from port 5500

Open [the port 5500 preview](http://127.0.0.1:5500/?api=http://127.0.0.1:8000), open DevTools **Network**, and click **Sign in** with `ava@northwind.example` and `demo-password-only`. The preview points to the API on port 8000. With the original API, `OPTIONS /api/login` returns `400` and the browser stops before sending the login `POST`.

The ports make these URLs different origins. Before sending the JSON `POST`, the browser asks the API whether the origin, method, and headers are allowed. The original CORS policy allowed only `GET`. The offline reproducer supplies the preview origin directly to isolate this bug from the configuration error below.

The repaired policy allows `GET`, `POST`, and `Content-Type` for explicit origins with credentials enabled. With the documented origins loaded, the preflight returns `200` and names the exact preview origin. The login `POST` can then reach the API. [CORS middleware configuration](app/main.py)

## BUG2 — Successful login still left the user signed out

Open [the API-served portal on port 8000](http://127.0.0.1:8000/) and keep the footer in **Same-origin** mode. Click **Sign in** with the same demo credentials. With the original API, `POST /api/login` returns `200` with Ava Chen's profile, followed immediately by `401` from `GET /api/me`. Opening `/api/projects` on port 8000 in the same browser session also returns `401`.

The login response set a session cookie with `Path=/api/login`. The browser sent it only to that path and its descendants, leaving `/api/me` and `/api/projects` without the session. The fix scopes the signed, `HttpOnly` cookie to `/api`, which includes login, profile, projects, and logout. `SameSite=Lax` permits the preview requests because the scheme and hostname match across the two ports. The cookie omits `Secure` for the local HTTP demo.

After the fix, `/api/me` returns Ava's profile and `/api/projects` returns **Atlas Brand Refresh** and **Harbor Launch Kit**. Reload the page to check session restore, then click **Sign out** to clear the session. The preview also supports `http://localhost:5500` paired with `http://localhost:8000`. [Session middleware configuration](app/main.py)

## BUG3 — The documented origin list had no effect

With `CORS_ORIGINS` set as above, run this command in another terminal. It probes `GET`, a method the original CORS policy already allowed, so the result isolates the origin setting.

```powershell
curl.exe -i -X OPTIONS http://127.0.0.1:8000/api/me `
  -H 'Origin: http://127.0.0.1:5500' `
  -H 'Access-Control-Request-Method: GET' `
  -H 'Access-Control-Request-Headers: content-type'
```

The original loader looked up `CORS_ORIGIN` in the singular and fell back to the port 8000 origins. The API returned `400` for the preview. The repaired loader reads `CORS_ORIGINS`, trims the comma-separated entries, and falls back to the four documented loopback origins when unset. The same probe returns `200` with `Access-Control-Allow-Origin: http://127.0.0.1:5500` and `Access-Control-Allow-Credentials: true`. The regression suite covers environment overrides and the configured demo password. The original startup check already rejected a missing `SESSION_SECRET`, and the fixed app retains and tests that behavior. [Settings loader](app/config.py)

## Compare before and after offline

The in-process diagnostic reports the preflight status, follow-up profile status, and effective origins. Run both copies from the repository root, then run the regression suite against the fixed tree.

```powershell
Push-Location before
try { ..\.venv\Scripts\python.exe -m scripts.reproduce } finally { Pop-Location }
.\.venv\Scripts\python.exe -m scripts.reproduce
.\.venv\Scripts\python.exe -m pytest -q
```

| Diagnostic | Before | After |
| --- | --- | --- |
| Login preflight with the preview origin supplied directly | `400`, `GET` | `200`, `GET, POST` |
| Login followed by a profile request | `200` then `401` | `200` then `200` |
| Effective origins with `CORS_ORIGINS=http://127.0.0.1:5500` | Both port 8000 defaults | `http://127.0.0.1:5500` |

The offline run reproduced all three failures in `before/` and passed all eight tests in the fixed tree. That run verified API responses and cookie handling in process. The browser steps above are the manual verification path.

## What to watch for in AI-generated web apps

Test sign-in through the first protected screen, a reload, and sign-out. Exercise the actual browser origin and request headers, since a same-origin check skips the cross-origin preflight. Test documented environment variables with values that differ from the defaults so a misspelled setting produces a visible failure.
