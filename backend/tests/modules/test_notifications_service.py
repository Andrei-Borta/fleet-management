"""Service coverage for in-app notifications and the events that create them."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.deps import Role
from app.core.errors import NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import Defect, DefectSeverity
from app.modules.maintenance.schemas import DefectCreate
from app.modules.maintenance.service import announce_defect, report_defect
from app.modules.notifications import service
from app.modules.notifications.models import Notification
from app.modules.operations.schemas import ChecklistCreate, ChecklistItemCreate
from app.modules.operations.service import create_checklist
from app.modules.reservations.models import ReservationStatus
from app.modules.reservations.service import (
    approve_reservation,
    cancel_reservation,
    reject_reservation,
)
from tests.modules.test_reservations_service import make_equipment, make_reservation

TODAY = date(2026, 11, 11)


@pytest.fixture(autouse=True)
def no_notifications(db: Session) -> None:
    """Feeds are global per role, so start from an empty table (rolled back afterwards)."""
    db.execute(delete(Notification))
    db.flush()


def make_serviced(
    db: Session,
    last_service: datetime | None,
    engine_hours: str = "100",
    status: EquipmentStatus = EquipmentStatus.AVAILABLE,
) -> Equipment:
    """A machine with a 180-day / 500-hour service interval, last serviced at 100 hours."""
    equipment = Equipment(
        name=f"Dozer {uuid4().hex[:6]}",
        type="bulldozer",
        serial_no=uuid4().hex,
        hourly_cost=Decimal(100),
        status=status,
        engine_hours=Decimal(engine_hours),
        service_interval_days=180,
        service_interval_hours=Decimal(500),
        last_service_at=last_service,
        last_service_hours=Decimal(100),
    )
    db.add(equipment)
    db.flush()
    return equipment


def feed(db: Session, role: Role) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.role == role)).all())


def service_due_for(db: Session, equipment: Equipment) -> list[Notification]:
    return [n for n in feed(db, Role.FLEET_MANAGER) if n.link == f"/equipment/{equipment.id}"]


# notify


def test_notify_adds_a_notification_without_committing(db: Session) -> None:
    created = service.notify(db, Role.MECHANIC, "Title", "Body", "/maintenance")

    assert created is not None
    assert created.id is not None
    assert (created.role, created.title, created.body, created.link) == (
        Role.MECHANIC,
        "Title",
        "Body",
        "/maintenance",
    )
    assert created.read_at is None


def test_notify_with_a_key_notifies_each_role_only_once(db: Session) -> None:
    first = service.notify(db, Role.FLEET_MANAGER, "Due", "Body", key="event-1")
    repeat = service.notify(db, Role.FLEET_MANAGER, "Due again", "Body", key="event-1")
    other_role = service.notify(db, Role.MECHANIC, "Due", "Body", key="event-1")

    assert first is not None
    assert repeat is None
    assert other_role is not None
    assert len(feed(db, Role.FLEET_MANAGER)) == 1


# list_notifications


def test_list_returns_only_the_role_newest_first(db: Session) -> None:
    older = service.notify(db, Role.SITE_MANAGER, "Older", "Body")
    newer = service.notify(db, Role.SITE_MANAGER, "Newer", "Body")
    service.notify(db, Role.MECHANIC, "Someone else's", "Body")
    older.created_at = datetime(2026, 11, 1, tzinfo=UTC)
    db.flush()

    items = service.list_notifications(db, Role.SITE_MANAGER)

    assert [n.id for n in items] == [newer.id, older.id]


def test_list_can_return_unread_only(db: Session) -> None:
    read = service.notify(db, Role.SITE_MANAGER, "Read", "Body")
    unread = service.notify(db, Role.SITE_MANAGER, "Unread", "Body")
    service.mark_read(db, read.id, Role.SITE_MANAGER)

    items = service.list_notifications(db, Role.SITE_MANAGER, unread_only=True)

    assert [n.id for n in items] == [unread.id]


def test_list_is_limited(db: Session) -> None:
    for number in range(service.LIST_LIMIT + 3):
        service.notify(db, Role.OPERATOR, f"Note {number}", "Body")

    assert len(service.list_notifications(db, Role.OPERATOR)) == service.LIST_LIMIT


def test_list_for_the_fleet_manager_announces_service_due(db: Session) -> None:
    overdue = make_serviced(db, datetime(2026, 1, 1, tzinfo=UTC))

    items = service.list_notifications(db, Role.FLEET_MANAGER, today=TODAY)

    assert any(n.link == f"/equipment/{overdue.id}" for n in items)
    assert service.list_notifications(db, Role.MECHANIC, today=TODAY) == []


# sync_service_due


def test_sync_service_due_announces_overdue_and_due_soon_machines_once(db: Session) -> None:
    overdue = make_serviced(db, datetime(2026, 1, 1, tzinfo=UTC))
    due_soon = make_serviced(db, datetime(2026, 5, 20, tzinfo=UTC))  # 5 days left
    by_hours = make_serviced(db, datetime(2026, 11, 1, tzinfo=UTC), engine_hours="570")
    fine = make_serviced(db, datetime(2026, 11, 1, tzinfo=UTC))

    created = service.sync_service_due(db, TODAY)

    links = {n.link for n in created}
    assert {f"/equipment/{m.id}" for m in (overdue, due_soon, by_hours)} <= links
    assert f"/equipment/{fine.id}" not in links
    [overdue_note] = service_due_for(db, overdue)
    assert overdue_note.title == f"Service due: {overdue.name}"
    assert overdue_note.body.startswith("Service is overdue (")
    assert "days overdue" in overdue_note.body
    assert service_due_for(db, due_soon)[0].body.startswith("Service is due soon (5 days left")
    assert "30 engine hours left" in service_due_for(db, by_hours)[0].body

    assert service.sync_service_due(db, TODAY) == []


def test_sync_service_due_announces_again_after_the_next_service(db: Session) -> None:
    machine = make_serviced(db, datetime(2026, 1, 1, tzinfo=UTC))
    service.sync_service_due(db, TODAY)

    # Serviced, then due again later: a new cycle gets a new notification.
    machine.last_service_at = datetime(2026, 11, 10, tzinfo=UTC)
    machine.last_service_hours = Decimal(100)
    db.flush()
    assert service.sync_service_due(db, TODAY) == []
    assert len(service.sync_service_due(db, date(2027, 6, 1))) >= 1

    assert len(service_due_for(db, machine)) == 2


def test_service_due_body_reads_naturally_at_the_limits(db: Session) -> None:
    today_due = make_serviced(db, datetime(2026, 5, 15, tzinfo=UTC), engine_hours="600")
    one_left = make_serviced(db, datetime(2026, 5, 16, tzinfo=UTC), engine_hours="599")

    service.sync_service_due(db, TODAY)

    assert service_due_for(db, today_due)[0].body == (
        "Service is overdue (due today, engine hours reached)."
    )
    assert service_due_for(db, one_left)[0].body == (
        "Service is due soon (1 day left, 1 engine hour left)."
    )


def test_sync_service_due_skips_retired_and_untracked_machines(db: Session) -> None:
    retired = make_serviced(db, datetime(2026, 1, 1, tzinfo=UTC), status=EquipmentStatus.RETIRED)
    untracked = make_equipment(db)  # no service interval

    service.sync_service_due(db, TODAY)

    assert service_due_for(db, retired) == []
    assert service_due_for(db, untracked) == []


def test_sync_service_due_announces_a_machine_never_serviced_by_hours(db: Session) -> None:
    machine = make_serviced(db, None, engine_hours="650")

    service.sync_service_due(db, TODAY)

    [note] = service_due_for(db, machine)
    assert note.body == "Service is overdue (50 engine hours overdue)."


# mark_read / mark_all_read


def test_mark_read_sets_the_time_once(db: Session) -> None:
    note = service.notify(db, Role.MECHANIC, "Title", "Body")

    first = service.mark_read(db, note.id, Role.MECHANIC)
    read_at = first.read_at
    again = service.mark_read(db, note.id, Role.MECHANIC)

    assert read_at is not None
    assert again.read_at == read_at


@pytest.mark.parametrize("role", [Role.SITE_MANAGER, Role.FLEET_MANAGER])
def test_mark_read_refuses_missing_or_other_roles_notifications(db: Session, role: Role) -> None:
    note = service.notify(db, Role.MECHANIC, "Title", "Body")

    with pytest.raises(NotFoundError, match="Notification not found"):
        service.mark_read(db, note.id, role)
    with pytest.raises(NotFoundError, match="Notification not found"):
        service.mark_read(db, 99_999_999, Role.MECHANIC)
    assert note.read_at is None


def test_mark_all_read_only_touches_the_role_unread_notifications(db: Session) -> None:
    first = service.notify(db, Role.SITE_MANAGER, "One", "Body")
    service.notify(db, Role.SITE_MANAGER, "Two", "Body")
    other = service.notify(db, Role.MECHANIC, "Other", "Body")
    service.mark_read(db, first.id, Role.SITE_MANAGER)

    assert service.mark_all_read(db, Role.SITE_MANAGER) == 1
    assert service.mark_all_read(db, Role.SITE_MANAGER) == 0
    assert all(n.read_at is not None for n in feed(db, Role.SITE_MANAGER))
    db.refresh(other)
    assert other.read_at is None


# Events from other modules


def test_approving_or_rejecting_notifies_the_site_manager(db: Session) -> None:
    approved = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)
    rejected = make_reservation(db, make_equipment(db), status=ReservationStatus.PENDING)

    approve_reservation(db, approved.id)
    reject_reservation(db, rejected.id)

    titles = sorted(n.title for n in feed(db, Role.SITE_MANAGER))
    assert titles == ["Reservation approved", "Reservation rejected"]
    note = next(n for n in feed(db, Role.SITE_MANAGER) if n.title == "Reservation approved")
    assert note.body == "Machine at North, 10 Nov 2026 – 20 Nov 2026."
    assert note.link == "/reservations"


def test_cancelling_does_not_notify(db: Session) -> None:
    reservation = make_reservation(db, make_equipment(db), status=ReservationStatus.APPROVED)

    cancel_reservation(db, reservation.id)

    assert feed(db, Role.SITE_MANAGER) == []


def test_reporting_a_defect_notifies_mechanics_and_the_fleet_manager(db: Session) -> None:
    equipment = make_equipment(db)

    report_defect(
        db,
        DefectCreate(
            equipment_id=equipment.id, description="Brake failure", severity=DefectSeverity.MEDIUM
        ),
    )

    for role in (Role.MECHANIC, Role.FLEET_MANAGER):
        [note] = [n for n in feed(db, role) if n.title.startswith("Defect")]
        assert note.title == "Defect reported: Machine"
        assert note.body == "Medium severity: Brake failure"
        assert note.link == "/maintenance"
    assert feed(db, Role.SITE_MANAGER) == []


def test_announce_defect_does_not_commit(db: Session) -> None:
    equipment = make_equipment(db)
    description = f"Noise {uuid4().hex}"
    defect = Defect(equipment_id=equipment.id, description=description, severity=DefectSeverity.LOW)
    db.add(defect)
    db.flush()

    announce_defect(db, defect)
    assert any(description in n.body for n in feed(db, Role.MECHANIC))
    db.rollback()

    assert not any(description in n.body for n in feed(db, Role.MECHANIC))


def test_a_failed_critical_checklist_item_notifies_like_a_defect(db: Session) -> None:
    equipment = make_equipment(db)

    create_checklist(
        db,
        ChecklistCreate(
            equipment_id=equipment.id,
            date=TODAY,
            items=[ChecklistItemCreate(name="Brakes", ok=False, critical=True)],
        ),
    )

    [note] = feed(db, Role.MECHANIC)
    assert note.body == "Critical severity: Safety checklist failure: Brakes"
