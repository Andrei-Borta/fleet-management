from fastapi import APIRouter, status

from app.core.deps import DbSession
from app.modules.maintenance import service
from app.modules.maintenance.models import InterventionStatus
from app.modules.maintenance.schemas import (
    InterventionCreate,
    InterventionRead,
    InterventionUpdate,
    PartCreate,
)

router = APIRouter(prefix="/maintenance", tags=["maintenance"])


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
