from datetime import date

import pytest
from sqlalchemy.orm import Session

from app.modules.equipment.models import Equipment
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.service import has_approved_outside_site_dates, periods_overlap
from app.modules.sites.models import Site

D = date


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ((D(2026, 11, 1), D(2026, 11, 5)), (D(2026, 11, 5), D(2026, 11, 9)), True),
        ((D(2026, 11, 1), D(2026, 11, 5)), (D(2026, 11, 6), D(2026, 11, 9)), False),
        ((D(2026, 11, 1), D(2026, 11, 30)), (D(2026, 11, 10), D(2026, 11, 12)), True),
    ],
)
def test_periods_overlap(a, b, expected):
    assert periods_overlap(*a, *b) is expected
    assert periods_overlap(*b, *a) is expected


def test_periods_overlap_rejects_inverted_range():
    with pytest.raises(ValueError):
        periods_overlap(D(2026, 11, 5), D(2026, 11, 1), D(2026, 11, 1), D(2026, 11, 2))


@pytest.mark.parametrize(
    ("reservation_status", "start", "end", "expected"),
    [
        (ReservationStatus.APPROVED, D(2026, 2, 1), D(2026, 2, 28), False),
        (ReservationStatus.APPROVED, D(2026, 1, 31), D(2026, 2, 28), True),
        (ReservationStatus.APPROVED, D(2026, 2, 1), D(2026, 3, 1), True),
        (ReservationStatus.PENDING, D(2026, 1, 1), D(2026, 3, 1), False),
        (ReservationStatus.REJECTED, D(2026, 1, 1), D(2026, 3, 1), False),
        (ReservationStatus.CANCELLED, D(2026, 1, 1), D(2026, 3, 1), False),
    ],
)
def test_approved_reservations_outside_site_dates(
    db: Session, reservation_status: ReservationStatus, start: date, end: date, expected: bool
) -> None:
    site = Site(
        name="Site", address="Street", budget=0, start_date=D(2026, 1, 1), end_date=D(2026, 12, 31)
    )
    equipment = Equipment(name="Loader", type="loader", serial_no="date-query", hourly_cost=0)
    db.add_all([site, equipment])
    db.flush()
    assert not has_approved_outside_site_dates(db, site.id, D(2026, 2, 1), D(2026, 2, 28))
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site.id,
            start_date=start,
            end_date=end,
            status=reservation_status,
            requested_by_role="site_manager",
        )
    )
    db.flush()
    assert has_approved_outside_site_dates(db, site.id, D(2026, 2, 1), D(2026, 2, 28)) is expected
    assert not has_approved_outside_site_dates(db, site.id + 1000000, D(2026, 2, 1), D(2026, 2, 28))


def test_approved_reservations_outside_site_dates_rejects_inverted_range(db: Session) -> None:
    with pytest.raises(ValueError, match="start date"):
        has_approved_outside_site_dates(db, 1, D(2026, 2, 2), D(2026, 2, 1))
