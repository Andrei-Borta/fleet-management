"""Business logic for the maintenance module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import UTC, date, datetime
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.deps import Role
from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.equipment import service as equipment_service
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.equipment.service import get_equipment
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    DefectStatus,
    InterventionKind,
    InterventionPart,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.maintenance.rules import (
    days_until_due,
    hours_until_due,
    is_service_due,
)
from app.modules.maintenance.schemas import (
    DefectCreate,
    DueEquipmentRead,
    InterventionCreate,
    InterventionRead,
    InterventionUpdate,
    PartCreate,
    PartRead,
)
from app.modules.notifications.service import notify
from app.modules.reservations.service import find_conflicts

DEFAULT_WITHIN_DAYS = 7
DEFAULT_WITHIN_HOURS = Decimal(50)
_NO_DAYS = 10**9  # sorts rows without a day-based interval last


def _has_in_progress_intervention(db: Session, equipment_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    ServiceIntervention.equipment_id == equipment_id,
                    ServiceIntervention.status == InterventionStatus.IN_PROGRESS,
                )
            )
        )
    )


def _has_open_critical_defect(db: Session, equipment_id: int) -> bool:
    return bool(
        db.scalar(
            select(
                exists().where(
                    Defect.equipment_id == equipment_id,
                    Defect.status == DefectStatus.OPEN,
                    Defect.severity == DefectSeverity.CRITICAL,
                )
            )
        )
    )


def recompute_status(db: Session, equipment_id: int) -> Equipment:
    """Single source of truth for the stored status of equipment.

    Retired equipment is left alone. Otherwise an intervention in progress means
    ``in_service``, an open critical defect means ``defective``, and anything else is
    ``available``. ``reserved`` is never stored: it is derived from approved reservations.

    Flushes but does not commit, so the caller can change a defect or intervention and the
    status in one transaction. The equipment row is locked until that transaction ends.
    """
    equipment = equipment_service.get_equipment(db, equipment_id, for_update=True)
    if equipment.status == EquipmentStatus.RETIRED:
        return equipment
    if _has_in_progress_intervention(db, equipment_id):
        equipment.status = EquipmentStatus.IN_SERVICE
    elif _has_open_critical_defect(db, equipment_id):
        equipment.status = EquipmentStatus.DEFECTIVE
    else:
        equipment.status = EquipmentStatus.AVAILABLE
    db.flush()
    return equipment


def list_defects(
    db: Session, equipment_id: int | None = None, open_only: bool | None = None
) -> list[Defect]:
    """List defects, optionally for one machine and only open (True) or resolved (False)."""
    query = select(Defect).order_by(Defect.id)
    if equipment_id is not None:
        query = query.where(Defect.equipment_id == equipment_id)
    if open_only is not None:
        wanted = DefectStatus.OPEN if open_only else DefectStatus.RESOLVED
        query = query.where(Defect.status == wanted)
    return list(db.scalars(query).all())


def announce_defect(db: Session, defect: Defect) -> None:
    """Notify the mechanics and the fleet manager of a new defect. Does not commit."""
    equipment = db.get(Equipment, defect.equipment_id)
    title = f"Defect reported: {equipment.name}"
    body = f"{defect.severity.value.capitalize()} severity: {defect.description}"
    for role in (Role.MECHANIC, Role.FLEET_MANAGER):
        notify(db, role, title, body, "/maintenance")


def report_defect(db: Session, data: DefectCreate) -> Defect:
    """Record an open defect, then recompute status in the same transaction.

    ``recompute_status`` locks the equipment row and flushes, but does not commit. An open
    critical defect blocks the machine unless it is retired or already in service.
    """
    get_equipment(db, data.equipment_id, for_update=True)
    defect = Defect(**data.model_dump())
    db.add(defect)
    # autoflush is off, so the new row must be visible before status is recomputed.
    db.flush()
    recompute_status(db, data.equipment_id)
    announce_defect(db, defect)
    db.commit()
    db.refresh(defect)
    return defect


def list_due_equipment(
    db: Session,
    within_days: int = DEFAULT_WITHIN_DAYS,
    within_hours: Decimal = DEFAULT_WITHIN_HOURS,
    today: date | None = None,
) -> list[DueEquipmentRead]:
    """Equipment that is overdue or will be within the given days or engine hours.

    Retired equipment is left out. Overdue equipment comes first, then the rest by days left.
    """
    if within_days < 0 or within_hours < 0:
        raise InvalidDataError("within_days and within_hours must not be negative")
    today = today or date.today()

    items = db.scalars(
        select(Equipment).where(Equipment.status != EquipmentStatus.RETIRED).order_by(Equipment.id)
    ).all()
    rows: list[DueEquipmentRead] = []
    for item in items:
        days = days_until_due(item, today)
        hours = hours_until_due(item)
        due_soon = (days is not None and days <= within_days) or (
            hours is not None and hours <= within_hours
        )
        if not due_soon:
            continue
        rows.append(
            DueEquipmentRead(
                equipment_id=item.id,
                name=item.name,
                type=item.type,
                status=item.status,
                days_until_due=days,
                hours_until_due=hours,
                overdue=is_service_due(item, today),
            )
        )
    rows.sort(
        key=lambda row: (
            not row.overdue,
            _NO_DAYS if row.days_until_due is None else row.days_until_due,
            row.equipment_id,
        )
    )
    return rows


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
    if data.kind == InterventionKind.REVISION:
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
    existing_status = intervention.status
    next_status = changes.get("status", existing_status)
    allowed = {
        InterventionStatus.PLANNED: InterventionStatus.IN_PROGRESS,
        InterventionStatus.IN_PROGRESS: InterventionStatus.DONE,
    }
    if next_status != intervention.status and allowed.get(intervention.status) != next_status:
        raise ConflictError("Interventions must move from planned to in progress to done")
    if next_status != intervention.status:
        now = datetime.now(UTC)
        if next_status == InterventionStatus.IN_PROGRESS:
            if intervention.kind == InterventionKind.REVISION:
                if intervention.scheduled_date > now.date():
                    raise ConflictError("Cannot start a revision before its scheduled date")
                # An in-progress intervention has an open-ended reservation block.
                conflicts = find_conflicts(db, equipment.id, now.date(), date.max)
                if any(item.kind == "reservation" for item in conflicts):
                    raise ConflictError(
                        "Equipment has approved reservations during the intervention"
                    )
            intervention.started_at = now
        elif next_status == InterventionStatus.DONE:
            intervention.completed_at = now
            if intervention.kind == InterventionKind.REVISION:
                equipment.last_service_at = now
                equipment.last_service_hours = equipment.engine_hours
            elif intervention.defect_id is not None:
                defect = db.get(Defect, intervention.defect_id, with_for_update=True)
                if defect is not None and defect.status == DefectStatus.OPEN:
                    defect.status = DefectStatus.RESOLVED
                    defect.resolved_at = now
    for field, value in changes.items():
        setattr(intervention, field, value)
    if next_status != existing_status:
        # The session disables autoflush; recomputation queries must see both changes.
        db.flush()
        recompute_status(db, equipment.id)
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
