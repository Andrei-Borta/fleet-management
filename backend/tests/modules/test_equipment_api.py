"""HTTP contract for equipment CRUD."""

from collections.abc import Iterator
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import Equipment, EquipmentStatus

URL = "/api/v1/equipment"


@pytest.fixture
def equipment_client(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.fixture
def payload() -> dict[str, object]:
    return {
        "name": "Excavator",
        "type": "api-test-excavator",
        "serial_no": "api-eq-001",
        "hourly_cost": 75.5,
        "engine_hours": 120.25,
        "service_interval_days": 180,
        "service_interval_hours": 250,
    }


def test_equipment_crud_http(equipment_client: TestClient, payload: dict[str, object]) -> None:
    response = equipment_client.post(URL, json=payload)
    assert response.status_code == 201
    equipment = response.json()
    assert equipment["status"] == "available"
    assert equipment["hourly_cost"] == 75.5
    assert equipment["engine_hours"] == 120.25
    assert isinstance(equipment["hourly_cost"], int | float)
    assert equipment["last_service_at"] is None
    equipment_id = equipment["id"]

    assert equipment_client.get(f"{URL}/{equipment_id}").json() == equipment
    assert equipment in equipment_client.get(URL).json()

    response = equipment_client.patch(
        f"{URL}/{equipment_id}", json={"status": "retired", "engine_hours": 130}
    )
    assert response.status_code == 200
    assert response.json()["status"] == "retired"
    assert response.json()["engine_hours"] == 130
    assert response.json()["name"] == "Excavator"

    response = equipment_client.delete(f"{URL}/{equipment_id}")
    assert response.status_code == 204
    assert not response.content
    assert equipment_client.get(f"{URL}/{equipment_id}").status_code == 404


def test_list_filters_http(equipment_client: TestClient, payload: dict[str, object]) -> None:
    first = equipment_client.post(URL, json=payload).json()
    second = equipment_client.post(
        URL, json={**payload, "serial_no": "api-eq-002", "status": "retired"}
    ).json()
    equipment_client.post(
        URL, json={**payload, "serial_no": "api-eq-003", "type": "api-test-crane"}
    )

    by_type = equipment_client.get(URL, params={"type": "api-test-excavator"}).json()
    assert [item["id"] for item in by_type] == [first["id"], second["id"]]
    by_status = equipment_client.get(
        URL, params={"type": "api-test-excavator", "status": "retired"}
    ).json()
    assert [item["id"] for item in by_status] == [second["id"]]


def test_available_period_filter_http(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    free = equipment_client.post(URL, json=payload).json()
    equipment_client.post(URL, json={**payload, "serial_no": "api-eq-retired", "status": "retired"})
    response = equipment_client.get(
        URL,
        params={
            "type": "api-test-excavator",
            "available_from": "2026-06-01",
            "available_to": "2026-06-05",
        },
    )
    assert response.status_code == 200
    assert [item["id"] for item in response.json()] == [free["id"]]


@pytest.mark.parametrize(
    "params",
    [
        {"available_from": "2026-06-01"},
        {"available_to": "2026-06-01"},
        {"available_from": "2026-06-05", "available_to": "2026-06-01"},
        {"available_from": "not-a-date", "available_to": "2026-06-01"},
        {"status": "flying"},
    ],
)
def test_invalid_list_filters_return_422(
    equipment_client: TestClient, params: dict[str, str]
) -> None:
    assert equipment_client.get(URL, params=params).status_code == 422


@pytest.mark.parametrize(
    "changes",
    [
        {"engine_hours": -1},
        {"hourly_cost": -5},
        {"hourly_cost": None},
        {"name": ""},
        {"status": "flying"},
        {"service_interval_days": 0},
        {"hourly_cost": 1.234},
    ],
)
def test_invalid_create_returns_422(
    equipment_client: TestClient, payload: dict[str, object], changes: dict[str, object]
) -> None:
    assert equipment_client.post(URL, json={**payload, **changes}).status_code == 422


@pytest.mark.parametrize("status", ["defective", "in_service", "reserved"])
def test_statuses_set_by_other_logic_return_422(
    equipment_client: TestClient, payload: dict[str, object], status: str
) -> None:
    assert equipment_client.post(URL, json={**payload, "status": status}).status_code == 422

    equipment_id = equipment_client.post(URL, json=payload).json()["id"]
    response = equipment_client.patch(f"{URL}/{equipment_id}", json={"status": status})
    assert response.status_code == 422
    assert equipment_client.get(f"{URL}/{equipment_id}").json()["status"] == "available"


def test_retire_with_approved_reservation_returns_409(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    equipment_id = equipment_client.post(URL, json=payload).json()["id"]
    today = date.today()
    site = {
        "name": "Site",
        "address": "Main Street",
        "budget": 1000,
        "start_date": (today - timedelta(days=30)).isoformat(),
        "end_date": (today + timedelta(days=365)).isoformat(),
    }
    site_id = equipment_client.post("/api/v1/sites", json=site).json()["id"]
    reservation = equipment_client.post(
        "/api/v1/reservations",
        json={
            "equipment_id": equipment_id,
            "site_id": site_id,
            "start_date": today.isoformat(),
            "end_date": (today + timedelta(days=3)).isoformat(),
        },
    ).json()

    approve = equipment_client.post(f"/api/v1/reservations/{reservation['id']}/approve")
    assert approve.status_code == 200

    response = equipment_client.patch(f"{URL}/{equipment_id}", json={"status": "retired"})
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Cannot retire equipment with approved reservations until they end"
    }
    assert equipment_client.get(f"{URL}/{equipment_id}").json()["status"] == "available"

    # Other fields can still be edited meanwhile.
    assert (
        equipment_client.patch(f"{URL}/{equipment_id}", json={"name": "Renamed"}).status_code == 200
    )

    equipment_client.post(f"/api/v1/reservations/{reservation['id']}/cancel")
    retired = equipment_client.patch(f"{URL}/{equipment_id}", json={"status": "retired"})
    assert retired.status_code == 200
    assert retired.json()["status"] == "retired"


def test_defective_equipment_made_available_by_hand_returns_409(
    equipment_client: TestClient, db: Session, payload: dict[str, object]
) -> None:
    equipment_id = equipment_client.post(URL, json=payload).json()["id"]
    equipment = db.get(Equipment, equipment_id)
    equipment.status = EquipmentStatus.DEFECTIVE
    db.commit()

    response = equipment_client.patch(f"{URL}/{equipment_id}", json={"status": "available"})

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Equipment is defective and becomes available through maintenance"
    }
    assert equipment_client.get(f"{URL}/{equipment_id}").json()["status"] == "defective"


def test_create_without_required_field_returns_422(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    del payload["serial_no"]
    assert equipment_client.post(URL, json=payload).status_code == 422


def test_duplicate_serial_no_returns_409(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    equipment_client.post(URL, json=payload)
    response = equipment_client.post(URL, json=payload)
    assert response.status_code == 409
    assert response.json() == {"detail": "Serial number is already in use"}

    other = equipment_client.post(URL, json={**payload, "serial_no": "api-eq-other"}).json()
    response = equipment_client.patch(f"{URL}/{other['id']}", json={"serial_no": "api-eq-001"})
    assert response.status_code == 409


def test_invalid_patch_and_missing_equipment(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    equipment_id = equipment_client.post(URL, json=payload).json()["id"]
    assert equipment_client.patch(f"{URL}/{equipment_id}", json={"name": None}).status_code == 422
    assert (
        equipment_client.patch(f"{URL}/{equipment_id}", json={"engine_hours": -1}).status_code
        == 422
    )
    cleared = equipment_client.patch(f"{URL}/{equipment_id}", json={"service_interval_days": None})
    assert cleared.status_code == 200
    assert cleared.json()["service_interval_days"] is None
    assert equipment_client.get(f"{URL}/99999999").status_code == 404
    assert equipment_client.patch(f"{URL}/99999999", json={"name": "New"}).status_code == 404
    assert equipment_client.delete(f"{URL}/99999999").status_code == 404


def test_delete_with_reservation_returns_409(
    equipment_client: TestClient, payload: dict[str, object]
) -> None:
    equipment_id = equipment_client.post(URL, json=payload).json()["id"]
    site = {
        "name": "Site",
        "address": "Main Street",
        "budget": 1000,
        "start_date": "2026-01-01",
        "end_date": "2026-12-31",
    }
    site_id = equipment_client.post("/api/v1/sites", json=site).json()["id"]
    reservation = equipment_client.post(
        "/api/v1/reservations",
        json={
            "equipment_id": equipment_id,
            "site_id": site_id,
            "start_date": "2026-05-01",
            "end_date": "2026-05-02",
        },
    )
    assert reservation.status_code == 201

    response = equipment_client.delete(f"{URL}/{equipment_id}")
    assert response.status_code == 409
    assert response.json() == {
        "detail": "Cannot delete equipment with reservations, defects or service history"
    }
    assert equipment_client.get(f"{URL}/{equipment_id}").status_code == 200
