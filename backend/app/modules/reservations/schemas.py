"""Request and response models for reservations."""

from datetime import date
from typing import Literal, Self

from pydantic import BaseModel, ConfigDict, model_validator

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
