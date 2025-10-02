"""add_new_destination_types_to_enum

Revision ID: 5e4698f32028
Revises: 02b1644a3a5b
Create Date: 2025-09-29 11:20:11.934490

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '5e4698f32028'
down_revision = '02b1644a3a5b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new values to the DataDestinationType enum
    op.execute("ALTER TYPE datadestinationtype ADD VALUE IF NOT EXISTS 'CSV'")
    op.execute("ALTER TYPE datadestinationtype ADD VALUE IF NOT EXISTS 'POSTGRES'")
    op.execute("ALTER TYPE datadestinationtype ADD VALUE IF NOT EXISTS 'SHEETS'")
    op.execute("ALTER TYPE datadestinationtype ADD VALUE IF NOT EXISTS 'ATHENA'")


def downgrade() -> None:
    # Note: PostgreSQL doesn't support removing enum values directly
    # This would require recreating the enum and updating all references
    pass
