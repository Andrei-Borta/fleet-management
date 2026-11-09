"""Business logic for the reservations module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.core.deps import Role
from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import InterventionStatus, ServiceIntervention
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.schemas import (
    CalendarEquipmentRead,
    CalendarEventRead,
    CalendarSiteRead,
    ConflictRead,
    ReservationCreate,
)
from app.modules.sites.models import Site

BLOCKED_STATUSES = (
    EquipmentStatus.DEFECTIVE,
    EquipmentStatus.IN_SERVICE,
    EquipmentStatus.RETIRED,
)

MAX_CALENDAR_DAYS = 93
# Rejected and cancelled requests occupy nothing, so the calendar leaves them out.
CALENDAR_RESERVATION_STATUSES = (ReservationStatus.PENDING, ReservationStatus.APPROVED)


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


def has_upcoming_approved_reservation(db: Session, equipment_id: int, today: date) -> bool:
    """Return whether an approved reservation of the equipment ends today or later."""
    return bool(
        db.scalar(
            select(
                exists().where(
                    Reservation.equipment_id == equipment_id,
                    Reservation.status == ReservationStatus.APPROVED,
                    Reservation.end_date >= today,
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


def list_reservations(
    db: Session,
    site_id: int | None = None,
    equipment_id: int | None = None,
    status: ReservationStatus | None = None,
) -> list[Reservation]:
    query = select(Reservation).order_by(Reservation.start_date, Reservation.id)
    if site_id is not None:
        query = query.where(Reservation.site_id == site_id)
    if equipment_id is not None:
        query = query.where(Reservation.equipment_id == equipment_id)
    if status is not None:
        query = query.where(Reservation.status == status)
    return list(db.scalars(query).all())


def _validate_calendar_range(start: date, end: date) -> None:
    if end < start:
        raise InvalidDataError("'to' must not be before 'from'")
    if (end - start).days + 1 > MAX_CALENDAR_DAYS:
        raise InvalidDataError(f"The calendar range must not exceed {MAX_CALENDAR_DAYS} days")


def _maintenance_period(intervention: ServiceIntervention) -> tuple[date, date | None]:
    """Planned jobs take their scheduled day, finished ones run until completion."""
    start = intervention.scheduled_date
    if intervention.status == InterventionStatus.PLANNED:
        return start, start
    if intervention.status == InterventionStatus.IN_PROGRESS or intervention.completed_at is None:
        return start, None
    return start, max(start, intervention.completed_at.date())


def list_calendar_events(
    db: Session,
    start: date,
    end: date,
    site_id: int | None = None,
    equipment_id: int | None = None,
) -> list[CalendarEventRead]:
    """Reservations and maintenance that touch the period, ordered by start date.

    Maintenance belongs to the equipment, not to a site, so it is left out when filtering by site.
    """
    _validate_calendar_range(start, end)

    reservation_query = (
        select(Reservation, Equipment, Site)
        .join(Equipment, Reservation.equipment_id == Equipment.id)
        .join(Site, Reservation.site_id == Site.id)
        .where(
            Reservation.status.in_(CALENDAR_RESERVATION_STATUSES),
            Reservation.start_date <= end,
            Reservation.end_date >= start,
        )
    )
    if site_id is not None:
        reservation_query = reservation_query.where(Reservation.site_id == site_id)
    if equipment_id is not None:
        reservation_query = reservation_query.where(Reservation.equipment_id == equipment_id)

    events = [
        CalendarEventRead(
            type="reservation",
            id=reservation.id,
            equipment=CalendarEquipmentRead(
                id=equipment.id, name=equipment.name, type=equipment.type
            ),
            site=CalendarSiteRead(id=site.id, name=site.name),
            start=reservation.start_date,
            end=reservation.end_date,
            status=reservation.status.value,
        )
        for reservation, equipment, site in db.execute(reservation_query).all()
    ]

    if site_id is None:
        maintenance_query = (
            select(ServiceIntervention, Equipment)
            .join(Equipment, ServiceIntervention.equipment_id == Equipment.id)
            .where(ServiceIntervention.scheduled_date <= end)
        )
        if equipment_id is not None:
            maintenance_query = maintenance_query.where(
                ServiceIntervention.equipment_id == equipment_id
            )
        for intervention, equipment in db.execute(maintenance_query).all():
            job_start, job_end = _maintenance_period(intervention)
            if job_end is not None and job_end < start:
                continue
            events.append(
                CalendarEventRead(
                    type="maintenance",
                    id=intervention.id,
                    equipment=CalendarEquipmentRead(
                        id=equipment.id, name=equipment.name, type=equipment.type
                    ),
                    site=None,
                    start=job_start,
                    end=job_end,
                    status=intervention.status.value,
                )
            )

    events.sort(key=lambda event: (event.start, event.equipment.id, event.type, event.id))
    return events


def _outside_site_dates(site: Site, start: date, end: date) -> bool:
    return start < site.start_date or end > site.end_date


def create_reservation(db: Session, data: ReservationCreate, role: Role) -> Reservation:
    """Create a pending request. Fails if the equipment cannot be booked for the period."""
    site = db.get(Site, data.site_id)
    if site is None:
        raise NotFoundError("Site not found")
    if _outside_site_dates(site, data.start_date, data.end_date):
        raise InvalidDataError("Reservation dates must be within the site dates")
    ensure_reservable(db, data.equipment_id, data.start_date, data.end_date)
    reservation = Reservation(**data.model_dump(), requested_by_role=role.value)
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation


def _lock_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = db.get(Reservation, reservation_id, with_for_update=True)
    if reservation is None:
        raise NotFoundError("Reservation not found")
    return reservation


def _require_pending(reservation: Reservation, action: str) -> None:
    if reservation.status != ReservationStatus.PENDING:
        raise ConflictError(f"Only pending reservations can be {action}")


def _set_status(db: Session, reservation: Reservation, status: ReservationStatus) -> Reservation:
    reservation.status = status
    db.commit()
    db.refresh(reservation)
    return reservation


def approve_reservation(db: Session, reservation_id: int) -> Reservation:
    """Approve a pending request, re-checking conflicts as the fleet may have changed."""
    reservation = _lock_reservation(db, reservation_id)
    _require_pending(reservation, "approved")
    # Locked so that the site's dates cannot change while this approval is being decided.
    site = db.get(Site, reservation.site_id, with_for_update=True)
    if _outside_site_dates(site, reservation.start_date, reservation.end_date):
        raise ConflictError("Reservation dates are no longer within the site dates")
    ensure_reservable(db, reservation.equipment_id, reservation.start_date, reservation.end_date)
    return _set_status(db, reservation, ReservationStatus.APPROVED)


def reject_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = _lock_reservation(db, reservation_id)
    _require_pending(reservation, "rejected")
    return _set_status(db, reservation, ReservationStatus.REJECTED)


def cancel_reservation(db: Session, reservation_id: int) -> Reservation:
    """Cancel a request that is still pending or already approved."""
    reservation = _lock_reservation(db, reservation_id)
    if reservation.status not in (ReservationStatus.PENDING, ReservationStatus.APPROVED):
        raise ConflictError("Only pending or approved reservations can be cancelled")
    return _set_status(db, reservation, ReservationStatus.CANCELLED)
