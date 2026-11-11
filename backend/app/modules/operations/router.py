"""API router for the operations module."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.modules.operations import service
from app.modules.operations.schemas import (
    ChecklistCreate,
    ChecklistRead,
    UsageCreate,
    UsageRead,
    UsageSummaryRead,
)

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
    equipment_id: Annotated[int | None, Query()] = None,
    site_id: Annotated[int | None, Query()] = None,
) -> UsageSummaryRead:
    return service.list_usage(db, equipment_id=equipment_id, site_id=site_id)


@router.post("/checklists", response_model=ChecklistRead, status_code=201)
def create_checklist(
    data: ChecklistCreate,
    db: DbSession,
) -> ChecklistRead:
    return service.create_checklist(db, data)


@router.get("/checklists", response_model=list[ChecklistRead])
def list_checklists(
    db: DbSession,
    equipment_id: Annotated[int | None, Query()] = None,
    date: Annotated[date | None, Query()] = None,
) -> list[ChecklistRead]:
    return service.list_checklists(db, equipment_id=equipment_id, date=date)
