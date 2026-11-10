"""Business logic for the maintenance module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date
from decimal import Decimal

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError
from app.modules.equipment import service as equipment_service
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    DefectStatus,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.maintenance.rules import (
    days_until_due,
    hours_until_due,
    is_service_due,
)
from app.modules.maintenance.schemas import DueEquipmentRead

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
