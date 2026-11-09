"""Align maintenance records with defect reporting and service workflows.

Revision ID: b72d46a92d10
Revises: ca55cb199eaf
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b72d46a92d10"
down_revision = "ca55cb199eaf"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    # Existing maintenance records have no severity, kind or schedule and cannot be migrated safely.
    if bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM defects) OR EXISTS (SELECT 1 FROM service_interventions)"
        )
    ).scalar():
        raise RuntimeError("Cannot migrate existing maintenance records without a data migration")
    severity = postgresql.ENUM("low", "medium", "critical", name="defect_severity")
    kind = postgresql.ENUM("repair", "revision", name="intervention_kind")
    severity.create(bind)
    kind.create(bind)

    op.add_column(
        "defects",
        sa.Column(
            "severity",
            postgresql.ENUM(name="defect_severity", create_type=False),
            nullable=False,
        ),
    )
    op.execute("ALTER TYPE intervention_status RENAME VALUE 'open' TO 'planned'")
    op.execute("ALTER TYPE intervention_status RENAME VALUE 'completed' TO 'done'")
    op.add_column(
        "service_interventions",
        sa.Column(
            "kind", postgresql.ENUM(name="intervention_kind", create_type=False), nullable=False
        ),
    )
    op.add_column("service_interventions", sa.Column("scheduled_date", sa.Date(), nullable=False))
    op.drop_constraint(
        "ck_service_interventions_labor_cost", "service_interventions", type_="check"
    )
    op.drop_column("service_interventions", "labor_cost")
    for name in ("labor_hours", "labor_rate"):
        op.add_column(
            "service_interventions",
            sa.Column(name, sa.Numeric(12, 2), nullable=False, server_default="0"),
        )
        op.create_check_constraint(
            f"ck_service_interventions_{name}", "service_interventions", f"{name} >= 0"
        )


def downgrade() -> None:
    bind = op.get_bind()
    # A downgrade cannot represent the new values, so never silently discard records.
    if bind.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM defects) OR EXISTS (SELECT 1 FROM service_interventions)"
        )
    ).scalar():
        raise RuntimeError("Cannot downgrade maintenance data without losing new fields")
    for name in ("labor_hours", "labor_rate"):
        op.drop_constraint(
            f"ck_service_interventions_{name}", "service_interventions", type_="check"
        )
        op.drop_column("service_interventions", name)
    op.add_column(
        "service_interventions",
        sa.Column("labor_cost", sa.Numeric(12, 2), nullable=False, server_default="0"),
    )
    op.create_check_constraint(
        "ck_service_interventions_labor_cost", "service_interventions", "labor_cost >= 0"
    )
    op.drop_column("service_interventions", "scheduled_date")
    op.drop_column("service_interventions", "kind")
    op.execute("ALTER TYPE intervention_status RENAME VALUE 'planned' TO 'open'")
    op.execute("ALTER TYPE intervention_status RENAME VALUE 'done' TO 'completed'")
    op.drop_column("defects", "severity")
    postgresql.ENUM(name="intervention_kind").drop(bind)
    postgresql.ENUM(name="defect_severity").drop(bind)
