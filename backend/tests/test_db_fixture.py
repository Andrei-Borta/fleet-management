"""Example of a database test isolated even when application code commits."""

from collections.abc import Iterator
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.db import engine


@pytest.fixture
def rollback_probe() -> Iterator[str]:
    # PostgreSQL creates tables transactionally; a unique name avoids conflicts between test runs.
    table_name = f"fixture_test_{uuid4().hex}"
    yield table_name
    with engine.connect() as connection:
        assert connection.scalar(text("SELECT to_regclass(:name)"), {"name": table_name}) is None


def test_db_fixture_rolls_back_commits_and_session_rollbacks(
    rollback_probe: str, db: Session
) -> None:
    db.execute(text(f'CREATE TABLE "{rollback_probe}" (id INTEGER PRIMARY KEY)'))
    db.execute(text(f'INSERT INTO "{rollback_probe}" (id) VALUES (1)'))
    db.commit()

    db.execute(text(f'INSERT INTO "{rollback_probe}" (id) VALUES (2)'))
    db.rollback()
    assert db.scalar(text(f'SELECT count(*) FROM "{rollback_probe}"')) == 1

    # An independent connection cannot see the uncommitted table, even after db.commit().
    with engine.connect() as connection:
        assert (
            connection.scalar(text("SELECT to_regclass(:name)"), {"name": rollback_probe}) is None
        )
    # rollback_probe also checks after the db fixture has torn down its outer transaction.
