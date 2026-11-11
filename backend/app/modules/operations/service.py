"""Business logic for the operations module."""

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import Defect, DefectSeverity, DefectStatus
from app.modules.maintenance.service import announce_defect, recompute_status
from app.modules.operations.models import Checklist, ChecklistItem, UsageLog
from app.modules.operations.schemas import (
    ChecklistCreate,
    UsageCreate,
    UsageSummaryRead,
)
from app.modules.sites.models import Site


def log_usage(db: Session, data: UsageCreate) -> UsageLog:
    """Log equipment usage hours and fuel consumed, incrementing engine hours."""
    if data.hours < 0 or data.fuel_liters < 0:
        raise InvalidDataError("Hours and fuel liters must not be negative")

    equipment = db.get(Equipment, data.equipment_id, with_for_update=True)
    if equipment is None:
        raise NotFoundError("Equipment not found")

    site = db.get(Site, data.site_id)
    if site is None:
        raise NotFoundError("Site not found")

    equipment.engine_hours = (equipment.engine_hours or Decimal(0)) + data.hours

    entry = UsageLog(
        equipment_id=data.equipment_id,
        site_id=data.site_id,
        date=data.date,
        hours=data.hours,
        fuel_liters=data.fuel_liters,
    )
    db.add(entry)
    db.flush()

    recompute_status(db, equipment.id)

    db.commit()
    db.refresh(entry)
    return entry


def list_usage(
    db: Session,
    equipment_id: int | None = None,
    site_id: int | None = None,
) -> UsageSummaryRead:
    """List usage logs with totals, optionally filtered by equipment_id and site_id."""
    stmt = select(UsageLog).order_by(UsageLog.date.desc(), UsageLog.id.desc())
    if equipment_id is not None:
        stmt = stmt.where(UsageLog.equipment_id == equipment_id)
    if site_id is not None:
        stmt = stmt.where(UsageLog.site_id == site_id)

    items = list(db.scalars(stmt).all())
    total_hours = sum((item.hours for item in items), Decimal(0))
    total_fuel_liters = sum((item.fuel_liters for item in items), Decimal(0))

    return UsageSummaryRead(
        items=items,
        total_hours=total_hours,
        total_fuel_liters=total_fuel_liters,
    )


def create_checklist(db: Session, data: ChecklistCreate) -> Checklist:
    """Record a daily safety checklist for an equipment.

    If any critical item fails (ok is False and critical is True),
    create an open critical defect and auto-block the equipment by recomputing status.
    """
    if not data.items:
        raise InvalidDataError("Checklist must contain at least one item")

    equipment = db.get(Equipment, data.equipment_id, with_for_update=True)
    if equipment is None:
        raise NotFoundError("Equipment not found")

    checklist = Checklist(
        equipment_id=data.equipment_id,
        date=data.date,
        items=[
            ChecklistItem(
                name=item.name,
                ok=item.ok,
                critical=item.critical,
            )
            for item in data.items
        ],
    )
    db.add(checklist)
    db.flush()

    critical_failures = [item for item in data.items if item.critical and not item.ok]
    if critical_failures:
        for failure in critical_failures:
            defect = Defect(
                equipment_id=data.equipment_id,
                description=f"Safety checklist failure: {failure.name}",
                severity=DefectSeverity.CRITICAL,
                status=DefectStatus.OPEN,
            )
            db.add(defect)
            db.flush()
            announce_defect(db, defect)
        recompute_status(db, equipment.id)

    db.commit()
    db.refresh(checklist)
    return checklist


def list_checklists(
    db: Session,
    equipment_id: int | None = None,
    date: date | None = None,
) -> list[Checklist]:
    """List daily safety checklists, optionally filtered by equipment_id and date."""
    stmt = select(Checklist).order_by(Checklist.date.desc(), Checklist.id.desc())
    if equipment_id is not None:
        stmt = stmt.where(Checklist.equipment_id == equipment_id)
    if date is not None:
        stmt = stmt.where(Checklist.date == date)

    return list(db.scalars(stmt).all())
