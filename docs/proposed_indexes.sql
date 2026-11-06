-- Proposal only: measure endpoint query plans before approval or application.
CREATE INDEX IF NOT EXISTS idx_orders_account_platform_date
    ON orders(account_id, platform, order_date);
CREATE INDEX IF NOT EXISTS idx_items_order_category
    ON order_items(order_id, category);
