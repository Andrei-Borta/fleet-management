"""HTTP coverage for maintenance due dates and defect reporting."""

from collections.abc import Iterator
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment, EquipmentStatus


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


DEFECTS = "/api/v1/maintenance/defects"


@pytest.fixture
def maintenance_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def equipment(db: Session) -> Equipment:
    item = Equipment(name="Loader", type="loader", serial_no=f"api-mnt-{uuid4()}", hourly_cost=10)
    db.add(item)
    db.commit()
    return item


def test_report_and_list_defects_http(maintenance_client: TestClient, equipment: Equipment) -> None:
    response = maintenance_client.post(
        DEFECTS,
        json={"equipment_id": equipment.id, "description": "Leaking hose", "severity": "medium"},
    )
    assert response.status_code == 201
    defect = response.json()
    assert defect["equipment_id"] == equipment.id
    assert defect["severity"] == "medium"
    assert defect["status"] == "open"
    assert defect["resolved_at"] is None
    assert defect["reported_at"]

    listed = maintenance_client.get(DEFECTS, params={"equipment_id": equipment.id}).json()
    assert listed == [defect]
    assert maintenance_client.get(
        DEFECTS, params={"equipment_id": equipment.id, "open": True}
    ).json() == [defect]
    resolved = maintenance_client.get(DEFECTS, params={"equipment_id": equipment.id, "open": False})
    assert resolved.json() == []


def test_critical_defect_blocks_equipment_http(
    maintenance_client: TestClient, db: Session, equipment: Equipment
) -> None:
    response = maintenance_client.post(
        DEFECTS,
        json={"equipment_id": equipment.id, "description": "Brake failure", "severity": "critical"},
    )
    assert response.status_code == 201
    db.refresh(equipment)
    assert equipment.status == EquipmentStatus.DEFECTIVE


def test_report_defect_for_missing_equipment_returns_404(maintenance_client: TestClient) -> None:
    response = maintenance_client.post(
        DEFECTS, json={"equipment_id": 99999999, "description": "Noise", "severity": "low"}
    )
    assert response.status_code == 404
    assert response.json() == {"detail": "Equipment not found"}


@pytest.mark.parametrize(
    "changes",
    [
        {"severity": "catastrophic"},
        {"severity": None},
        {"description": ""},
        {"description": "   "},
        {"equipment_id": "abc"},
    ],
)
def test_invalid_defect_returns_422(
    maintenance_client: TestClient, equipment: Equipment, changes: dict[str, object]
) -> None:
    body = {"equipment_id": equipment.id, "description": "Noise", "severity": "low"}
    assert maintenance_client.post(DEFECTS, json={**body, **changes}).status_code == 422


def test_missing_defect_field_returns_422(
    maintenance_client: TestClient, equipment: Equipment
) -> None:
    body = {"equipment_id": equipment.id, "severity": "low"}
    assert maintenance_client.post(DEFECTS, json=body).status_code == 422


def test_invalid_defect_list_filters_return_422(maintenance_client: TestClient) -> None:
    assert maintenance_client.get(DEFECTS, params={"open": "maybe"}).status_code == 422
    assert maintenance_client.get(DEFECTS, params={"equipment_id": "abc"}).status_code == 422
