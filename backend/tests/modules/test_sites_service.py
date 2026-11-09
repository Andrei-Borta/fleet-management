"""Service coverage for site CRUD and reservation-history protection."""

from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, NotFoundError
from app.modules.equipment.models import Equipment
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites import service
from app.modules.sites.models import Site
from app.modules.sites.schemas import SiteCreate, SiteUpdate


@pytest.fixture
def site_data() -> SiteCreate:
    return SiteCreate(
        name="North site",
        address="Main Street",
        budget=Decimal("1200.50"),
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )


def test_create_list_and_get_sites(db: Session, site_data: SiteCreate) -> None:
    site = service.create_site(db, site_data)
    assert site.id is not None
    assert site.budget == Decimal("1200.50")
    assert service.get_site(db, site.id).name == "North site"
    assert site.id in [item.id for item in service.list_sites(db)]


@pytest.mark.parametrize("operation", ["get", "update", "delete"])
def test_missing_site_raises_not_found(db: Session, operation: str) -> None:
    with pytest.raises(NotFoundError, match="Site not found"):
        if operation == "get":
            service.get_site(db, 99999999)
        elif operation == "update":
            service.update_site(db, 99999999, SiteUpdate(name="New"))
        else:
            service.delete_site(db, 99999999)


def test_update_site_partial_and_same_day(db: Session, site_data: SiteCreate) -> None:
    site = service.create_site(db, site_data)
    updated = service.update_site(
        db, site.id, SiteUpdate(name="South", start_date=date(2026, 12, 31))
    )
    assert updated.name == "South"
    assert updated.address == "Main Street"
    assert updated.start_date == updated.end_date
    assert service.update_site(db, site.id, SiteUpdate()).id == site.id


@pytest.mark.parametrize(
    "changes",
    [SiteUpdate(start_date=date(2027, 1, 1)), SiteUpdate(end_date=date(2025, 12, 31))],
)
def test_update_rejects_invalid_dates_without_mutation(
    db: Session, site_data: SiteCreate, changes: SiteUpdate
) -> None:
    site = service.create_site(db, site_data)
    with pytest.raises(ValueError, match="end_date"):
        service.update_site(db, site.id, changes)
    assert site.start_date == date(2026, 1, 1)
    assert site.end_date == date(2026, 12, 31)


def test_update_rejects_dates_excluding_approved_reservation(
    db: Session, site_data: SiteCreate
) -> None:
    site = service.create_site(db, site_data)
    equipment = Equipment(name="Loader", type="loader", serial_no="site-date", hourly_cost=10)
    db.add(equipment)
    db.flush()
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site.id,
            start_date=date(2026, 5, 10),
            end_date=date(2026, 5, 20),
            status=ReservationStatus.APPROVED,
            requested_by_role="site_manager",
        )
    )
    db.commit()
    for changes in (
        SiteUpdate(start_date=date(2026, 5, 11)),
        SiteUpdate(end_date=date(2026, 5, 19)),
    ):
        with pytest.raises(ConflictError, match="approved reservations"):
            service.update_site(db, site.id, changes)
        assert site.start_date == date(2026, 1, 1)
        assert site.end_date == date(2026, 12, 31)
    updated = service.update_site(
        db,
        site.id,
        SiteUpdate(
            start_date=date(2026, 5, 10),
            end_date=date(2026, 5, 20),
        ),
    )
    assert updated.start_date == date(2026, 5, 10)
    assert updated.end_date == date(2026, 5, 20)


def test_delete_unreferenced_site(db: Session, site_data: SiteCreate) -> None:
    site = service.create_site(db, site_data)
    site_id = site.id
    service.delete_site(db, site_id)
    assert db.get(Site, site_id) is None


@pytest.mark.parametrize(
    ("reservation_status", "start_offset", "end_offset"),
    [
        (ReservationStatus.APPROVED, 1, 2),
        (ReservationStatus.APPROVED, -2, -1),
        (ReservationStatus.PENDING, 1, 2),
        (ReservationStatus.REJECTED, 1, 2),
        (ReservationStatus.CANCELLED, 1, 2),
    ],
)
def test_delete_site_with_reservations_preserves_history(
    db: Session,
    site_data: SiteCreate,
    reservation_status: ReservationStatus,
    start_offset: int,
    end_offset: int,
) -> None:
    site = service.create_site(db, site_data)
    site_id = site.id
    equipment = Equipment(name="Loader", type="loader", serial_no="site-test", hourly_cost=10)
    db.add(equipment)
    db.flush()
    today = date.today()
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site_id,
        start_date=today + timedelta(days=start_offset),
        end_date=today + timedelta(days=end_offset),
        status=reservation_status,
        requested_by_role="site_manager",
    )
    db.add(reservation)
    db.commit()
    with pytest.raises(ConflictError, match="reservations"):
        service.delete_site(db, site_id)
    assert db.get(Site, site_id) is not None
    assert db.scalar(select(Reservation).where(Reservation.site_id == site_id)) is not None
