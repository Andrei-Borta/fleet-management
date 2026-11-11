"""The demo seed is deterministic, idempotent and matches the demo scenario."""

from datetime import date, timedelta
from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import (
    InterventionPart,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.maintenance.rules import is_service_due
from app.modules.operations.models import UsageLog
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site
from seed import ANCHOR, seed

EXPECTED = {
    "sites": 4,
    "equipment": 20,
    "reservations": 15,
    "defects": 3,
    "interventions": 3,
    "parts": 4,
    "usage_logs": 21,
}


def count(db: Session, model: type) -> int:
    return db.scalar(select(func.count()).select_from(model)) or 0


def test_seed_creates_the_demo_dataset_and_is_idempotent(db: Session) -> None:
    assert seed(db, reset=True) == EXPECTED

    assert count(db, Site) == EXPECTED["sites"]
    assert count(db, Equipment) == EXPECTED["equipment"]
    assert count(db, Reservation) == EXPECTED["reservations"]
    assert count(db, ServiceIntervention) == EXPECTED["interventions"]
    assert count(db, InterventionPart) == EXPECTED["parts"]
    assert count(db, UsageLog) == EXPECTED["usage_logs"]

    # A second run must not duplicate anything.
    assert seed(db) == {}
    assert count(db, Equipment) == EXPECTED["equipment"]
    assert count(db, Reservation) == EXPECTED["reservations"]


def test_seed_builds_the_demo_scenarios(db: Session) -> None:
    seed(db, reset=True)

    machines = {machine.serial_no: machine for machine in db.scalars(select(Equipment)).all()}
    assert machines["DEMO-EXC-03"].status == EquipmentStatus.DEFECTIVE
    assert machines["DEMO-LOA-02"].status == EquipmentStatus.IN_SERVICE
    assert machines["DEMO-COM-03"].status == EquipmentStatus.RETIRED

    exc_01 = machines["DEMO-EXC-01"]
    exc_01_reservations = db.scalars(
        select(Reservation).where(Reservation.equipment_id == exc_01.id)
    ).all()
    approved = [r for r in exc_01_reservations if r.status == ReservationStatus.APPROVED]
    pending = [r for r in exc_01_reservations if r.status == ReservationStatus.PENDING]
    assert len(approved) == 1
    assert len(pending) == 1
    assert pending[0].start_date <= approved[0].end_date
    assert pending[0].end_date >= approved[0].start_date

    jobs = db.scalars(select(ServiceIntervention)).all()
    assert {job.status for job in jobs} == {
        InterventionStatus.PLANNED,
        InterventionStatus.IN_PROGRESS,
        InterventionStatus.DONE,
    }
    assert any(part.unit_cost == Decimal("450.00") for part in db.scalars(select(InterventionPart)))


def test_seed_costs_show_over_budget_and_near_budget(db: Session) -> None:
    seed(db, reset=True)
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            response = client.get("/api/v1/dashboard/costs")
    finally:
        app.dependency_overrides.pop(get_db, None)

    assert response.status_code == 200
    sites = {site["site_name"]: site for site in response.json()["sites"]}
    over = sites["Pipera Business Park"]
    near = sites["Dambovita Bridge"]
    assert over["over_budget"] is True
    assert over["spent"] > over["budget"]
    assert over["remaining"] < 0
    assert near["over_budget"] is False
    assert 85 <= near["percent_used"] < 100


def test_seed_reset_removes_existing_fleet_data(db: Session) -> None:
    seed(db, reset=True)
    db.add(
        Site(
            name="Temporary site",
            address="Elsewhere",
            budget=Decimal("1.00"),
            start_date=date(2099, 1, 1),
            end_date=date(2099, 12, 31),
        )
    )
    db.commit()
    assert count(db, Site) == EXPECTED["sites"] + 1

    seed(db, reset=True)

    assert count(db, Site) == EXPECTED["sites"]
    assert count(db, Equipment) == EXPECTED["equipment"]


def machines_by_serial(db: Session) -> dict[str, Equipment]:
    return {machine.serial_no: machine for machine in db.scalars(select(Equipment)).all()}


def booking_dates(db: Session, machine: Equipment) -> list[tuple[date, date]]:
    reservations = db.scalars(select(Reservation).where(Reservation.equipment_id == machine.id))
    return sorted((r.start_date, r.end_date) for r in reservations)


def test_seed_dates_move_with_the_run_date(db: Session) -> None:
    seed(db, reset=True, today=ANCHOR)
    exc_01 = machines_by_serial(db)["DEMO-EXC-01"]
    before = booking_dates(db, exc_01)
    service_before = exc_01.last_service_at

    later = ANCHOR + timedelta(days=45)
    seed(db, reset=True, today=later)
    exc_01 = machines_by_serial(db)["DEMO-EXC-01"]
    after = booking_dates(db, exc_01)

    shift = timedelta(days=45)
    assert after == [(start + shift, end + shift) for start, end in before]
    assert exc_01.last_service_at == service_before + shift
    site = db.scalars(select(Site).where(Site.name == "Pipera Business Park")).one()
    assert site.start_date == date(2026, 11, 1) + shift
    assert max(log.date for log in db.scalars(select(UsageLog))) < later


def test_seed_service_due_matches_the_bookings_on_any_run_date(db: Session) -> None:
    for today in (ANCHOR, ANCHOR + timedelta(days=60)):
        seed(db, reset=True, today=today)
        machines = machines_by_serial(db)
        overdue = {serial for serial, machine in machines.items() if is_service_due(machine, today)}

        # CAT D6 holds an approved booking, so it must not be overdue (#92).
        assert "DEMO-BUL-01" not in overdue
        # The service-due widget still shows overdue machines.
        assert {"DEMO-BUL-03", "DEMO-EXC-03"} <= overdue
        approved_overdue = db.scalars(
            select(Reservation).where(
                Reservation.status == ReservationStatus.APPROVED,
                Reservation.end_date >= today,
                Reservation.equipment_id.in_([machines[serial].id for serial in overdue]),
            )
        ).all()
        assert approved_overdue == []


def test_seed_usage_logs_fit_the_bookings_and_engine_hours(db: Session) -> None:
    seed(db, reset=True, today=ANCHOR)
    approved = db.scalars(
        select(Reservation).where(Reservation.status == ReservationStatus.APPROVED)
    ).all()
    logs = db.scalars(select(UsageLog)).all()
    assert logs

    for log in logs:
        assert log.date < ANCHOR
        assert log.hours > 0 and log.fuel_liters > 0
        assert any(
            r.equipment_id == log.equipment_id
            and r.site_id == log.site_id
            and r.start_date <= log.date <= r.end_date
            for r in approved
        ), f"usage log on {log.date} has no matching approved booking"

    for machine in db.scalars(select(Equipment)).all():
        logged = sum((log.hours for log in logs if log.equipment_id == machine.id), Decimal(0))
        assert logged <= machine.engine_hours - (machine.last_service_hours or 0)
