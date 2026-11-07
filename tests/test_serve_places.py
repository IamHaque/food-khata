import sqlite3

from food_khata.serve.places import places
from food_khata.serve.schemas import Filters


def test_places_scope_and_coordinates():
    conn = sqlite3.connect(":memory:")
    conn.executescript("""
        CREATE TABLE orders (id, account_id, order_status, final_amount_paid, delivery_fee, restaurant_id, delivery_address_id);
        CREATE TABLE restaurants (id PRIMARY KEY, latitude, longitude);
        CREATE TABLE delivery_addresses (id PRIMARY KEY, normalized_label, city, latitude, longitude, full_address);
        CREATE TABLE order_items (order_id, is_veg);
        INSERT INTO restaurants VALUES ('r', 0, 0);
        INSERT INTO delivery_addresses VALUES ('d', NULL, 'City', 0, 1, 'SECRET ADDRESS');
        INSERT INTO orders VALUES ('1', 'a', 'DELIVERED', 100, 10, 'r', 'd');
        INSERT INTO orders VALUES ('2', 'b', 'DELIVERED', 200, 20, 'r', 'd');
        INSERT INTO order_items VALUES ('1', 1), ('1', 1);
    """)
    result = places(conn, Filters(account_ids=["a"], veg="veg"))
    assert result["labels"] == [
        {"label": "Unknown", "city": "City", "orders": 1, "spend": 100, "fee": 10}
    ]
    assert result["distances"] == [{"distance_km": 111.19, "fee": 10}]
    assert "SECRET ADDRESS" not in str(result)
    conn.execute("UPDATE delivery_addresses SET longitude=999")
    result = places(conn, Filters())
    assert result["distances"] == [] and result["distance_unavailable_reason"]
    assert places(conn, Filters(account_ids=["missing"]))["labels"] == []


pytest_plugins = ["test_serve_filters"]


def test_zero_distance_and_exact_missing_threshold(conn):
    conn.execute("UPDATE restaurants SET latitude=0,longitude=0")
    conn.execute(
        "INSERT INTO delivery_addresses (id,full_address,latitude,longitude) VALUES ('valid','SENTINEL',0,0),('missing','SENTINEL',NULL,NULL)"
    )
    conn.execute(
        "UPDATE orders SET account_id='a',order_status='DELIVERED',delivery_address_id='missing'"
    )
    for number in (4, 5):
        conn.execute(
            "INSERT INTO orders (id,account_id,platform,platform_order_id,order_timestamp,order_date,order_time,order_status,final_amount_paid,restaurant_id,delivery_address_id) VALUES (?,'a','SWIGGY',?,'2025-01-01T12:00:00','2025-01-01','12:00:00','DELIVERED',10,'r1','missing')",
            (str(number), str(number)),
        )
    conn.execute("UPDATE orders SET delivery_address_id='valid' WHERE id='1'")
    result = places(conn, Filters())
    assert result["distance_unavailable_reason"] is None
    assert result["distances"][0]["distance_km"] == 0
    assert len(result["distances"]) == 1
    assert "SENTINEL" not in str(result)
    conn.execute("UPDATE orders SET delivery_address_id='missing' WHERE id='1'")
    assert places(conn, Filters())["distance_unavailable_reason"]
