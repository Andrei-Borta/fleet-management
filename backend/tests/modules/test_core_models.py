"""Exercise the core model against the migrated PostgreSQL schema."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import (
    Defect,
    DefectSeverity,
    DefectStatus,
    InterventionKind,
    InterventionPart,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site


def test_core_records_and_defaults_round_trip(db):
    equipment = Equipment(name="Excavator", type="digger", serial_no="SN-001", hourly_cost=50)
    site = Site(
        name="North",
        address="Main Street",
        budget=10000,
        start_date=date(2026, 11, 1),
        end_date=date(2026, 11, 30),
    )
    db.add_all([equipment, site])
    db.flush()
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site.id,
        start_date=date(2026, 11, 4),
        end_date=date(2026, 11, 4),
        requested_by_role="site_manager",
    )
    defect = Defect(
        equipment_id=equipment.id, description="Hydraulic leak", severity=DefectSeverity.CRITICAL
    )
    db.add_all([reservation, defect])
    db.flush()
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        defect_id=defect.id,
        description="Repair hose",
        kind=InterventionKind.REPAIR,
        scheduled_date=date(2026, 11, 5),
        labor_hours=Decimal("2.50"),
        labor_rate=Decimal("80.00"),
    )
    db.add(intervention)
    db.flush()
    part = InterventionPart(
        intervention_id=intervention.id, name="Hose", qty=2, unit_cost=Decimal("12.50")
    )
    db.add(part)
    db.flush()
    db.expire_all()

    assert db.get(Equipment, equipment.id).status == EquipmentStatus.AVAILABLE
    assert db.get(Equipment, equipment.id).engine_hours == Decimal("0.00")
    assert db.get(Reservation, reservation.id).status == ReservationStatus.PENDING
    assert db.get(Defect, defect.id).status == DefectStatus.OPEN
    assert db.get(Defect, defect.id).severity == DefectSeverity.CRITICAL
    assert db.get(ServiceIntervention, intervention.id).status == InterventionStatus.PLANNED
    assert db.get(ServiceIntervention, intervention.id).kind == InterventionKind.REPAIR
    assert db.get(ServiceIntervention, intervention.id).scheduled_date == date(2026, 11, 5)
    assert db.get(ServiceIntervention, intervention.id).labor_hours == Decimal("2.50")
    assert db.get(ServiceIntervention, intervention.id).labor_rate == Decimal("80.00")
    assert db.get(InterventionPart, part.id).unit_cost == Decimal("12.50")


@pytest.mark.parametrize(
    "record",
    [
        Equipment(name="Bad", type="digger", serial_no="negative", hourly_cost=-1),
        Site(
            name="Bad",
            address="Road",
            budget=1,
            start_date=date(2026, 11, 2),
            end_date=date(2026, 11, 1),
        ),
        Reservation(
            equipment_id=99999999,
            site_id=99999999,
            start_date=date(2026, 11, 1),
            end_date=date(2026, 11, 1),
            requested_by_role="site_manager",
        ),
    ],
)
def test_database_rejects_invalid_values_and_references(db, record):
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(record)
        db.flush()


def test_maintenance_severities_kinds_and_statuses_round_trip(db):
    equipment = Equipment(name="Loader", type="loader", serial_no="enums", hourly_cost=10)
    db.add(equipment)
    db.flush()
    defects = [
        Defect(equipment_id=equipment.id, description="Fault", severity=severity)
        for severity in DefectSeverity
    ]
    interventions = [
        ServiceIntervention(
            equipment_id=equipment.id,
            description="Maintenance",
            kind=kind,
            scheduled_date=date(2026, 11, 5),
            status=status,
        )
        for kind in InterventionKind
        for status in InterventionStatus
    ]
    db.add_all([*defects, *interventions])
    db.flush()
    db.expire_all()
    assert {db.get(Defect, item.id).severity for item in defects} == set(DefectSeverity)
    assert {db.get(ServiceIntervention, item.id).kind for item in interventions} == set(
        InterventionKind
    )
    assert {db.get(ServiceIntervention, item.id).status for item in interventions} == set(
        InterventionStatus
    )


@pytest.mark.parametrize("field", ["labor_hours", "labor_rate"])
def test_intervention_rejects_negative_labor_values(db, field):
    equipment = Equipment(name="Loader", type="loader", serial_no="negative-labor", hourly_cost=10)
    db.add(equipment)
    db.flush()
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        description="Repair",
        kind=InterventionKind.REPAIR,
        scheduled_date=date(2026, 11, 5),
    )
    setattr(intervention, field, Decimal("-1"))
    with pytest.raises(IntegrityError), db.begin_nested():
        db.add(intervention)
        db.flush()
