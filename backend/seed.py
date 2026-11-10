"""Populate the database with realistic demo data.

Run from ``backend/``:

    python seed.py            # idempotent: does nothing if the demo data exists
    python seed.py --reset    # wipe all fleet data and insert a fresh demo set

The data is deterministic so every scene from ``docs/DEMO_SCRIPT.md`` can be
reproduced from an empty database.
"""

import argparse
from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
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

SERIAL_PREFIX = "DEMO-"


def _dt(year: int, month: int, day: int, hour: int = 8) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)


SITES = [
    {
        "name": "North Ring Road",
        "address": "Calea Bucuresti 120, Bucharest",
        "budget": Decimal("850000.00"),
        "start_date": date(2026, 9, 1),
        "end_date": date(2027, 6, 30),
    },
    {
        "name": "Dambovita Bridge",
        "address": "Splaiul Independentei 45, Bucharest",
        "budget": Decimal("65000.00"),
        "start_date": date(2026, 10, 1),
        "end_date": date(2027, 8, 31),
    },
    {
        "name": "Pipera Business Park",
        "address": "Bulevardul Pipera 1, Voluntari",
        "budget": Decimal("20000.00"),
        "start_date": date(2026, 11, 1),
        "end_date": date(2027, 3, 31),
    },
    {
        "name": "A1 Highway Section 4",
        "address": "A1 km 42, Giurgiu",
        "budget": Decimal("2300000.00"),
        "start_date": date(2026, 8, 15),
        "end_date": date(2027, 12, 31),
    },
]

# name, type, serial suffix, engine_hours, hourly_cost, interval_days, interval_hours,
# last_service_at, last_service_hours, status
EQUIPMENT = [
    (
        "CAT 320 Excavator",
        "excavator",
        "EXC-01",
        "1240.50",
        "185.00",
        180,
        "500.00",
        _dt(2026, 8, 15),
        "980.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Komatsu PC210 Excavator",
        "excavator",
        "EXC-02",
        "860.00",
        "175.00",
        180,
        "500.00",
        _dt(2026, 9, 1),
        "700.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Volvo EC220E Excavator",
        "excavator",
        "EXC-03",
        "2100.00",
        "190.00",
        180,
        "500.00",
        _dt(2026, 5, 20),
        "1600.00",
        EquipmentStatus.DEFECTIVE,
    ),
    (
        "JCB 220X Excavator",
        "excavator",
        "EXC-04",
        "320.00",
        "165.00",
        180,
        "500.00",
        _dt(2026, 10, 1),
        "100.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Hitachi ZX210 Excavator",
        "excavator",
        "EXC-05",
        "1500.00",
        "180.00",
        180,
        "500.00",
        _dt(2026, 7, 10),
        "1200.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Liebherr LTM 1050 Crane",
        "crane",
        "CRA-01",
        "980.00",
        "320.00",
        365,
        "750.00",
        _dt(2026, 3, 1),
        "500.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Tadano ATF 60 Crane",
        "crane",
        "CRA-02",
        "1420.00",
        "340.00",
        365,
        "750.00",
        _dt(2026, 2, 15),
        "900.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Grove GMK 3050 Crane",
        "crane",
        "CRA-03",
        "760.00",
        "310.00",
        365,
        "750.00",
        _dt(2026, 6, 1),
        "400.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Manitowoc 10000 Crane",
        "crane",
        "CRA-04",
        "1990.00",
        "360.00",
        365,
        "750.00",
        _dt(2025, 12, 1),
        "1400.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "CAT 950M Loader",
        "loader",
        "LOA-01",
        "640.00",
        "145.00",
        180,
        "500.00",
        _dt(2026, 8, 1),
        "400.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Volvo L120H Loader",
        "loader",
        "LOA-02",
        "1100.00",
        "150.00",
        180,
        "500.00",
        _dt(2026, 6, 15),
        "800.00",
        EquipmentStatus.IN_SERVICE,
    ),
    (
        "Komatsu WA320 Loader",
        "loader",
        "LOA-03",
        "430.00",
        "140.00",
        180,
        "500.00",
        _dt(2026, 9, 20),
        "200.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "JCB 437 Loader",
        "loader",
        "LOA-04",
        "890.00",
        "155.00",
        180,
        "500.00",
        _dt(2026, 7, 1),
        "600.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "CAT D6 Bulldozer",
        "bulldozer",
        "BUL-01",
        "1750.00",
        "210.00",
        180,
        "600.00",
        _dt(2026, 4, 10),
        "1300.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Komatsu D65 Bulldozer",
        "bulldozer",
        "BUL-02",
        "1320.00",
        "205.00",
        180,
        "600.00",
        _dt(2026, 5, 25),
        "900.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "CAT D8 Bulldozer",
        "bulldozer",
        "BUL-03",
        "2400.00",
        "240.00",
        180,
        "600.00",
        _dt(2026, 2, 1),
        "1800.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Liebherr PR 736 Bulldozer",
        "bulldozer",
        "BUL-04",
        "580.00",
        "220.00",
        180,
        "600.00",
        _dt(2026, 8, 20),
        "300.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Bomag BW 213 Compactor",
        "compactor",
        "COM-01",
        "380.00",
        "95.00",
        180,
        "400.00",
        _dt(2026, 9, 1),
        "200.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "CAT CS56B Compactor",
        "compactor",
        "COM-02",
        "720.00",
        "100.00",
        180,
        "400.00",
        _dt(2026, 7, 15),
        "500.00",
        EquipmentStatus.AVAILABLE,
    ),
    (
        "Hamm H12i Compactor",
        "compactor",
        "COM-03",
        "1600.00",
        "105.00",
        180,
        "400.00",
        _dt(2025, 11, 1),
        "1200.00",
        EquipmentStatus.RETIRED,
    ),
]

# equipment suffix, site name, start, end, status
RESERVATIONS = [
    (
        "EXC-01",
        "North Ring Road",
        date(2026, 11, 10),
        date(2026, 11, 20),
        ReservationStatus.APPROVED,
    ),
    (
        "CRA-01",
        "Dambovita Bridge",
        date(2026, 11, 5),
        date(2026, 11, 12),
        ReservationStatus.APPROVED,
    ),
    (
        "LOA-01",
        "Pipera Business Park",
        date(2026, 11, 8),
        date(2026, 11, 15),
        ReservationStatus.APPROVED,
    ),
    (
        "BUL-01",
        "A1 Highway Section 4",
        date(2026, 11, 1),
        date(2026, 11, 14),
        ReservationStatus.APPROVED,
    ),
    (
        "EXC-02",
        "Dambovita Bridge",
        date(2026, 11, 18),
        date(2026, 11, 28),
        ReservationStatus.APPROVED,
    ),
    (
        # The completed CRA-02 repair is scheduled during this approved booking,
        # so its cost is attributed to Dambovita Bridge.
        "CRA-02",
        "Dambovita Bridge",
        date(2026, 10, 26),
        date(2026, 11, 2),
        ReservationStatus.APPROVED,
    ),
    (
        "LOA-03",
        "North Ring Road",
        date(2026, 11, 22),
        date(2026, 12, 2),
        ReservationStatus.APPROVED,
    ),
    (
        "BUL-02",
        "A1 Highway Section 4",
        date(2026, 11, 15),
        date(2026, 11, 30),
        ReservationStatus.APPROVED,
    ),
    (
        "COM-01",
        "A1 Highway Section 4",
        date(2026, 11, 10),
        date(2026, 11, 16),
        ReservationStatus.APPROVED,
    ),
    (
        "EXC-04",
        "Pipera Business Park",
        date(2026, 12, 1),
        date(2026, 12, 10),
        ReservationStatus.APPROVED,
    ),
    # Overlaps the approved EXC-01 booking: approving it would return a conflict.
    (
        "EXC-01",
        "North Ring Road",
        date(2026, 11, 18),
        date(2026, 11, 22),
        ReservationStatus.PENDING,
    ),
    (
        "CRA-02",
        "Dambovita Bridge",
        date(2026, 11, 22),
        date(2026, 11, 25),
        ReservationStatus.PENDING,
    ),
    (
        "LOA-04",
        "Pipera Business Park",
        date(2026, 12, 5),
        date(2026, 12, 12),
        ReservationStatus.PENDING,
    ),
    (
        "BUL-03",
        "A1 Highway Section 4",
        date(2026, 12, 1),
        date(2026, 12, 15),
        ReservationStatus.PENDING,
    ),
    (
        "COM-02",
        "North Ring Road",
        date(2026, 12, 10),
        date(2026, 12, 18),
        ReservationStatus.PENDING,
    ),
]

DEFECTS = [
    {
        "key": "excavator-leak",
        "equipment": "EXC-03",
        "description": "Hydraulic oil leak from the main boom cylinder",
        "severity": DefectSeverity.CRITICAL,
        "status": DefectStatus.OPEN,
        "reported_at": _dt(2026, 11, 9, 7),
        "resolved_at": None,
    },
    {
        "key": "loader-hose",
        "equipment": "LOA-02",
        "description": "Burst hydraulic hose on the lift circuit",
        "severity": DefectSeverity.MEDIUM,
        "status": DefectStatus.OPEN,
        "reported_at": _dt(2026, 11, 9, 9),
        "resolved_at": None,
    },
    {
        "key": "crane-hook",
        "equipment": "CRA-02",
        "description": "Worn safety latch on the main hook",
        "severity": DefectSeverity.LOW,
        "status": DefectStatus.RESOLVED,
        "reported_at": _dt(2026, 10, 28, 11),
        "resolved_at": _dt(2026, 11, 2, 16),
    },
]

# key, equipment, defect key, description, kind, scheduled_date, status, started, completed,
# labor_hours, labor_rate
INTERVENTIONS = [
    (
        "loader-repair",
        "LOA-02",
        "loader-hose",
        "Replace the lift circuit hydraulic hose",
        InterventionKind.REPAIR,
        date(2026, 11, 9),
        InterventionStatus.IN_PROGRESS,
        _dt(2026, 11, 9, 10),
        None,
        "3.50",
        "120.00",
    ),
    (
        "crane-repair",
        "CRA-02",
        "crane-hook",
        "Replace the crane hook safety latch",
        InterventionKind.REPAIR,
        date(2026, 10, 30),
        InterventionStatus.DONE,
        _dt(2026, 10, 30, 9),
        _dt(2026, 11, 2, 16),
        "4.00",
        "130.00",
    ),
    (
        "excavator-revision",
        "EXC-01",
        None,
        "Scheduled 500-hour revision",
        InterventionKind.REVISION,
        date(2026, 11, 25),
        InterventionStatus.PLANNED,
        _dt(2026, 11, 25, 8),
        None,
        "0.00",
        "140.00",
    ),
]

PARTS = [
    ("loader-repair", 'Hydraulic hose 3/4"', 1, "450.00"),
    ("loader-repair", "Hydraulic fittings", 2, "35.00"),
    ("crane-repair", "Hook latch kit", 1, "280.00"),
    ("crane-repair", "Safety pin", 1, "45.00"),
]


def _clear(session: Session) -> None:
    """Delete every fleet row in foreign-key-safe order."""
    for model in (
        InterventionPart,
        ServiceIntervention,
        Defect,
        Reservation,
        Equipment,
        Site,
    ):
        session.execute(delete(model))
    session.flush()


def _already_seeded(session: Session) -> bool:
    return (
        session.scalar(
            select(Equipment.id).where(Equipment.serial_no.like(f"{SERIAL_PREFIX}%")).limit(1)
        )
        is not None
    )


def seed(session: Session, *, reset: bool = False) -> dict[str, int]:
    """Insert the demo dataset. Returns the number of rows written per entity."""
    if reset:
        _clear(session)
    elif _already_seeded(session):
        return {}

    sites = {data["name"]: Site(**data) for data in SITES}
    session.add_all(sites.values())
    session.flush()

    equipment: dict[str, Equipment] = {}
    for (
        name,
        equipment_type,
        suffix,
        engine_hours,
        hourly_cost,
        interval_days,
        interval_hours,
        last_service_at,
        last_service_hours,
        status,
    ) in EQUIPMENT:
        serial_no = f"{SERIAL_PREFIX}{suffix}"
        equipment[suffix] = Equipment(
            name=name,
            type=equipment_type,
            serial_no=serial_no,
            status=status,
            engine_hours=Decimal(engine_hours),
            hourly_cost=Decimal(hourly_cost),
            service_interval_days=interval_days,
            service_interval_hours=Decimal(interval_hours),
            last_service_at=last_service_at,
            last_service_hours=Decimal(last_service_hours),
        )
    session.add_all(equipment.values())
    session.flush()

    reservations = [
        Reservation(
            equipment_id=equipment[suffix].id,
            site_id=sites[site_name].id,
            start_date=start,
            end_date=end,
            status=status,
            requested_by_role="site_manager",
        )
        for suffix, site_name, start, end, status in RESERVATIONS
    ]
    session.add_all(reservations)

    defects: dict[str, Defect] = {}
    for data in DEFECTS:
        defect = Defect(
            equipment_id=equipment[data["equipment"]].id,
            description=data["description"],
            severity=data["severity"],
            status=data["status"],
            reported_at=data["reported_at"],
            resolved_at=data["resolved_at"],
        )
        defects[data["key"]] = defect
    session.add_all(defects.values())
    session.flush()

    interventions: dict[str, ServiceIntervention] = {}
    for (
        key,
        equipment_suffix,
        defect_key,
        description,
        kind,
        scheduled_date,
        status,
        started_at,
        completed_at,
        labor_hours,
        labor_rate,
    ) in INTERVENTIONS:
        intervention = ServiceIntervention(
            equipment_id=equipment[equipment_suffix].id,
            defect_id=defects[defect_key].id if defect_key else None,
            description=description,
            kind=kind,
            scheduled_date=scheduled_date,
            status=status,
            started_at=started_at,
            completed_at=completed_at,
            labor_hours=Decimal(labor_hours),
            labor_rate=Decimal(labor_rate),
        )
        interventions[key] = intervention
    session.add_all(interventions.values())
    session.flush()

    parts = [
        InterventionPart(
            intervention_id=interventions[key].id,
            name=name,
            qty=qty,
            unit_cost=Decimal(unit_cost),
        )
        for key, name, qty, unit_cost in PARTS
    ]
    session.add_all(parts)
    session.commit()

    return {
        "sites": len(sites),
        "equipment": len(equipment),
        "reservations": len(reservations),
        "defects": len(defects),
        "interventions": len(interventions),
        "parts": len(parts),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--reset",
        action="store_true",
        help="delete all fleet data before inserting the demo dataset",
    )
    args = parser.parse_args()

    with SessionLocal() as session:
        counts = seed(session, reset=args.reset)

    if not counts:
        print("Seed: demo data already present, nothing to do. Use --reset to start over.")
        return
    summary = ", ".join(f"{name}={count}" for name, count in counts.items())
    print(f"Seed: inserted {summary}.")


if __name__ == "__main__":
    main()
