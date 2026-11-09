"""Defects, service interventions, and parts used during an intervention."""

from datetime import datetime
from decimal import Decimal
from enum import StrEnum

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class DefectStatus(StrEnum):
    OPEN = "open"
    RESOLVED = "resolved"


class InterventionStatus(StrEnum):
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class Defect(Base):
    __tablename__ = "defects"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[DefectStatus] = mapped_column(
        Enum(DefectStatus, values_callable=lambda e: [v.value for v in e], name="defect_status"),
        default=DefectStatus.OPEN,
        server_default=DefectStatus.OPEN.value,
    )
    reported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ServiceIntervention(Base):
    __tablename__ = "service_interventions"
    __table_args__ = (
        CheckConstraint("labor_cost >= 0", name="ck_service_interventions_labor_cost"),
        CheckConstraint("completed_at >= started_at", name="ck_service_interventions_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), index=True)
    defect_id: Mapped[int | None] = mapped_column(ForeignKey("defects.id"), index=True)
    description: Mapped[str] = mapped_column(Text)
    status: Mapped[InterventionStatus] = mapped_column(
        Enum(
            InterventionStatus,
            values_callable=lambda e: [v.value for v in e],
            name="intervention_status",
        ),
        default=InterventionStatus.OPEN,
        server_default=InterventionStatus.OPEN.value,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    labor_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=0, server_default="0")


class InterventionPart(Base):
    __tablename__ = "intervention_parts"
    __table_args__ = (
        CheckConstraint("qty > 0", name="ck_intervention_parts_qty"),
        CheckConstraint("unit_cost >= 0", name="ck_intervention_parts_unit_cost"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    intervention_id: Mapped[int] = mapped_column(ForeignKey("service_interventions.id"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    qty: Mapped[int]
    unit_cost: Mapped[Decimal] = mapped_column(Numeric(12, 2))
