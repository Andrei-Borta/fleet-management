"""Service coverage for the central calendar (reservations and maintenance timeline)."""

from datetime import UTC, date, datetime, timedelta

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import InterventionKind, InterventionStatus, ServiceIntervention
from app.modules.reservations import service
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

D = date(2099, 3, 1)  # first day of the range used in most tests
START = D
END = D + timedelta(days=29)


def make_equipment(db: Session, serial_no: str) -> Equipment:
    equipment = Equipment(name="Loader", type="loader", serial_no=serial_no, hourly_cost=10)
    db.add(equipment)
    db.flush()
    return equipment


def make_site(db: Session, name: str = "North site") -> Site:
    site = Site(
        name=name,
        address="Main Street",
        budget=1000,
        start_date=date(2099, 1, 1),
        end_date=date(2099, 12, 31),
    )
    db.add(site)
    db.flush()
    return site


def reserve(
    db: Session,
    equipment: Equipment,
    site: Site,
    start: date,
    end: date,
    status: ReservationStatus = ReservationStatus.APPROVED,
) -> Reservation:
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site.id,
        start_date=start,
        end_date=end,
        status=status,
        requested_by_role="site_manager",
    )
    db.add(reservation)
    db.flush()
    return reservation


def maintain(
    db: Session,
    equipment: Equipment,
    scheduled: date,
    status: InterventionStatus = InterventionStatus.PLANNED,
    completed_at: datetime | None = None,
) -> ServiceIntervention:
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        description="Oil change",
        kind=InterventionKind.REVISION,
        scheduled_date=scheduled,
        status=status,
        started_at=datetime(2099, 2, 1, tzinfo=UTC),
        completed_at=completed_at,
    )
    db.add(intervention)
    db.flush()
    return intervention


def test_returns_reservations_with_equipment_and_site(db: Session) -> None:
    equipment = make_equipment(db, "cal-1")
    site = make_site(db)
    reservation = reserve(db, equipment, site, D + timedelta(days=2), D + timedelta(days=4))

    events = service.list_calendar_events(db, START, END, equipment_id=equipment.id)

    assert len(events) == 1
    event = events[0]
    assert event.type == "reservation"
    assert event.id == reservation.id
    assert (event.equipment.id, event.equipment.name, event.equipment.type) == (
        equipment.id,
        "Loader",
        "loader",
    )
    assert event.site is not None
    assert (event.site.id, event.site.name) == (site.id, "North site")
    assert (event.start, event.end) == (D + timedelta(days=2), D + timedelta(days=4))
    assert event.status == "approved"


def test_only_pending_and_approved_reservations_are_shown(db: Session) -> None:
    equipment = make_equipment(db, "cal-status")
    site = make_site(db)
    for index, status in enumerate(ReservationStatus):
        day = D + timedelta(days=index * 2)
        reserve(db, equipment, site, day, day, status)

    events = service.list_calendar_events(db, START, END, equipment_id=equipment.id)

    assert sorted(event.status for event in events) == ["approved", "pending"]


def test_reservation_range_is_inclusive_at_both_ends(db: Session) -> None:
    equipment = make_equipment(db, "cal-edges")
    site = make_site(db)
    before = reserve(db, equipment, site, START - timedelta(days=5), START - timedelta(days=1))
    touches_start = reserve(db, equipment, site, START - timedelta(days=3), START)
    touches_end = reserve(db, equipment, site, END, END + timedelta(days=3))
    after = reserve(db, equipment, site, END + timedelta(days=1), END + timedelta(days=2))
    spanning = reserve(db, equipment, site, START - timedelta(days=9), END + timedelta(days=9))

    ids = {e.id for e in service.list_calendar_events(db, START, END, equipment_id=equipment.id)}

    assert ids == {touches_start.id, touches_end.id, spanning.id}
    assert before.id not in ids
    assert after.id not in ids


def test_maintenance_planned_in_progress_and_done(db: Session) -> None:
    equipment = make_equipment(db, "cal-maint")
    planned = maintain(db, equipment, D + timedelta(days=3))
    running = maintain(db, equipment, D + timedelta(days=5), InterventionStatus.IN_PROGRESS)
    finished = maintain(
        db,
        equipment,
        D + timedelta(days=7),
        InterventionStatus.DONE,
        completed_at=datetime(2099, 3, 12, 15, 0, tzinfo=UTC),
    )

    events = {
        e.id: e for e in service.list_calendar_events(db, START, END, equipment_id=equipment.id)
    }

    assert set(events) == {planned.id, running.id, finished.id}
    assert all(event.type == "maintenance" and event.site is None for event in events.values())
    assert (events[planned.id].start, events[planned.id].end) == (D + timedelta(days=3),) * 2
    assert events[planned.id].status == "planned"
    assert events[running.id].end is None
    assert events[running.id].status == "in_progress"
    assert (events[finished.id].start, events[finished.id].end) == (
        D + timedelta(days=7),
        date(2099, 3, 12),
    )
    assert events[finished.id].status == "done"


def test_maintenance_done_without_usable_completion_date(db: Session) -> None:
    equipment = make_equipment(db, "cal-done-odd")
    # Finished before the scheduled day: the block still covers the scheduled day.
    early = maintain(
        db,
        equipment,
        D + timedelta(days=10),
        InterventionStatus.DONE,
        completed_at=datetime(2099, 3, 5, tzinfo=UTC),
    )
    # No completion recorded: treated as open-ended.
    unknown = maintain(db, equipment, D + timedelta(days=12), InterventionStatus.DONE)

    events = {
        e.id: e for e in service.list_calendar_events(db, START, END, equipment_id=equipment.id)
    }

    assert events[early.id].end == D + timedelta(days=10)
    assert events[unknown.id].end is None


def test_maintenance_outside_the_range_is_left_out(db: Session) -> None:
    equipment = make_equipment(db, "cal-maint-out")
    maintain(db, equipment, START - timedelta(days=4))  # planned before the range
    maintain(
        db,
        equipment,
        START - timedelta(days=20),
        InterventionStatus.DONE,
        completed_at=datetime(2099, 2, 20, tzinfo=UTC),  # finished before the range
    )
    maintain(db, equipment, END + timedelta(days=1))  # starts after the range
    still_running = maintain(
        db, equipment, START - timedelta(days=30), InterventionStatus.IN_PROGRESS
    )  # started earlier but not finished
    on_last_day = maintain(db, equipment, END)

    ids = {e.id for e in service.list_calendar_events(db, START, END, equipment_id=equipment.id)}

    assert ids == {still_running.id, on_last_day.id}


def test_site_filter_returns_only_that_sites_reservations(db: Session) -> None:
    equipment = make_equipment(db, "cal-site")
    north = make_site(db, "North")
    south = make_site(db, "South")
    mine = reserve(db, equipment, north, D, D + timedelta(days=1))
    reserve(db, equipment, south, D + timedelta(days=5), D + timedelta(days=6))
    maintain(db, equipment, D + timedelta(days=2))

    events = service.list_calendar_events(db, START, END, site_id=north.id)

    assert [(e.type, e.id) for e in events] == [("reservation", mine.id)]


def test_equipment_filter_applies_to_reservations_and_maintenance(db: Session) -> None:
    wanted = make_equipment(db, "cal-eq-1")
    other = make_equipment(db, "cal-eq-2")
    site = make_site(db)
    reservation = reserve(db, wanted, site, D, D + timedelta(days=1))
    reserve(db, other, site, D, D + timedelta(days=1))
    job = maintain(db, wanted, D + timedelta(days=4))
    maintain(db, other, D + timedelta(days=4))

    events = service.list_calendar_events(db, START, END, equipment_id=wanted.id)

    assert {(e.type, e.id) for e in events} == {
        ("reservation", reservation.id),
        ("maintenance", job.id),
    }
    assert service.list_calendar_events(db, START, END, equipment_id=99999999) == []


def test_events_are_ordered_by_start_date(db: Session) -> None:
    equipment = make_equipment(db, "cal-order")
    site = make_site(db)
    late = reserve(db, equipment, site, D + timedelta(days=9), D + timedelta(days=10))
    early = reserve(db, equipment, site, D + timedelta(days=1), D + timedelta(days=2))
    job = maintain(db, equipment, D + timedelta(days=5))

    events = service.list_calendar_events(db, START, END, equipment_id=equipment.id)

    assert [(e.type, e.id) for e in events] == [
        ("reservation", early.id),
        ("maintenance", job.id),
        ("reservation", late.id),
    ]


def test_empty_calendar_returns_empty_list(db: Session) -> None:
    equipment = make_equipment(db, "cal-empty")
    assert service.list_calendar_events(db, START, END, equipment_id=equipment.id) == []


def test_range_of_one_day_and_of_93_days_is_allowed(db: Session) -> None:
    equipment = make_equipment(db, "cal-range")
    assert service.list_calendar_events(db, START, START, equipment_id=equipment.id) == []
    last_allowed = START + timedelta(days=service.MAX_CALENDAR_DAYS - 1)
    assert service.list_calendar_events(db, START, last_allowed, equipment_id=equipment.id) == []


def test_range_longer_than_93_days_is_rejected(db: Session) -> None:
    too_far = START + timedelta(days=service.MAX_CALENDAR_DAYS)
    with pytest.raises(InvalidDataError, match="93 days"):
        service.list_calendar_events(db, START, too_far)


def test_range_ending_before_it_starts_is_rejected(db: Session) -> None:
    with pytest.raises(InvalidDataError, match="'to' must not be before 'from'"):
        service.list_calendar_events(db, END, START)


def test_maintenance_finished_on_the_first_day_is_kept(db: Session) -> None:
    equipment = make_equipment(db, "cal-done-first-day")
    finished = maintain(
        db,
        equipment,
        START - timedelta(days=3),
        InterventionStatus.DONE,
        completed_at=datetime(2099, 3, 1, 0, 30, tzinfo=UTC),
    )

    events = {
        e.id: e for e in service.list_calendar_events(db, START, END, equipment_id=equipment.id)
    }

    event = events[finished.id]
    assert (event.start, event.end) == (START - timedelta(days=3), START)
