from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from fastapi.responses import JSONResponse

from app.core.deps import CurrentRole, DbSession
from app.modules.reservations import service
from app.modules.reservations.models import ReservationStatus
from app.modules.reservations.schemas import (
    AlternativeRead,
    CalendarEventRead,
    ReservationConflictBody,
    ReservationCreate,
    ReservationRead,
)

router = APIRouter(prefix="/reservations", tags=["reservations"])

CONFLICT_RESPONSE = {status.HTTP_409_CONFLICT: {"model": ReservationConflictBody}}


async def reservation_conflict_handler(
    _request: Request, exc: service.ReservationConflictError
) -> JSONResponse:
    body = ReservationConflictBody(
        detail=str(exc), conflicts=exc.conflicts, alternatives=exc.alternatives
    )
    return JSONResponse(status_code=status.HTTP_409_CONFLICT, content=body.model_dump(mode="json"))


@router.get("", response_model=list[ReservationRead])
def list_reservations(
    db: DbSession,
    site_id: int | None = None,
    equipment_id: int | None = None,
    reservation_status: Annotated[ReservationStatus | None, Query(alias="status")] = None,
) -> list[ReservationRead]:
    reservations = service.list_reservations(db, site_id, equipment_id, reservation_status)
    return [ReservationRead.model_validate(reservation) for reservation in reservations]


@router.get("/calendar", response_model=list[CalendarEventRead])
def calendar(
    db: DbSession,
    range_start: Annotated[date, Query(alias="from")],
    range_end: Annotated[date, Query(alias="to")],
    site_id: int | None = None,
    equipment_id: int | None = None,
) -> list[CalendarEventRead]:
    return service.list_calendar_events(db, range_start, range_end, site_id, equipment_id)


@router.get("/alternatives", response_model=list[AlternativeRead])
def alternatives(db: DbSession, equipment_id: int, start: date, end: date) -> list[AlternativeRead]:
    equipment = service.find_alternatives(db, equipment_id, start, end)
    return [AlternativeRead.model_validate(e) for e in equipment]


@router.post(
    "",
    response_model=ReservationRead,
    status_code=status.HTTP_201_CREATED,
    responses=CONFLICT_RESPONSE,
)
def create_reservation(
    db: DbSession, role: CurrentRole, data: ReservationCreate
) -> ReservationRead:
    return ReservationRead.model_validate(service.create_reservation(db, data, role))


@router.post(
    "/{reservation_id}/approve", response_model=ReservationRead, responses=CONFLICT_RESPONSE
)
def approve_reservation(db: DbSession, reservation_id: int) -> ReservationRead:
    return ReservationRead.model_validate(service.approve_reservation(db, reservation_id))


@router.post("/{reservation_id}/reject", response_model=ReservationRead)
def reject_reservation(db: DbSession, reservation_id: int) -> ReservationRead:
    return ReservationRead.model_validate(service.reject_reservation(db, reservation_id))


@router.post("/{reservation_id}/cancel", response_model=ReservationRead)
def cancel_reservation(db: DbSession, reservation_id: int) -> ReservationRead:
    return ReservationRead.model_validate(service.cancel_reservation(db, reservation_id))
