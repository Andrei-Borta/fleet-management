from datetime import date
from decimal import Decimal

from app.modules.equipment.models import Equipment


def days_until_due(equipment: Equipment, today: date) -> int | None:
    """Days left before the time-based service; negative when overdue. None if not tracked."""
    if equipment.service_interval_days is None or equipment.last_service_at is None:
        return None
    elapsed = (today - equipment.last_service_at.date()).days
    return equipment.service_interval_days - elapsed


def hours_until_due(equipment: Equipment) -> Decimal | None:
    """Engine hours left before the hours-based service; negative when overdue."""
    if equipment.service_interval_hours is None or equipment.last_service_hours is None:
        return None
    elapsed = equipment.engine_hours - equipment.last_service_hours
    return equipment.service_interval_hours - elapsed


def is_service_due(equipment: Equipment, today: date) -> bool:
    """True when days since the last service, or engine hours since it, reach the interval."""
    days = days_until_due(equipment, today)
    hours = hours_until_due(equipment)
    return (days is not None and days <= 0) or (hours is not None and hours <= 0)
