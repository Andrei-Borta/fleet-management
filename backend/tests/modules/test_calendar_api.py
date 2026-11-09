"""HTTP contract for the central calendar endpoint."""

from collections.abc import Iterator
from datetime import UTC, date, datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import InterventionKind, ServiceIntervention
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

URL = "/api/v1/reservations/calendar"


@pytest.fixture
def calendar_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def scenario(db: Session) -> dict[str, int]:
    equipment = Equipment(name="Crane", type="crane", serial_no="api-cal-001", hourly_cost=10)
    site = Site(
        name="East site",
        address="Main Street",
        budget=1000,
        start_date=date(2099, 1, 1),
        end_date=date(2099, 12, 31),
    )
    db.add_all([equipment, site])
    db.flush()
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site.id,
        start_date=date(2099, 5, 10),
        end_date=date(2099, 5, 12),
        status=ReservationStatus.APPROVED,
        requested_by_role="site_manager",
    )
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        description="Inspection",
        kind=InterventionKind.REVISION,
        scheduled_date=date(2099, 5, 20),
        started_at=datetime(2099, 5, 1, tzinfo=UTC),
    )
    db.add_all([reservation, intervention])
    db.commit()
    return {
        "equipment_id": equipment.id,
        "site_id": site.id,
        "reservation_id": reservation.id,
        "intervention_id": intervention.id,
    }


def test_calendar_returns_reservations_and_maintenance(
    calendar_client: TestClient, scenario: dict[str, int]
) -> None:
    response = calendar_client.get(
        URL,
        params={"from": "2099-05-01", "to": "2099-05-31", "equipment_id": scenario["equipment_id"]},
    )

    assert response.status_code == 200
    assert response.json() == [
        {
            "type": "reservation",
            "id": scenario["reservation_id"],
            "equipment": {"id": scenario["equipment_id"], "name": "Crane", "type": "crane"},
            "site": {"id": scenario["site_id"], "name": "East site"},
            "start": "2099-05-10",
            "end": "2099-05-12",
            "status": "approved",
        },
        {
            "type": "maintenance",
            "id": scenario["intervention_id"],
            "equipment": {"id": scenario["equipment_id"], "name": "Crane", "type": "crane"},
            "site": None,
            "start": "2099-05-20",
            "end": "2099-05-20",
            "status": "planned",
        },
    ]


def test_calendar_filters_by_site_and_range(
    calendar_client: TestClient, scenario: dict[str, int]
) -> None:
    by_site = calendar_client.get(
        URL, params={"from": "2099-05-01", "to": "2099-05-31", "site_id": scenario["site_id"]}
    ).json()
    assert [(e["type"], e["id"]) for e in by_site] == [("reservation", scenario["reservation_id"])]

    narrow = calendar_client.get(
        URL,
        params={"from": "2099-05-13", "to": "2099-05-19", "equipment_id": scenario["equipment_id"]},
    )
    assert narrow.status_code == 200
    assert narrow.json() == []


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2099-05-01"},
        {"to": "2099-05-31"},
        {},
        {"from": "not-a-date", "to": "2099-05-31"},
        {"from": "2099-05-31", "to": "2099-05-01"},
        {"from": "2099-01-01", "to": "2099-04-04"},  # 94 days
        {"from": "2099-05-01", "to": "2099-05-31", "site_id": "abc"},
    ],
)
def test_invalid_calendar_params_return_422(
    calendar_client: TestClient, params: dict[str, str]
) -> None:
    assert calendar_client.get(URL, params=params).status_code == 422


def test_range_of_93_days_is_accepted_and_error_has_detail(calendar_client: TestClient) -> None:
    accepted = calendar_client.get(URL, params={"from": "2099-01-01", "to": "2099-04-03"})
    assert accepted.status_code == 200

    rejected = calendar_client.get(URL, params={"from": "2099-01-01", "to": "2099-04-04"})
    assert rejected.status_code == 422
    assert rejected.json() == {"detail": "The calendar range must not exceed 93 days"}
