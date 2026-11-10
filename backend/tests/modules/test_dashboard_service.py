"""Service coverage for dashboard availability, utilization and cost aggregates."""

from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.dashboard import service
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import (
    Defect,
    InterventionKind,
    InterventionPart,
    InterventionStatus,
    ServiceIntervention,
)
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

D = date(2099, 5, 1)


@pytest.fixture(autouse=True)
def empty_fleet(db: Session) -> None:
    """Aggregates are global, so start each test from an empty fleet (rolled back afterwards)."""
    for model in (InterventionPart, ServiceIntervention, Defect, Reservation, Equipment, Site):
        db.execute(delete(model))
    db.flush()


def make_equipment(
    db: Session,
    name: str = "Machine",
    type_: str = "excavator",
    status: EquipmentStatus = EquipmentStatus.AVAILABLE,
    hourly_cost: Decimal = Decimal("100.00"),
) -> Equipment:
    equipment = Equipment(
        name=name,
        type=type_,
        serial_no=uuid4().hex,
        status=status,
        hourly_cost=hourly_cost,
    )
    db.add(equipment)
    db.flush()
    return equipment


def make_site(
    db: Session,
    name: str = "Site",
    budget: Decimal = Decimal("10000.00"),
) -> Site:
    site = Site(
        name=name,
        address="Main Street",
        budget=budget,
        start_date=date(2099, 1, 1),
        end_date=date(2099, 12, 31),
    )
    db.add(site)
    db.flush()
    return site


def reserve(
    db: Session,
    equipment: Equipment,
    site: Site,
    start: date,
    end: date,
    status: ReservationStatus = ReservationStatus.APPROVED,
) -> Reservation:
    reservation = Reservation(
        equipment_id=equipment.id,
        site_id=site.id,
        start_date=start,
        end_date=end,
        status=status,
        requested_by_role="site_manager",
    )
    db.add(reservation)
    db.flush()
    return reservation


def maintain(
    db: Session,
    equipment: Equipment,
    scheduled: date,
    labor_hours: Decimal = Decimal("0.00"),
    labor_rate: Decimal = Decimal("0.00"),
    status: InterventionStatus = InterventionStatus.PLANNED,
    parts: list[tuple[str, int, Decimal]] | None = None,
) -> ServiceIntervention:
    intervention = ServiceIntervention(
        equipment_id=equipment.id,
        description="Repair",
        kind=InterventionKind.REPAIR,
        scheduled_date=scheduled,
        status=status,
        started_at=datetime(2099, 4, 1, tzinfo=UTC),
        labor_hours=labor_hours,
        labor_rate=labor_rate,
    )
    db.add(intervention)
    db.flush()
    for name, qty, unit_cost in parts or []:
        db.add(
            InterventionPart(
                intervention_id=intervention.id,
                name=name,
                qty=qty,
                unit_cost=unit_cost,
            )
        )
    db.flush()
    return intervention


# --- fleet availability & utilization (#11) ---------------------------------


def test_empty_fleet_has_zero_counts_and_no_rankings(db: Session) -> None:
    stats = service.fleet_stats(db, D, D)

    assert stats.total_equipment == 0
    assert stats.period_days == 1
    assert [(item.status, item.count) for item in stats.by_status] == [
        (status, 0) for status in EquipmentStatus
    ]
    assert stats.by_type == []
    assert stats.utilization == []
    assert stats.top_used == []
    assert stats.least_used == []


def test_counts_group_by_status_and_type(db: Session) -> None:
    make_equipment(db, type_="excavator")
    make_equipment(db, type_="excavator", status=EquipmentStatus.DEFECTIVE)
    make_equipment(db, type_="crane")
    make_equipment(db, type_="loader", status=EquipmentStatus.RETIRED)

    stats = service.fleet_stats(db, D, D)

    counts = {item.status: item.count for item in stats.by_status}
    assert counts[EquipmentStatus.AVAILABLE] == 2
    assert counts[EquipmentStatus.DEFECTIVE] == 1
    assert counts[EquipmentStatus.RETIRED] == 1
    assert counts[EquipmentStatus.IN_SERVICE] == 0
    assert [(item.type, item.count) for item in stats.by_type] == [
        ("excavator", 2),
        ("crane", 1),
        ("loader", 1),
    ]


def test_utilization_counts_only_approved_days_inside_the_period(db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    # Approved: 10 days, clipped to 6 days by the period.
    reserve(db, equipment, site, D, D.replace(day=10), ReservationStatus.APPROVED)
    # Pending and rejected requests do not occupy the machine.
    reserve(db, equipment, site, D.replace(day=1), D.replace(day=14), ReservationStatus.PENDING)
    reserve(db, equipment, site, D.replace(day=1), D.replace(day=14), ReservationStatus.REJECTED)
    # Outside the period.
    reserve(db, equipment, site, D.replace(day=20), D.replace(day=25), ReservationStatus.APPROVED)

    stats = service.fleet_stats(db, D.replace(day=5), D.replace(day=14))

    row = stats.utilization[0]
    assert (row.reserved_days, row.period_days) == (6, 10)
    assert row.utilization_percent == 60.0


def test_overlapping_and_adjacent_reservations_are_not_double_counted(db: Session) -> None:
    overlapping = make_equipment(db, name="Overlapping")
    adjacent = make_equipment(db, name="Adjacent")
    site = make_site(db)
    reserve(db, overlapping, site, D, D.replace(day=5))
    reserve(db, overlapping, site, D.replace(day=4), D.replace(day=10))
    reserve(db, adjacent, site, D.replace(day=12), D.replace(day=14))
    reserve(db, adjacent, site, D.replace(day=15), D.replace(day=16))

    stats = service.fleet_stats(db, D, D.replace(day=16))

    rows = {row.equipment_id: row for row in stats.utilization}
    assert rows[overlapping.id].reserved_days == 10
    assert rows[overlapping.id].utilization_percent == 62.5
    assert rows[adjacent.id].reserved_days == 5
    assert rows[adjacent.id].utilization_percent == 31.25


def test_disjoint_reservations_are_summed_without_gaps(db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    reserve(db, equipment, site, D, D.replace(day=2))
    reserve(db, equipment, site, D.replace(day=10), D.replace(day=11))

    stats = service.fleet_stats(db, D, D.replace(day=11))

    row = stats.utilization[0]
    assert row.reserved_days == 4
    assert row.utilization_percent == 36.36


def test_merged_days_handles_an_empty_interval_list() -> None:
    assert service._merged_days([]) == 0


def test_utilization_percent_is_rounded_to_two_decimals(db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    reserve(db, equipment, site, D, D)

    stats = service.fleet_stats(db, D, D.replace(day=3))

    assert stats.utilization[0].utilization_percent == 33.33


def test_retired_equipment_is_counted_but_has_no_utilization_or_ranking(db: Session) -> None:
    active = make_equipment(db, name="Active")
    retired = make_equipment(db, name="Retired", status=EquipmentStatus.RETIRED)
    site = make_site(db)
    reserve(db, active, site, D, D)
    reserve(db, retired, site, D, D)

    stats = service.fleet_stats(db, D, D)

    assert stats.total_equipment == 2
    assert {item.status: item.count for item in stats.by_status}[EquipmentStatus.RETIRED] == 1
    assert [row.equipment_id for row in stats.utilization] == [active.id]
    assert [row.equipment_id for row in stats.top_used] == [active.id]
    assert [row.equipment_id for row in stats.least_used] == [active.id]


def test_top_and_least_used_are_limited_to_five(db: Session) -> None:
    site = make_site(db)
    equipment = [make_equipment(db, name=f"Machine {index}") for index in range(7)]
    # Machine 0 uses 0 days, machine 1 uses 1 day, ..., machine 6 uses 6 days.
    for index, item in enumerate(equipment):
        if index:
            reserve(db, item, site, D, D.replace(day=index))

    stats = service.fleet_stats(db, D, D.replace(day=6))

    assert [row.reserved_days for row in stats.top_used] == [6, 5, 4, 3, 2]
    assert [row.reserved_days for row in stats.least_used] == [0, 1, 2, 3, 4]


def test_fleet_stats_rejects_an_inverted_period(db: Session) -> None:
    with pytest.raises(InvalidDataError, match="'to' must not be before 'from'"):
        service.fleet_stats(db, D.replace(day=2), D)


# --- operating cost per site vs budget (#12) --------------------------------


def test_equipment_cost_uses_approved_reservation_days(db: Session) -> None:
    equipment = make_equipment(db, hourly_cost=Decimal("100.00"))
    site = make_site(db, budget=Decimal("10000.00"))
    reserve(db, equipment, site, D, D.replace(day=3), ReservationStatus.APPROVED)
    reserve(db, equipment, site, D.replace(day=5), D.replace(day=9), ReservationStatus.PENDING)

    report = service.site_costs(db)

    cost = report.sites[0]
    assert cost.equipment_cost == Decimal("2400.00")
    assert cost.maintenance_cost == Decimal("0.00")
    assert cost.spent == Decimal("2400.00")
    assert cost.remaining == Decimal("7600.00")
    assert cost.percent_used == 24.0
    assert cost.over_budget is False


def test_costs_are_reported_per_site_and_can_be_filtered(db: Session) -> None:
    north = make_site(db, name="North", budget=Decimal("1000.00"))
    south = make_site(db, name="South", budget=Decimal("5000.00"))
    cheap = make_equipment(db, hourly_cost=Decimal("10.00"))
    pricey = make_equipment(db, hourly_cost=Decimal("50.00"))
    reserve(db, cheap, north, D, D)  # 1 day * 8h * 10 = 80
    reserve(db, pricey, south, D, D.replace(day=2))  # 2 days * 8h * 50 = 800

    report = service.site_costs(db)

    assert [(row.site_name, row.spent) for row in report.sites] == [
        ("North", Decimal("80.00")),
        ("South", Decimal("800.00")),
    ]

    filtered = service.site_costs(db, south.id)
    assert [row.site_name for row in filtered.sites] == ["South"]
    assert filtered.sites[0].spent == Decimal("800.00")


def test_maintenance_cost_is_attributed_by_scheduled_date(db: Session) -> None:
    equipment = make_equipment(db, hourly_cost=Decimal("50.00"))
    site = make_site(db, budget=Decimal("10000.00"))
    reserve(db, equipment, site, D, D.replace(day=9), ReservationStatus.APPROVED)
    # 2h * 100 + two parts (1 * 300, 2 * 25) = 550, inside the reservation window.
    maintain(
        db,
        equipment,
        D.replace(day=5),
        labor_hours=Decimal("2.00"),
        labor_rate=Decimal("100.00"),
        parts=[("Pump", 1, Decimal("300.00")), ("Seals", 2, Decimal("25.00"))],
    )
    # Outside every approved reservation, so it stays unattributed.
    maintain(
        db,
        equipment,
        D.replace(day=20),
        labor_hours=Decimal("5.00"),
        labor_rate=Decimal("100.00"),
    )

    cost = service.site_costs(db).sites[0]

    assert cost.equipment_cost == Decimal("3600.00")
    assert cost.maintenance_cost == Decimal("550.00")
    assert cost.spent == Decimal("4150.00")


def test_maintenance_without_parts_or_labour_costs_nothing(db: Session) -> None:
    equipment = make_equipment(db)
    site = make_site(db)
    reserve(db, equipment, site, D, D)
    maintain(db, equipment, D)

    cost = service.site_costs(db).sites[0]

    assert cost.equipment_cost == Decimal("800.00")
    assert cost.maintenance_cost == Decimal("0.00")


def test_over_budget_site_is_flagged(db: Session) -> None:
    equipment = make_equipment(db, hourly_cost=Decimal("100.00"))
    site = make_site(db, budget=Decimal("1000.00"))
    reserve(db, equipment, site, D, D.replace(day=3))

    cost = service.site_costs(db).sites[0]

    assert cost.spent == Decimal("2400.00")
    assert cost.remaining == Decimal("-1400.00")
    assert cost.percent_used == 240.0
    assert cost.over_budget is True


@pytest.mark.parametrize(
    ("budget", "spent_equipment", "expected_percent", "over_budget"),
    [
        (Decimal("0.00"), None, 0.0, False),
        (Decimal("0.00"), Decimal("100.00"), 100.0, True),
    ],
)
def test_zero_budget_does_not_divide_by_zero(
    db: Session,
    budget: Decimal,
    spent_equipment: Decimal | None,
    expected_percent: float,
    over_budget: bool,
) -> None:
    site = make_site(db, budget=budget)
    if spent_equipment is not None:
        equipment = make_equipment(db, hourly_cost=spent_equipment)
        reserve(db, equipment, site, D, D)

    cost = service.site_costs(db).sites[0]

    assert cost.percent_used == expected_percent
    assert cost.over_budget is over_budget


def test_site_costs_without_reservations_are_zero(db: Session) -> None:
    make_site(db, name="Empty", budget=Decimal("500.00"))

    cost = service.site_costs(db).sites[0]

    assert cost.equipment_cost == Decimal("0.00")
    assert cost.maintenance_cost == Decimal("0.00")
    assert cost.spent == Decimal("0.00")
    assert cost.remaining == Decimal("500.00")
    assert cost.percent_used == 0.0


def test_site_costs_without_sites_returns_an_empty_report(db: Session) -> None:
    assert service.site_costs(db).sites == []


def test_unknown_site_raises_not_found(db: Session) -> None:
    with pytest.raises(NotFoundError, match="Site not found"):
        service.site_costs(db, 99999999)


def test_costs_ignore_reservations_of_other_sites_when_filtering(db: Session) -> None:
    north = make_site(db, name="North")
    south = make_site(db, name="South")
    equipment = make_equipment(db)
    reserve(db, equipment, north, D, D)
    reserve(db, equipment, south, D, D)

    report = service.site_costs(db, north.id)

    assert [(row.site_name, row.spent) for row in report.sites] == [("North", Decimal("800.00"))]
