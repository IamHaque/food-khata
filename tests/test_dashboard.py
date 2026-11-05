"""Unit tests for the Food Khata visual dashboard generator."""

from pathlib import Path

from food_khata.dashboard import fetch_analytics, generate_dashboard, render_dashboard_html
from food_khata.db import AnalyticsDB


def test_fetch_analytics_and_render_dashboard(tmp_path: Path):
    db_file = tmp_path / "test_analytics.db"
    db = AnalyticsDB(db_file)

    # Ingest mock orders
    swiggy_order = {
        "history": {"orderStatus": "Delivered", "orderTotal": 150},
        "details": {
            "orders": [
                {
                    "order_id": "sw_101",
                    "order_time": "2026-10-01 13:00:00",
                    "order_status": "Delivered",
                    "order_total": 150,
                    "item_total": 200,
                    "order_discount": 50,
                    "order_delivery_charge": 10,
                    "restaurant_name": "Burger Spot",
                    "order_items": [{"name": "Classic Burger", "quantity": 1, "final_price": 150}],
                }
            ]
        },
    }

    zomato_order = {
        "history": {"top_container": {"title": "Pizza Spot"}},
        "details": {
            "id": "zm_202",
            "created_at_str": "2026-10-05 20:00:00",
            "current_status": "DELIVERED",
            "restaurant": {"id": 999, "name": "Pizza Spot"},
            "order": {
                "total_cost": 300,
                "items": [
                    {
                        "item": {
                            "type": "dish",
                            "item_name": "Veggie Pizza",
                            "quantity": 1,
                            "total_cost": 280,
                            "tag_slugs": ["veg"],
                        }
                    },
                    {
                        "item": {
                            "type": "charge",
                            "item_name": "Delivery Charge",
                            "total_cost": 20,
                        }
                    },
                ],
            },
        },
    }

    with db.connection() as conn:
        cursor = conn.cursor()
        db.ingest_swiggy_order(cursor, "acc-1", "sw_101", swiggy_order)
        db.ingest_zomato_order(cursor, "acc-1", "zm_202", zomato_order)
        conn.commit()

    analytics = fetch_analytics(db_file)
    assert analytics["macro"]["delivered_orders"] == 2
    assert analytics["macro"]["delivered_spend"] == 450.0
    assert "SWIGGY" in analytics["platforms"]
    assert "ZOMATO" in analytics["platforms"]
    assert len(analytics["top_restaurants"]) == 2
    assert len(analytics["top_dishes"]) == 2

    html = render_dashboard_html(analytics)
    assert "<!DOCTYPE html>" in html
    assert "Chart.js" in html or "chart.js" in html
    assert "Food Khata Analytics" in html
    assert "Burger Spot" in html
    assert "Pizza Spot" in html

    out_file = tmp_path / "dashboard.html"
    result_path = generate_dashboard(db_file, out_file)
    assert result_path.exists()
    assert result_path.stat().st_size > 0


def test_complete_history_and_safe_embedded_data(tmp_path: Path):
    db_file = tmp_path / "history.db"
    db = AnalyticsDB(db_file)
    with db.connection() as conn:
        conn.executemany(
            "INSERT INTO accounts VALUES (?, ?, ?)", [("first", "1", "1"), ("other", "2", "2")]
        )
        for i in range(55):
            conn.execute(
                "INSERT INTO orders (id, account_id, platform, platform_order_id, "
                "order_timestamp, order_date, order_time, order_status, final_amount_paid) "
                "VALUES (?, ?, 'SWIGGY', ?, '2026-01-01T12:00:00', '2026-01-01', "
                "'12:00:00', 'DELIVERED', 10)",
                (str(i), "other" if i == 54 else "first", str(i)),
            )
        conn.execute(
            "INSERT INTO order_items (order_id, item_name, quantity) VALUES (?, ?, 1)",
            ("54", "</script><script>alert(1)</script>"),
        )
        conn.commit()

    analytics = fetch_analytics(db_file, account_id="first")
    assert len(analytics["orders"]) == 55
    assert len(analytics["recent_orders"]) == 54
    other = next(order for order in analytics["orders"] if order["account_id"] == "other")
    assert other["items"][0]["item_name"].startswith("</script>")
    html = render_dashboard_html(analytics)
    assert "</script><script>alert(1)</script>" not in html
    assert r"\u003c/script>" in html
    assert "textContent" in html


def test_client_filters_and_pagination():
    import shutil
    import subprocess

    node = shutil.which("node")
    if not node:
        return
    data = {
        "accounts": [{"id": "a", "phone": "1"}, {"id": "b", "phone": "2"}],
        "orders": [
            {
                "id": str(i),
                "account_id": "a" if i < 30 else "b",
                "order_date": "2026-01-01",
                "order_time": "12:00:00",
                "order_status": "DELIVERED",
                "platform": "SWIGGY",
                "final_amount_paid": 10,
                "total_discount": 2,
                "reported_savings": 3,
                "financial_verified": 1 if i == 0 else 0,
                "items": [],
            }
            for i in range(35)
        ],
    }
    data["orders"][1]["order_status"] = "CANCELLED"
    data["archive_imports"] = [
        {
            "account_id": "a",
            "platform": "SWIGGY",
            "history_complete": 1,
            "details_complete": 1,
            "lifetime_complete": 0,
        }
    ]
    html = render_dashboard_html(data)
    script = html.split("</script><script>")[-1].split("</script>")[0]
    import json

    mock = r"""
class Element {
  constructor() { this.children=[]; this.value=''; this.dataset={}; this.disabled=false; }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children=[...nodes]; }
  get firstChild() { return this.children[0]; }
  addEventListener() {}
  showModal() {}
  close() {}
}
const elements={};
const document={getElementById(id) { return elements[id] ||= new Element(); },
  createElement() { return new Element(); }, querySelectorAll() { return []; }};
elements['analytics-data']=new Element();
elements['analytics-data'].textContent=DATA;
elements.interval=new Element(); elements.interval.value='month';
elements.measure=new Element(); elements.measure.value='spend';
const chartData={};
class Chart { constructor(element, config) { chartData[element.id]=config; } destroy() {} }
const oldGet=document.getElementById; document.getElementById=function(id) { const e=oldGet(id); e.id=id; return e; };
""".replace("DATA;", json.dumps(json.dumps(data)) + ";")
    checks = r"""
if (selected().length !== 35 || $('rows').children.length !== 25) throw Error('full history');
if ($('spend').textContent !== '₹340' || $('saved').textContent !== '₹2' || $('advertised').textContent !== '₹102') throw Error('financial totals');
if (chartData.platformChart.data.datasets[0].data[0] !== 340) throw Error('cancelled spend');
$('measure').value='orders'; render();
if (chartData.platformChart.data.datasets[0].data[0] !== 35) throw Error('all order counts');
if (!$('coverage').textContent.includes('Lifetime coverage unconfirmed')) throw Error('coverage');
$('qualityFilter').value='unverified';
if (selected().length !== 34) throw Error('quality filter');
$('qualityFilter').value='';
$('account').value='b'; page=0; render();
if (selected().length !== 5 || $('rows').children.length !== 5) throw Error('account filter');
$('from').value='2027-01-01'; render();
if (selected().length !== 0) throw Error('date filter');
"""
    subprocess.run([node, "-e", mock + script + checks], check=True, capture_output=True, text=True)
