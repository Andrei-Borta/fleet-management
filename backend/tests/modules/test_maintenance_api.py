"""HTTP coverage for GET /maintenance/due."""

from uuid import uuid4

from fastapi.testclient import TestClient


def test_due_lists_overdue_equipment(client: TestClient) -> None:
    created = client.post(
        "/api/v1/equipment",
        json={
            "name": "Due excavator",
            "type": "maint-api-test",
            "serial_no": f"mt-api-{uuid4()}",
            "hourly_cost": 50,
            "service_interval_days": 1,
            "last_service_at": "2020-01-01T00:00:00Z",
        },
    ).json()
    try:
        response = client.get(
            "/api/v1/maintenance/due", params={"within_days": 0, "within_hours": 0}
        )
        assert response.status_code == 200
        row = next(item for item in response.json() if item["equipment_id"] == created["id"])
        assert row["overdue"] is True
        assert row["days_until_due"] < 0
        assert row["hours_until_due"] is None
    finally:
        client.delete(f"/api/v1/equipment/{created['id']}")


def test_due_rejects_negative_window(client: TestClient) -> None:
    assert client.get("/api/v1/maintenance/due", params={"within_days": -1}).status_code == 422
    assert client.get("/api/v1/maintenance/due", params={"within_hours": -1}).status_code == 422
