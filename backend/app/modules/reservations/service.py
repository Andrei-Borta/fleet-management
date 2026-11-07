"""Business logic for the reservations module.

Every public function here MUST have pytest tests (see AGENTS.md).
"""

from datetime import date


def periods_overlap(start_a: date, end_a: date, start_b: date, end_b: date) -> bool:
    """True if two inclusive date ranges overlap. Building block for conflict detection."""
    if start_a > end_a or start_b > end_b:
        raise ValueError("start date must not be after end date")
    return start_a <= end_b and start_b <= end_a
