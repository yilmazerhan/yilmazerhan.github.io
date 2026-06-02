"""customers_table: separate customer list + patch.customers JSONB array

Revision ID: 0025_customers_table
Revises: 0024_inventory_groups
Create Date: 2026-06-02
"""

from alembic import op

revision = "0025_customers_table"
down_revision = "0024_inventory_groups"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Dedicated customer lookup table
    op.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name       VARCHAR(255) NOT NULL UNIQUE,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )
    """)

    # 2. Add JSONB column for multi-customer support
    op.execute("""
        ALTER TABLE customer_patches
        ADD COLUMN IF NOT EXISTS customers JSONB NOT NULL DEFAULT '[]'
    """)

    # 3. Migrate existing single-customer string → JSON array
    op.execute("""
        UPDATE customer_patches
        SET customers = jsonb_build_array(customer)
        WHERE customer IS NOT NULL AND customer <> ''
    """)

    # 4. Seed the customers table from existing patch records
    op.execute("""
        INSERT INTO customers (name)
        SELECT DISTINCT customer FROM customer_patches
        WHERE customer IS NOT NULL AND customer <> ''
        ON CONFLICT (name) DO NOTHING
    """)

    # 5. Drop the old single-value column
    op.execute("""
        ALTER TABLE customer_patches DROP COLUMN IF EXISTS customer
    """)


def downgrade() -> None:
    op.execute("""
        ALTER TABLE customer_patches
        ADD COLUMN IF NOT EXISTS customer VARCHAR(255) NOT NULL DEFAULT ''
    """)
    # Restore first element from the array
    op.execute("""
        UPDATE customer_patches
        SET customer = (customers->>0)
        WHERE jsonb_array_length(customers) > 0
    """)
    op.execute("ALTER TABLE customer_patches DROP COLUMN IF EXISTS customers")
    op.execute("DROP TABLE IF EXISTS customers")
