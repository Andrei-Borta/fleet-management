"""Request and response models for dashboard aggregates."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, field_serializer

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


class SiteCost(BaseModel):
    site_id: int
    site_name: str
    budget: Decimal
    equipment_cost: Decimal
    maintenance_cost: Decimal
    spent: Decimal
    remaining: Decimal
    percent_used: float
    over_budget: bool

    @field_serializer("budget", "equipment_cost", "maintenance_cost", "spent", "remaining")
    def serialize_money(self, value: Decimal) -> float:
        return float(value)


class SiteCostsReport(BaseModel):
    sites: list[SiteCost]
