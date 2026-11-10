"""Request and response models for reservations."""

from datetime import date
from decimal import Decimal
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, field_serializer, model_validator

from app.modules.equipment.models import EquipmentStatus
from app.modules.reservations.models import ReservationStatus


class ReservationCreate(BaseModel):
    equipment_id: int
    site_id: int
    start_date: date
    end_date: date
    note: str | None = None

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class ReservationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    equipment_id: int
    site_id: int
    start_date: date
    end_date: date
    status: ReservationStatus
    requested_by_role: str
    note: str | None


class ConflictRead(BaseModel):
    """Something that already occupies the equipment during a requested period."""

    kind: Literal["reservation", "maintenance"]
    id: int
    start_date: date
    end_date: date | None  # None: maintenance in progress, no known end yet
    status: str


class AlternativeRead(BaseModel):
    """Equipment suggested in place of one that is not free."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    type: str
    status: EquipmentStatus
    hourly_cost: Decimal

    @field_serializer("hourly_cost", when_used="json")
    def serialize_hourly_cost(self, value: Decimal) -> float:
        return float(value)


class ReservationConflictBody(BaseModel):
    """Body of the 409 returned when equipment cannot be reserved."""

    detail: str
    conflicts: list[ConflictRead]
    alternatives: list[AlternativeRead] = []


class CalendarEquipmentRead(BaseModel):
    id: int
    name: str
    type: str


class CalendarSiteRead(BaseModel):
    id: int
    name: str


class CalendarEventRead(BaseModel):
    """One block on the central calendar: a reservation or a maintenance job."""

    type: Literal["reservation", "maintenance"]
    id: int  # reservation id or service intervention id, depending on `type`
    equipment: CalendarEquipmentRead
    site: CalendarSiteRead | None  # None for maintenance, which belongs to no site
    start: date
    end: date | None  # None: maintenance in progress, no known end yet
    status: str
