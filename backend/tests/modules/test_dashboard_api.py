"""HTTP contract for the dashboard endpoints."""

from collections.abc import Iterator
from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment
from app.modules.maintenance.models import Defect, InterventionPart, ServiceIntervention
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

FLEET_URL = "/api/v1/dashboard/fleet"


@pytest.fixture(autouse=True)
def empty_fleet(db: Session) -> None:
    """Keep the aggregate endpoints isolated from any data already in the local database."""
    for model in (InterventionPart, ServiceIntervention, Defect, Reservation, Equipment, Site):
        db.execute(delete(model))
    db.flush()


@pytest.fixture
def dashboard_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def scenario(db: Session) -> dict[str, int]:
    equipment = Equipment(
        name="Crane",
        type="crane",
        serial_no="api-dashboard-001",
        hourly_cost=Decimal("100.00"),
    )
    site = Site(
        name="East site",
        address="Main Street",
        budget=Decimal("10000.00"),
        start_date=date(2099, 1, 1),
        end_date=date(2099, 12, 31),
    )
    db.add_all([equipment, site])
    db.flush()
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site.id,
            start_date=date(2099, 5, 10),
            end_date=date(2099, 5, 12),
            status=ReservationStatus.APPROVED,
            requested_by_role="site_manager",
        )
    )
    db.commit()
    return {"equipment_id": equipment.id, "site_id": site.id}


def test_fleet_endpoint_returns_counts_and_utilization(
    dashboard_client: TestClient, scenario: dict[str, int]
) -> None:
    response = dashboard_client.get(FLEET_URL, params={"from": "2099-05-10", "to": "2099-05-12"})

    assert response.status_code == 200
    body = response.json()
    assert body["start_date"] == "2099-05-10"
    assert body["end_date"] == "2099-05-12"
    assert body["period_days"] == 3
    assert body["total_equipment"] == 1
    assert {row["status"]: row["count"] for row in body["by_status"]}["available"] == 1
    assert body["by_type"] == [{"type": "crane", "count": 1}]
    assert body["utilization"] == [
        {
            "equipment_id": scenario["equipment_id"],
            "name": "Crane",
            "type": "crane",
            "reserved_days": 3,
            "period_days": 3,
            "utilization_percent": 100.0,
        }
    ]
    assert body["top_used"] == body["utilization"]
    assert body["least_used"] == body["utilization"]


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2099-05-01"},
        {"to": "2099-05-31"},
        {},
        {"from": "not-a-date", "to": "2099-05-31"},
        {"from": "2099-05-31", "to": "2099-05-01"},
    ],
)
def test_invalid_fleet_params_return_422(
    dashboard_client: TestClient, params: dict[str, str]
) -> None:
    assert dashboard_client.get(FLEET_URL, params=params).status_code == 422


def test_invalid_fleet_period_has_a_detail_message(dashboard_client: TestClient) -> None:
    response = dashboard_client.get(FLEET_URL, params={"from": "2099-05-31", "to": "2099-05-01"})

    assert response.status_code == 422
    assert response.json() == {"detail": "'to' must not be before 'from'"}
