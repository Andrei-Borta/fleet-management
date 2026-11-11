"""Pydantic schemas (request/response) for the notifications module."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.core.deps import Role


class NotificationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: Role
    title: str
    body: str
    link: str | None
    created_at: datetime
    read_at: datetime | None


class ReadAllResult(BaseModel):
    marked: int
