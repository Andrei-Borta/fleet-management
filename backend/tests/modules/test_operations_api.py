"""HTTP API tests for the operations usage logging and checklist endpoints."""

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app


@pytest.fixture
def client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_usage_logging_api_flow(client: TestClient) -> None:
    eq = client.post(
        "/api/v1/equipment",
        json={
            "name": "Bulldozer",
            "type": "heavy",
            "serial_no": f"ops-{uuid4().hex}",
            "hourly_cost": 75,
        },
    ).json()

    site = client.post(
        "/api/v1/sites",
        json={
            "name": "Highway Construction",
            "address": "Km 45",
            "budget": 50000,
            "start_date": "2026-01-01",
            "end_date": "2026-12-31",
        },
    ).json()

    post_resp = client.post(
        "/api/v1/operations/usage",
        json={
            "equipment_id": eq["id"],
            "site_id": site["id"],
            "date": "2026-11-10",
            "hours": 8.5,
            "fuel_liters": 25.0,
        },
    )
    assert post_resp.status_code == 201
    data = post_resp.json()
    assert data["hours"] == 8.5
    assert data["fuel_liters"] == 25.0

    get_resp = client.get(
        "/api/v1/operations/usage",
        params={"equipment_id": eq["id"]},
    )
    assert get_resp.status_code == 200
    summary = get_resp.json()
    assert summary["total_hours"] == 8.5
    assert summary["total_fuel_liters"] == 25.0
    assert len(summary["items"]) == 1


def test_checklist_api_passing_flow(client: TestClient) -> None:
    eq = client.post(
        "/api/v1/equipment",
        json={
            "name": "Excavator",
            "type": "excavator",
            "serial_no": f"ops-{uuid4().hex}",
            "hourly_cost": 100,
        },
    ).json()

    post_resp = client.post(
        "/api/v1/operations/checklists",
        json={
            "equipment_id": eq["id"],
            "date": "2026-11-10",
            "items": [
                {"name": "Brakes", "ok": True, "critical": True},
                {"name": "Mirrors", "ok": True, "critical": False},
            ],
        },
    )
    assert post_resp.status_code == 201
    data = post_resp.json()
    assert data["equipment_id"] == eq["id"]
    assert data["date"] == "2026-11-10"
    assert len(data["items"]) == 2

    # Check equipment remains available
    eq_check = client.get(f"/api/v1/equipment/{eq['id']}").json()
    assert eq_check["status"] == "available"

    # Query checklists
    get_resp = client.get(
        "/api/v1/operations/checklists",
        params={"equipment_id": eq["id"], "date": "2026-11-10"},
    )
    assert get_resp.status_code == 200
    items = get_resp.json()
    assert len(items) == 1
    assert items[0]["id"] == data["id"]


def test_checklist_api_critical_failure_auto_blocks(client: TestClient) -> None:
    eq = client.post(
        "/api/v1/equipment",
        json={
            "name": "Crane",
            "type": "crane",
            "serial_no": f"ops-{uuid4().hex}",
            "hourly_cost": 150,
        },
    ).json()

    post_resp = client.post(
        "/api/v1/operations/checklists",
        json={
            "equipment_id": eq["id"],
            "date": "2026-11-10",
            "items": [
                {"name": "Hydraulic Pressure", "ok": False, "critical": True},
                {"name": "Wipers", "ok": True, "critical": False},
            ],
        },
    )
    assert post_resp.status_code == 201
    data = post_resp.json()
    assert len(data["items"]) == 2

    # Equipment should now be defective (auto-blocked)
    eq_check = client.get(f"/api/v1/equipment/{eq['id']}").json()
    assert eq_check["status"] == "defective"

    # Defect should exist in maintenance defects
    defects_resp = client.get(
        "/api/v1/maintenance/defects",
        params={"equipment_id": eq["id"], "open": "true"},
    )
    assert defects_resp.status_code == 200
    defects = defects_resp.json()
    assert len(defects) == 1
    assert defects[0]["severity"] == "critical"
    assert defects[0]["status"] == "open"
    assert "Hydraulic Pressure" in defects[0]["description"]


def test_checklist_api_validation_errors(client: TestClient) -> None:
    # Unknown equipment
    resp = client.post(
        "/api/v1/operations/checklists",
        json={
            "equipment_id": 999_999,
            "date": "2026-11-10",
            "items": [{"name": "Brakes", "ok": True, "critical": True}],
        },
    )
    assert resp.status_code == 404

    # Empty items list
    resp = client.post(
        "/api/v1/operations/checklists",
        json={
            "equipment_id": 1,
            "date": "2026-11-10",
            "items": [],
        },
    )
    assert resp.status_code == 422
