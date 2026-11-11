"""HTTP contract tests for intervention workflows."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment


@pytest.fixture
def maintenance_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def equipment_id(db: Session) -> int:
    equipment = Equipment(
        name="Digger", type="excavator", serial_no="maintenance-api", hourly_cost=10
    )
    db.add(equipment)
    db.flush()
    return equipment.id


def test_intervention_api_workflow(maintenance_client: TestClient, equipment_id: int) -> None:
    client = maintenance_client
    response = client.post(
        "/api/v1/maintenance/interventions",
        json={
            "equipment_id": equipment_id,
            "kind": "revision",
            "scheduled_date": "2020-01-01",
            "labor_hours": 1.25,
            "labor_rate": 40,
        },
    )
    assert response.status_code == 201
    item = response.json()
    assert item["status"] == "planned"
    assert item["total_cost"] == 50.0
    assert isinstance(item["total_cost"], int | float)
    item_id = item["id"]
    response = client.post(
        f"/api/v1/maintenance/interventions/{item_id}/parts",
        json={
            "name": "Filter",
            "qty": 2,
            "unit_cost": 3.5,
        },
    )
    assert response.status_code == 201
    assert response.json()["total_cost"] == 57.0
    assert response.json()["parts"][0]["unit_cost"] == 3.5
    assert client.get(f"/api/v1/maintenance/interventions/{item_id}").json() == response.json()
    listed = client.get(
        "/api/v1/maintenance/interventions", params={"equipment_id": equipment_id}
    ).json()
    assert [row["id"] for row in listed] == [item_id]
    assert (
        client.patch(
            f"/api/v1/maintenance/interventions/{item_id}", json={"status": "done"}
        ).status_code
        == 409
    )
    assert (
        client.patch(
            f"/api/v1/maintenance/interventions/{item_id}", json={"status": "in_progress"}
        ).status_code
        == 200
    )
    completed = client.patch(
        f"/api/v1/maintenance/interventions/{item_id}", json={"status": "done"}
    )
    assert completed.status_code == 200
    assert completed.json()["completed_at"] is not None


@pytest.mark.parametrize(
    "change",
    [
        {"equipment_id": -1},
        {"kind": "unknown"},
        {"labor_hours": -1},
        {"labor_rate": 0.001},
    ],
)
def test_invalid_create_returns_422(
    maintenance_client: TestClient, equipment_id: int, change: dict
) -> None:
    payload = {"equipment_id": equipment_id, "kind": "repair", "scheduled_date": "2020-01-01"}
    assert (
        maintenance_client.post(
            "/api/v1/maintenance/interventions", json={**payload, **change}
        ).status_code
        == 422
    )


def test_missing_and_invalid_part_requests(
    maintenance_client: TestClient, equipment_id: int
) -> None:
    client = maintenance_client
    assert client.get("/api/v1/maintenance/interventions/99999999").status_code == 404
    assert (
        client.patch(
            "/api/v1/maintenance/interventions/99999999", json={"status": "in_progress"}
        ).status_code
        == 404
    )
    assert (
        client.post(
            "/api/v1/maintenance/interventions/99999999/parts",
            json={"name": "Hose", "qty": 1, "unit_cost": 1},
        ).status_code
        == 404
    )
    created = client.post(
        "/api/v1/maintenance/interventions",
        json={"equipment_id": equipment_id, "kind": "repair", "scheduled_date": "2020-01-01"},
    ).json()
    item_id = created["id"]
    assert (
        client.post(
            f"/api/v1/maintenance/interventions/{item_id}/parts",
            json={"name": "Hose", "qty": 0, "unit_cost": 1},
        ).status_code
        == 422
    )
    assert (
        client.patch(
            f"/api/v1/maintenance/interventions/{item_id}", json={"labor_hours": None}
        ).status_code
        == 422
    )
