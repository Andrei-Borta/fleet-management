"""Pydantic schemas (request/response) for the maintenance module."""

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator
from pydantic.json_schema import SkipJsonSchema

from app.modules.equipment.models import EquipmentStatus
from app.modules.maintenance.models import InterventionKind, InterventionStatus


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


Amount = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]


class InterventionCreate(BaseModel):
    equipment_id: int = Field(gt=0)
    defect_id: int | None = Field(default=None, gt=0)
    kind: InterventionKind
    scheduled_date: date
    description: str = Field(default="", max_length=5000)
    labor_hours: Amount = Decimal("0")
    labor_rate: Amount = Decimal("0")


class InterventionUpdate(BaseModel):
    status: InterventionStatus | SkipJsonSchema[None] = None
    labor_hours: Amount | SkipJsonSchema[None] = None
    labor_rate: Amount | SkipJsonSchema[None] = None

    @field_validator("status", "labor_hours", "labor_rate", mode="before")
    @classmethod
    def reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("field cannot be null")
        return value


class PartCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200, pattern=r".*\S.*")
    qty: int = Field(gt=0, le=2147483647, strict=True)
    unit_cost: Amount


class PartRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    intervention_id: int
    name: str
    qty: int
    unit_cost: Decimal

    @field_serializer("unit_cost", when_used="json")
    def serialize_unit_cost(self, value: Decimal) -> float:
        return float(value)


class InterventionRead(BaseModel):
    id: int
    equipment_id: int
    defect_id: int | None
    description: str
    kind: InterventionKind
    scheduled_date: date
    status: InterventionStatus
    started_at: datetime
    completed_at: datetime | None
    labor_hours: Decimal
    labor_rate: Decimal
    parts: list[PartRead]
    total_cost: Decimal

    @field_serializer("labor_hours", "labor_rate", "total_cost", when_used="json")
    def serialize_amount(self, value: Decimal) -> float:
        return float(value)
