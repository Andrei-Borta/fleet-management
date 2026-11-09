"""Request and response models for construction sites."""

from datetime import date
from decimal import Decimal
from typing import Annotated, Self

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_serializer,
    field_validator,
    model_validator,
)
from pydantic.json_schema import SkipJsonSchema

Name = Annotated[str, Field(min_length=1, max_length=200, pattern=r".*\S.*")]
Address = Annotated[str, Field(min_length=1, max_length=500, pattern=r".*\S.*")]
Budget = Annotated[Decimal, Field(ge=0, max_digits=14, decimal_places=2, allow_inf_nan=False)]


class SiteCreate(BaseModel):
    name: Name
    address: Address
    budget: Budget
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def check_dates(self) -> Self:
        if self.end_date < self.start_date:
            raise ValueError("end_date must not be before start_date")
        return self


class SiteUpdate(BaseModel):
    name: Name | SkipJsonSchema[None] = None
    address: Address | SkipJsonSchema[None] = None
    budget: Budget | SkipJsonSchema[None] = None
    start_date: date | SkipJsonSchema[None] = None
    end_date: date | SkipJsonSchema[None] = None

    @field_validator("name", "address", "budget", "start_date", "end_date", mode="before")
    @classmethod
    def reject_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("field cannot be null")
        return value


class SiteRead(SiteCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int

    @field_serializer("budget", when_used="json")
    def serialize_budget(self, value: Decimal) -> float:
        return float(value)
