"""Business logic for the operations module."""

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.equipment.models import Equipment
from app.modules.maintenance.service import recompute_status
from app.modules.operations.models import UsageLog
from app.modules.operations.schemas import UsageCreate, UsageSummaryRead
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
