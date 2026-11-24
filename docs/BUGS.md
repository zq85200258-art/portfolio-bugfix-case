# Bug tracker

All three bugs are fixed in the current app. [CASE_STUDY.md](../CASE_STUDY.md) has reproduction commands, browser steps, and before-and-after results. The original [bug notes](../before/docs/BUGS.md) and [baseline tests](../before/tests/test_buggy_behavior.py) are preserved in `before/`.

| Bug | Before | After |
| --- | --- | --- |
| BUG1 | JSON login preflight returned HTTP 400 because the method policy omitted `POST`. | The explicit CORS policy allows credentialed JSON `GET` and `POST` from both preview origins. |
| BUG2 | Login returned HTTP 200, then `/api/me` and `/api/projects` returned HTTP 401 because the session cookie only covered `/api/login`. | The HTTP-only cookie covers `/api` and works over local HTTP with matching preview and API hostnames. |
| BUG3 | The loader read `CORS_ORIGIN` and ignored the documented `CORS_ORIGINS`. | The loader uses `CORS_ORIGINS` from the process environment or `.env` and defaults to the four loopback demo origins. A session signing key remains required. |
