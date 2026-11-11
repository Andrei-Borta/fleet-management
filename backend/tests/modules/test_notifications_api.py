"""HTTP API tests for the notifications endpoints."""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import Role
from app.main import app
from app.modules.notifications import service
from app.modules.notifications.models import Notification
from app.modules.reservations.models import ReservationStatus
from tests.modules.test_reservations_service import make_equipment, make_reservation

URL = "/api/v1/notifications"
SITE_MANAGER = {"X-Role": "site_manager"}
MECHANIC = {"X-Role": "mechanic"}


@pytest.fixture
def api(db: Session) -> Iterator[TestClient]:
    db.execute(delete(Notification))
    db.flush()
    app.dependency_overrides[get_db] = lambda: db
    try:
        with TestClient(app) as client:
            yield client
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_list_returns_the_feed_of_the_role_in_the_header(api: TestClient, db: Session) -> None:
    service.notify(db, Role.SITE_MANAGER, "Reservation approved", "Body", "/reservations")
    service.notify(db, Role.MECHANIC, "Defect reported", "Body", "/maintenance")

    response = api.get(URL, headers=SITE_MANAGER)

    assert response.status_code == 200
    [item] = response.json()
    assert set(item) == {"id", "role", "title", "body", "link", "created_at", "read_at"}
    assert item["role"] == "site_manager"
    assert item["title"] == "Reservation approved"
    assert item["read_at"] is None


def test_unknown_role_header_is_rejected(api: TestClient) -> None:
    assert api.get(URL, headers={"X-Role": "visitor"}).status_code == 422


def test_approval_appears_in_the_site_manager_feed(api: TestClient, db: Session) -> None:
    reservation = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)

    assert api.post(f"/api/v1/reservations/{reservation.id}/approve").status_code == 200

    titles = [item["title"] for item in api.get(URL, headers=SITE_MANAGER).json()]
    assert titles == ["Reservation approved"]


def test_mark_read_and_unread_filter(api: TestClient, db: Session) -> None:
    first = service.notify(db, Role.MECHANIC, "One", "Body")
    second = service.notify(db, Role.MECHANIC, "Two", "Body")

    response = api.post(f"{URL}/{first.id}/read", headers=MECHANIC)

    assert response.status_code == 200
    assert response.json()["read_at"] is not None
    unread = api.get(URL, params={"unread": True}, headers=MECHANIC).json()
    assert [item["id"] for item in unread] == [second.id]


def test_mark_read_of_another_roles_notification_returns_404(api: TestClient, db: Session) -> None:
    note = service.notify(db, Role.MECHANIC, "One", "Body")

    response = api.post(f"{URL}/{note.id}/read", headers=SITE_MANAGER)

    assert response.status_code == 404
    assert response.json() == {"detail": "Notification not found"}


def test_read_all_marks_the_role_feed(api: TestClient, db: Session) -> None:
    service.notify(db, Role.MECHANIC, "One", "Body")
    service.notify(db, Role.MECHANIC, "Two", "Body")
    service.notify(db, Role.SITE_MANAGER, "Other", "Body")

    response = api.post(f"{URL}/read-all", headers=MECHANIC)

    assert response.status_code == 200
    assert response.json() == {"marked": 2}
    assert api.get(URL, params={"unread": True}, headers=MECHANIC).json() == []
    assert len(api.get(URL, params={"unread": True}, headers=SITE_MANAGER).json()) == 1
