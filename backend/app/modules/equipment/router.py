from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.core.deps import DbSession
from app.modules.equipment import service
from app.modules.equipment.models import EquipmentStatus
from app.modules.equipment.schemas import EquipmentCreate, EquipmentRead, EquipmentUpdate

router = APIRouter(prefix="/equipment", tags=["equipment"])


@router.get("", response_model=list[EquipmentRead])
def list_equipment(
    db: DbSession,
    equipment_type: Annotated[str | None, Query(alias="type")] = None,
    equipment_status: Annotated[EquipmentStatus | None, Query(alias="status")] = None,
    available_from: date | None = None,
    available_to: date | None = None,
) -> list[EquipmentRead]:
    items = service.list_equipment(
        db, equipment_type, equipment_status, available_from, available_to
    )
    return [EquipmentRead.model_validate(item) for item in items]


@router.post("", response_model=EquipmentRead, status_code=status.HTTP_201_CREATED)
def create_equipment(db: DbSession, data: EquipmentCreate) -> EquipmentRead:
    return EquipmentRead.model_validate(service.create_equipment(db, data))


@router.get("/{equipment_id}", response_model=EquipmentRead)
def get_equipment(db: DbSession, equipment_id: int) -> EquipmentRead:
    return EquipmentRead.model_validate(service.get_equipment(db, equipment_id))


@router.patch("/{equipment_id}", response_model=EquipmentRead)
def update_equipment(db: DbSession, equipment_id: int, data: EquipmentUpdate) -> EquipmentRead:
    return EquipmentRead.model_validate(service.update_equipment(db, equipment_id, data))


@router.delete("/{equipment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_equipment(db: DbSession, equipment_id: int) -> Response:
    service.delete_equipment(db, equipment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
