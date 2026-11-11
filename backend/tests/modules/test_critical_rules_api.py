"""Black-box HTTP tests for the critical business rules."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import Role
from app.main import app
from tests.modules.test_reservations_service import make_equipment, make_site

RESERVATIONS = "/api/v1/reservations"
PERIOD = {"start_date": "2026-11-10", "end_date": "2026-11-20"}


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_reservation_approval_rejects_non_fleet_manager_with_403(
    api: TestClient, db: Session
) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    reservation = api.post(
        RESERVATIONS,
        json={"equipment_id": equipment.id, "site_id": site.id, **PERIOD},
        headers={"X-Role": Role.SITE_MANAGER.value},
    ).json()

    response = api.post(
        f"{RESERVATIONS}/{reservation['id']}/approve",
        headers={"X-Role": Role.SITE_MANAGER.value},
    )

    assert response.status_code == 403
