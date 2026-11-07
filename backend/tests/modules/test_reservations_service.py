from datetime import date

import pytest

from app.modules.reservations.service import periods_overlap

D = date


@pytest.mark.parametrize(
    ("a", "b", "expected"),
    [
        ((D(2026, 11, 1), D(2026, 11, 5)), (D(2026, 11, 5), D(2026, 11, 9)), True),
        ((D(2026, 11, 1), D(2026, 11, 5)), (D(2026, 11, 6), D(2026, 11, 9)), False),
        ((D(2026, 11, 1), D(2026, 11, 30)), (D(2026, 11, 10), D(2026, 11, 12)), True),
    ],
)
def test_periods_overlap(a, b, expected):
    assert periods_overlap(*a, *b) is expected
    assert periods_overlap(*b, *a) is expected


def test_periods_overlap_rejects_inverted_range():
    with pytest.raises(ValueError):
        periods_overlap(D(2026, 11, 5), D(2026, 11, 1), D(2026, 11, 1), D(2026, 11, 2))
