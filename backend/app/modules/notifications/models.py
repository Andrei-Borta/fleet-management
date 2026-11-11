"""ORM models for the notifications module."""

from datetime import datetime

from sqlalchemy import DateTime, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Notification(Base):
    """A message for every user of one role (there are no user accounts in the MVP)."""

    __tablename__ = "notifications"
    # A key makes an event notify a role only once (e.g. one "service due" per service cycle).
    __table_args__ = (UniqueConstraint("role", "key", name="uq_notifications_role_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    role: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(200))
    key: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
