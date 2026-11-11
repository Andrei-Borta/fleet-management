"""HTTP API tests for the operations usage logging endpoints."""

from uuid import uuid4

from fastapi.testclient import TestClient


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

    try:
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
    finally:
        client.delete(f"/api/v1/equipment/{eq['id']}")
        client.delete(f"/api/v1/sites/{site['id']}")
