"""Business logic for the notifications module.

Every public function here MUST have pytest tests (see AGENTS.md).

Other modules call ``notify`` inside their own transaction. It never commits, so a notification
is stored only when the event that caused it is. This module must not import other modules'
services (they import it), only their models and pure rules.
"""

from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.deps import Role
from app.core.errors import NotFoundError
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.rules import days_until_due, hours_until_due, is_service_due
from app.modules.notifications.models import Notification

LIST_LIMIT = 50
# Same window as the "Service due soon" list (GET /maintenance/due defaults).
DUE_WITHIN_DAYS = 7
DUE_WITHIN_HOURS = Decimal(50)


def notify(
    db: Session,
    role: Role,
    title: str,
    body: str,
    link: str | None = None,
    key: str | None = None,
) -> Notification | None:
    """Add a notification for ``role`` without committing.

    With a ``key``, a role gets the notification only once; a repeat returns ``None``.
    """
    if key is not None:
        exists = db.scalar(
            select(Notification.id).where(Notification.role == role, Notification.key == key)
        )
        if exists is not None:
            return None
    notification = Notification(role=role, title=title, body=body, link=link, key=key)
    db.add(notification)
    db.flush()
    return notification


def _amount(value: int | Decimal, unit: str, overdue: bool) -> str:
    number = f"{value.normalize():f}" if isinstance(value, Decimal) else str(value)
    plural = "" if value == 1 else "s"
    return f"{number} {unit}{plural} {'overdue' if overdue else 'left'}"


def _service_due_body(item: Equipment, today: date) -> str:
    parts: list[str] = []
    days = days_until_due(item, today)
    hours = hours_until_due(item)
    if days is not None:
        parts.append("due today" if days == 0 else _amount(abs(days), "day", days < 0))
    if hours is not None:
        engine = abs(hours)
        parts.append(
            "engine hours reached" if hours == 0 else _amount(engine, "engine hour", hours < 0)
        )
    state = "overdue" if is_service_due(item, today) else "due soon"
    return f"Service is {state} ({', '.join(parts)})."


def sync_service_due(db: Session, today: date | None = None) -> list[Notification]:
    """Notify the fleet manager once per service cycle of every machine that is due soon.

    The key includes the last service reading, so a machine is announced again after its next
    service. Retired equipment is left out. Does not commit.
    """
    today = today or date.today()
    machines = db.scalars(
        select(Equipment).where(Equipment.status != EquipmentStatus.RETIRED).order_by(Equipment.id)
    ).all()
    created: list[Notification] = []
    for item in machines:
        days = days_until_due(item, today)
        hours = hours_until_due(item)
        due_soon = (days is not None and days <= DUE_WITHIN_DAYS) or (
            hours is not None and hours <= DUE_WITHIN_HOURS
        )
        if not due_soon:
            continue
        last = item.last_service_at.date().isoformat() if item.last_service_at else "never"
        notification = notify(
            db,
            Role.FLEET_MANAGER,
            f"Service due: {item.name}",
            _service_due_body(item, today),
            f"/equipment/{item.id}",
            key=f"service-due:{item.id}:{last}:{item.last_service_hours}",
        )
        if notification is not None:
            created.append(notification)
    return created


def list_notifications(
    db: Session, role: Role, unread_only: bool = False, today: date | None = None
) -> list[Notification]:
    """The role's latest notifications, newest first (at most ``LIST_LIMIT``).

    For the fleet manager, machines that became due for service are announced first.
    """
    if role == Role.FLEET_MANAGER:
        sync_service_due(db, today)
        db.commit()
    query = select(Notification).where(Notification.role == role)
    if unread_only:
        query = query.where(Notification.read_at.is_(None))
    query = query.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(LIST_LIMIT)
    return list(db.scalars(query).all())


def mark_read(db: Session, notification_id: int, role: Role) -> Notification:
    """Mark one of the role's notifications as read. Reading it again keeps the first time."""
    notification = db.get(Notification, notification_id)
    # Another role's notification is reported as missing rather than revealing it exists.
    if notification is None or notification.role != role:
        raise NotFoundError("Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.now(UTC)
        db.commit()
        db.refresh(notification)
    return notification


def mark_all_read(db: Session, role: Role) -> int:
    """Mark every unread notification of the role as read. Returns how many changed."""
    result = db.execute(
        update(Notification)
        .where(Notification.role == role, Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    db.commit()
    return result.rowcount
