"""add material video urls

Revision ID: 8806fd72eb0c
Revises: c868c3e2ab87
Create Date: 2026-11-11 11:16:42.439920
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = '8806fd72eb0c'
down_revision: str | None = 'c868c3e2ab87'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'materials',
        sa.Column(
            'video_urls',
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('materials', 'video_urls')
