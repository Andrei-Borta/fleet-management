from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_error_handlers
from app.modules.reservations.router import reservation_conflict_handler
from app.modules.reservations.service import ReservationConflictError

app = FastAPI(title="Fleet Management API", version="0.1.0")
register_error_handlers(app)
app.add_exception_handler(ReservationConflictError, reservation_conflict_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_origins.split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", tags=["health"])
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(api_router, prefix="/api/v1")
