from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.modules.dashboard import service
from app.modules.dashboard.schemas import FleetStats, SiteCostsReport

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/fleet", response_model=FleetStats)
def fleet_stats(
    db: DbSession,
    range_start: Annotated[date, Query(alias="from")],
    range_end: Annotated[date, Query(alias="to")],
) -> FleetStats:
    return service.fleet_stats(db, range_start, range_end)


@router.get("/costs", response_model=SiteCostsReport)
def site_costs(db: DbSession, site_id: int | None = None) -> SiteCostsReport:
    return service.site_costs(db, site_id)
