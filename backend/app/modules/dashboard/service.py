"""Business logic for the dashboard module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from collections import Counter
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError
from app.modules.dashboard.schemas import (
    EquipmentUtilization,
    FleetStats,
    StatusCount,
    TypeCount,
)
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.reservations.models import Reservation, ReservationStatus

TOP_EQUIPMENT = 5


def _validate_period(start: date, end: date) -> None:
    if end < start:
        raise InvalidDataError("'to' must not be before 'from'")


def _inclusive_days(start: date, end: date) -> int:
    return (end - start).days + 1


def _merged_days(intervals: list[tuple[date, date]]) -> int:
    """Count the inclusive days covered by intervals, merging overlaps and adjacent ranges."""
    if not intervals:
        return 0
    ordered = sorted(intervals)
    total = 0
    current_start, current_end = ordered[0]
    for start, end in ordered[1:]:
        if start <= current_end + timedelta(days=1):
            current_end = max(current_end, end)
        else:
            total += _inclusive_days(current_start, current_end)
            current_start, current_end = start, end
    return total + _inclusive_days(current_start, current_end)


def _reserved_days_by_equipment(db: Session, start: date, end: date) -> dict[int, int]:
    """Approved reservation days per equipment, clipped to the period and not double counted."""
    reservations = db.scalars(
        select(Reservation).where(
            Reservation.status == ReservationStatus.APPROVED,
            Reservation.start_date <= end,
            Reservation.end_date >= start,
        )
    ).all()
    intervals: dict[int, list[tuple[date, date]]] = {}
    for reservation in reservations:
        clipped_start = max(start, reservation.start_date)
        clipped_end = min(end, reservation.end_date)
        intervals.setdefault(reservation.equipment_id, []).append((clipped_start, clipped_end))
    return {equipment_id: _merged_days(ranges) for equipment_id, ranges in intervals.items()}


def _utilization(
    equipment: Equipment, reserved_days: int, period_days: int
) -> EquipmentUtilization:
    percent = round(reserved_days / period_days * 100, 2)
    return EquipmentUtilization(
        equipment_id=equipment.id,
        name=equipment.name,
        type=equipment.type,
        reserved_days=reserved_days,
        period_days=period_days,
        utilization_percent=percent,
    )


def fleet_stats(db: Session, start: date, end: date) -> FleetStats:
    """Counts per status/type plus utilization and rankings for an inclusive period.

    Utilization and rankings cover the active fleet (retired equipment is left out); the
    status and type counts still include every equipment record.
    """
    _validate_period(start, end)
    period_days = _inclusive_days(start, end)
    equipment = list(db.scalars(select(Equipment).order_by(Equipment.id)).all())

    status_counts = Counter(item.status for item in equipment)
    by_status = [
        StatusCount(status=status, count=status_counts.get(status, 0)) for status in EquipmentStatus
    ]

    type_counts = Counter(item.type for item in equipment)
    by_type = [
        TypeCount(type=type_name, count=count)
        for type_name, count in sorted(type_counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]

    reserved_days = _reserved_days_by_equipment(db, start, end)
    utilization = [
        _utilization(item, reserved_days.get(item.id, 0), period_days)
        for item in equipment
        if item.status != EquipmentStatus.RETIRED
    ]

    top_used = sorted(utilization, key=lambda item: (-item.reserved_days, item.equipment_id))[
        :TOP_EQUIPMENT
    ]
    least_used = sorted(utilization, key=lambda item: (item.reserved_days, item.equipment_id))[
        :TOP_EQUIPMENT
    ]

    return FleetStats(
        start_date=start,
        end_date=end,
        period_days=period_days,
        total_equipment=len(equipment),
        by_status=by_status,
        by_type=by_type,
        utilization=utilization,
        top_used=top_used,
        least_used=least_used,
    )
