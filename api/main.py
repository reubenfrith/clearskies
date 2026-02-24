import logging
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from auth.dependencies import get_current_user
from database import create_pool, close_pool
from polling.scheduler import start_scheduler, shutdown_scheduler
from routes import sites, holds, logs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ───────────────────────────────────────────────────────────────
    app.state.pool = await create_pool()
    await start_scheduler(app.state.pool)

    yield

    # ── Shutdown ──────────────────────────────────────────────────────────────
    shutdown_scheduler()
    await close_pool(app.state.pool)


app = FastAPI(title="ClearSkies API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://my.geotab.com",
        "https://reubenfrith.github.io",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_auth = [Depends(get_current_user)]
app.include_router(sites.router, prefix="/api", dependencies=_auth)
app.include_router(holds.router, prefix="/api", dependencies=_auth)
app.include_router(logs.router, prefix="/api", dependencies=_auth)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/debug-key")
async def debug_key():
    import os
    key = os.environ.get("API_KEY", "")
    return {"len": len(key), "repr": repr(key[:6])}
