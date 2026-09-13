"""add system_run_id to dataset_profiles

Revision ID: 030f11eb85d7
Revises: 7eaa63be1fcf
Create Date: 2026-09-13 22:16:43.510384

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '030f11eb85d7'
down_revision: Union[str, Sequence[str], None] = '7eaa63be1fcf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.batch_alter_table('dataset_profiles') as batch_op:
        batch_op.add_column(sa.Column('system_run_id', sa.String(), nullable=True))
        batch_op.create_foreign_key('fk_dataset_profiles_system_run_id', 'analysis_runs', ['system_run_id'], ['id'], ondelete='SET NULL')


def downgrade() -> None:
    """Downgrade schema."""
    with op.batch_alter_table('dataset_profiles') as batch_op:
        batch_op.drop_constraint('fk_dataset_profiles_system_run_id', type_='foreignkey')
        batch_op.drop_column('system_run_id')
    # ### end Alembic commands ###
