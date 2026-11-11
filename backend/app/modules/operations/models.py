"""ORM models for the operations module."""

from datetime import date
from decimal import Decimal

from sqlalchemy import Boolean, Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


class UsageLog(Base):
    __tablename__ = "usage_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(ForeignKey("equipment.id"), nullable=False)
    site_id: Mapped[int] = mapped_column(ForeignKey("sites.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    hours: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)
    fuel_liters: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False)

    equipment = relationship("Equipment")
    site = relationship("Site")


class Checklist(Base):
    __tablename__ = "checklists"

    id: Mapped[int] = mapped_column(primary_key=True)
    equipment_id: Mapped[int] = mapped_column(
        ForeignKey("equipment.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)

    equipment = relationship("Equipment")
    items: Mapped[list["ChecklistItem"]] = relationship(
        "ChecklistItem",
        back_populates="checklist",
        cascade="all, delete-orphan",
        order_by="ChecklistItem.id",
        lazy="selectin",
    )


class ChecklistItem(Base):
    __tablename__ = "checklist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    checklist_id: Mapped[int] = mapped_column(
        ForeignKey("checklists.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    critical: Mapped[bool] = mapped_column(Boolean, nullable=False)

    checklist: Mapped["Checklist"] = relationship("Checklist", back_populates="items")
