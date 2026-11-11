"""API router for the notifications module. Notifications belong to the role in X-Role."""

from fastapi import APIRouter

from app.core.deps import CurrentRole, DbSession
from app.modules.notifications import service
from app.modules.notifications.schemas import NotificationRead, ReadAllResult

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=list[NotificationRead])
def list_notifications(
    db: DbSession, role: CurrentRole, unread: bool = False
) -> list[NotificationRead]:
    items = service.list_notifications(db, role, unread_only=unread)
    return [NotificationRead.model_validate(item) for item in items]


# Declared before /{notification_id}/read so "read-all" is never parsed as an id.
@router.post("/read-all", response_model=ReadAllResult)
def mark_all_read(db: DbSession, role: CurrentRole) -> ReadAllResult:
    return ReadAllResult(marked=service.mark_all_read(db, role))


@router.post("/{notification_id}/read", response_model=NotificationRead)
def mark_read(notification_id: int, db: DbSession, role: CurrentRole) -> NotificationRead:
    return NotificationRead.model_validate(service.mark_read(db, notification_id, role))
