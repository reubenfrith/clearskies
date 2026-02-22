import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

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
        "https://reubenfrith.github.io",
        "http://localhost:5173",
        "http://localhost:3000",
        "http://localhost:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sites.router, prefix="/api")
app.include_router(holds.router, prefix="/api")
app.include_router(logs.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
