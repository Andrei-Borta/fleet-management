"""Request and response models for reservations."""

from datetime import date
from typing import Literal

from pydantic import BaseModel


class ConflictRead(BaseModel):
    """Something that already occupies the equipment during a requested period."""

    kind: Literal["reservation", "maintenance"]
    id: int
    start_date: date
    end_date: date | None  # None: maintenance in progress, no known end yet
    status: str
