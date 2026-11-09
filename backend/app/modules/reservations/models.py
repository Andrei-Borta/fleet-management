"""Equipment requests for construction sites."""

from datetime import date
from enum import StrEnum

from sqlalchemy import CheckConstraint, Enum, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class ReservationStatus(StrEnum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class Reservation(Base):
    __tablename__ = "reservations"
    __table_args__ = (CheckConstraint("end_date >= start_date", name="ck_reservations_dates"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), index=True)
    start_date: Mapped[date]
    end_date: Mapped[date]
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(
            ReservationStatus,
            values_callable=lambda e: [v.value for v in e],
            name="reservation_status",
        ),
        default=ReservationStatus.PENDING,
        server_default=ReservationStatus.PENDING.value,
    )
    requested_by_role: Mapped[str] = mapped_column(String(30))
    note: Mapped[str | None] = mapped_column(Text)
