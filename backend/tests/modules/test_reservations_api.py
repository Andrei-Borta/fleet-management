"""HTTP contract for reservation requests."""

from collections.abc import Iterator
from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import EquipmentStatus
from app.modules.reservations.models import ReservationStatus
from app.modules.sites.models import Site
from tests.modules.test_reservations_service import (
    make_equipment,
    make_reservation,
    make_site,
)

URL = "/api/v1/reservations"
SITE_MANAGER = {"X-Role": "site_manager"}


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)


def request_body(equipment_id: int, site_id: int) -> dict[str, object]:
    return {
        "equipment_id": equipment_id,
        "site_id": site_id,
        "start_date": "2026-11-10",
        "end_date": "2026-11-20",
        "note": "Foundation works",
    }


def test_create_returns_a_pending_request(api, db):
    equipment, site = make_equipment(db), make_site(db)

    response = api.post(URL, json=request_body(equipment.id, site.id), headers=SITE_MANAGER)

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"
    assert body["requested_by_role"] == "site_manager"
    assert body["start_date"] == "2026-11-10"
    assert body["note"] == "Foundation works"


def test_create_conflict_returns_409_with_conflicts_and_alternatives(api, db):
    equipment = make_equipment(db)
    existing = make_reservation(db, equipment)

    response = api.post(URL, json=request_body(equipment.id, make_site(db).id))

    assert response.status_code == 409
    assert response.json() == {
        "detail": "Equipment is already booked or in maintenance for this period",
        "conflicts": [
            {
                "kind": "reservation",
                "id": existing.id,
                "start_date": "2026-11-10",
                "end_date": "2026-11-20",
                "status": "approved",
            }
        ],
        "alternatives": [],
    }


def test_create_on_blocked_equipment_returns_409(api, db):
    equipment = make_equipment(db, status=EquipmentStatus.DEFECTIVE)

    response = api.post(URL, json=request_body(equipment.id, make_site(db).id))

    assert response.status_code == 409
    assert "defective" in response.json()["detail"]
    assert response.json()["conflicts"] == []


def test_create_with_unknown_references_returns_404(api, db):
    assert api.post(URL, json=request_body(make_equipment(db).id, 99999999)).status_code == 404
    assert api.post(URL, json=request_body(99999999, make_site(db).id)).status_code == 404


def test_create_with_inverted_dates_returns_422(api, db):
    body = request_body(make_equipment(db).id, make_site(db).id)
    body["end_date"] = "2026-11-01"

    assert api.post(URL, json=body).status_code == 422


def test_create_outside_the_site_dates_returns_422(api, db):
    body = request_body(make_equipment(db).id, make_site(db).id)
    body["start_date"] = "2026-10-01"

    response = api.post(URL, json=body)

    assert response.status_code == 422
    assert response.json() == {"detail": "Reservation dates must be within the site dates"}


def test_list_applies_filters(api, db):
    equipment = make_equipment(db)
    pending = make_reservation(db, equipment, status=ReservationStatus.PENDING)
    make_reservation(db, make_equipment(db))

    response = api.get(URL, params={"equipment_id": equipment.id, "status": "pending"})

    assert response.status_code == 200
    assert [r["id"] for r in response.json()] == [pending.id]
    assert api.get(URL, params={"site_id": pending.site_id}).json()[0]["id"] == pending.id
    assert api.get(URL, params={"equipment_id": equipment.id, "status": "approved"}).json() == []


def test_list_rejects_unknown_status(api):
    assert api.get(URL, params={"status": "nonsense"}).status_code == 422


def test_approve_and_cancel(api, db):
    reservation = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)

    approved = api.post(f"{URL}/{reservation.id}/approve")
    assert approved.status_code == 200
    assert approved.json()["status"] == "approved"

    cancelled = api.post(f"{URL}/{reservation.id}/cancel", headers=SITE_MANAGER)
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_reject(api, db):
    reservation = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)

    response = api.post(f"{URL}/{reservation.id}/reject")

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"


def test_approve_conflict_returns_409_with_conflicts_and_alternatives(api, db):
    equipment = make_equipment(db)
    existing = make_reservation(db, equipment)
    pending = make_reservation(db, equipment, status=ReservationStatus.PENDING)

    response = api.post(f"{URL}/{pending.id}/approve")

    assert response.status_code == 409
    assert [c["id"] for c in response.json()["conflicts"]] == [existing.id]
    assert response.json()["alternatives"] == []


def test_approve_outside_the_site_dates_returns_409(api, db):
    pending = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)
    db.get(Site, pending.site_id).end_date = date(2026, 11, 15)
    db.flush()

    response = api.post(f"{URL}/{pending.id}/approve")

    assert response.status_code == 409
    assert response.json() == {"detail": "Reservation dates are no longer within the site dates"}


def test_approving_twice_returns_409_without_conflict_list(api, db):
    reservation = make_reservation(db, make_equipment(db))

    response = api.post(f"{URL}/{reservation.id}/approve")

    assert response.status_code == 409
    assert response.json() == {"detail": "Only pending reservations can be approved"}


@pytest.mark.parametrize("action", ["approve", "reject", "cancel"])
def test_actions_on_unknown_reservation_return_404(api, action):
    assert api.post(f"{URL}/99999999/{action}").status_code == 404
