"""Pydantic schemas (request/response) for the equipment module."""

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
)
from pydantic.json_schema import SkipJsonSchema

from app.modules.equipment.models import EquipmentStatus

Name = Annotated[str, Field(min_length=1, max_length=200, pattern=r".*\S.*")]
EquipmentType = Annotated[str, Field(min_length=1, max_length=100, pattern=r".*\S.*")]
SerialNo = Annotated[str, Field(min_length=1, max_length=100, pattern=r".*\S.*")]
NonNegative = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]
Positive = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2, allow_inf_nan=False)]
PositiveDays = Annotated[int, Field(gt=0)]

# Fields that are required in the database: PATCH may omit them but not set them to null.
REQUIRED_FIELDS = ("name", "type", "serial_no", "status", "engine_hours", "hourly_cost")


class EquipmentCreate(BaseModel):
    name: Name
    type: EquipmentType
    serial_no: SerialNo
    status: EquipmentStatus = EquipmentStatus.AVAILABLE
    engine_hours: NonNegative = Decimal(0)
    hourly_cost: NonNegative
    service_interval_days: PositiveDays | None = None
    service_interval_hours: Positive | None = None
    last_service_at: datetime | None = None
    last_service_hours: NonNegative | None = None


class EquipmentUpdate(BaseModel):
    name: Name | SkipJsonSchema[None] = None
    type: EquipmentType | SkipJsonSchema[None] = None
    serial_no: SerialNo | SkipJsonSchema[None] = None
    status: EquipmentStatus | SkipJsonSchema[None] = None
    engine_hours: NonNegative | SkipJsonSchema[None] = None
    hourly_cost: NonNegative | SkipJsonSchema[None] = None
    service_interval_days: PositiveDays | None = None
    service_interval_hours: Positive | None = None
    last_service_at: datetime | None = None
    last_service_hours: NonNegative | None = None

    @field_validator(*REQUIRED_FIELDS, mode="before")
    @classmethod
    def reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("field cannot be null")
        return value


class EquipmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    serial_no: str
    status: EquipmentStatus
    engine_hours: Decimal
    hourly_cost: Decimal
    service_interval_days: int | None
    service_interval_hours: Decimal | None
    last_service_at: datetime | None
    last_service_hours: Decimal | None

    @field_serializer(
        "engine_hours",
        "hourly_cost",
        "service_interval_hours",
        "last_service_hours",
        when_used="json",
    )
    def serialize_decimal(self, value: Decimal | None) -> float | None:
        return None if value is None else float(value)
