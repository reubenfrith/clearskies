# ClearSkies — Session 3: FastAPI Migration & Railway Deployment

> Date: 2026-02-22
> Goal: Replace Node.js agent + Supabase with Python FastAPI backend on Railway PostgreSQL

---

## What We Did

### 1. Replaced the Node.js Agent with Python FastAPI

The `agent/` directory (Node.js + TypeScript) was deleted and replaced with `api/` (Python + FastAPI). The motivation:

- Node agent was local-only — never deployed, no Railway config
- Supabase was the only persistence layer; the frontend talked directly to Supabase
- Goal: a single deployable backend that handles both polling *and* REST endpoints for the frontend

**New structure:**
```
api/
  main.py              # FastAPI app, lifespan starts scheduler
  database.py          # asyncpg connection pool + helpers
  schema.sql           # PostgreSQL schema (no RLS)
  requirements.txt
  railway.toml
  .env.example
  polling/
    scheduler.py       # APScheduler, poll() every 5 min
    weather.py         # httpx + Open-Meteo (port of weatherPoller.ts)
    thresholds.py      # OSHA rules + DEMO_MODE (port of thresholdEngine.ts)
    geotab.py          # Geotab auth + zone lookup (port of geotabResolver.ts)
    alerts.py          # Twilio SMS (port of alertDispatcher.ts)
  routes/
    sites.py           # GET /api/sites, GET /api/sites/{id}
    holds.py           # GET /api/holds, GET /api/holds/active, POST, PATCH clear
    logs.py            # GET /api/logs
```

Each `polling/*.py` is a direct port of the corresponding TypeScript file:
- `async/await` → Python `async def`
- `Promise.allSettled` → `asyncio.gather(*tasks, return_exceptions=True)`
- `@supabase/supabase-js` → `asyncpg` with raw SQL
- `twilio` npm package → `twilio` Python SDK

---

### 2. React Frontend: Supabase Removed

`addin/src/lib/supabase.ts` was deleted. All pages now go through `addin/src/lib/api.ts` — a thin fetch wrapper pointing at `VITE_API_URL`.

```typescript
// api.ts pattern
const BASE = import.meta.env.VITE_API_URL;

async function get(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const api = {
  getSites: () => get('/api/sites'),
  getActiveHolds: (siteId?: string) => get(`/api/holds/active${siteId ? `?site_id=${siteId}` : ''}`),
  getHolds: (page = 0, pageSize = 25) => get(`/api/holds?page=${page}&page_size=${pageSize}`),
  // ...
};
```

`@supabase/supabase-js` was removed from `package.json`. GitHub Actions workflow updated to use `VITE_API_URL` secret instead of `VITE_SUPABASE_*`.

---

### 3. Railway Deployment

Railway is configured with:
- **Root directory**: `api/` (so Railway only sees the Python backend)
- **Build**: Nixpacks (auto-detects Python from `requirements.txt`)
- **Start command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- **PostgreSQL plugin**: Railway auto-sets `DATABASE_URL`

`railway.toml`:
```toml
[build]
builder = "nixpacks"

[deploy]
startCommand = "uvicorn main:app --host 0.0.0.0 --port $PORT"
```

---

## Bugs Fixed During Deployment

### Bug 1: `ModuleNotFoundError: No module named 'api'`

**Symptom:** Railway logs showed `ModuleNotFoundError: No module named 'api'` immediately on startup.

**Root cause:** The original `railway.toml` used `uvicorn api.main:app`. Because Railway's root directory is set to `api/`, the working directory at runtime *is* `api/`. There is no `api` package inside `api/` — just `main.py`. Python couldn't find a module named `api`.

**Fix:** Changed start command to `uvicorn main:app` (no `api.` prefix). Also removed the `api.` prefix from all internal imports across the codebase:
```python
# Before (broken)
from api.database import get_pool
from api.polling.thresholds import RULE_LABELS

# After (correct)
from database import get_pool
from polling.thresholds import RULE_LABELS
```

Files affected: `main.py`, `polling/scheduler.py`, `polling/alerts.py`, `routes/sites.py`, `routes/holds.py`, `routes/logs.py`.

**Lesson:** When Railway's root directory is a subdirectory, the app runs *from inside* that directory. Imports must be relative to that directory, not the repo root.

---

### Bug 2: 422 Unprocessable Content — `"Field required": "request"`

**Symptom:** Every API call returned:
```json
{"detail":[{"type":"missing","loc":["query","request"],"msg":"Field required","input":null}]}
```

**Root cause:** `database.py`'s `get_pool` function had an untyped parameter:
```python
# Broken — FastAPI sees untyped `request` as a required query param
def get_pool(request):
    return request.app.state.pool
```

FastAPI inspects function signatures to build its dependency graph. An untyped parameter with no default is treated as a required **query parameter**, not as an injected dependency. So FastAPI looked for `?request=` in the URL and 422'd when it wasn't there.

**Fix:** Add the type annotation:
```python
from fastapi import Request

def get_pool(request: Request):
    return request.app.state.pool
```

With `Request` as the type, FastAPI recognises this as a special injection (the raw HTTP request object) rather than a query param.

**Lesson:** FastAPI's dependency injection is entirely type-annotation driven. Missing or wrong type annotations on dependency functions produce confusing 422 errors, not import errors.

---

### Bug 3: Frontend calling wrong URL

**Symptom:** Network tab showed requests going to:
```
https://reubenfrith.github.io/clearskies/clearskies-production.up.railway.app/api/sites
```

**Root cause:** `VITE_API_URL` GitHub secret was set to `clearskies-production.up.railway.app` (no `https://` prefix). Vite inlined the raw string; the browser then resolved it as a relative path from the current page origin.

**Fix:** Update the GitHub secret to include the full URL:
```
VITE_API_URL=https://clearskies-production.up.railway.app
```

**Lesson:** Always include the scheme (`https://`) in base URL environment variables. A bare hostname looks like a relative path to a browser.

---

### Bug 4: `relation "sites" does not exist` — Schema not applied

**Symptom:** API returned 500. Railway logs showed:
```
asyncpg.exceptions.UndefinedTableError: relation "sites" does not exist
```

**Root cause:** Railway PostgreSQL provisions a blank database. The schema (`api/schema.sql`) must be run manually — Railway does not run it automatically.

**Fix:** Connect to Railway PostgreSQL using the external connection URL from Railway's Connect tab and run:
```bash
psql "postgresql://postgres:PASSWORD@gondola.proxy.rlwy.net:33935/railway" -f api/schema.sql
```

`psql` is available via Homebrew (`/opt/homebrew/bin/psql`). The Railway PostgreSQL external host is `gondola.proxy.rlwy.net:33935`.

**Status:** Pending — user still needs to run this command with their password.

---

## Prompts to Deepen Understanding

### Architecture

1. **Why replace Supabase with Railway PostgreSQL + FastAPI instead of keeping Supabase?**
   The frontend was reading directly from Supabase using the anon key. What are the downsides of having your frontend talk directly to the database? What does adding a FastAPI layer in between give you?

2. **The Python `api/` is one process that does two jobs: polling and serving HTTP. What are the trade-offs of combining these vs running them separately?**
   Think about failure modes: if the polling loop throws an unhandled exception, what happens to the HTTP server? What if it were two separate processes?

3. **Why does `asyncio.gather(*tasks, return_exceptions=True)` mirror `Promise.allSettled` rather than `Promise.all`?**
   `Promise.all` short-circuits on first rejection. `Promise.allSettled` collects all results. What's the equivalent difference in Python's `asyncio.gather`? When would you use `return_exceptions=False`?

4. **`database.py`'s `serialize_row()` manually converts UUIDs and datetimes to strings. Why doesn't asyncpg handle this automatically when returning JSON?**
   asyncpg returns Python-native types (`uuid.UUID`, `datetime`). FastAPI's JSON serialiser doesn't know how to handle these by default. What's the alternative approach — could you configure FastAPI to handle these types globally instead?

### FastAPI & Dependency Injection

5. **Why does FastAPI treat an untyped parameter as a query parameter rather than raising an error at startup?**
   FastAPI builds its route schemas from type annotations at import time. What's the design philosophy here — fail fast at startup, or be permissive and infer intent? What's the practical downside of the permissive approach?

6. **`get_pool` uses `Depends(get_pool)` in route handlers. Why is this better than importing the pool as a module-level global?**
   Consider testability: if the pool is injected, how does writing a test change? If it's a global, what problem do you hit when testing multiple routes?

### Deployment

7. **Railway sets `DATABASE_URL` automatically when you add the PostgreSQL plugin. Why is this more reliable than copy-pasting the connection string into an env var yourself?**
   What happens if Railway rotates the database password? What if you copy the wrong value?

8. **The start command is `uvicorn main:app --host 0.0.0.0 --port $PORT`. Why `0.0.0.0` instead of `127.0.0.1` (localhost)?**
   `127.0.0.1` binds to the loopback interface only — traffic from outside the container can't reach it. What does `0.0.0.0` bind to, and why does Railway's load balancer need this?

9. **Nixpacks auto-detects the Python version and installs dependencies from `requirements.txt`. What file does Nixpacks use to determine the Python version, and what happens if you don't specify one?**

### Debugging

10. **All three URL bugs (module path, import path, API URL) produced different error messages. Map each bug to its symptom:**
    - `ModuleNotFoundError: No module named 'api'` → ?
    - `422: Field required: request` → ?
    - Requests going to `github.io/clearskies/clearskies-production.up.railway.app/...` → ?

    For each: what was the actual mistake, and why did it produce that specific error rather than a more obvious one?

---

## Key Lessons

| Lesson | Context |
|---|---|
| Railway root directory changes the Python import context | `uvicorn api.main:app` fails when root dir is `api/`; use `uvicorn main:app` |
| FastAPI 422 on missing `request` means untyped dependency param | Add `request: Request` type annotation to `get_pool` |
| Base URLs must include scheme | `VITE_API_URL` without `https://` is treated as a relative path |
| Railway PostgreSQL starts empty | Always run schema manually after provisioning |
| Port TypeScript patterns idiomatically, don't transliterate | `Promise.allSettled` → `asyncio.gather(return_exceptions=True)`, not `try/except` in a loop |

---

## Current State (as of 2026-02-22)

| Component | Status |
|---|---|
| FastAPI backend | ✅ Deployed on Railway, starts cleanly |
| APScheduler polling loop | ✅ Running (5-min interval) |
| REST endpoints | ✅ Responding — `/api/sites`, `/api/holds`, `/api/logs` |
| Railway PostgreSQL | ⏳ Provisioned but schema not yet applied |
| React addin | ✅ Deployed to GitHub Pages with `VITE_API_URL` |
| Twilio SMS | ⏳ Env vars set; not yet tested end-to-end |
| End-to-end hold lifecycle | ⏳ Blocked on schema + seed data |
