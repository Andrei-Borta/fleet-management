"""API router for the operations module."""

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.modules.operations import service
from app.modules.operations.schemas import UsageCreate, UsageRead, UsageSummaryRead

router = APIRouter(prefix="/operations", tags=["operations"])


@router.post("/usage", response_model=UsageRead, status_code=201)
def create_usage_log(
    data: UsageCreate,
    db: DbSession,
) -> UsageRead:
    return service.log_usage(db, data)


@router.get("/usage", response_model=UsageSummaryRead)
def list_usage_logs(
    db: DbSession,
    equipment_id: int | None = Query(None),
    site_id: int | None = Query(None),
) -> UsageSummaryRead:
    return service.list_usage(db, equipment_id=equipment_id, site_id=site_id)
