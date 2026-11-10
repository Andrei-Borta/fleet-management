"""Service interventions and their labour and parts costs."""

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.equipment.service import get_equipment
from app.modules.maintenance.models import (
    Defect,
    InterventionKind,
    InterventionPart,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.maintenance.schemas import (
    InterventionCreate,
    InterventionRead,
    InterventionUpdate,
    PartCreate,
    PartRead,
)
from app.modules.reservations.service import find_conflicts


def _read(db: Session, intervention: ServiceIntervention) -> InterventionRead:
    parts = list(
        db.scalars(
            select(InterventionPart)
            .where(InterventionPart.intervention_id == intervention.id)
            .order_by(InterventionPart.id)
        )
    )
    total = (intervention.labor_hours * intervention.labor_rate) + sum(
        (part.qty * part.unit_cost for part in parts), Decimal("0")
    )
    return InterventionRead(
        id=intervention.id,
        equipment_id=intervention.equipment_id,
        defect_id=intervention.defect_id,
        description=intervention.description,
        kind=intervention.kind,
        scheduled_date=intervention.scheduled_date,
        status=intervention.status,
        started_at=intervention.started_at,
        completed_at=intervention.completed_at,
        labor_hours=intervention.labor_hours,
        labor_rate=intervention.labor_rate,
        parts=[PartRead.model_validate(part) for part in parts],
        total_cost=total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )


def _get(db: Session, intervention_id: int, *, lock: bool = False) -> ServiceIntervention:
    intervention = db.get(ServiceIntervention, intervention_id, with_for_update=lock)
    if intervention is None:
        raise NotFoundError("Intervention not found")
    return intervention


def list_interventions(
    db: Session, equipment_id: int | None = None, status: InterventionStatus | None = None
) -> list[InterventionRead]:
    query = select(ServiceIntervention).order_by(ServiceIntervention.id)
    if equipment_id is not None:
        query = query.where(ServiceIntervention.equipment_id == equipment_id)
    if status is not None:
        query = query.where(ServiceIntervention.status == status)
    return [_read(db, item) for item in db.scalars(query).all()]


def get_intervention(db: Session, intervention_id: int) -> InterventionRead:
    return _read(db, _get(db, intervention_id))


def create_intervention(db: Session, data: InterventionCreate) -> InterventionRead:
    # Reservation approvals lock the equipment row too, so scheduling cannot race an approval.
    get_equipment(db, data.equipment_id, for_update=True)
    if data.defect_id is not None:
        defect = db.get(Defect, data.defect_id)
        if defect is None:
            raise NotFoundError("Defect not found")
        if defect.equipment_id != data.equipment_id:
            raise ConflictError("Defect belongs to different equipment")
    conflicts = find_conflicts(db, data.equipment_id, data.scheduled_date, data.scheduled_date)
    if any(item.kind == "reservation" for item in conflicts):
        raise ConflictError("Equipment has an approved reservation on the scheduled date")
    intervention = ServiceIntervention(**data.model_dump())
    db.add(intervention)
    db.commit()
    db.refresh(intervention)
    return _read(db, intervention)


def update_intervention(
    db: Session, intervention_id: int, data: InterventionUpdate
) -> InterventionRead:
    # Equipment is locked first, matching reservation operations and revision readings updates.
    existing = _get(db, intervention_id)
    equipment = get_equipment(db, existing.equipment_id, for_update=True)
    intervention = _get(db, intervention_id, lock=True)
    changes = data.model_dump(exclude_unset=True)
    if intervention.status == InterventionStatus.DONE and changes:
        raise ConflictError("Completed interventions cannot be changed")
    next_status = changes.get("status", intervention.status)
    allowed = {
        InterventionStatus.PLANNED: InterventionStatus.IN_PROGRESS,
        InterventionStatus.IN_PROGRESS: InterventionStatus.DONE,
    }
    if next_status != intervention.status and allowed.get(intervention.status) != next_status:
        raise ConflictError("Interventions must move from planned to in progress to done")
    if next_status != intervention.status:
        now = datetime.now(UTC)
        if next_status == InterventionStatus.IN_PROGRESS:
            if intervention.scheduled_date > now.date():
                raise ConflictError("Cannot start an intervention before its scheduled date")
            # An in-progress intervention has an open-ended reservation block.
            conflicts = find_conflicts(db, equipment.id, now.date(), date.max)
            if any(item.kind == "reservation" for item in conflicts):
                raise ConflictError("Equipment has approved reservations during the intervention")
            intervention.started_at = now
        elif next_status == InterventionStatus.DONE:
            intervention.completed_at = now
            if intervention.kind == InterventionKind.REVISION:
                equipment.last_service_at = now
                equipment.last_service_hours = equipment.engine_hours
    for field, value in changes.items():
        setattr(intervention, field, value)
    db.commit()
    db.refresh(intervention)
    return _read(db, intervention)


def add_intervention_part(db: Session, intervention_id: int, data: PartCreate) -> InterventionRead:
    intervention = _get(db, intervention_id, lock=True)
    if intervention.status == InterventionStatus.DONE:
        raise ConflictError("Cannot add parts to a completed intervention")
    db.add(InterventionPart(intervention_id=intervention_id, **data.model_dump()))
    db.commit()
    db.refresh(intervention)
    return _read(db, intervention)
