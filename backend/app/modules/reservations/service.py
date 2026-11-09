"""Business logic for the reservations module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date

from sqlalchemy import exists, or_, select
from sqlalchemy.orm import Session

from app.modules.reservations.models import Reservation, ReservationStatus


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
