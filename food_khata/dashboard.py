"""Pure Python generator for interactive food order history visual dashboard."""

import json
import sqlite3
import webbrowser
from pathlib import Path
from typing import Any

from .db import DEFAULT_DB_PATH

DEFAULT_DASHBOARD_PATH = DEFAULT_DB_PATH.parent / "dashboard.html"


def fetch_analytics(db_path: Path | str, account_id: str | None = None) -> dict[str, Any]:
    """Execute aggregation queries across orders, restaurants, addresses, and line items."""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    acc_filter = "WHERE account_id = ?" if account_id else ""
    acc_params = (account_id,) if account_id else ()

    # 1. Accounts summary
    c.execute("SELECT id, phone, local_id FROM accounts ORDER BY phone ASC;")
    accounts = [dict(r) for r in c.fetchall()]

    # 2. Macro KPIs
    where_clause = (
        f"{acc_filter} AND order_status = 'DELIVERED'"
        if acc_filter
        else "WHERE order_status = 'DELIVERED'"
    )
    c.execute(
        f"""
        SELECT 
            COUNT(*) as total_orders,
            COUNT(CASE WHEN order_status = 'DELIVERED' THEN 1 END) as delivered_orders,
            COUNT(CASE WHEN order_status = 'CANCELLED' THEN 1 END) as cancelled_orders,
            COUNT(CASE WHEN order_status = 'PAYMENT_INCOMPLETE' THEN 1 END) as incomplete_orders,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid ELSE 0 END), 2) as delivered_spend,
            ROUND(SUM(final_amount_paid), 2) as total_attempted_spend,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_discount ELSE 0 END), 2) as total_savings,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee_discount ELSE 0 END), 2) as total_delivery_saved,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee ELSE 0 END), 2) as total_delivery_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN platform_fee ELSE 0 END), 2) as total_platform_fees,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN packaging_fee ELSE 0 END), 2) as total_packaging_fees,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_tax ELSE 0 END), 2) as total_taxes_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN item_subtotal ELSE 0 END), 2) as gross_food_cost,
            MIN(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END) as min_spend,
            MAX(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END) as max_spend
        FROM orders
        {acc_filter}
        """,
        acc_params,
    )
    macro = dict(c.fetchone() or {})
    deliv_orders = macro.get("delivered_orders") or 0
    deliv_spend = macro.get("delivered_spend") or 0.0
    tot_savings = macro.get("total_savings") or 0.0
    macro["aov"] = round(deliv_spend / deliv_orders, 2) if deliv_orders else 0.0
    macro["effective_discount_pct"] = (
        round((tot_savings / (deliv_spend + tot_savings)) * 100, 1)
        if (deliv_spend + tot_savings) > 0
        else 0.0
    )

    # 3. Platform Breakdown (Head-to-Head)
    c.execute(
        f"""
        SELECT 
            platform,
            COUNT(*) as total_orders,
            COUNT(CASE WHEN order_status = 'DELIVERED' THEN 1 END) as delivered_orders,
            COUNT(CASE WHEN order_status != 'DELIVERED' THEN 1 END) as failed_orders,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid ELSE 0 END), 2) as spend,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN total_discount ELSE 0 END), 2) as savings,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee ELSE 0 END), 2) as delivery_paid,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN delivery_fee_discount ELSE 0 END), 2) as delivery_saved,
            ROUND(SUM(CASE WHEN order_status = 'DELIVERED' THEN platform_fee ELSE 0 END), 2) as platform_fees,
            ROUND(AVG(CASE WHEN order_status = 'DELIVERED' THEN final_amount_paid END), 2) as aov,
            ROUND(AVG(CASE WHEN order_status = 'DELIVERED' THEN discount_percentage END), 1) as avg_discount_pct
        FROM orders
        {acc_filter}
        GROUP BY platform
        """,
        acc_params,
    )
    platforms = {r["platform"]: dict(r) for r in c.fetchall()}

    # 4. Monthly Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 7) as month,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov,
            ROUND(SUM(total_discount), 2) as savings,
            ROUND(SUM(CASE WHEN platform = 'SWIGGY' THEN final_amount_paid ELSE 0 END), 2) as swiggy_spend,
            ROUND(SUM(CASE WHEN platform = 'ZOMATO' THEN final_amount_paid ELSE 0 END), 2) as zomato_spend
        FROM orders
        {where_clause}
        GROUP BY month
        ORDER BY month ASC
        """,
        acc_params,
    )
    monthly_timeline = [dict(r) for r in c.fetchall()]

    # 5. Yearly Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 4) as year,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov,
            ROUND(SUM(total_discount), 2) as savings,
            COUNT(CASE WHEN platform = 'SWIGGY' THEN 1 END) as swiggy_orders,
            COUNT(CASE WHEN platform = 'ZOMATO' THEN 1 END) as zomato_orders
        FROM orders
        {where_clause}
        GROUP BY year
        ORDER BY year ASC
        """,
        acc_params,
    )
    yearly_timeline = [dict(r) for r in c.fetchall()]

    # 6. 7x24 Ordering Density Matrix (Day of week x Hour)
    c.execute(
        f"""
        SELECT 
            CAST(STRFTIME('%w', order_date) AS INT) as dow,
            CAST(SUBSTR(order_time, 1, 2) AS INT) as hour,
            COUNT(*) as count,
            ROUND(SUM(final_amount_paid), 2) as spend
        FROM orders
        {where_clause}
        GROUP BY dow, hour
        ORDER BY dow ASC, hour ASC
        """,
        acc_params,
    )
    heatmap_raw = [dict(r) for r in c.fetchall()]

    # 7. Meal Slot Habits
    c.execute(
        f"""
        SELECT 
            CASE
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 6 AND 10 THEN 'Breakfast (6am-11am)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 11 AND 15 THEN 'Lunch (11am-4pm)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 16 AND 18 THEN 'Snacks (4pm-7pm)'
                WHEN CAST(SUBSTR(order_time, 1, 2) AS INT) BETWEEN 19 AND 23 THEN 'Dinner (7pm-12am)'
                ELSE 'Late Night (12am-6am)'
            END AS meal_slot,
            COUNT(*) as orders,
            ROUND(SUM(final_amount_paid), 2) as spend,
            ROUND(AVG(final_amount_paid), 2) as aov
        FROM orders
        {where_clause}
        GROUP BY meal_slot
        ORDER BY orders DESC
        """,
        acc_params,
    )
    meal_slots = [dict(r) for r in c.fetchall()]

    # 8. Veg vs Non-Veg Consumption
    c.execute(
        f"""
        SELECT 
            CASE oi.is_veg
                WHEN 1 THEN 'Vegetarian'
                WHEN 0 THEN 'Non-Vegetarian'
                ELSE 'Bakery / Other'
            END AS category,
            COUNT(DISTINCT oi.item_name) as unique_dishes,
            SUM(oi.quantity) as total_qty,
            ROUND(SUM(oi.total_price), 2) as total_spent
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY oi.is_veg
        ORDER BY total_spent DESC
        """,
        acc_params,
    )
    veg_split = [dict(r) for r in c.fetchall()]

    # 9. Cuisine Breakdown
    c.execute(
        f"""
        SELECT 
            COALESCE(oi.category, 'Other Delicacies') as cuisine,
            COUNT(DISTINCT oi.item_name) as unique_dishes,
            SUM(oi.quantity) as total_qty,
            ROUND(SUM(oi.total_price), 2) as total_spent
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY cuisine
        ORDER BY total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    cuisines = [dict(r) for r in c.fetchall()]

    # 10. Top 10 Favorite Restaurants
    c.execute(
        f"""
        SELECT 
            r.name,
            r.platform,
            r.locality,
            COUNT(o.id) as visits,
            ROUND(SUM(o.final_amount_paid), 2) as total_spent,
            ROUND(AVG(o.final_amount_paid), 2) as aov
        FROM orders o
        JOIN restaurants r ON o.restaurant_id = r.id
        {where_clause}
        GROUP BY r.name, r.platform
        ORDER BY visits DESC, total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    top_restaurants = [dict(r) for r in c.fetchall()]

    # 11. Top 10 Most Ordered Dishes
    c.execute(
        f"""
        SELECT 
            LOWER(TRIM(oi.item_name)) as dish,
            oi.is_veg,
            SUM(oi.quantity) as times_ordered,
            ROUND(SUM(oi.total_price), 2) as total_spent,
            ROUND(AVG(oi.unit_price), 2) as avg_price
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        {where_clause}
        GROUP BY LOWER(TRIM(oi.item_name)), oi.is_veg
        ORDER BY times_ordered DESC, total_spent DESC
        LIMIT 10
        """,
        acc_params,
    )
    top_dishes = [dict(r) for r in c.fetchall()]

    # 12. Delivery Locations
    c.execute(
        f"""
        SELECT 
            da.normalized_label as label,
            COUNT(o.id) as orders,
            ROUND(SUM(o.final_amount_paid), 2) as spend,
            ROUND(AVG(o.final_amount_paid), 2) as aov,
            ROUND(SUM(o.total_discount), 2) as savings
        FROM orders o
        JOIN delivery_addresses da ON o.delivery_address_id = da.id
        {where_clause}
        GROUP BY da.normalized_label
        ORDER BY spend DESC
        """,
        acc_params,
    )
    delivery_locations = [dict(r) for r in c.fetchall()]

    # 13. Platform Fee Evolution Timeline
    c.execute(
        f"""
        SELECT 
            SUBSTR(order_date, 1, 4) as year,
            platform,
            COUNT(*) as orders,
            ROUND(AVG(platform_fee), 2) as avg_platform_fee,
            ROUND(MAX(platform_fee), 2) as max_platform_fee,
            ROUND(AVG(delivery_fee), 2) as avg_deliv_paid,
            ROUND(AVG(delivery_fee_discount), 2) as avg_deliv_saved
        FROM orders
        {where_clause}
        GROUP BY year, platform
        ORDER BY year ASC, platform ASC
        """,
        acc_params,
    )
    platform_fees_creep = [dict(r) for r in c.fetchall()]

    # 14. Orders table
    c.execute(
        f"""
        SELECT 
            o.id,
            o.platform,
            o.order_date,
            o.order_time,
            o.order_status,
            o.payment_method,
            o.final_amount_paid,
            o.total_discount,
            r.name as restaurant_name,
            da.normalized_label as location_label,
            (
                SELECT GROUP_CONCAT(oi.quantity || 'x ' || oi.item_name, ', ')
                FROM order_items oi WHERE oi.order_id = o.id
            ) as items_summary
        FROM orders o
        LEFT JOIN restaurants r ON o.restaurant_id = r.id
        LEFT JOIN delivery_addresses da ON o.delivery_address_id = da.id
        {acc_filter}
        ORDER BY o.order_timestamp DESC
        """,
        acc_params,
    )
    recent_orders = [dict(r) for r in c.fetchall()]
    # Keep the complete dataset in the generated file so account switching works offline.
    orders = [
        dict(row) for row in conn.execute("SELECT * FROM orders ORDER BY order_timestamp DESC")
    ]
    restaurants = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM restaurants")}
    addresses = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM delivery_addresses")}
    items = {}
    for row in conn.execute("SELECT * FROM order_items ORDER BY id"):
        item = dict(row)
        items.setdefault(item["order_id"], []).append(item)
    for order in orders:
        order["restaurant"] = restaurants.get(order.get("restaurant_id"))
        order["address"] = addresses.get(order.get("delivery_address_id"))
        order["items"] = items.get(order["id"], [])
    archive_imports = []
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='archive_imports'"
    ).fetchone():
        archive_imports = [dict(row) for row in conn.execute("SELECT * FROM archive_imports")]
    conn.close()

    return {
        "archive_imports": archive_imports,
        "orders": orders,
        "accounts": accounts,
        "selected_account": account_id,
        "macro": macro,
        "platforms": platforms,
        "monthly_timeline": monthly_timeline,
        "yearly_timeline": yearly_timeline,
        "heatmap": heatmap_raw,
        "meal_slots": meal_slots,
        "veg_split": veg_split,
        "cuisines": cuisines,
        "top_restaurants": top_restaurants,
        "top_dishes": top_dishes,
        "locations": delivery_locations,
        "platform_fees": platform_fees_creep,
        "recent_orders": recent_orders,
    }


def render_dashboard_html(data: dict[str, Any]) -> str:
    """Render the complete dataset in an interactive local dashboard."""
    json_data = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")
    return r"""<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Food Khata Analytics</title>
<script src="https://cdn.tailwindcss.com"></script>
<!-- Chart.js --><script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root{color-scheme:light;--ink:#292824;--muted:#77756e;--line:#e8e5dd;--accent:#a76542;--paper:#f8f7f3}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:14px/1.5 system-ui,sans-serif}header{background:#292824;color:#fff;padding:24px max(5vw,24px)}header small,.eyebrow{text-transform:uppercase;letter-spacing:.15em;font-size:10px;font-weight:700;color:#b6a99d}h1{font:normal 32px Georgia,serif;margin:5px 0}header p{margin:0;color:#c7c3ba}main{max-width:1500px;margin:auto;padding:28px max(4vw,20px)}h2{font:normal 24px Georgia,serif;margin:0}h3{font-size:15px;margin:0}.muted{color:var(--muted)}.section{margin-top:30px}.section-head{display:flex;align-items:end;justify-content:space-between;gap:14px;margin-bottom:15px}.filters,.cards,.grid{display:grid;gap:12px}.filters{grid-template-columns:repeat(auto-fit,minmax(145px,1fr));padding:18px;background:#fff;border:1px solid var(--line);border-radius:12px}.field{display:grid;gap:5px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}input,select,button{font:inherit;color:var(--ink);border:1px solid #dedbd3;border-radius:7px;background:#fff;padding:9px;min-width:0}button{cursor:pointer}button:hover{border-color:var(--accent)}button:focus-visible,input:focus-visible,select:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.cards{grid-template-columns:repeat(auto-fit,minmax(160px,1fr));margin-top:18px}.card,.panel{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px}.card strong{display:block;font:normal 29px Georgia,serif;margin-top:8px}.card span{font-size:12px;color:var(--muted)}.grid{grid-template-columns:repeat(2,minmax(0,1fr))}.hour-grid{display:grid;grid-template-columns:32px repeat(24,minmax(10px,1fr));gap:3px;font-size:9px;overflow:auto;padding-top:15px}.hour-grid span{padding:3px 0;text-align:center;border-radius:3px}.chart{height:270px;margin-top:16px}.controls{display:flex;gap:8px;flex-wrap:wrap}.list{max-height:350px;overflow:auto;margin-top:12px}.line{display:flex;justify-content:space-between;gap:15px;padding:11px 0;border-bottom:1px solid var(--line)}.line:last-child{border:0}.line small{display:block;color:var(--muted)}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;white-space:nowrap;text-align:left}th,td{padding:12px;border-bottom:1px solid var(--line)}th button{border:0;padding:0;font-size:11px;text-transform:uppercase;color:var(--muted);font-weight:700}td button{border:0;color:var(--accent);padding:0;text-align:left}td:nth-child(4){max-width:260px;overflow:hidden;text-overflow:ellipsis}.pagination{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:14px}dialog{border:0;border-radius:14px;box-shadow:0 15px 80px #0003;max-width:700px;width:calc(100% - 32px);max-height:90vh;padding:26px}dialog::backdrop{background:#1c1b18aa}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 20px}.detail-grid div{padding:8px 0;border-bottom:1px solid var(--line);overflow-wrap:anywhere}.detail-grid small{display:block;color:var(--muted)}.detail-grid pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}footer{padding:30px 0;color:var(--muted);font-size:12px}.empty{color:var(--muted);padding:16px 0}@media(max-width:700px){.grid{grid-template-columns:1fr}.section-head{align-items:start;flex-direction:column}.detail-grid{grid-template-columns:1fr}main{padding:20px 16px}header{padding:22px 16px}}
</style></head><body><header><small>Your food story</small><h1>Food Khata Analytics</h1><p>A thoughtful look at every order, all in one place.</p></header><main>
<section><div class="section-head"><div><span class="eyebrow">Explore your history</span><h2>The overview</h2></div><button id="reset">Reset filters</button></div><div class="filters">
<label class="field">Customer<select id="account"><option value="">All customers</option></select></label><label class="field">From<input id="from" type="date"></label><label class="field">To<input id="to" type="date"></label><label class="field">Platform<select id="platform"></select></label><label class="field">Status<select id="status"></select></label><label class="field">Restaurant<select id="restaurant"></select></label><label class="field">Location<select id="location"></select></label><label class="field">Payment<select id="payment"></select></label><label class="field">Quality<select id="qualityFilter"><option value="">All records</option><option value="unverified">Unverified financials</option><option value="missingDate">Missing date</option><option value="missingAddress">Missing address</option><option value="missingItems">Missing items</option></select></label></div>
<div class="cards"><div class="card"><span>Orders</span><strong id="count">0</strong><span>Matching orders</span></div><div class="card"><span>Delivered spend</span><strong id="spend">₹0</strong><span>Delivered orders only</span></div><div class="card"><span>Verified savings</span><strong id="saved">₹0</strong><span>Delivered, verified discounts</span></div><div class="card"><span>Unverified discounts</span><strong id="unverified">₹0</strong><span>Delivered · financials unverified</span></div><div class="card"><span>Advertised savings</span><strong id="advertised">₹0</strong><span>Reported by platform · may overlap</span></div><div class="card"><span>Average order</span><strong id="average">₹0</strong><span>Delivered orders only</span></div><div class="card"><span>Fees &amp; tax</span><strong id="fees">₹0</strong><span>Delivered orders</span></div><div class="card"><span>Refunds</span><strong id="refunds">₹0</strong><span>All matching orders</span></div></div></section>
<section class="section"><div class="section-head"><div><span class="eyebrow">Over time</span><h2>Your ordering rhythm</h2></div><div class="controls flex flex-wrap gap-2"><label><span class="muted">Interval </span><select id="interval"><option value="day">Day</option><option value="week">Week</option><option value="month" selected>Month</option><option value="year">Year</option></select></label><label><span class="muted">Measure </span><select id="measure"><option value="spend">Spend</option><option value="orders">Orders</option><option value="savings">Explicit discounts</option></select></label></div></div><div class="grid"><div class="panel"><h3>Timeline</h3><div class="muted">Orders: all statuses · spend and savings: delivered only · empty periods shown</div><div id="dateMessage" class="muted" role="status"></div><div class="chart"><canvas id="timeline"></canvas></div></div><div class="panel"><h3>By platform</h3><div class="muted">Orders: all statuses · spend and savings: delivered only</div><div class="chart"><canvas id="platformChart"></canvas></div></div><div class="panel"><h3>Orders by weekday and hour</h3><div class="muted">Matching orders · local order time</div><div class="chart"><div id="hours" class="hour-grid"></div></div></div><div class="panel"><h3>Fee composition</h3><div class="muted">Delivered orders</div><div class="chart"><canvas id="feeChart"></canvas></div></div><div class="panel"><h3>Order value distribution</h3><div class="muted">Delivered orders</div><div class="chart"><canvas id="distribution"></canvas></div></div><div class="panel"><h3>Food categories</h3><div class="muted">Inferred from item names · delivered items</div><div class="chart"><canvas id="cuisineChart"></canvas></div></div><div class="panel"><h3>Dietary mix</h3><div class="muted">Item quantity · source tags or name inference</div><div class="chart"><canvas id="dietChart"></canvas></div></div><div class="panel"><h3>Data quality</h3><div class="muted">Counts among matching orders</div><div id="coverage" class="muted"></div><div class="list" id="quality"></div></div></div></section>
<section class="section"><div class="section-head"><div><span class="eyebrow">The favourites</span><h2>Places & dishes</h2></div><input id="rankSearch" type="search" placeholder="Search places or dishes" aria-label="Search places or dishes"></div><div class="grid"><div class="panel"><h3>Restaurants</h3><div class="muted">Ranked by orders</div><div class="list" id="restaurants"></div></div><div class="panel"><h3>Dishes</h3><div class="muted">Ranked by item quantity</div><div class="list" id="dishes"></div></div><div class="panel"><h3>Delivery locations</h3><div class="muted">Grouped labels and their raw address variants</div><div class="list" id="locations"></div></div></div></section>
<section class="section panel"><div class="section-head"><div><span class="eyebrow">Every order</span><h2>Order history</h2></div><input id="search" type="search" placeholder="Search all order details" aria-label="Search order history"></div><div class="table-wrap"><table><thead><tr><th><button data-sort="order_date">Date ↕</button></th><th><button data-sort="platform">Platform ↕</button></th><th><button data-sort="restaurant">Restaurant ↕</button></th><th>Items</th><th><button data-sort="order_status">Status ↕</button></th><th><button data-sort="final_amount_paid">Amount ↕</button></th><th>Details</th></tr></thead><tbody id="rows"></tbody></table></div><div class="pagination"><span id="pageInfo" class="muted"></span><div class="controls"><button id="prev">Previous</button><button id="next">Next</button></div></div></section><footer>Food Khata · Generated from your local database</footer></main>
<dialog id="drawer"><div class="section-head"><div><span class="eyebrow">Order details</span><h2 id="detailTitle"></h2></div><button id="close">Close</button></div><div id="details"></div></dialog>
<script id="analytics-data" type="application/json">__DATA__</script><script>
const analytics=JSON.parse(document.getElementById('analytics-data').textContent), all=analytics.orders||[], $=id=>document.getElementById(id), money=n=>'₹'+Number(n||0).toLocaleString('en-IN',{maximumFractionDigits:2}), value=(o,k)=>k==='restaurant'?(o.restaurant?.name||'Unknown'):k==='location'?(o.address?.normalized_label||'Unknown'):({status:o.order_status,payment:o.payment_method,platform:o.platform}[k]||'Unknown');

const node=(tag,text,cls)=>{const e=document.createElement(tag);

  if(text!==undefined)e.textContent=String(text);

  if(cls)e.className=cls;

  return e};

const filterIds=['account','from','to','platform','status','restaurant','location','payment','qualityFilter'];

analytics.accounts.forEach(a=>{const opt=node('option',a.phone||a.local_id||a.id);
opt.value=a.id;

  $('account').append(opt)});

  $('account').value=analytics.selected_account||'';

for(const key of ['platform','status','restaurant','location','payment']){const select=$(key);
select.append(node('option','All '+key+'s'));
select.firstChild.value='';
[...new Set(all.map(o=>value(o,key)))].sort().forEach(v=>{const opt=node('option',v);
opt.value=v;
select.append(opt)})}
let page=0,sort='order_date',descending=true,charts={};

  const pageSize=25;

const qualityTests = {unverified:o=>o.financial_verified !== 1, missingDate:o=>!o.order_date, missingAddress:o=>!o.address?.full_address, missingItems:o=>!o.items?.length};
function selected(){return all.filter(o=>(!$('account').value||o.account_id===$('account').value)&&(!$('qualityFilter').value||qualityTests[$('qualityFilter').value](o))&&(!$('from').value||o.order_date>=$('from').value)&&(!$('to').value||o.order_date<=$('to').value)&&['platform','status','restaurant','location','payment'].every(k=>!$(k).value||value(o,k)===$(k).value))}
function addLine(parent,title,subtitle,right){const row=node('div',undefined,'line'),left=node('div');
left.append(node('strong',title));

  if(subtitle)left.append(node('small',subtitle));
row.append(left,node('span',right));
parent.append(row)}
function chart(id,type,labels,datasets){if(charts[id])charts[id].destroy();

  if(typeof Chart==='undefined')return;
charts[id]=new Chart($(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:datasets.length>1}},scales:type==='doughnut'?{}:{y:{beginAtZero:true,grid:{color:'#eeeae3'}},x:{grid:{display:false}}}}})}
function dateKey(date,interval){const d=new Date(date+'T00:00:00');

  if(interval==='week')d.setDate(d.getDate()-(d.getDay()+6)%7);

  if(interval==='month')d.setDate(1);

  if(interval==='year')d.setMonth(0,1);

  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')}
function increment(d,interval){if(interval==='day')d.setDate(d.getDate()+1);
else if(interval==='week')d.setDate(d.getDate()+7);
else if(interval==='month')d.setMonth(d.getMonth()+1);
else d.setFullYear(d.getFullYear()+1)}
function renderCharts(orders) {
  const interval = $('interval').value, measure = $('measure').value;

  const validDate = d => /^\d{4}-\d\d-\d\d$/.test(d || '') && !Number.isNaN(new Date(d + 'T00:00:00').getTime());

  const valid = orders.filter(o => validDate(o.order_date));

  const dates = all.filter(o => !$('account').value || o.account_id === $('account').value)
    .map(o => o.order_date).filter(validDate).sort();

  const today = new Date();

  const todayKey = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');

  const start = $('from').value || dates[0] || todayKey, end = $('to').value || todayKey;

  const buckets = new Map();

  const span = (new Date(end+'T00:00:00') - new Date(start+'T00:00:00')) / 86400000;

  $('dateMessage').textContent = start > end ? 'The start date must be on or before the end date.' :
    span > 36525 ? 'Choose a date range of 100 years or less to display the timeline.' : '';

  if (start <= end && span <= 36525) {
    const d = new Date(dateKey(start, interval)+'T00:00:00'), last = dateKey(end, interval);

    while (true) {
      const key = [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');

      if (key > last) break;

      buckets.set(key, 0);

      increment(d, interval);

    }
  }
  const amount = o => measure === 'orders' ? 1 : o.order_status !== 'DELIVERED' ? 0 :
    measure === 'savings' ? Number(o.total_discount || 0) : Number(o.final_amount_paid || 0);

  const platforms = new Map(), heat = Array.from({length:7},()=>Array(24).fill(0));

  valid.forEach(o => {
    const k = dateKey(o.order_date, interval);

    if (buckets.has(k)) buckets.set(k, buckets.get(k) + amount(o));

    platforms.set(o.platform, (platforms.get(o.platform)||0) + amount(o));

    const h = Number((o.order_time||'').slice(0,2)), day = new Date(o.order_date+'T00:00:00').getDay();

    if (o.order_time && h >= 0 && h < 24) heat[day][h]++;

  });

  chart('timeline','line',[...buckets.keys()],[{label:measure,data:[...buckets.values()],borderColor:'#a76542',backgroundColor:'#a7654233',pointRadius:0,tension:.2,fill:true}]);

  chart('platformChart','bar',[...platforms.keys()],[{label:measure,data:[...platforms.values()],backgroundColor:'#bd896d'}]);

  const heatGrid = $('hours');
  heatGrid.replaceChildren(node('span',''));
  for (let hour=0; hour<24; hour++) heatGrid.append(node('span',hour));
  const maxHeat = Math.max(1,...heat.flat());
  heat.forEach((values,day) => {
    heatGrid.append(node('span',['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]));
    values.forEach((count,hour) => {
      const cell=node('span',count||'·');
      cell.title=`${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][day]} ${hour}:00 — ${count} orders`;
      cell.className=count/maxHeat>.66?'bg-orange-700 text-white':count/maxHeat>.33?'bg-orange-300':count?'bg-orange-100':'bg-stone-100';
      heatGrid.append(cell);
    });
  });

  const delivered = orders.filter(o => o.order_status === 'DELIVERED');

  const categories=new Map(), diet=[0,0,0];
  delivered.forEach(o => (o.items||[]).forEach(i => {
    const quantity=Number(i.quantity||0), category=i.category||'Unknown';
    categories.set(category,(categories.get(category)||0)+quantity);
    diet[i.is_veg===1?0:i.is_veg===0?1:2]+=quantity;
  }));
  chart('cuisineChart','bar',[...categories.keys()],[{label:'Item quantity',data:[...categories.values()],backgroundColor:'#8e9990'}]);
  chart('dietChart','doughnut',['Vegetarian','Non-vegetarian','Unknown'],[{label:'Item quantity',data:diet,backgroundColor:['#8e9990','#a76542','#ddd8cf']}]);

  const feeFields = ['delivery_fee','platform_fee','packaging_fee','total_tax','tip','other_charges'];

  chart('feeChart','doughnut',['Delivery','Platform','Packaging','Tax','Tip','Other'],[{label:'Amount',data:feeFields.map(k => delivered.reduce((s,o)=>s+Number(o[k]||0),0)),backgroundColor:['#a76542','#c6967c','#d5b6a3','#8e9990','#b2b7aa','#77756e']}]);

  const distribution = [0,0,0,0,0];

  delivered.forEach(o => { const n=Number(o.final_amount_paid||0);
 distribution[n<200?0:n<400?1:n<600?2:n<1000?3:4]++;
 });

  chart('distribution','bar',['Below ₹200','₹200–399','₹400–599','₹600–999','₹1,000+'],[{label:'Orders',data:distribution,backgroundColor:'#bd896d'}]);

}
function rankings(delivered) {
  const restaurants=new Map(),dishes=new Map(),locations=new Map();
delivered.forEach(o=>{const name=value(o,'restaurant'),r=restaurants.get(name)||{count:0,spend:0};
r.count++;
r.spend+=Number(o.final_amount_paid||0);
restaurants.set(name,r);
(o.items||[]).forEach(i=>{const name=i.item_name||'Unknown',key=name.trim().toLowerCase(),d=dishes.get(key)||{name,count:0,spend:0};
d.count+=Number(i.quantity||0);
d.spend+=Number(i.total_price||0);
dishes.set(key,d)});

  const label=value(o,'location'),l=locations.get(label)||{count:0,variants:new Set()};
l.count++;

  if(o.address)l.variants.add([o.address.label,o.address.full_address].filter(Boolean).join(' · '));
locations.set(label,l)});

  const term=$('rankSearch').value.toLowerCase();

  for(const id of ['restaurants','dishes','locations'])$(id).replaceChildren();
[...restaurants].sort((a,b)=>b[1].count-a[1].count).filter(([n])=>n.toLowerCase().includes(term)).forEach(([n,r])=>addLine($('restaurants'),n,r.count+' orders',money(r.spend)));
[...dishes.values()].sort((a,b)=>b.count-a.count).filter(d=>d.name.toLowerCase().includes(term)).forEach(d=>addLine($('dishes'),d.name,d.count+' items',money(d.spend)));
[...locations].sort((a,b)=>b[1].count-a[1].count).filter(([n,l])=>(n+' '+[...l.variants].join(' ')).toLowerCase().includes(term)).forEach(([n,l])=>addLine($('locations'),n,[...l.variants].join(' | '),l.count+' orders'));

  for(const id of ['restaurants','dishes','locations'])if(!$(id).children.length)$(id).append(node('div','No matching records','empty'))}
function details(o) {
  $('detailTitle').textContent=o.platform_order_id||o.id;

  const target=$('details');
target.replaceChildren();
function group(title,obj){target.append(node('h3',title));

  const grid=node('div',undefined,'detail-grid');
Object.entries(obj||{}).forEach(([k,v])=>{const cell=node('div');

  let shown=v;
 if(k.endsWith('_json') && v) { try { shown=JSON.stringify(JSON.parse(v),null,2);
 } catch {} } cell.append(node('small',k.replaceAll('_',' ')),node(k.endsWith('_json')?'pre':'span',shown===null||shown===undefined?'—':shown));
grid.append(cell)});
target.append(grid)}const {restaurant,address,items,...fields}=o;
group('Order',fields);
group('Restaurant',restaurant);
group('Delivery address',address);
(items||[]).forEach((item,i)=>group('Item '+(i+1),item));

  if(!(items||[]).length)target.append(node('p','No items recorded','muted'));

  $('drawer').showModal()}
function renderTable(orders) {
  const term=$('search').value.toLowerCase(),filtered=orders.filter(o=>JSON.stringify(o).toLowerCase().includes(term));
filtered.sort((a,b)=>{let x=sort==='restaurant'?value(a,'restaurant'):a[sort],y=sort==='restaurant'?value(b,'restaurant'):b[sort];

  return (typeof x==='number'&&typeof y==='number'?x-y:String(x||'').localeCompare(String(y||'')))*(descending?-1:1)});
page=Math.min(page,Math.max(0,Math.ceil(filtered.length/pageSize)-1));

  $('rows').replaceChildren();
filtered.slice(page*pageSize,(page+1)*pageSize).forEach(o=>{const tr=node('tr');
[o.order_date+' '+(o.order_time||''),o.platform,value(o,'restaurant'),(o.items||[]).map(i=>i.quantity+' × '+i.item_name).join(', '),o.order_status,money(o.final_amount_paid)].forEach(v=>tr.append(node('td',v||'—')));

  const td=node('td'),button=node('button','View');
button.addEventListener('click',()=>details(o));
td.append(button);
tr.append(td);

  $('rows').append(tr)});

  $('pageInfo').textContent=filtered.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,filtered.length)} of ${filtered.length} orders`:'No matching orders';

  $('prev').disabled=page===0;

  $('next').disabled=(page+1)*pageSize>=filtered.length}
function render() {
  const orders = selected(), delivered = orders.filter(o => o.order_status === 'DELIVERED');

  const sum = (rows, key) => rows.reduce((total,o) => total + Number(o[key]||0),0);

  const spend = sum(delivered,'final_amount_paid');

  $('count').textContent = orders.length;

  $('spend').textContent = money(spend);

  $('saved').textContent = money(sum(delivered.filter(o => o.financial_verified === 1),'total_discount'));

  $('unverified').textContent = money(sum(delivered.filter(o => o.financial_verified !== 1),'total_discount'));
  $('advertised').textContent = money(sum(delivered,'reported_savings'));

  $('average').textContent = money(delivered.length ? spend / delivered.length : 0);

  $('fees').textContent = money(['delivery_fee','platform_fee','packaging_fee','total_tax','tip','other_charges'].reduce((total,k)=>total+sum(delivered,k),0));

  $('refunds').textContent = money(sum(orders,'refund_amount'));

  const coverage = (analytics.archive_imports || []).filter(a =>
    (!$('account').value || a.account_id === $('account').value) &&
    (!$('platform').value || a.platform === $('platform').value));
  $('coverage').textContent = coverage.length ?
    `${coverage.filter(a=>a.history_complete===1).length}/${coverage.length} archives have complete imported history; ${coverage.filter(a=>a.details_complete===1).length}/${coverage.length} have complete details. ${coverage.every(a=>a.lifetime_complete===1) ? 'Lifetime coverage confirmed.' : 'Lifetime coverage unconfirmed.'}` :
    'Archive coverage unavailable; lifetime coverage unconfirmed.';
  $('quality').replaceChildren();

  [
    ['Missing restaurant',o=>!o.restaurant],
    ['Missing delivery address',o=>!o.address?.full_address],
    ['Missing order date',o=>!o.order_date],
    ['Missing items',o=>!o.items?.length],
    ['Unknown payment',o=>!o.payment_method||o.payment_method==='Unknown'],
    ['Source incomplete or unknown',o=>o.source_complete !== 1],
    ['Financials unverified or unknown',o=>o.financial_verified !== 1],
    ['Reconciliation unavailable',o=>o.reconciliation_difference == null],
    ['Reconciliation difference',o=>o.reconciliation_difference != null && Math.abs(Number(o.reconciliation_difference)) > 1]
  ].forEach(([label,test])=>addLine($('quality'),label,'',orders.filter(test).length));

  renderCharts(orders);

  rankings(delivered);

  renderTable(orders);

}
filterIds.forEach(id=>$(id).addEventListener('change',()=>{page=0;

  render()}));
['interval','measure'].forEach(id=>$(id).addEventListener('change',render));

  $('rankSearch').addEventListener('input',()=>rankings(selected().filter(o=>o.order_status==='DELIVERED')));

  $('search').addEventListener('input',()=>{page=0;
renderTable(selected())});
document.querySelectorAll('[data-sort]').forEach(b=>b.addEventListener('click',()=>{descending=sort===b.dataset.sort?!descending:false;
sort=b.dataset.sort;
renderTable(selected())}));

  $('prev').onclick=()=>{page--;
renderTable(selected())};

  $('next').onclick=()=>{page++;
renderTable(selected())};

  $('close').onclick=()=>$('drawer').close();

  $('reset').onclick=()=>{filterIds.forEach(id=>$(id).value='');

  $('search').value='';

  $('rankSearch').value='';
page=0;

  render()};

  render();

</script></body></html>
""".replace("__DATA__", json_data)


def generate_dashboard(
    db_path: Path | str | None = None,
    output_path: Path | str | None = None,
    account_id: str | None = None,
) -> Path:
    """Generate a local HTML snapshot; chart and style assets load from CDNs."""
    path = Path(db_path) if db_path is not None else DEFAULT_DB_PATH
    out = Path(output_path) if output_path is not None else DEFAULT_DASHBOARD_PATH
    out.parent.mkdir(parents=True, exist_ok=True)

    data = fetch_analytics(path, account_id=account_id)
    html_content = render_dashboard_html(data)

    with out.open("w", encoding="utf-8") as f:
        f.write(html_content)

    return out


def open_dashboard(html_path: Path) -> None:
    """Open generated dashboard in user's default browser."""
    webbrowser.open(html_path.resolve().as_uri())
