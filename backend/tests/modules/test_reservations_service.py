from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import (
    InterventionKind,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.service import (
    ReservationConflictError,
    ensure_reservable,
    find_conflicts,
    has_approved_outside_site_dates,
    periods_overlap,
)
from app.modules.sites.models import Site

D = date
BOOKED_START = D(2026, 11, 10)
BOOKED_END = D(2026, 11, 20)


def make_equipment(
    db: Session,
    type_: str = "excavator",
    hourly_cost: int = 50,
    status: EquipmentStatus = EquipmentStatus.AVAILABLE,
) -> Equipment:
    equipment = Equipment(
        name="Machine",
        type=type_,
        serial_no=uuid4().hex,
        hourly_cost=hourly_cost,
        status=status,
    )
    db.add(equipment)
    db.flush()
    return equipment


def make_site(db: Session) -> Site:
    site = Site(
        name="North",
        address="Main Street",
        budget=10000,
        start_date=D(2026, 11, 1),
        end_date=D(2026, 12, 31),
    )
    db.add(site)
    db.flush()
    return site


def make_reservation(
    db: Session,
    equipment: Equipment,
    start: date = BOOKED_START,
    end: date = BOOKED_END,
    status: ReservationStatus = ReservationStatus.APPROVED,
) -> Reservation:
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=make_site(db).id,
        start_date=start,
        end_date=end,
        status=status,
        requested_by_role="site_manager",
    )
    db.add(reservation)
    db.flush()
    return reservation


def make_intervention(
    db: Session,
    equipment: Equipment,
    scheduled: date = BOOKED_START,
    status: InterventionStatus = InterventionStatus.PLANNED,
) -> ServiceIntervention:
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        description="Revision",
        kind=InterventionKind.REVISION,
        scheduled_date=scheduled,
        status=status,
    )
    db.add(intervention)
    db.flush()
    return intervention


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


@pytest.mark.parametrize(
    ("start", "end", "expected"),
    [
        (D(2026, 11, 5), D(2026, 11, 9), False),  # ends the day before
        (D(2026, 11, 5), D(2026, 11, 10), True),  # ends on the first booked day
        (D(2026, 11, 20), D(2026, 11, 25), True),  # starts on the last booked day
        (D(2026, 11, 21), D(2026, 11, 25), False),  # starts the day after
        (D(2026, 11, 12), D(2026, 11, 14), True),  # contained in the booking
        (D(2026, 11, 1), D(2026, 11, 30), True),  # contains the booking
        (D(2026, 11, 15), D(2026, 11, 15), True),  # single day inside
    ],
)
def test_find_conflicts_date_boundaries(db, start, end, expected):
    equipment = make_equipment(db)
    reservation = make_reservation(db, equipment)

    conflicts = find_conflicts(db, equipment.id, start, end)

    assert [c.id for c in conflicts] == ([reservation.id] if expected else [])
    if expected:
        assert conflicts[0].kind == "reservation"
        assert conflicts[0].start_date == reservation.start_date
        assert conflicts[0].end_date == reservation.end_date
        assert conflicts[0].status == "approved"


@pytest.mark.parametrize(
    "status",
    [ReservationStatus.PENDING, ReservationStatus.REJECTED, ReservationStatus.CANCELLED],
)
def test_find_conflicts_ignores_reservations_that_are_not_approved(db, status):
    equipment = make_equipment(db)
    make_reservation(db, equipment, status=status)

    assert find_conflicts(db, equipment.id, D(2026, 11, 12), D(2026, 11, 14)) == []


def test_find_conflicts_ignores_other_equipment(db):
    make_reservation(db, make_equipment(db))
    make_intervention(db, make_equipment(db), status=InterventionStatus.IN_PROGRESS)

    assert find_conflicts(db, make_equipment(db).id, D(2026, 11, 12), D(2026, 11, 14)) == []


def test_find_conflicts_planned_maintenance_blocks_only_its_day(db):
    equipment = make_equipment(db)
    intervention = make_intervention(db, equipment)

    conflicts = find_conflicts(db, equipment.id, D(2026, 11, 10), D(2026, 11, 10))

    assert [(c.kind, c.id, c.end_date) for c in conflicts] == [
        ("maintenance", intervention.id, D(2026, 11, 10))
    ]
    assert find_conflicts(db, equipment.id, D(2026, 11, 11), D(2026, 11, 15)) == []


def test_find_conflicts_maintenance_in_progress_blocks_with_no_end(db):
    equipment = make_equipment(db)
    intervention = make_intervention(db, equipment, status=InterventionStatus.IN_PROGRESS)

    conflicts = find_conflicts(db, equipment.id, D(2027, 6, 1), D(2027, 6, 2))

    assert [(c.id, c.end_date, c.status) for c in conflicts] == [
        (intervention.id, None, "in_progress")
    ]
    assert find_conflicts(db, equipment.id, D(2026, 11, 1), D(2026, 11, 9)) == []


def test_find_conflicts_ignores_finished_maintenance(db):
    equipment = make_equipment(db)
    make_intervention(db, equipment, status=InterventionStatus.DONE)

    assert find_conflicts(db, equipment.id, D(2026, 11, 10), D(2026, 11, 10)) == []


def test_find_conflicts_returns_reservations_and_maintenance_together(db):
    equipment = make_equipment(db)
    make_reservation(db, equipment)
    make_intervention(db, equipment, scheduled=D(2026, 11, 15))

    conflicts = find_conflicts(db, equipment.id, D(2026, 11, 1), D(2026, 11, 30))

    assert [c.kind for c in conflicts] == ["reservation", "maintenance"]


def test_find_conflicts_rejects_inverted_period_even_with_no_bookings(db):
    with pytest.raises(InvalidDataError):
        find_conflicts(db, make_equipment(db).id, D(2026, 11, 5), D(2026, 11, 1))


@pytest.mark.parametrize("status", [EquipmentStatus.AVAILABLE, EquipmentStatus.RESERVED])
def test_ensure_reservable_accepts_free_equipment(db, status):
    equipment = make_equipment(db, status=status)

    ensure_reservable(db, equipment.id, BOOKED_START, BOOKED_END)


@pytest.mark.parametrize(
    "status",
    [EquipmentStatus.DEFECTIVE, EquipmentStatus.IN_SERVICE, EquipmentStatus.RETIRED],
)
def test_ensure_reservable_rejects_blocked_equipment(db, status):
    equipment = make_equipment(db, status=status)

    with pytest.raises(ReservationConflictError, match=status.value) as error:
        ensure_reservable(db, equipment.id, BOOKED_START, BOOKED_END)

    assert error.value.conflicts == []


def test_ensure_reservable_reports_the_overlapping_booking(db):
    equipment = make_equipment(db)
    reservation = make_reservation(db, equipment)

    with pytest.raises(ReservationConflictError) as error:
        ensure_reservable(db, equipment.id, BOOKED_START, BOOKED_START)

    assert [c.id for c in error.value.conflicts] == [reservation.id]


def test_ensure_reservable_rejects_unknown_equipment(db):
    with pytest.raises(NotFoundError):
        ensure_reservable(db, 99999999, BOOKED_START, BOOKED_END)
