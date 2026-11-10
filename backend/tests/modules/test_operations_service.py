"""Service coverage for the operations usage and fuel logging module."""

from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.operations import service
from app.modules.operations.schemas import UsageCreate
from app.modules.sites.models import Site

TODAY = date(2026, 11, 10)


def make_equipment(db: Session, engine_hours: Decimal = Decimal(100)) -> Equipment:
    equipment = Equipment(
        name="Loader",
        type="excavator",
        serial_no=uuid4().hex,
        hourly_cost=Decimal(50),
        engine_hours=engine_hours,
        status=EquipmentStatus.AVAILABLE,
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
