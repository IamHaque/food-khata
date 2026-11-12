-- Proposal only. Measured in PR-12 (docs/perf/pr-12-query-report.md): neither index changes a plan or a timing on the 20,000-order dataset, so none was added. Re-measure with filtered workloads before applying.
CREATE INDEX IF NOT EXISTS idx_orders_account_platform_date
    ON orders(account_id, platform, order_date);
CREATE INDEX IF NOT EXISTS idx_items_order_category
    ON order_items(order_id, category);
