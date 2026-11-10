"""HTTP integration tests for reservation and maintenance-related rules."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.main import app
from app.modules.equipment.models import EquipmentStatus
from app.modules.maintenance.models import Defect, DefectSeverity
from app.modules.reservations.models import ReservationStatus
from tests.modules.test_reservations_service import make_equipment, make_reservation, make_site

URL = "/api/v1/reservations"
SITE_MANAGER = {"X-Role": "site_manager"}
FLEET_MANAGER = {"X-Role": "fleet_manager"}
MECHANIC = {"X-Role": "mechanic"}
OPERATOR = {"X-Role": "operator"}


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


def test_create_conflict_returns_409_with_conflicts_and_alternatives(
    api: TestClient, db: Session
) -> None:
    equipment = make_equipment(db)
    existing = make_reservation(db, equipment)

    response = api.post(
        URL, json=request_body(equipment.id, make_site(db).id), headers=SITE_MANAGER
    )

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


@pytest.mark.parametrize(
    ("header", "action"),
    [
        (MECHANIC, "create"),
        (OPERATOR, "create"),
        (SITE_MANAGER, "approve"),
        (MECHANIC, "approve"),
        (OPERATOR, "reject"),
        (MECHANIC, "cancel"),
    ],
)
def test_role_checks_return_403(
    api: TestClient, db: Session, header: dict[str, str], action: str
) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    pending = make_reservation(db, equipment, status=ReservationStatus.PENDING)

    if action == "create":
        response = api.post(URL, json=request_body(equipment.id, site.id), headers=header)
    else:
        response = api.post(f"{URL}/{pending.id}/{action}", headers=header)

    assert response.status_code == 403


def test_critical_defect_auto_blocks_new_reservations(api: TestClient, db: Session) -> None:
    equipment = make_equipment(db)
    db.add(
        Defect(
            equipment_id=equipment.id,
            description="Hydraulic system failure",
            severity=DefectSeverity.CRITICAL,
        )
    )
    equipment.status = EquipmentStatus.DEFECTIVE
    db.flush()

    response = api.post(
        URL, json=request_body(equipment.id, make_site(db).id), headers=SITE_MANAGER
    )

    assert response.status_code == 409
    assert "defective" in response.json()["detail"]
    assert response.json()["conflicts"] == []
    assert response.json()["alternatives"] == []


def test_fleet_manager_can_approve_pending_reservation(api: TestClient, db: Session) -> None:
    reservation = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)

    response = api.post(f"{URL}/{reservation.id}/approve", headers=FLEET_MANAGER)

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
