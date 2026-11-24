# Known bugs in the BEFORE version

Run `python -m scripts.reproduce` from the repo root in the virtual environment. The script exercises all three symptoms with an in-process HTTP client.

## BUG1 — Cross-origin login is blocked

A browser preview at `http://127.0.0.1:5500` tries to send a JSON login request to port 8000 with credentials. Before sending the login, it asks the API which methods are allowed. The API returns HTTP 400 for that preflight request.

The reproducer supplies the preview origin directly, then sends `OPTIONS /api/login` with `Origin: http://127.0.0.1:5500`, `Access-Control-Request-Method: POST`, and `Access-Control-Request-Headers: content-type`. The response recognizes the origin and allows credentials, but its allowed methods omit `POST`. Inspect the CORS middleware policy in `app/main.py`.

## BUG2 — A successful login leaves the portal signed out

A same-origin `POST /api/login` with the demo credentials returns HTTP 200 and Ava's profile. In the same client, `GET /api/me` and `GET /api/projects` both return HTTP 401.

Use a client that retains cookies across requests. Inspect the `Set-Cookie` attributes on the login response and the request headers on `/api/me`. The cookie is scoped to `/api/login`, so the client leaves it off the profile request. Inspect the session middleware setup in `app/main.py`.

## BUG3 — The documented preview origins are ignored

Set `CORS_ORIGINS=http://127.0.0.1:5500` using the documented config name and inspect the settings loaded by the app. The effective list still contains only the port 8000 defaults. Copying the example to `.env` produces the same result even though the preview origins are listed there.

The reproducer prints the supplied and effective origins side by side. Inspect the environment lookup and fallback in `app/config.py`. This adds a second reason the preview login preflight fails under the example config.
