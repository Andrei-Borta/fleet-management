"""Black-box HTTP tests for the critical business rules of the demo storyline.

Each test drives a whole rule through the API only (no service calls), so it checks routing, error
handlers and response bodies together. Role checks are out of scope for the MVP: roles shape the
frontend only and the backend does not enforce them (docs/SCOPE.md).
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from tests.modules.test_reservations_service import make_equipment, make_site

API = "/api/v1"
RESERVATIONS = f"{API}/reservations"
SITE_MANAGER = {"X-Role": "site_manager"}
FLEET_MANAGER = {"X-Role": "fleet_manager"}


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def request_booking(api: TestClient, equipment_id: int, site_id: int, start: str, end: str) -> dict:
    response = api.post(
        RESERVATIONS,
        json={
            "equipment_id": equipment_id,
            "site_id": site_id,
            "start_date": start,
            "end_date": end,
        },
        headers=SITE_MANAGER,
    )
    return {"status": response.status_code, "body": response.json()}


def approve(api: TestClient, reservation_id: int) -> dict:
    response = api.post(f"{RESERVATIONS}/{reservation_id}/approve", headers=FLEET_MANAGER)
    return {"status": response.status_code, "body": response.json()}


def test_overlapping_request_returns_409_with_conflict_and_alternative(
    api: TestClient, db: Session
) -> None:
    booked = make_equipment(db)
    alternative = make_equipment(db)
    make_equipment(db, type_="crane")  # another type is never suggested
    site = make_site(db)
    first = request_booking(api, booked.id, site.id, "2026-11-10", "2026-11-20")
    assert first["status"] == 201
    assert approve(api, first["body"]["id"])["status"] == 200

    conflict = request_booking(api, booked.id, site.id, "2026-11-18", "2026-11-22")

    assert conflict["status"] == 409
    body = conflict["body"]
    assert body["detail"]
    assert [(c["kind"], c["id"]) for c in body["conflicts"]] == [
        ("reservation", first["body"]["id"])
    ]
    suggested = [a["id"] for a in body["alternatives"]]
    assert alternative.id in suggested
    assert booked.id not in suggested
    assert all(a["type"] == "excavator" for a in body["alternatives"])

    # Choosing the suggested alternative goes through.
    assert (
        request_booking(api, alternative.id, site.id, "2026-11-18", "2026-11-22")["status"] == 201
    )


def test_approval_is_checked_again_against_bookings_approved_meanwhile(
    api: TestClient, db: Session
) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    first = request_booking(api, equipment.id, site.id, "2026-11-10", "2026-11-15")
    second = request_booking(api, equipment.id, site.id, "2026-11-14", "2026-11-18")
    assert first["status"] == second["status"] == 201

    assert approve(api, first["body"]["id"])["status"] == 200
    refused = approve(api, second["body"]["id"])

    assert refused["status"] == 409
    assert [c["id"] for c in refused["body"]["conflicts"]] == [first["body"]["id"]]


def test_critical_defect_blocks_the_equipment_until_it_is_repaired(
    api: TestClient, db: Session
) -> None:
    equipment = make_equipment(db)
    site = make_site(db)

    reported = api.post(
        f"{API}/maintenance/defects",
        json={"equipment_id": equipment.id, "description": "Brake failure", "severity": "critical"},
    )
    assert reported.status_code == 201
    assert api.get(f"{API}/equipment/{equipment.id}").json()["status"] == "defective"

    refused = request_booking(api, equipment.id, site.id, "2026-11-10", "2026-11-12")
    assert refused["status"] == 409

    repair = api.post(
        f"{API}/maintenance/interventions",
        json={
            "equipment_id": equipment.id,
            "defect_id": reported.json()["id"],
            "kind": "repair",
            "scheduled_date": "2026-11-09",
            "description": "Replace brake pads",
        },
    )
    assert repair.status_code == 201
    url = f"{API}/maintenance/interventions/{repair.json()['id']}"
    assert api.patch(url, json={"status": "in_progress"}).status_code == 200
    assert api.get(f"{API}/equipment/{equipment.id}").json()["status"] == "in_service"
    assert api.patch(url, json={"status": "done"}).status_code == 200

    assert api.get(f"{API}/equipment/{equipment.id}").json()["status"] == "available"
    assert request_booking(api, equipment.id, site.id, "2026-11-10", "2026-11-12")["status"] == 201


def test_low_severity_defect_does_not_block_the_equipment(api: TestClient, db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)

    reported = api.post(
        f"{API}/maintenance/defects",
        json={"equipment_id": equipment.id, "description": "Scratched door", "severity": "low"},
    )

    assert reported.status_code == 201
    assert api.get(f"{API}/equipment/{equipment.id}").json()["status"] == "available"
    assert request_booking(api, equipment.id, site.id, "2026-11-10", "2026-11-12")["status"] == 201
