"""Pydantic schemas for the operations module."""

from datetime import date
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer


class UsageCreate(BaseModel):
    equipment_id: int
    site_id: int
    date: date
    hours: Decimal
    fuel_liters: Decimal


class UsageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    site_id: int
    date: date
    hours: Decimal
    fuel_liters: Decimal

    @field_serializer("hours", "fuel_liters", when_used="json")
    def serialize_decimals(self, value: Decimal) -> float:
        return float(value)


class UsageSummaryRead(BaseModel):
    items: list[UsageRead]
    total_hours: Decimal
    total_fuel_liters: Decimal

    @field_serializer("total_hours", "total_fuel_liters", when_used="json")
    def serialize_totals(self, value: Decimal) -> float:
        return float(value)


class ChecklistItemCreate(BaseModel):
    name: str
    ok: bool
    critical: bool


class ChecklistItemRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    ok: bool
    critical: bool


class ChecklistCreate(BaseModel):
    equipment_id: int
    date: date
    items: list[ChecklistItemCreate]


class ChecklistRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    date: date
    items: list[ChecklistItemRead]
