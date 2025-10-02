"""Add csv_filename and error_message to data_connectors

Revision ID: add_csv_fields
Revises: bde23ee1ae54
Create Date: 2025-09-30 14:16:00

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_csv_fields'
down_revision = 'bde23ee1ae54'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add csv_filename and error_message columns to data_connectors table
    op.add_column('data_connectors', sa.Column('csv_filename', sa.String(), nullable=True))
    op.add_column('data_connectors', sa.Column('error_message', sa.Text(), nullable=True))


def downgrade() -> None:
    # Remove the columns if rolling back
    op.drop_column('data_connectors', 'error_message')
    op.drop_column('data_connectors', 'csv_filename')
