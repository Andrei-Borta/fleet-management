from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.modules.maintenance import service
from app.modules.maintenance.schemas import DueEquipmentRead

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


# Keep this above any parameterised routes added later (/{id}).
@router.get("/due", response_model=list[DueEquipmentRead])
def list_due(
    db: DbSession,
    within_days: Annotated[int, Query(ge=0)] = service.DEFAULT_WITHIN_DAYS,
    within_hours: Annotated[Decimal, Query(ge=0)] = service.DEFAULT_WITHIN_HOURS,
) -> list[DueEquipmentRead]:
    return service.list_due_equipment(db, within_days, within_hours)
