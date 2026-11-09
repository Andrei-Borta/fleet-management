"""HTTP contract for site CRUD."""

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment
from app.modules.reservations.models import Reservation, ReservationStatus


@pytest.fixture
def sites_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def payload() -> dict[str, object]:
    return {
        "name": "North site",
        "address": "Main Street",
        "budget": 1200.5,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
    }


def test_site_crud_http(sites_client: TestClient, payload: dict[str, object]) -> None:
    response = sites_client.post("/api/v1/sites", json=payload)
    assert response.status_code == 201
    site = response.json()
    assert site["budget"] == 1200.5
    assert isinstance(site["budget"], int | float)
    site_id = site["id"]
    assert sites_client.get(f"/api/v1/sites/{site_id}").json() == site
    assert site in sites_client.get("/api/v1/sites").json()
    response = sites_client.patch(f"/api/v1/sites/{site_id}", json={"name": "South"})
    assert response.status_code == 200
    assert response.json()["name"] == "South"
    response = sites_client.delete(f"/api/v1/sites/{site_id}")
    assert response.status_code == 204
    assert not response.content
    assert sites_client.get(f"/api/v1/sites/{site_id}").status_code == 404


@pytest.mark.parametrize(
    "changes",
    [
        {"budget": -1},
        {"start_date": "2027-01-01"},
        {"name": ""},
        {"budget": None},
        {"budget": 1.234},
    ],
)
def test_invalid_create_returns_422(
    sites_client: TestClient, payload: dict[str, object], changes: dict[str, object]
) -> None:
    assert sites_client.post("/api/v1/sites", json={**payload, **changes}).status_code == 422


def test_invalid_patch_and_missing_site(
    sites_client: TestClient, payload: dict[str, object]
) -> None:
    site_id = sites_client.post("/api/v1/sites", json=payload).json()["id"]
    assert (
        sites_client.patch(f"/api/v1/sites/{site_id}", json={"end_date": "2025-01-01"}).status_code
        == 422
    )
    assert sites_client.patch(f"/api/v1/sites/{site_id}", json={"name": None}).status_code == 422
    assert sites_client.patch("/api/v1/sites/99999999", json={"name": "New"}).status_code == 404
    assert sites_client.delete("/api/v1/sites/99999999").status_code == 404


def test_delete_with_reservation_returns_409(
    sites_client: TestClient, db: Session, payload: dict[str, object]
) -> None:
    site_id = sites_client.post("/api/v1/sites", json=payload).json()["id"]
    equipment = Equipment(name="Loader", type="loader", serial_no="api-site", hourly_cost=10)
    db.add(equipment)
    db.flush()
    db.add(
        Reservation(
            equipment_id=equipment.id,
            site_id=site_id,
            start_date=date(2099, 1, 1),
            end_date=date(2099, 1, 2),
            status=ReservationStatus.APPROVED,
            requested_by_role="site_manager",
        )
    )
    db.commit()
    response = sites_client.delete(f"/api/v1/sites/{site_id}")
    assert response.status_code == 409
    assert response.json() == {"detail": "Cannot delete a site with reservations"}
    assert sites_client.get(f"/api/v1/sites/{site_id}").status_code == 200
