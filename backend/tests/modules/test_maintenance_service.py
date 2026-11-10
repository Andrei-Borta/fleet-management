"""Service coverage for auto-blocking and the service-due rule."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment import service as equipment_service
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.equipment.schemas import EquipmentCreate
from app.modules.maintenance import service
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    DefectStatus,
    InterventionKind,
    InterventionStatus,
    ServiceIntervention,
)

TYPE = "maint-test-excavator"
TODAY = date(2026, 11, 10)


def make_equipment(db: Session, serial_no: str, **overrides: object) -> Equipment:
    values: dict[str, object] = {
        "name": "Excavator",
        "type": TYPE,
        "serial_no": serial_no,
        "hourly_cost": Decimal("75.50"),
    }
    values.update(overrides)
    return equipment_service.create_equipment(db, EquipmentCreate(**values))


def bare(**overrides: object) -> Equipment:
    """An unsaved equipment object for the pure due-date functions."""
    values: dict[str, object] = {"engine_hours": Decimal(0)}
    values.update(overrides)
    return Equipment(**values)


def add_defect(
    db: Session,
    equipment_id: int,
    severity: DefectSeverity,
    status: DefectStatus = DefectStatus.OPEN,
) -> None:
    db.add(Defect(equipment_id=equipment_id, description="x", severity=severity, status=status))
    db.flush()


def add_intervention(db: Session, equipment_id: int, status: InterventionStatus) -> None:
    db.add(
        ServiceIntervention(
            equipment_id=equipment_id,
            description="x",
            kind=InterventionKind.REPAIR,
            scheduled_date=TODAY,
            status=status,
        )
    )
    db.flush()


# --- recompute_status ---------------------------------------------------------------------


def test_recompute_without_problems_is_available(db: Session) -> None:
    equipment = make_equipment(db, "mt-001")
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.AVAILABLE


def test_recompute_open_critical_defect_is_defective(db: Session) -> None:
    equipment = make_equipment(db, "mt-002")
    add_defect(db, equipment.id, DefectSeverity.CRITICAL)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.DEFECTIVE


@pytest.mark.parametrize("severity", [DefectSeverity.LOW, DefectSeverity.MEDIUM])
def test_recompute_minor_defect_does_not_block(db: Session, severity: DefectSeverity) -> None:
    equipment = make_equipment(db, f"mt-003-{severity.value}")
    add_defect(db, equipment.id, severity)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.AVAILABLE


def test_recompute_resolved_critical_defect_frees_equipment(db: Session) -> None:
    equipment = make_equipment(db, "mt-004")
    add_defect(db, equipment.id, DefectSeverity.CRITICAL)
    service.recompute_status(db, equipment.id)
    db.query(Defect).filter_by(equipment_id=equipment.id).update({"status": DefectStatus.RESOLVED})
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.AVAILABLE


def test_recompute_intervention_in_progress_is_in_service(db: Session) -> None:
    equipment = make_equipment(db, "mt-005")
    add_intervention(db, equipment.id, InterventionStatus.IN_PROGRESS)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.IN_SERVICE


def test_recompute_in_service_wins_over_defective(db: Session) -> None:
    equipment = make_equipment(db, "mt-006")
    add_defect(db, equipment.id, DefectSeverity.CRITICAL)
    add_intervention(db, equipment.id, InterventionStatus.IN_PROGRESS)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.IN_SERVICE


@pytest.mark.parametrize("status", [InterventionStatus.PLANNED, InterventionStatus.DONE])
def test_recompute_planned_or_done_intervention_does_not_block(
    db: Session, status: InterventionStatus
) -> None:
    equipment = make_equipment(db, f"mt-007-{status.value}")
    add_intervention(db, equipment.id, status)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.AVAILABLE


def test_recompute_leaves_retired_equipment_alone(db: Session) -> None:
    equipment = make_equipment(db, "mt-008", status=EquipmentStatus.RETIRED)
    add_defect(db, equipment.id, DefectSeverity.CRITICAL)
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.RETIRED


def test_recompute_never_stores_reserved(db: Session) -> None:
    equipment = make_equipment(db, "mt-009")
    equipment.status = EquipmentStatus.RESERVED
    db.flush()
    assert service.recompute_status(db, equipment.id).status == EquipmentStatus.AVAILABLE


def test_recompute_unknown_equipment_raises(db: Session) -> None:
    with pytest.raises(NotFoundError):
        service.recompute_status(db, 999_999_999)


# --- is_service_due -----------------------------------------------------------------------


def test_due_by_days_at_the_interval() -> None:
    last = datetime(2026, 10, 11, tzinfo=UTC)  # exactly 30 days before TODAY
    equipment = bare(service_interval_days=30, last_service_at=last)
    assert service.is_service_due(equipment, TODAY) is True
    assert service.is_service_due(equipment, date(2026, 11, 9)) is False


def test_due_by_hours_at_the_interval() -> None:
    equipment = bare(
        service_interval_hours=Decimal(250),
        last_service_hours=Decimal(1000),
        engine_hours=Decimal(1250),
    )
    assert service.is_service_due(equipment, TODAY) is True
    equipment.engine_hours = Decimal("1249.99")
    assert service.is_service_due(equipment, TODAY) is False


def test_due_when_only_one_criterion_is_reached() -> None:
    equipment = bare(
        service_interval_days=30,
        last_service_at=datetime(2026, 11, 1, tzinfo=UTC),
        service_interval_hours=Decimal(100),
        last_service_hours=Decimal(0),
        engine_hours=Decimal(150),
    )
    assert service.is_service_due(equipment, TODAY) is True


def test_not_due_without_intervals() -> None:
    assert service.is_service_due(bare(), TODAY) is False


def test_not_due_without_a_baseline() -> None:
    equipment = bare(service_interval_days=30, service_interval_hours=Decimal(100))
    assert service.is_service_due(equipment, TODAY) is False


def test_until_due_helpers() -> None:
    equipment = bare(
        service_interval_days=30,
        last_service_at=datetime(2026, 10, 1, tzinfo=UTC),
        service_interval_hours=Decimal(100),
        last_service_hours=Decimal(10),
        engine_hours=Decimal(60),
    )
    assert service.days_until_due(equipment, TODAY) == -10
    assert service.hours_until_due(equipment) == Decimal(50)


# --- list_due_equipment -------------------------------------------------------------------


def test_list_due_equipment(db: Session) -> None:
    overdue = make_equipment(
        db,
        "mt-020",
        service_interval_days=30,
        last_service_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    hours_due = make_equipment(
        db,
        "mt-021",
        service_interval_hours=Decimal(100),
        last_service_hours=Decimal(0),
        engine_hours=Decimal(120),
    )
    soon = make_equipment(
        db,
        "mt-022",
        service_interval_days=30,
        last_service_at=datetime(2026, 10, 14, tzinfo=UTC),
    )
    far = make_equipment(
        db,
        "mt-023",
        service_interval_days=30,
        last_service_at=datetime(2026, 11, 1, tzinfo=UTC),
    )
    retired = make_equipment(
        db,
        "mt-024",
        status=EquipmentStatus.RETIRED,
        service_interval_days=30,
        last_service_at=datetime(2026, 10, 1, tzinfo=UTC),
    )
    untracked = make_equipment(db, "mt-025")
    mine = {overdue.id, hours_due.id, soon.id, far.id, retired.id, untracked.id}

    rows = [
        row
        for row in service.list_due_equipment(
            db, within_days=7, within_hours=Decimal(10), today=TODAY
        )
        if row.equipment_id in mine
    ]

    assert [row.equipment_id for row in rows] == [overdue.id, hours_due.id, soon.id]
    assert [row.overdue for row in rows] == [True, True, False]
    assert rows[0].days_until_due == -10
    assert rows[1].hours_until_due == Decimal(-20)
    assert rows[2].days_until_due == 3


def test_list_due_rejects_negative_windows(db: Session) -> None:
    with pytest.raises(InvalidDataError):
        service.list_due_equipment(db, within_days=-1)
    with pytest.raises(InvalidDataError):
        service.list_due_equipment(db, within_hours=Decimal(-1))
