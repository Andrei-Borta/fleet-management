"""Business logic for the equipment module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.equipment.schemas import EquipmentCreate, EquipmentUpdate
from app.modules.reservations.service import BLOCKED_STATUSES, find_conflicts

UNIQUE_VIOLATION = "23505"
FOREIGN_KEY_VIOLATION = "23503"


def _sqlstate(exc: IntegrityError) -> str | None:
    return getattr(exc.orig, "sqlstate", None)


def _is_free(db: Session, equipment: Equipment, start: date, end: date) -> bool:
    """Not blocked, with no approved reservation or open maintenance in the period."""
    if equipment.status in BLOCKED_STATUSES:
        return False
    return not find_conflicts(db, equipment.id, start, end)


def list_equipment(
    db: Session,
    equipment_type: str | None = None,
    status: EquipmentStatus | None = None,
    available_from: date | None = None,
    available_to: date | None = None,
) -> list[Equipment]:
    """List equipment, optionally filtered by type, status and a period it must be free for."""
    if (available_from is None) != (available_to is None):
        raise InvalidDataError("available_from and available_to must be given together")
    if available_from is not None and available_to is not None and available_to < available_from:
        raise InvalidDataError("available_to must not be before available_from")

    query = select(Equipment).order_by(Equipment.id)
    if equipment_type is not None:
        query = query.where(Equipment.type == equipment_type)
    if status is not None:
        query = query.where(Equipment.status == status)
    items = list(db.scalars(query).all())
    if available_from is not None and available_to is not None:
        items = [item for item in items if _is_free(db, item, available_from, available_to)]
    return items


def get_equipment(db: Session, equipment_id: int, *, for_update: bool = False) -> Equipment:
    equipment = db.get(Equipment, equipment_id, with_for_update=for_update)
    if equipment is None:
        raise NotFoundError("Equipment not found")
    return equipment


def create_equipment(db: Session, data: EquipmentCreate) -> Equipment:
    equipment = Equipment(**data.model_dump())
    db.add(equipment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _sqlstate(exc) == UNIQUE_VIOLATION:
            raise ConflictError("Serial number is already in use") from exc
        raise
    db.refresh(equipment)
    return equipment


def update_equipment(db: Session, equipment_id: int, data: EquipmentUpdate) -> Equipment:
    # Locked so that a reservation cannot be checked against the status being replaced.
    equipment = get_equipment(db, equipment_id, for_update=True)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(equipment, field, value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _sqlstate(exc) == UNIQUE_VIOLATION:
            raise ConflictError("Serial number is already in use") from exc
        raise
    db.refresh(equipment)
    return equipment


def delete_equipment(db: Session, equipment_id: int) -> None:
    equipment = get_equipment(db, equipment_id)
    db.delete(equipment)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _sqlstate(exc) == FOREIGN_KEY_VIOLATION:
            raise ConflictError(
                "Cannot delete equipment with reservations, defects or service history"
            ) from exc
        raise
