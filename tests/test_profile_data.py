import sqlite3

from food_khata.db import AnalyticsDB
from scripts.profile_data import profile


def test_profile_empty_and_populated(tmp_path):
    db = tmp_path / "test.db"
    AnalyticsDB(db).init_db()
    empty = profile(db)
    assert "orders: 0 rows" in empty
    assert "minimum/maximum: none / none" in empty
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO accounts VALUES ('private', 'SENTINEL_PHONE', 'secret')")
        conn.execute(
            "INSERT INTO restaurants (id,platform,platform_restaurant_id,name,locality) VALUES ('r1','SWIGGY','1','SENTINEL_NAME','SENTINEL_ADDRESS'), ('r2','ZOMATO','2','sentinel_name','sentinel_address')"
        )
        conn.execute(
            """INSERT INTO orders (id,account_id,platform,platform_order_id,order_timestamp,order_date,order_time,order_status,payment_method,final_amount_paid,item_subtotal,total_discount,delivery_fee,packaging_fee,platform_fee,total_tax,tip,other_charges,refund_amount,reconciliation_difference,financial_verified,source_bill_json,discount_breakdown_json) VALUES ('o','private','SWIGGY','1','2024-01-02T12:00:00+05:30','2024-01-02','12:00:00','delivered','upi',100,100,0,0,0,0,0,0,0,0,0,1,'{"item_total":"SENTINEL_PAYLOAD"}','{"food":1}')"""
        )
    output = profile(db)
    assert "orders: 1 rows" in output
    assert "Normalized restaurant duplicate groups: 1" in output
    assert "groups spanning platforms: 1" in output
    assert "Brief formula within INR 1: 1" in output
    assert "order_status DELIVERED: 1" in output
    assert "numeric offset': 1" in output
    assert "SENTINEL" not in output


def test_report_cannot_overwrite_database(tmp_path):
    import os

    import pytest

    from scripts.profile_data import write_profile

    db = tmp_path / "source.db"
    AnalyticsDB(db).init_db()
    before = db.read_bytes()
    with pytest.raises(ValueError, match="source database"):
        write_profile(db, db)
    alias = tmp_path / "alias.md"
    os.link(db, alias)
    with pytest.raises(ValueError, match="source database"):
        write_profile(db, alias)
    assert db.read_bytes() == before
