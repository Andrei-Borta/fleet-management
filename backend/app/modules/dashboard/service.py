"""Business logic for the dashboard module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from collections import Counter
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import InvalidDataError, NotFoundError
from app.modules.dashboard.schemas import (
    EquipmentUtilization,
    FleetStats,
    SiteCost,
    SiteCostsReport,
    StatusCount,
    TypeCount,
)
from app.modules.equipment.models import Equipment, EquipmentStatus
from app.modules.maintenance.models import InterventionPart, ServiceIntervention
from app.modules.reservations.models import Reservation, ReservationStatus
from app.modules.sites.models import Site

HOURS_PER_RESERVATION_DAY = Decimal("8.00")
MONEY = Decimal("0.01")
TOP_EQUIPMENT = 5


def _validate_period(start: date, end: date) -> None:
    if end < start:
        raise InvalidDataError("'to' must not be before 'from'")


def _inclusive_days(start: date, end: date) -> int:
    return (end - start).days + 1


def _merged_days(intervals: list[tuple[date, date]]) -> int:
    """Count the inclusive days covered by intervals, merging overlaps and adjacent ranges."""
    if not intervals:
        return 0
    ordered = sorted(intervals)
    total = 0
    current_start, current_end = ordered[0]
    for start, end in ordered[1:]:
        if start <= current_end + timedelta(days=1):
            current_end = max(current_end, end)
        else:
            total += _inclusive_days(current_start, current_end)
            current_start, current_end = start, end
    return total + _inclusive_days(current_start, current_end)


def _reserved_days_by_equipment(db: Session, start: date, end: date) -> dict[int, int]:
    """Approved reservation days per equipment, clipped to the period and not double counted."""
    reservations = db.scalars(
        select(Reservation).where(
            Reservation.status == ReservationStatus.APPROVED,
            Reservation.start_date <= end,
            Reservation.end_date >= start,
        )
    ).all()
    intervals: dict[int, list[tuple[date, date]]] = {}
    for reservation in reservations:
        clipped_start = max(start, reservation.start_date)
        clipped_end = min(end, reservation.end_date)
        intervals.setdefault(reservation.equipment_id, []).append((clipped_start, clipped_end))
    return {equipment_id: _merged_days(ranges) for equipment_id, ranges in intervals.items()}


def _utilization(
    equipment: Equipment, reserved_days: int, period_days: int
) -> EquipmentUtilization:
    percent = round(reserved_days / period_days * 100, 2)
    return EquipmentUtilization(
        equipment_id=equipment.id,
        name=equipment.name,
        type=equipment.type,
        reserved_days=reserved_days,
        period_days=period_days,
        utilization_percent=percent,
    )


def fleet_stats(db: Session, start: date, end: date) -> FleetStats:
    """Counts per status/type plus utilization and rankings for an inclusive period.

    Utilization and rankings cover the active fleet (retired equipment is left out); the
    status and type counts still include every equipment record.
    """
    _validate_period(start, end)
    period_days = _inclusive_days(start, end)
    equipment = list(db.scalars(select(Equipment).order_by(Equipment.id)).all())

    status_counts = Counter(item.status for item in equipment)
    by_status = [
        StatusCount(status=status, count=status_counts.get(status, 0)) for status in EquipmentStatus
    ]

    type_counts = Counter(item.type for item in equipment)
    by_type = [
        TypeCount(type=type_name, count=count)
        for type_name, count in sorted(type_counts.items(), key=lambda pair: (-pair[1], pair[0]))
    ]

    reserved_days = _reserved_days_by_equipment(db, start, end)
    utilization = [
        _utilization(item, reserved_days.get(item.id, 0), period_days)
        for item in equipment
        if item.status != EquipmentStatus.RETIRED
    ]

    top_used = sorted(utilization, key=lambda item: (-item.reserved_days, item.equipment_id))[
        :TOP_EQUIPMENT
    ]
    least_used = sorted(utilization, key=lambda item: (item.reserved_days, item.equipment_id))[
        :TOP_EQUIPMENT
    ]

    return FleetStats(
        start_date=start,
        end_date=end,
        period_days=period_days,
        total_equipment=len(equipment),
        by_status=by_status,
        by_type=by_type,
        utilization=utilization,
        top_used=top_used,
        least_used=least_used,
    )


def _money(value: Decimal) -> Decimal:
    return value.quantize(MONEY)


def _parts_costs(db: Session, intervention_ids: list[int]) -> dict[int, Decimal]:
    if not intervention_ids:
        return {}
    parts = db.scalars(
        select(InterventionPart).where(InterventionPart.intervention_id.in_(intervention_ids))
    ).all()
    costs: dict[int, Decimal] = {}
    for part in parts:
        costs[part.intervention_id] = costs.get(part.intervention_id, Decimal(0)) + (
            Decimal(part.qty) * part.unit_cost
        )
    return costs


def _intervention_cost(intervention: ServiceIntervention, parts_cost: Decimal) -> Decimal:
    labor = Decimal(intervention.labor_hours or 0) * Decimal(intervention.labor_rate or 0)
    return _money(labor + parts_cost)


def _scheduled_within(day: date, intervals: list[tuple[date, date]]) -> bool:
    return any(start <= day <= end for start, end in intervals)


def _percent_used(spent: Decimal, budget: Decimal) -> float:
    if budget == 0:
        return 0.0 if spent == 0 else 100.0
    return round(float(spent / budget * 100), 2)


def site_costs(db: Session, site_id: int | None = None) -> SiteCostsReport:
    """Operating cost compared with each site's budget.

    Equipment cost is ``approved reservation days × 8h × hourly_cost``. A maintenance
    intervention is attributed to the site whose approved reservation of that equipment
    contains the intervention's scheduled date; otherwise it stays unattributed.
    """
    if site_id is not None:
        site = db.get(Site, site_id)
        if site is None:
            raise NotFoundError("Site not found")
        sites = [site]
    else:
        sites = list(db.scalars(select(Site).order_by(Site.id)).all())

    included_site_ids = {site.id for site in sites}
    equipment_costs = {site.id: Decimal(0) for site in sites}
    maintenance_costs = {site.id: Decimal(0) for site in sites}
    reservation_windows: dict[tuple[int, int], list[tuple[date, date]]] = {}
    equipment_ids: set[int] = set()

    reservations = db.execute(
        select(Reservation, Equipment)
        .join(Equipment, Reservation.equipment_id == Equipment.id)
        .where(Reservation.status == ReservationStatus.APPROVED)
    ).all()

    for reservation, equipment in reservations:
        if reservation.site_id not in included_site_ids:
            continue
        days = _inclusive_days(reservation.start_date, reservation.end_date)
        equipment_costs[reservation.site_id] += (
            Decimal(days) * HOURS_PER_RESERVATION_DAY * equipment.hourly_cost
        )
        reservation_windows.setdefault((reservation.site_id, equipment.id), []).append(
            (reservation.start_date, reservation.end_date)
        )
        equipment_ids.add(equipment.id)

    if equipment_ids:
        interventions = db.scalars(
            select(ServiceIntervention).where(ServiceIntervention.equipment_id.in_(equipment_ids))
        ).all()
        parts_costs = _parts_costs(db, [item.id for item in interventions])
        for intervention in interventions:
            cost = _intervention_cost(intervention, parts_costs.get(intervention.id, Decimal(0)))
            for site in sites:
                windows = reservation_windows.get((site.id, intervention.equipment_id), [])
                if _scheduled_within(intervention.scheduled_date, windows):
                    maintenance_costs[site.id] += cost
                    break

    rows = []
    for site in sites:
        equipment_cost = _money(equipment_costs[site.id])
        maintenance_cost = _money(maintenance_costs[site.id])
        spent = _money(equipment_cost + maintenance_cost)
        rows.append(
            SiteCost(
                site_id=site.id,
                site_name=site.name,
                budget=site.budget,
                equipment_cost=equipment_cost,
                maintenance_cost=maintenance_cost,
                spent=spent,
                remaining=_money(site.budget - spent),
                percent_used=_percent_used(spent, site.budget),
                over_budget=spent > site.budget,
            )
        )
    return SiteCostsReport(sites=rows)
