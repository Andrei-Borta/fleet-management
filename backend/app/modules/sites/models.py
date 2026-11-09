"""Construction sites and their budgets."""

from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.db import Base


class Site(Base):
    __tablename__ = "sites"
    __table_args__ = (
        CheckConstraint("budget >= 0", name="ck_sites_budget"),
        CheckConstraint("end_date >= start_date", name="ck_sites_dates"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str] = mapped_column(String(500))
    budget: Mapped[Decimal] = mapped_column(Numeric(14, 2))
    start_date: Mapped[date]
    end_date: Mapped[date]
