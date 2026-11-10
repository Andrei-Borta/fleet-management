"""Request and response models for dashboard aggregates."""

from datetime import date

from pydantic import BaseModel

from app.modules.equipment.models import EquipmentStatus


class StatusCount(BaseModel):
    status: EquipmentStatus
    count: int


class TypeCount(BaseModel):
    type: str
    count: int


class EquipmentUtilization(BaseModel):
    equipment_id: int
    name: str
    type: str
    reserved_days: int
    period_days: int
    utilization_percent: float


class FleetStats(BaseModel):
    """Availability and utilization for the active fleet in an inclusive period."""

    start_date: date
    end_date: date
    period_days: int
    total_equipment: int
    by_status: list[StatusCount]
    by_type: list[TypeCount]
    utilization: list[EquipmentUtilization]
    top_used: list[EquipmentUtilization]
    least_used: list[EquipmentUtilization]
