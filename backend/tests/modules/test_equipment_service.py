"""Service coverage for equipment CRUD, filters and validation."""

from datetime import UTC, date, datetime
from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.core.errors import ConflictError, InvalidDataError, NotFoundError
from app.modules.equipment import service
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.equipment.schemas import EquipmentCreate, EquipmentUpdate
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    InterventionKind,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

TYPE = "svc-test-excavator"


def make(serial_no: str, **overrides: object) -> EquipmentCreate:
    values: dict[str, object] = {
        "name": "Excavator",
        "type": TYPE,
        "serial_no": serial_no,
        "hourly_cost": Decimal("75.50"),
    }
    values.update(overrides)
    return EquipmentCreate(**values)


def make_site(db: Session) -> Site:
    site = Site(
        name="Site",
        address="Main Street",
        budget=1000,
        start_date=date(2026, 1, 1),
        end_date=date(2026, 12, 31),
    )
    db.add(site)
    db.flush()
    return site


def reserve(
    db: Session, equipment_id: int, start: date, end: date, status: ReservationStatus
) -> None:
    db.add(
        Reservation(
            equipment_id=equipment_id,
            site_id=make_site(db).id,
            start_date=start,
            end_date=end,
            status=status,
            requested_by_role="site_manager",
        )
    )
    db.commit()


def test_create_applies_defaults_and_get(db: Session) -> None:
    equipment = service.create_equipment(db, make("svc-001"))
    assert equipment.id is not None
    assert equipment.status == EquipmentStatus.AVAILABLE
    assert equipment.engine_hours == Decimal("0")
    assert equipment.hourly_cost == Decimal("75.50")
    assert equipment.service_interval_days is None
    assert service.get_equipment(db, equipment.id).serial_no == "svc-001"


def test_create_with_all_fields(db: Session) -> None:
    serviced = datetime(2026, 3, 1, tzinfo=UTC)
    equipment = service.create_equipment(
        db,
        make(
            "svc-002",
            status=EquipmentStatus.IN_SERVICE,
            engine_hours=Decimal("120.5"),
            service_interval_days=180,
            service_interval_hours=Decimal("250"),
            last_service_at=serviced,
            last_service_hours=Decimal("100"),
        ),
    )
    assert equipment.status == EquipmentStatus.IN_SERVICE
    assert equipment.engine_hours == Decimal("120.50")
    assert equipment.service_interval_days == 180
    assert equipment.service_interval_hours == Decimal("250")
    assert equipment.last_service_at == serviced
    assert equipment.last_service_hours == Decimal("100")


def test_create_rejects_duplicate_serial_no(db: Session) -> None:
    service.create_equipment(db, make("svc-dup"))
    with pytest.raises(ConflictError, match="Serial number"):
        service.create_equipment(db, make("svc-dup", name="Other"))
    # The session is still usable after the failed insert.
    assert service.create_equipment(db, make("svc-dup-2")).id is not None


@pytest.mark.parametrize(
    "changes",
    [
        {"engine_hours": Decimal("-1")},
        {"hourly_cost": Decimal("-0.01")},
        {"service_interval_days": 0},
        {"service_interval_hours": Decimal("0")},
        {"last_service_hours": Decimal("-5")},
        {"name": "  "},
        {"serial_no": ""},
        {"hourly_cost": Decimal("1.234")},
    ],
)
def test_create_schema_rejects_invalid_values(changes: dict[str, object]) -> None:
    base = {"name": "Excavator", "type": TYPE, "serial_no": "svc-invalid", "hourly_cost": 1}
    with pytest.raises(ValidationError):
        EquipmentCreate(**{**base, **changes})


def test_missing_equipment_raises_not_found(db: Session) -> None:
    with pytest.raises(NotFoundError, match="Equipment not found"):
        service.get_equipment(db, 99999999)
    with pytest.raises(NotFoundError, match="Equipment not found"):
        service.update_equipment(db, 99999999, EquipmentUpdate(name="New"))
    with pytest.raises(NotFoundError, match="Equipment not found"):
        service.delete_equipment(db, 99999999)


def test_update_is_partial(db: Session) -> None:
    equipment = service.create_equipment(db, make("svc-upd", service_interval_days=90))
    updated = service.update_equipment(
        db,
        equipment.id,
        EquipmentUpdate(
            name="Loader", engine_hours=Decimal("10"), status=EquipmentStatus.DEFECTIVE
        ),
    )
    assert updated.name == "Loader"
    assert updated.engine_hours == Decimal("10")
    assert updated.status == EquipmentStatus.DEFECTIVE
    assert updated.serial_no == "svc-upd"
    assert updated.service_interval_days == 90
    assert service.update_equipment(db, equipment.id, EquipmentUpdate()).id == equipment.id


def test_update_can_clear_optional_fields(db: Session) -> None:
    equipment = service.create_equipment(
        db, make("svc-clear", service_interval_days=90, last_service_hours=Decimal("5"))
    )
    updated = service.update_equipment(
        db, equipment.id, EquipmentUpdate(service_interval_days=None, last_service_hours=None)
    )
    assert updated.service_interval_days is None
    assert updated.last_service_hours is None


def test_update_rejects_serial_no_of_other_equipment(db: Session) -> None:
    service.create_equipment(db, make("svc-taken"))
    equipment = service.create_equipment(db, make("svc-mine"))
    with pytest.raises(ConflictError, match="Serial number"):
        service.update_equipment(db, equipment.id, EquipmentUpdate(serial_no="svc-taken"))
    assert service.get_equipment(db, equipment.id).serial_no == "svc-mine"
    # Keeping its own serial number is not a conflict.
    same = service.update_equipment(db, equipment.id, EquipmentUpdate(serial_no="svc-mine"))
    assert same.serial_no == "svc-mine"


@pytest.mark.parametrize(
    "changes",
    [
        {"name": None},
        {"hourly_cost": None},
        {"status": None},
        {"engine_hours": Decimal("-1")},
        {"service_interval_days": 0},
    ],
)
def test_update_schema_rejects_invalid_values(changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        EquipmentUpdate(**changes)


def test_delete_unreferenced_equipment(db: Session) -> None:
    equipment = service.create_equipment(db, make("svc-del"))
    equipment_id = equipment.id
    service.delete_equipment(db, equipment_id)
    assert db.get(Equipment, equipment_id) is None


def test_delete_equipment_with_reservation_is_rejected(db: Session) -> None:
    equipment = service.create_equipment(db, make("svc-del-res"))
    equipment_id = equipment.id
    reserve(db, equipment_id, date(2026, 5, 1), date(2026, 5, 2), ReservationStatus.REJECTED)
    with pytest.raises(ConflictError, match="Cannot delete equipment"):
        service.delete_equipment(db, equipment_id)
    assert db.get(Equipment, equipment_id) is not None


def test_delete_equipment_with_defect_is_rejected(db: Session) -> None:
    equipment = service.create_equipment(db, make("svc-del-def"))
    equipment_id = equipment.id
    db.add(Defect(equipment_id=equipment_id, description="Leak", severity=DefectSeverity.LOW))
    db.commit()
    with pytest.raises(ConflictError, match="Cannot delete equipment"):
        service.delete_equipment(db, equipment_id)
    assert db.get(Equipment, equipment_id) is not None


def test_list_filters_by_type_and_status(db: Session) -> None:
    a = service.create_equipment(db, make("svc-l1"))
    b = service.create_equipment(db, make("svc-l2", status=EquipmentStatus.DEFECTIVE))
    other = service.create_equipment(db, make("svc-l3", type="svc-test-crane"))

    by_type = [item.id for item in service.list_equipment(db, equipment_type=TYPE)]
    assert by_type == [a.id, b.id]

    by_status = service.list_equipment(db, equipment_type=TYPE, status=EquipmentStatus.DEFECTIVE)
    assert [item.id for item in by_status] == [b.id]

    both = service.list_equipment(
        db, equipment_type="svc-test-crane", status=EquipmentStatus.AVAILABLE
    )
    assert [item.id for item in both] == [other.id]
    assert service.list_equipment(db, equipment_type="svc-test-none") == []


def test_list_without_filters_returns_everything_ordered(db: Session) -> None:
    a = service.create_equipment(db, make("svc-all-1"))
    b = service.create_equipment(db, make("svc-all-2"))
    ids = [item.id for item in service.list_equipment(db)]
    assert ids == sorted(ids)
    assert a.id in ids
    assert b.id in ids


def test_list_available_period_excludes_busy_and_blocked(db: Session) -> None:
    free = service.create_equipment(db, make("svc-av-free"))
    booked = service.create_equipment(db, make("svc-av-booked"))
    pending = service.create_equipment(db, make("svc-av-pending"))
    maintained = service.create_equipment(db, make("svc-av-maint"))
    blocked = service.create_equipment(db, make("svc-av-blocked", status=EquipmentStatus.RETIRED))

    reserve(db, booked.id, date(2026, 6, 10), date(2026, 6, 20), ReservationStatus.APPROVED)
    # Pending requests do not block the equipment.
    reserve(db, pending.id, date(2026, 6, 10), date(2026, 6, 20), ReservationStatus.PENDING)
    db.add(
        ServiceIntervention(
            equipment_id=maintained.id,
            description="Oil change",
            kind=InterventionKind.REVISION,
            scheduled_date=date(2026, 6, 15),
            status=InterventionStatus.PLANNED,
        )
    )
    db.commit()

    result = service.list_equipment(
        db,
        equipment_type=TYPE,
        available_from=date(2026, 6, 15),
        available_to=date(2026, 6, 16),
    )
    assert [item.id for item in result] == [free.id, pending.id]
    assert blocked.id not in [item.id for item in result]

    # Outside every booking the booked and maintained machines are free again.
    later = service.list_equipment(
        db,
        equipment_type=TYPE,
        available_from=date(2026, 7, 1),
        available_to=date(2026, 7, 2),
    )
    assert {item.id for item in later} == {free.id, booked.id, pending.id, maintained.id}


def test_list_available_period_is_inclusive_and_combines_with_status(db: Session) -> None:
    booked = service.create_equipment(db, make("svc-inc"))
    reserve(db, booked.id, date(2026, 8, 10), date(2026, 8, 20), ReservationStatus.APPROVED)

    for start, end in (
        (date(2026, 8, 20), date(2026, 8, 25)),
        (date(2026, 8, 5), date(2026, 8, 10)),
    ):
        assert (
            service.list_equipment(db, equipment_type=TYPE, available_from=start, available_to=end)
            == []
        )
    free_day = service.list_equipment(
        db,
        equipment_type=TYPE,
        status=EquipmentStatus.AVAILABLE,
        available_from=date(2026, 8, 21),
        available_to=date(2026, 8, 21),
    )
    assert [item.id for item in free_day] == [booked.id]


def test_list_available_period_rejects_invalid_range(db: Session) -> None:
    with pytest.raises(InvalidDataError, match="together"):
        service.list_equipment(db, available_from=date(2026, 6, 1))
    with pytest.raises(InvalidDataError, match="together"):
        service.list_equipment(db, available_to=date(2026, 6, 1))
    with pytest.raises(InvalidDataError, match="available_to"):
        service.list_equipment(db, available_from=date(2026, 6, 2), available_to=date(2026, 6, 1))
