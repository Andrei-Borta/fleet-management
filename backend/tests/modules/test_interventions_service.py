"""Service tests for interventions, transitions, parts and costs."""

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance import service
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    DefectStatus,
    InterventionKind,
    InterventionStatus,
)
from app.modules.maintenance.schemas import InterventionCreate, InterventionUpdate, PartCreate
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.reservations.service import ReservationConflictError, ensure_reservable
from app.modules.sites.models import Site


@pytest.fixture
def equipment(db: Session) -> Equipment:
    item = Equipment(
        name="Digger",
        type="excavator",
        serial_no="maintenance-service",
        hourly_cost=20,
        engine_hours=123,
    )
    db.add(item)
    db.flush()
    return item


@pytest.fixture
def intervention_data(equipment: Equipment) -> InterventionCreate:
    return InterventionCreate(
        equipment_id=equipment.id,
        kind=InterventionKind.REVISION,
        scheduled_date=date(2020, 1, 1),
        labor_hours=Decimal("2.25"),
        labor_rate=Decimal("80.10"),
    )


def test_create_get_list_and_parts_total(
    db: Session, intervention_data: InterventionCreate
) -> None:
    created = service.create_intervention(db, intervention_data)
    assert created.status == InterventionStatus.PLANNED
    assert created.parts == []
    assert created.total_cost == Decimal("180.23")
    updated = service.add_intervention_part(
        db, created.id, PartCreate(name="Filter", qty=2, unit_cost=Decimal("10.00"))
    )
    assert updated.total_cost == Decimal("200.23")
    assert updated.parts[0].name == "Filter"
    assert service.get_intervention(db, created.id).parts[0].qty == 2
    assert created.id in [item.id for item in service.list_interventions(db)]
    assert [
        item.id
        for item in service.list_interventions(
            db, equipment_id=created.equipment_id, status=InterventionStatus.PLANNED
        )
    ] == [created.id]
    assert (
        service.list_interventions(
            db, equipment_id=created.equipment_id, status=InterventionStatus.DONE
        )
        == []
    )


def test_create_validates_equipment_and_defect(db: Session, equipment: Equipment) -> None:
    missing = InterventionCreate(
        equipment_id=99999999, kind="repair", scheduled_date=date(2020, 1, 1)
    )
    with pytest.raises(NotFoundError, match="Equipment"):
        service.create_intervention(db, missing)
    missing_defect = InterventionCreate(
        equipment_id=equipment.id,
        defect_id=99999999,
        kind="repair",
        scheduled_date=date(2020, 1, 1),
    )
    with pytest.raises(NotFoundError, match="Defect"):
        service.create_intervention(db, missing_defect)
    other = Equipment(name="Other", type="loader", serial_no="maintenance-other", hourly_cost=10)
    db.add(other)
    db.flush()
    defect = Defect(equipment_id=other.id, description="Leak", severity=DefectSeverity.LOW)
    db.add(defect)
    db.flush()
    missing_defect.defect_id = defect.id
    with pytest.raises(ConflictError, match="different equipment"):
        service.create_intervention(db, missing_defect)
    missing_defect.equipment_id = other.id
    assert service.create_intervention(db, missing_defect).defect_id == defect.id


def test_status_progression_revision_records_readings(
    db: Session, equipment: Equipment, intervention_data: InterventionCreate
) -> None:
    created = service.create_intervention(db, intervention_data)
    with pytest.raises(ConflictError, match="planned"):
        service.update_intervention(db, created.id, InterventionUpdate(status="done"))
    started = service.update_intervention(db, created.id, InterventionUpdate(status="in_progress"))
    assert started.status == InterventionStatus.IN_PROGRESS
    assert started.completed_at is None
    with pytest.raises(ConflictError, match="planned"):
        service.update_intervention(db, created.id, InterventionUpdate(status="planned"))
    before = datetime.now(UTC)
    completed = service.update_intervention(
        db, created.id, InterventionUpdate(status="done", labor_hours=3)
    )
    assert completed.status == InterventionStatus.DONE
    assert completed.completed_at is not None and completed.completed_at >= before
    db.refresh(equipment)
    assert equipment.last_service_at == completed.completed_at
    assert equipment.last_service_hours == Decimal("123.00")
    with pytest.raises(ConflictError, match="cannot be changed"):
        service.update_intervention(db, created.id, InterventionUpdate(labor_rate=5))
    with pytest.raises(ConflictError, match="completed"):
        service.add_intervention_part(db, created.id, PartCreate(name="Hose", qty=1, unit_cost=1))


def test_repair_does_not_reset_service_readings(
    db: Session, equipment: Equipment, intervention_data: InterventionCreate
) -> None:
    intervention_data.kind = InterventionKind.REPAIR
    item = service.create_intervention(db, intervention_data)
    service.update_intervention(db, item.id, InterventionUpdate(status="in_progress"))
    service.update_intervention(db, item.id, InterventionUpdate(status="done"))
    db.refresh(equipment)
    assert equipment.last_service_at is None
    assert equipment.last_service_hours is None


@pytest.mark.parametrize("operation", ["get", "update", "add_part"])
def test_missing_intervention(db: Session, operation: str) -> None:
    with pytest.raises(NotFoundError, match="Intervention"):
        if operation == "get":
            service.get_intervention(db, 99999999)
        elif operation == "update":
            service.update_intervention(db, 99999999, InterventionUpdate(status="in_progress"))
        else:
            service.add_intervention_part(db, 99999999, PartCreate(name="Part", qty=1, unit_cost=1))


def test_approved_reservations_block_scheduling_and_start(
    db: Session, equipment: Equipment, intervention_data: InterventionCreate
) -> None:
    site = Site(
        name="Site",
        address="Road",
        budget=0,
        start_date=date(2020, 1, 1),
        end_date=date(2099, 1, 1),
    )
    db.add(site)
    db.flush()
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site.id,
        start_date=date(2020, 1, 1),
        end_date=date(2020, 1, 1),
        status=ReservationStatus.APPROVED,
        requested_by_role="site_manager",
    )
    db.add(reservation)
    db.commit()
    with pytest.raises(ConflictError, match="scheduled date"):
        service.create_intervention(db, intervention_data)
    reservation.status = ReservationStatus.CANCELLED
    db.commit()
    item = service.create_intervention(db, intervention_data)
    reservation.status = ReservationStatus.APPROVED
    reservation.start_date = date(2090, 1, 1)
    reservation.end_date = date(2090, 1, 2)
    db.commit()
    with pytest.raises(ConflictError, match="approved reservations"):
        service.update_intervention(db, item.id, InterventionUpdate(status="in_progress"))
    assert service.get_intervention(db, item.id).status == InterventionStatus.PLANNED


def test_cannot_start_before_scheduled_date(
    db: Session, intervention_data: InterventionCreate
) -> None:
    intervention_data.scheduled_date = date(2090, 1, 1)
    intervention = service.create_intervention(db, intervention_data)
    with pytest.raises(ConflictError, match="before its scheduled date"):
        service.update_intervention(db, intervention.id, InterventionUpdate(status="in_progress"))


def test_intervention_blocks_reservations_until_completed(
    db: Session, equipment: Equipment, intervention_data: InterventionCreate
) -> None:
    today = datetime.now(UTC).date()
    intervention_data.scheduled_date = today
    item = service.create_intervention(db, intervention_data)
    with pytest.raises(ReservationConflictError):
        ensure_reservable(db, equipment.id, today, today)
    service.update_intervention(db, item.id, InterventionUpdate(status="in_progress"))
    with pytest.raises(ReservationConflictError):
        ensure_reservable(db, equipment.id, today, today)
    service.update_intervention(db, item.id, InterventionUpdate(status="done"))
    ensure_reservable(db, equipment.id, today, today)


def test_repair_with_bookings_resolves_defect_and_recomputes_status(
    db: Session, equipment: Equipment
) -> None:
    today = datetime.now(UTC).date()
    site = Site(
        name="Site", address="Road", budget=0, start_date=today, end_date=today + timedelta(days=30)
    )
    defect = Defect(
        equipment_id=equipment.id, description="Failure", severity=DefectSeverity.CRITICAL
    )
    db.add_all([site, defect])
    db.flush()
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site.id,
            start_date=today,
            end_date=today + timedelta(days=1),
            status=ReservationStatus.APPROVED,
            requested_by_role="site_manager",
        )
    )
    db.flush()
    service.recompute_status(db, equipment.id)
    db.commit()
    assert equipment.status == EquipmentStatus.DEFECTIVE

    repair = service.create_intervention(
        db,
        InterventionCreate(
            equipment_id=equipment.id,
            defect_id=defect.id,
            kind="repair",
            scheduled_date=today,
        ),
    )
    service.update_intervention(db, repair.id, InterventionUpdate(status="in_progress"))
    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.IN_SERVICE
    completed = service.update_intervention(db, repair.id, InterventionUpdate(status="done"))
    db.refresh(defect)
    db.refresh(equipment)
    assert defect.status == DefectStatus.RESOLVED
    assert defect.resolved_at == completed.completed_at
    assert equipment.status == EquipmentStatus.AVAILABLE
    assert (
        db.query(Reservation).filter_by(site_id=site.id).one().status == ReservationStatus.APPROVED
    )


def test_completed_repair_leaves_other_critical_defects_blocking(
    db: Session, equipment: Equipment
) -> None:
    first = Defect(equipment_id=equipment.id, description="First", severity=DefectSeverity.CRITICAL)
    second = Defect(
        equipment_id=equipment.id, description="Second", severity=DefectSeverity.CRITICAL
    )
    db.add_all([first, second])
    db.flush()
    repair = service.create_intervention(
        db,
        InterventionCreate(
            equipment_id=equipment.id,
            defect_id=first.id,
            kind="repair",
            scheduled_date=date(2020, 1, 1),
        ),
    )
    service.update_intervention(db, repair.id, InterventionUpdate(status="in_progress"))
    service.update_intervention(db, repair.id, InterventionUpdate(status="done"))
    db.refresh(first)
    db.refresh(second)
    db.refresh(equipment)
    assert first.status == DefectStatus.RESOLVED
    assert second.status == DefectStatus.OPEN
    assert equipment.status == EquipmentStatus.DEFECTIVE


def test_repair_can_start_before_scheduled_date_despite_future_booking(
    db: Session, equipment: Equipment
) -> None:
    today = datetime.now(UTC).date()
    future = today + timedelta(days=10)
    site = Site(name="Site", address="Road", budget=0, start_date=today, end_date=future)
    db.add(site)
    db.flush()
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site.id,
            start_date=future,
            end_date=future,
            status=ReservationStatus.APPROVED,
            requested_by_role="site_manager",
        )
    )
    db.commit()
    repair = service.create_intervention(
        db,
        InterventionCreate(
            equipment_id=equipment.id,
            kind="repair",
            scheduled_date=future,
        ),
    )
    started = service.update_intervention(db, repair.id, InterventionUpdate(status="in_progress"))
    db.refresh(equipment)
    assert started.status == InterventionStatus.IN_PROGRESS
    assert equipment.status == EquipmentStatus.IN_SERVICE


def test_revision_does_not_resolve_linked_defect(db: Session, equipment: Equipment) -> None:
    defect = Defect(
        equipment_id=equipment.id, description="Failure", severity=DefectSeverity.CRITICAL
    )
    db.add(defect)
    db.flush()
    revision = service.create_intervention(
        db,
        InterventionCreate(
            equipment_id=equipment.id,
            defect_id=defect.id,
            kind="revision",
            scheduled_date=date(2020, 1, 1),
        ),
    )
    service.update_intervention(db, revision.id, InterventionUpdate(status="in_progress"))
    service.update_intervention(db, revision.id, InterventionUpdate(status="done"))
    db.refresh(defect)
    db.refresh(equipment)
    assert defect.status == DefectStatus.OPEN
    assert equipment.status == EquipmentStatus.DEFECTIVE


def test_recompute_failure_keeps_transition_and_defect_atomic(
    db: Session, equipment: Equipment, monkeypatch: pytest.MonkeyPatch
) -> None:
    defect = Defect(
        equipment_id=equipment.id, description="Failure", severity=DefectSeverity.CRITICAL
    )
    db.add(defect)
    db.flush()
    repair = service.create_intervention(
        db,
        InterventionCreate(
            equipment_id=equipment.id,
            defect_id=defect.id,
            kind="repair",
            scheduled_date=date(2020, 1, 1),
        ),
    )
    service.update_intervention(db, repair.id, InterventionUpdate(status="in_progress"))

    def fail_recompute(_db: Session, _equipment_id: int) -> Equipment:
        raise RuntimeError("status calculation failed")

    monkeypatch.setattr(service, "recompute_status", fail_recompute)
    with pytest.raises(RuntimeError, match="status calculation failed"):
        service.update_intervention(db, repair.id, InterventionUpdate(status="done"))
    db.rollback()
    assert service.get_intervention(db, repair.id).status == InterventionStatus.IN_PROGRESS
    assert db.get(Defect, defect.id).status == DefectStatus.OPEN
    assert db.get(Equipment, equipment.id).status == EquipmentStatus.IN_SERVICE
