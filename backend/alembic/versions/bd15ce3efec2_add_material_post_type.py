"""add material post type

Revision ID: bd15ce3efec2
Revises: 8806fd72eb0c
Create Date: 2026-11-11 11:35:01.442482
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = 'bd15ce3efec2'
down_revision: str | None = '8806fd72eb0c'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'materials',
        sa.Column(
            'post_type',
            sa.String(length=20),
            server_default='post',
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column('materials', 'post_type')
