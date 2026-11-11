from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Query, status

from app.core.deps import DbSession
from app.modules.maintenance import service
from app.modules.maintenance.models import InterventionStatus
from app.modules.maintenance.schemas import (
    DefectCreate,
    DefectRead,
    DueEquipmentRead,
    InterventionCreate,
    InterventionRead,
    InterventionUpdate,
    PartCreate,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


# Keep this above any parameterised routes added later (/{id}).
@router.get("/due", response_model=list[DueEquipmentRead])
def list_due(
    db: DbSession,
    within_days: Annotated[int, Query(ge=0)] = service.DEFAULT_WITHIN_DAYS,
    within_hours: Annotated[Decimal, Query(ge=0)] = service.DEFAULT_WITHIN_HOURS,
) -> list[DueEquipmentRead]:
    return service.list_due_equipment(db, within_days, within_hours)


@router.get("/defects", response_model=list[DefectRead])
def list_defects(
    db: DbSession,
    equipment_id: int | None = None,
    open_only: Annotated[bool | None, Query(alias="open")] = None,
) -> list[DefectRead]:
    defects = service.list_defects(db, equipment_id, open_only)
    return [DefectRead.model_validate(item) for item in defects]


@router.post("/defects", response_model=DefectRead, status_code=status.HTTP_201_CREATED)
def report_defect(db: DbSession, data: DefectCreate) -> DefectRead:
    return DefectRead.model_validate(service.report_defect(db, data))


@router.get("/interventions", response_model=list[InterventionRead])
def list_interventions(
    db: DbSession, equipment_id: int | None = None, status: InterventionStatus | None = None
) -> list[InterventionRead]:
    return service.list_interventions(db, equipment_id, status)


@router.get("/interventions/{intervention_id}", response_model=InterventionRead)
def get_intervention(db: DbSession, intervention_id: int) -> InterventionRead:
    return service.get_intervention(db, intervention_id)


@router.post("/interventions", response_model=InterventionRead, status_code=status.HTTP_201_CREATED)
def create_intervention(db: DbSession, data: InterventionCreate) -> InterventionRead:
    return service.create_intervention(db, data)


@router.patch("/interventions/{intervention_id}", response_model=InterventionRead)
def update_intervention(
    db: DbSession, intervention_id: int, data: InterventionUpdate
) -> InterventionRead:
    return service.update_intervention(db, intervention_id, data)


@router.post(
    "/interventions/{intervention_id}/parts",
    response_model=InterventionRead,
    status_code=status.HTTP_201_CREATED,
)
def add_intervention_part(
    db: DbSession, intervention_id: int, data: PartCreate
) -> InterventionRead:
    return service.add_intervention_part(db, intervention_id, data)
