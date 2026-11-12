"""add proxy pool and app settings

Revision ID: 620bbf42b15b
Revises: bd15ce3efec2
Create Date: 2026-11-11 11:52:49.831375
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "620bbf42b15b"
down_revision: str | None = "bd15ce3efec2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "proxy_nodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), server_default="", nullable=False),
        sa.Column("protocol", sa.String(length=10), server_default="http", nullable=False),
        sa.Column("host", sa.String(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("password", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("fail_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("success_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("last_checked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("host", "port", "username", name="uq_proxy_endpoint"),
    )
    op.create_table(
        "app_settings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column(
            "auto_sync_forums",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
        sa.Column("default_proxy_id", sa.Integer(), nullable=True),
        sa.Column(
            "proxy_auto_disable",
            sa.Boolean(),
            server_default=sa.true(),
            nullable=False,
        ),
        sa.Column(
            "proxy_failure_threshold",
            sa.Integer(),
            server_default="3",
            nullable=False,
        ),
        sa.Column(
            "request_timeout_seconds",
            sa.Integer(),
            server_default="30",
            nullable=False,
        ),
        sa.Column(
            "follow_interval_min",
            sa.Float(),
            server_default="2",
            nullable=False,
        ),
        sa.Column(
            "follow_interval_max",
            sa.Float(),
            server_default="5",
            nullable=False,
        ),
        sa.Column("sign_interval_min", sa.Float(), server_default="1", nullable=False),
        sa.Column("sign_interval_max", sa.Float(), server_default="3", nullable=False),
        sa.Column("post_interval_min", sa.Float(), server_default="10", nullable=False),
        sa.Column("post_interval_max", sa.Float(), server_default="30", nullable=False),
        sa.Column("post_prewarm_min", sa.Float(), server_default="1.2", nullable=False),
        sa.Column("post_prewarm_max", sa.Float(), server_default="3.5", nullable=False),
        sa.Column("max_task_total", sa.Integer(), server_default="100", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["default_proxy_id"],
            ["proxy_nodes.id"],
            name="fk_app_settings_default_proxy",
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.add_column("accounts", sa.Column("proxy_id", sa.Integer(), nullable=True))
    op.create_index("ix_accounts_proxy_id", "accounts", ["proxy_id"], unique=False)
    op.create_foreign_key(
        "fk_accounts_proxy_id_proxy_nodes",
        "accounts",
        "proxy_nodes",
        ["proxy_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_accounts_proxy_id_proxy_nodes",
        "accounts",
        type_="foreignkey",
    )
    op.drop_index("ix_accounts_proxy_id", table_name="accounts")
    op.drop_column("accounts", "proxy_id")
    op.drop_table("app_settings")
    op.drop_table("proxy_nodes")
