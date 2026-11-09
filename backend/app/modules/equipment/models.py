"""Equipment records and their current fleet status."""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class EquipmentStatus(StrEnum):
    AVAILABLE = "available"
    RESERVED = "reserved"
    IN_SERVICE = "in_service"
    DEFECTIVE = "defective"
    RETIRED = "retired"


class Equipment(Base):
    __tablename__ = "equipment"
    __table_args__ = (
        CheckConstraint("engine_hours >= 0", name="ck_equipment_engine_hours"),
        CheckConstraint("hourly_cost >= 0", name="ck_equipment_hourly_cost"),
        CheckConstraint("service_interval_days > 0", name="ck_equipment_service_interval_days"),
        CheckConstraint("service_interval_hours > 0", name="ck_equipment_service_interval_hours"),
        CheckConstraint("last_service_hours >= 0", name="ck_equipment_last_service_hours"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(100), index=True)
    serial_no: Mapped[str] = mapped_column(String(100), unique=True)
    status: Mapped[EquipmentStatus] = mapped_column(
        Enum(
            EquipmentStatus, values_callable=lambda e: [v.value for v in e], name="equipment_status"
        ),
        default=EquipmentStatus.AVAILABLE,
        server_default=EquipmentStatus.AVAILABLE.value,
    )
    engine_hours: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")
    hourly_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
    service_interval_days: Mapped[int | None]
    service_interval_hours: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    last_service_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_service_hours: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
