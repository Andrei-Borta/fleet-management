"""Pydantic schemas (request/response) for the maintenance module."""

from decimal import Decimal

from pydantic import BaseModel, field_serializer

from app.modules.equipment.models import EquipmentStatus


class DueEquipmentRead(BaseModel):
    equipment_id: int
    name: str
    type: str
    status: EquipmentStatus
    days_until_due: int | None
    hours_until_due: Decimal | None
    overdue: bool

    @field_serializer("hours_until_due", when_used="json")
    def serialize_hours(self, value: Decimal | None) -> float | None:
        return None if value is None else float(value)
