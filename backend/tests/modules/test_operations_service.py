"""Service coverage for the operations usage, fuel logging, and checklist module."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import Defect, DefectSeverity, DefectStatus
from app.modules.operations import service
from app.modules.operations.schemas import (
    ChecklistCreate,
    ChecklistItemCreate,
    UsageCreate,
)
from app.modules.sites.models import Site

TODAY = date(2026, 11, 10)
TOMORROW = date(2026, 11, 11)


def make_equipment(
    db: Session,
    engine_hours: Decimal = Decimal(100),
    status: EquipmentStatus = EquipmentStatus.AVAILABLE,
) -> Equipment:
    equipment = Equipment(
        name="Loader",
        type="excavator",
        serial_no=uuid4().hex,
        hourly_cost=Decimal(50),
        engine_hours=engine_hours,
        status=status,
    )
    db.add(equipment)
    db.flush()
    return equipment


def make_site(db: Session) -> Site:
    site = Site(
        name="Site A",
        address="Street 1",
        budget=Decimal(10000),
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db.add(site)
    db.flush()
    return site


def test_log_usage_increments_hours_and_creates_log(db: Session) -> None:
    equipment = make_equipment(db, engine_hours=Decimal(100))
    site = make_site(db)

    payload = UsageCreate(
        equipment_id=equipment.id,
        site_id=site.id,
        date=TODAY,
        hours=Decimal(15),
        fuel_liters=Decimal(45),
    )
    entry = service.log_usage(db, payload)

    assert entry.id is not None
    assert entry.hours == Decimal(15)
    assert entry.fuel_liters == Decimal(45)

    db.refresh(equipment)
    assert equipment.engine_hours == Decimal(115)


def test_log_usage_rejects_unknown_equipment(db: Session) -> None:
    site = make_site(db)
    payload = UsageCreate(
        equipment_id=999_999,
        site_id=site.id,
        date=TODAY,
        hours=Decimal(5),
        fuel_liters=Decimal(10),
    )
    with pytest.raises(NotFoundError, match="Equipment"):
        service.log_usage(db, payload)


def test_log_usage_rejects_unknown_site(db: Session) -> None:
    equipment = make_equipment(db)
    payload = UsageCreate(
        equipment_id=equipment.id,
        site_id=999_999,
        date=TODAY,
        hours=Decimal(5),
        fuel_liters=Decimal(10),
    )
    with pytest.raises(NotFoundError, match="Site"):
        service.log_usage(db, payload)


def test_log_usage_rejects_negative_values(db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    payload = UsageCreate(
        equipment_id=equipment.id,
        site_id=site.id,
        date=TODAY,
        hours=Decimal(-5),
        fuel_liters=Decimal(10),
    )
    with pytest.raises(InvalidDataError):
        service.log_usage(db, payload)


def test_list_usage_filters_and_calculates_totals(db: Session) -> None:
    eq1 = make_equipment(db)
    eq2 = make_equipment(db)
    site1 = make_site(db)
    site2 = make_site(db)

    service.log_usage(
        db,
        UsageCreate(
            equipment_id=eq1.id,
            site_id=site1.id,
            date=TODAY,
            hours=Decimal(10),
            fuel_liters=Decimal(30),
        ),
    )
    service.log_usage(
        db,
        UsageCreate(
            equipment_id=eq1.id,
            site_id=site2.id,
            date=TODAY,
            hours=Decimal(5),
            fuel_liters=Decimal(15),
        ),
    )
    service.log_usage(
        db,
        UsageCreate(
            equipment_id=eq2.id,
            site_id=site1.id,
            date=TODAY,
            hours=Decimal(20),
            fuel_liters=Decimal(60),
        ),
    )

    summary_eq1 = service.list_usage(db, equipment_id=eq1.id)
    assert len(summary_eq1.items) == 2
    assert summary_eq1.total_hours == Decimal(15)
    assert summary_eq1.total_fuel_liters == Decimal(45)

    summary_site1 = service.list_usage(db, site_id=site1.id)
    assert len(summary_site1.items) == 2
    assert summary_site1.total_hours == Decimal(30)
    assert summary_site1.total_fuel_liters == Decimal(90)

    summary_all = service.list_usage(db)
    assert len(summary_all.items) >= 3


def test_create_checklist_all_ok(db: Session) -> None:
    equipment = make_equipment(db, status=EquipmentStatus.AVAILABLE)

    payload = ChecklistCreate(
        equipment_id=equipment.id,
        date=TODAY,
        items=[
            ChecklistItemCreate(name="Brakes", ok=True, critical=True),
            ChecklistItemCreate(name="Tires", ok=True, critical=True),
            ChecklistItemCreate(name="Lights", ok=True, critical=False),
        ],
    )
    checklist = service.create_checklist(db, payload)

    assert checklist.id is not None
    assert checklist.equipment_id == equipment.id
    assert checklist.date == TODAY
    assert len(checklist.items) == 3

    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.AVAILABLE

    defects = db.query(Defect).filter(Defect.equipment_id == equipment.id).all()
    assert len(defects) == 0


def test_create_checklist_non_critical_failure_does_not_block(db: Session) -> None:
    equipment = make_equipment(db, status=EquipmentStatus.AVAILABLE)

    payload = ChecklistCreate(
        equipment_id=equipment.id,
        date=TODAY,
        items=[
            ChecklistItemCreate(name="Brakes", ok=True, critical=True),
            ChecklistItemCreate(name="Horn", ok=False, critical=False),
        ],
    )
    checklist = service.create_checklist(db, payload)

    assert checklist.id is not None
    assert len(checklist.items) == 2

    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.AVAILABLE

    defects = db.query(Defect).filter(Defect.equipment_id == equipment.id).all()
    assert len(defects) == 0


def test_create_checklist_critical_failure_creates_defect_and_blocks(db: Session) -> None:
    equipment = make_equipment(db, status=EquipmentStatus.AVAILABLE)

    payload = ChecklistCreate(
        equipment_id=equipment.id,
        date=TODAY,
        items=[
            ChecklistItemCreate(name="Brakes", ok=False, critical=True),
            ChecklistItemCreate(name="Lights", ok=True, critical=False),
        ],
    )
    checklist = service.create_checklist(db, payload)

    assert checklist.id is not None
    assert len(checklist.items) == 2

    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.DEFECTIVE

    defects = db.query(Defect).filter(Defect.equipment_id == equipment.id).all()
    assert len(defects) == 1
    assert defects[0].severity == DefectSeverity.CRITICAL
    assert defects[0].status == DefectStatus.OPEN
    assert "Brakes" in defects[0].description


def test_create_checklist_multiple_critical_failures(db: Session) -> None:
    equipment = make_equipment(db, status=EquipmentStatus.AVAILABLE)

    payload = ChecklistCreate(
        equipment_id=equipment.id,
        date=TODAY,
        items=[
            ChecklistItemCreate(name="Brakes", ok=False, critical=True),
            ChecklistItemCreate(name="Steering", ok=False, critical=True),
            ChecklistItemCreate(name="Lights", ok=True, critical=False),
        ],
    )
    checklist = service.create_checklist(db, payload)

    assert checklist.id is not None
    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.DEFECTIVE

    defects = db.query(Defect).filter(Defect.equipment_id == equipment.id).all()
    assert len(defects) == 2
    for defect in defects:
        assert defect.severity == DefectSeverity.CRITICAL
        assert defect.status == DefectStatus.OPEN


def test_create_checklist_rejects_unknown_equipment(db: Session) -> None:
    payload = ChecklistCreate(
        equipment_id=999_999,
        date=TODAY,
        items=[
            ChecklistItemCreate(name="Brakes", ok=True, critical=True),
        ],
    )
    with pytest.raises(NotFoundError, match="Equipment"):
        service.create_checklist(db, payload)


def test_create_checklist_rejects_empty_items(db: Session) -> None:
    equipment = make_equipment(db)
    payload = ChecklistCreate(
        equipment_id=equipment.id,
        date=TODAY,
        items=[],
    )
    with pytest.raises(InvalidDataError, match="at least one item"):
        service.create_checklist(db, payload)


def test_list_checklists_filters(db: Session) -> None:
    eq1 = make_equipment(db)
    eq2 = make_equipment(db)

    service.create_checklist(
        db,
        ChecklistCreate(
            equipment_id=eq1.id,
            date=TODAY,
            items=[ChecklistItemCreate(name="Item 1", ok=True, critical=False)],
        ),
    )
    service.create_checklist(
        db,
        ChecklistCreate(
            equipment_id=eq1.id,
            date=TOMORROW,
            items=[ChecklistItemCreate(name="Item 2", ok=True, critical=False)],
        ),
    )
    service.create_checklist(
        db,
        ChecklistCreate(
            equipment_id=eq2.id,
            date=TODAY,
            items=[ChecklistItemCreate(name="Item 3", ok=True, critical=False)],
        ),
    )

    all_checklists = service.list_checklists(db)
    assert len(all_checklists) >= 3

    eq1_checklists = service.list_checklists(db, equipment_id=eq1.id)
    assert len(eq1_checklists) == 2
    assert all(c.equipment_id == eq1.id for c in eq1_checklists)

    today_checklists = service.list_checklists(db, date=TODAY)
    assert len(today_checklists) >= 2
    assert all(c.date == TODAY for c in today_checklists)

    eq1_today = service.list_checklists(db, equipment_id=eq1.id, date=TODAY)
    assert len(eq1_today) == 1
    assert eq1_today[0].equipment_id == eq1.id
    assert eq1_today[0].date == TODAY
    assert len(eq1_today[0].items) == 1
