"""Business logic for the reservations module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import InterventionStatus, ServiceIntervention
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.schemas import ConflictRead

BLOCKED_STATUSES = (
    EquipmentStatus.DEFECTIVE,
    EquipmentStatus.IN_SERVICE,
    EquipmentStatus.RETIRED,
)


class ReservationConflictError(ConflictError):
    """The equipment cannot be reserved for the period; carries what stands in the way."""

    def __init__(self, message: str, conflicts: list[ConflictRead]) -> None:
        super().__init__(message)
        self.conflicts = conflicts


def periods_overlap(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    """True if two inclusive date ranges overlap. Building block for conflict detection."""
    if start_a > end_a or start_b > end_b:
        raise ValueError("start date must not be after end date")
    return start_a <= end_b and start_b <= end_a


def has_approved_outside_site_dates(
    db: Session, site_id: int, start_date: date, end_date: date
) -> bool:
    """Return whether an approved reservation extends beyond the proposed site period."""
    if start_date > end_date:
        raise ValueError("start date must not be after end date")
    return bool(
        db.scalar(
            select(
                exists().where(
                    Reservation.site_id == site_id,
                    Reservation.status == ReservationStatus.APPROVED,
                    or_(Reservation.start_date < start_date, Reservation.end_date > end_date),
                )
            )
        )
    )


def _validate_period(start: date, end: date) -> None:
    if start > end:
        raise InvalidDataError("start date must not be after end date")


def _maintenance_end(intervention: ServiceIntervention) -> date | None:
    """A planned job blocks its scheduled day; one in progress has no known end."""
    if intervention.status == InterventionStatus.PLANNED:
        return intervention.scheduled_date
    return None


def find_conflicts(db: Session, equipment_id: int, start: date, end: date) -> list[ConflictRead]:
    """Approved reservations and open maintenance that overlap the period."""
    _validate_period(start, end)
    reservations = db.scalars(
        select(Reservation)
        .where(
            Reservation.equipment_id == equipment_id,
            Reservation.status == ReservationStatus.APPROVED,
        )
        .order_by(Reservation.start_date, Reservation.id)
    ).all()
    interventions = db.scalars(
        select(ServiceIntervention)
        .where(
            ServiceIntervention.equipment_id == equipment_id,
            ServiceIntervention.status != InterventionStatus.DONE,
        )
        .order_by(ServiceIntervention.scheduled_date, ServiceIntervention.id)
    ).all()

    reservation_conflicts = [
        ConflictRead(
            kind="reservation",
            id=reservation.id,
            start_date=reservation.start_date,
            end_date=reservation.end_date,
            status=reservation.status.value,
        )
        for reservation in reservations
        if periods_overlap(start, end, reservation.start_date, reservation.end_date)
    ]
    maintenance_conflicts = [
        ConflictRead(
            kind="maintenance",
            id=intervention.id,
            start_date=intervention.scheduled_date,
            end_date=_maintenance_end(intervention),
            status=intervention.status.value,
        )
        for intervention in interventions
        if periods_overlap(
            start, end, intervention.scheduled_date, _maintenance_end(intervention) or date.max
        )
    ]
    return reservation_conflicts + maintenance_conflicts


def ensure_reservable(db: Session, equipment_id: int, start: date, end: date) -> None:
    """Raise unless the equipment can be booked for the period.

    Locks the equipment row until the transaction ends, so two simultaneous requests for
    the same machine are checked one after the other and cannot both succeed.
    """
    equipment = db.get(Equipment, equipment_id, with_for_update=True)
    if equipment is None:
        raise NotFoundError("Equipment not found")
    if equipment.status in BLOCKED_STATUSES:
        raise ReservationConflictError(
            f"Equipment is {equipment.status.value} and cannot be reserved", []
        )
    conflicts = find_conflicts(db, equipment_id, start, end)
    if conflicts:
        raise ReservationConflictError(
            "Equipment is already booked or in maintenance for this period", conflicts
        )
