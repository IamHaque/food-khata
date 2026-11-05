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

    # 14. Recent Orders Table (Last 50)
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
        LIMIT 50
        """,
        acc_params,
    )
    recent_orders = [dict(r) for r in c.fetchall()]
    conn.close()

    return {
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
    """Render a standalone, dark-themed responsive analytics dashboard with modern charts."""
    json_data = json.dumps(data, ensure_ascii=False)

    return f"""<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Food Khata - Unified Order Analytics</title>
  <!-- Tailwind CSS CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {{
      darkMode: 'class',
      theme: {{
        extend: {{
          colors: {{
            brand: {{
              50: '#fff7ed',
              500: '#f97316',
              600: '#ea580c',
              700: '#c2410c'
            }},
            swiggy: '#fc8019',
            zomato: '#e23744'
          }}
        }}
      }}
    }}
  </script>
  <!-- Chart.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body {{
      background-color: #0b0f19;
      color: #e2e8f0;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
    }}
    .glass-card {{
      background: rgba(17, 24, 39, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 1rem;
    }}
    .gradient-header {{
      background: linear-gradient(135deg, #f97316 0%, #ef4444 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }}
  </style>
</head>
<body class="min-h-screen p-4 md:p-8 space-y-8">
  <div class="max-w-7xl mx-auto space-y-8">
    
    <!-- Top Header & Navigation -->
    <header class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6 border-b border-gray-800">
      <div>
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-tr from-orange-500 to-red-500 flex items-center justify-center text-white text-xl font-black shadow-lg shadow-orange-500/20">
            FK
          </div>
          <h1 class="text-3xl font-extrabold tracking-tight gradient-header">Food Khata Analytics</h1>
        </div>
        <p class="text-sm text-gray-400 mt-1">Cross-platform food order intelligence (Swiggy & Zomato)</p>
      </div>

      <!-- Controls: Account & Filter -->
      <div class="flex flex-wrap items-center gap-3">
        <label for="accountSelect" class="text-xs uppercase font-bold text-gray-500">Account:</label>
        <select id="accountSelect" onchange="switchAccount(this.value)" class="bg-gray-800/90 text-sm font-medium text-white px-3 py-2 rounded-lg border border-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-500">
          <option value="">All Accounts (Household Combined)</option>
        </select>
        <button onclick="window.location.reload()" class="bg-gray-800 hover:bg-gray-700 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-700 text-gray-300 transition">
          ↺ Refresh
        </button>
      </div>
    </header>

    <!-- Key Performance Indicator Cards -->
    <section class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="glass-card p-5">
        <span class="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Delivered Spend</span>
        <div id="kpiSpend" class="text-3xl font-extrabold text-white mt-1">₹0</div>
        <div id="kpiAttempted" class="text-xs text-gray-500 mt-1">Total attempted: ₹0</div>
      </div>
      <div class="glass-card p-5">
        <span class="text-xs font-bold text-emerald-400 uppercase tracking-wider">Total Savings</span>
        <div id="kpiSavings" class="text-3xl font-extrabold text-emerald-400 mt-1">₹0</div>
        <div id="kpiDiscountPct" class="text-xs text-emerald-500/80 mt-1">0% effective discount</div>
      </div>
      <div class="glass-card p-5">
        <span class="text-xs font-bold text-blue-400 uppercase tracking-wider">Delivered Orders</span>
        <div id="kpiOrders" class="text-3xl font-extrabold text-white mt-1">0</div>
        <div id="kpiAOV" class="text-xs text-gray-400 mt-1">Average Order Value: ₹0</div>
      </div>
      <div class="glass-card p-5">
        <span class="text-xs font-bold text-orange-400 uppercase tracking-wider">Platform Split</span>
        <div class="flex items-center gap-4 mt-2">
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-swiggy"></span>
            <span id="kpiSwiggy" class="text-sm font-bold text-white">0%</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="w-3 h-3 rounded-full bg-zomato"></span>
            <span id="kpiZomato" class="text-sm font-bold text-white">0%</span>
          </div>
        </div>
        <div id="kpiFeeNote" class="text-xs text-gray-500 mt-1">Free delivery savings tracked</div>
      </div>
    </section>

    <!-- Head-to-Head Platform Comparison -->
    <section class="glass-card p-6">
      <h2 class="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <span>⚔️ Platform Battle: Swiggy vs Zomato</span>
      </h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Swiggy Card -->
        <div class="p-5 rounded-xl bg-orange-950/20 border border-orange-500/20">
          <div class="flex items-center justify-between pb-3 border-b border-orange-500/10">
            <span class="text-lg font-black text-swiggy">Swiggy</span>
            <span id="swiggyOrdersBadge" class="text-xs font-semibold px-2 py-1 rounded bg-orange-500/20 text-orange-300">0 orders</span>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <span class="text-xs text-gray-400">Total Spend</span>
              <div id="swiggySpend" class="text-xl font-bold text-white">₹0</div>
            </div>
            <div>
              <span class="text-xs text-gray-400">Average Order</span>
              <div id="swiggyAOV" class="text-xl font-bold text-white">₹0</div>
            </div>
            <div>
              <span class="text-xs text-emerald-400">Coupons & Promo Savings</span>
              <div id="swiggySavings" class="text-lg font-bold text-emerald-400">₹0</div>
            </div>
            <div>
              <span class="text-xs text-gray-400">Delivery Fees Paid</span>
              <div id="swiggyDelivery" class="text-lg font-bold text-gray-300">₹0</div>
            </div>
          </div>
        </div>

        <!-- Zomato Card -->
        <div class="p-5 rounded-xl bg-red-950/20 border border-red-500/20">
          <div class="flex items-center justify-between pb-3 border-b border-red-500/10">
            <span class="text-lg font-black text-zomato">Zomato</span>
            <span id="zomatoOrdersBadge" class="text-xs font-semibold px-2 py-1 rounded bg-red-500/20 text-red-300">0 orders</span>
          </div>
          <div class="grid grid-cols-2 gap-4 mt-4">
            <div>
              <span class="text-xs text-gray-400">Total Spend</span>
              <div id="zomatoSpend" class="text-xl font-bold text-white">₹0</div>
            </div>
            <div>
              <span class="text-xs text-gray-400">Average Order</span>
              <div id="zomatoAOV" class="text-xl font-bold text-white">₹0</div>
            </div>
            <div>
              <span class="text-xs text-emerald-400">Coupons & Promo Savings</span>
              <div id="zomatoSavings" class="text-lg font-bold text-emerald-400">₹0</div>
            </div>
            <div>
              <span class="text-xs text-gray-400">Delivery Fees Paid</span>
              <div id="zomatoDelivery" class="text-lg font-bold text-gray-300">₹0</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Spending Trends & Timeline -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4">Monthly Spend Curve (₹)</h3>
        <div class="h-64">
          <canvas id="monthlyChart"></canvas>
        </div>
      </div>
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4">Dietary & Cuisine Split</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 h-64">
          <div>
            <canvas id="vegChart"></canvas>
          </div>
          <div>
            <canvas id="cuisineChart"></canvas>
          </div>
        </div>
      </div>
    </section>

    <!-- Ordering Habits & Fee Evolution -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4">Meal Time Slot Distribution</h3>
        <div class="h-64">
          <canvas id="mealSlotChart"></canvas>
        </div>
      </div>
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4">Hidden Fee Creep Evolution</h3>
        <div class="h-64">
          <canvas id="feeCreepChart"></canvas>
        </div>
      </div>
    </section>

    <!-- Favorites: Top Restaurants and Most Ordered Dishes -->
    <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Top Restaurants -->
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4 flex items-center justify-between">
          <span>Top Favorite Restaurants</span>
          <span class="text-xs text-gray-500 font-normal">Ranked by frequency</span>
        </h3>
        <div id="restaurantList" class="space-y-3 overflow-y-auto max-h-80 pr-1"></div>
      </div>

      <!-- Top Dishes -->
      <div class="glass-card p-6">
        <h3 class="text-base font-bold text-white mb-4 flex items-center justify-between">
          <span>Top Ordered Dishes</span>
          <span class="text-xs text-gray-500 font-normal">Ranked by volume</span>
        </h3>
        <div id="dishList" class="space-y-3 overflow-y-auto max-h-80 pr-1"></div>
      </div>
    </section>

    <!-- Recent Orders Log Table -->
    <section class="glass-card p-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
        <h3 class="text-base font-bold text-white">Recent Order History (Last 50)</h3>
        <input type="text" id="orderSearch" onkeyup="filterOrdersTable()" placeholder="Search dishes, restaurants..." class="bg-gray-800 text-xs px-3 py-1.5 rounded-lg border border-gray-700 text-gray-200 focus:outline-none focus:ring-1 focus:ring-orange-500 w-full sm:w-64">
      </div>
      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs text-gray-300">
          <thead class="bg-gray-800/60 uppercase text-gray-400 font-bold border-b border-gray-700">
            <tr>
              <th class="py-3 px-4">Date & Time</th>
              <th class="py-3 px-4">Platform</th>
              <th class="py-3 px-4">Restaurant</th>
              <th class="py-3 px-4">Items</th>
              <th class="py-3 px-4">Status</th>
              <th class="py-3 px-4">Amount</th>
              <th class="py-3 px-4">Saved</th>
            </tr>
          </thead>
          <tbody id="ordersTableBody" class="divide-y divide-gray-800/60"></tbody>
        </table>
      </div>
    </section>

    <!-- Footer -->
    <footer class="text-center text-xs text-gray-600 py-6 border-t border-gray-800">
      Food Khata • Generated locally from SQLite database • Zero cloud telemetry
    </footer>
  </div>

  <script>
    const analytics = {json_data};

    // Populate Account Selector
    const accSelect = document.getElementById('accountSelect');
    analytics.accounts.forEach(acc => {{
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = `Account ...${{acc.phone.slice(-4)}} (${{acc.phone}})`;
      if (analytics.selected_account === acc.id) opt.selected = true;
      accSelect.appendChild(opt);
    }});

    function switchAccount(accId) {{
      const url = new URL(window.location);
      if (accId) {{
        url.searchParams.set('account', accId);
      }} else {{
        url.searchParams.delete('account');
      }}
      window.location = url.toString();
    }}

    // Format Currency
    const inr = n => '₹' + Number(n || 0).toLocaleString('en-IN');

    // Populate Macro KPIs
    const m = analytics.macro;
    document.getElementById('kpiSpend').textContent = inr(m.delivered_spend);
    document.getElementById('kpiAttempted').textContent = `Total attempted: ${{inr(m.total_attempted_spend)}}`;
    document.getElementById('kpiSavings').textContent = inr(m.total_savings);
    document.getElementById('kpiDiscountPct').textContent = `${{m.effective_discount_pct || 0}}% effective discount`;
    document.getElementById('kpiOrders').textContent = (m.delivered_orders || 0).toLocaleString();
    document.getElementById('kpiAOV').textContent = `Average Order Value: ${{inr(m.aov)}}`;

    // Platform Battle
    const sw = analytics.platforms.SWIGGY || {{}};
    const zm = analytics.platforms.ZOMATO || {{}};
    const totalDeliv = (sw.delivered_orders || 0) + (zm.delivered_orders || 0);
    const swPct = totalDeliv ? Math.round(((sw.delivered_orders || 0) / totalDeliv) * 100) : 0;
    const zmPct = totalDeliv ? Math.round(((zm.delivered_orders || 0) / totalDeliv) * 100) : 0;
    document.getElementById('kpiSwiggy').textContent = `${{swPct}}% Swiggy`;
    document.getElementById('kpiZomato').textContent = `${{zmPct}}% Zomato`;

    document.getElementById('swiggyOrdersBadge').textContent = `${{sw.delivered_orders || 0}} orders`;
    document.getElementById('swiggySpend').textContent = inr(sw.spend);
    document.getElementById('swiggyAOV').textContent = inr(sw.aov);
    document.getElementById('swiggySavings').textContent = inr(sw.savings);
    document.getElementById('swiggyDelivery').textContent = inr(sw.delivery_paid);

    document.getElementById('zomatoOrdersBadge').textContent = `${{zm.delivered_orders || 0}} orders`;
    document.getElementById('zomatoSpend').textContent = inr(zm.spend);
    document.getElementById('zomatoAOV').textContent = inr(zm.aov);
    document.getElementById('zomatoSavings').textContent = inr(zm.savings);
    document.getElementById('zomatoDelivery').textContent = inr(zm.delivery_paid);

    // Monthly Spend Chart
    const months = analytics.monthly_timeline.map(x => x.month);
    const swiggyMonthly = analytics.monthly_timeline.map(x => x.swiggy_spend || 0);
    const zomatoMonthly = analytics.monthly_timeline.map(x => x.zomato_spend || 0);

    new Chart(document.getElementById('monthlyChart'), {{
      type: 'bar',
      data: {{
        labels: months,
        datasets: [
          {{ label: 'Swiggy', data: swiggyMonthly, backgroundColor: '#fc8019' }},
          {{ label: 'Zomato', data: zomatoMonthly, backgroundColor: '#e23744' }}
        ]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        scales: {{
          x: {{ stacked: true, grid: {{ color: 'rgba(255,255,255,0.05)' }} }},
          y: {{ stacked: true, grid: {{ color: 'rgba(255,255,255,0.05)' }} }}
        }},
        plugins: {{ legend: {{ labels: {{ color: '#94a3b8' }} }} }}
      }}
    }});

    // Veg vs Non-Veg Donut
    const vegData = analytics.veg_split;
    new Chart(document.getElementById('vegChart'), {{
      type: 'doughnut',
      data: {{
        labels: vegData.map(v => v.category),
        datasets: [{{
          data: vegData.map(v => v.total_spent),
          backgroundColor: ['#22c55e', '#ef4444', '#a855f7']
        }}]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
          title: {{ display: true, text: 'Dietary Spend', color: '#cbd5e1' }},
          legend: {{ position: 'bottom', labels: {{ color: '#94a3b8', boxWidth: 12 }} }}
        }}
      }}
    }});

    // Cuisines Doughnut
    const cuisines = analytics.cuisines;
    new Chart(document.getElementById('cuisineChart'), {{
      type: 'doughnut',
      data: {{
        labels: cuisines.slice(0, 6).map(c => c.cuisine),
        datasets: [{{
          data: cuisines.slice(0, 6).map(c => c.total_spent),
          backgroundColor: ['#f97316', '#3b82f6', '#ec4899', '#14b8a6', '#8b5cf6', '#eab308']
        }}]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        plugins: {{
          title: {{ display: true, text: 'Top Cuisines', color: '#cbd5e1' }},
          legend: {{ position: 'bottom', labels: {{ color: '#94a3b8', boxWidth: 10 }} }}
        }}
      }}
    }});

    // Meal Slots
    const mealSlots = analytics.meal_slots;
    new Chart(document.getElementById('mealSlotChart'), {{
      type: 'bar',
      data: {{
        labels: mealSlots.map(m => m.meal_slot),
        datasets: [{{
          label: 'Orders',
          data: mealSlots.map(m => m.orders),
          backgroundColor: '#3b82f6'
        }}]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        scales: {{
          x: {{ grid: {{ display: false }} }},
          y: {{ grid: {{ color: 'rgba(255,255,255,0.05)' }} }}
        }},
        plugins: {{ legend: {{ display: false }} }}
      }}
    }});

    // Platform Fee Creep
    const feeYears = [...new Set(analytics.platform_fees.map(f => f.year))].sort();
    const swiggyFees = feeYears.map(y => {{
      const found = analytics.platform_fees.find(f => f.year === y && f.platform === 'SWIGGY');
      return found ? found.avg_platform_fee : 0;
    }});
    const zomatoFees = feeYears.map(y => {{
      const found = analytics.platform_fees.find(f => f.year === y && f.platform === 'ZOMATO');
      return found ? found.avg_platform_fee : 0;
    }});

    new Chart(document.getElementById('feeCreepChart'), {{
      type: 'line',
      data: {{
        labels: feeYears,
        datasets: [
          {{ label: 'Swiggy Avg Platform Fee (₹)', data: swiggyFees, borderColor: '#fc8019', tension: 0.3, fill: false }},
          {{ label: 'Zomato Avg Platform Fee (₹)', data: zomatoFees, borderColor: '#e23744', tension: 0.3, fill: false }}
        ]
      }},
      options: {{
        responsive: true,
        maintainAspectRatio: false,
        scales: {{
          x: {{ grid: {{ color: 'rgba(255,255,255,0.05)' }} }},
          y: {{ grid: {{ color: 'rgba(255,255,255,0.05)' }} }}
        }},
        plugins: {{ legend: {{ labels: {{ color: '#94a3b8' }} }} }}
      }}
    }});

    // Populate Top Restaurants
    const rContainer = document.getElementById('restaurantList');
    analytics.top_restaurants.forEach((r, idx) => {{
      const color = r.platform === 'SWIGGY' ? 'text-orange-400 bg-orange-500/10' : 'text-red-400 bg-red-500/10';
      const el = document.createElement('div');
      el.className = 'flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="w-6 text-center font-bold text-gray-500">${{idx + 1}}</span>
          <div>
            <div class="font-bold text-white text-sm">${{r.name}}</div>
            <div class="text-xs text-gray-400">${{r.locality || 'Locality'}} • ${{r.visits}} visits</div>
          </div>
        </div>
        <div class="text-right">
          <div class="font-bold text-white text-sm">${{inr(r.total_spent)}}</div>
          <span class="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded ${{color}}">${{r.platform}}</span>
        </div>
      `;
      rContainer.appendChild(el);
    }});

    // Populate Top Dishes
    const dContainer = document.getElementById('dishList');
    analytics.top_dishes.forEach((d, idx) => {{
      const vegDot = d.is_veg === 1 ? '🟢' : (d.is_veg === 0 ? '🔴' : '⚪');
      const el = document.createElement('div');
      el.className = 'flex items-center justify-between p-2.5 rounded-lg bg-gray-800/40 border border-gray-800 hover:border-gray-700 transition';
      el.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="w-6 text-center font-bold text-gray-500">${{idx + 1}}</span>
          <div>
            <div class="font-bold text-white text-sm capitalize">${{vegDot}} ${{d.dish}}</div>
            <div class="text-xs text-gray-400">Ordered ${{d.times_ordered}} times • Avg ${{inr(d.avg_price)}}</div>
          </div>
        </div>
        <div class="text-right font-bold text-white text-sm">${{inr(d.total_spent)}}</div>
      `;
      dContainer.appendChild(el);
    }});

    // Populate Recent Orders Table
    const tbody = document.getElementById('ordersTableBody');
    analytics.recent_orders.forEach(o => {{
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-gray-800/40 transition';
      const badge = o.platform === 'SWIGGY' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400';
      const statusColor = o.order_status === 'DELIVERED' ? 'text-emerald-400' : 'text-gray-400';
      tr.innerHTML = `
        <td class="py-2.5 px-4 font-mono text-xs text-gray-400">${{o.order_date}}<br><span class="text-[10px] text-gray-500">${{o.order_time}}</span></td>
        <td class="py-2.5 px-4"><span class="px-2 py-0.5 rounded font-bold text-[10px] ${{badge}}">${{o.platform}}</span></td>
        <td class="py-2.5 px-4 font-medium text-white">${{o.restaurant_name || '-'}}</td>
        <td class="py-2.5 px-4 text-gray-300 max-w-xs truncate" title="${{o.items_summary || ''}}">${{o.items_summary || '-'}}</td>
        <td class="py-2.5 px-4 font-semibold ${{statusColor}}">${{o.order_status}}</td>
        <td class="py-2.5 px-4 font-bold text-white">${{inr(o.final_amount_paid)}}</td>
        <td class="py-2.5 px-4 font-semibold text-emerald-400">${{o.total_discount > 0 ? inr(o.total_discount) : '-'}}</td>
      `;
      tbody.appendChild(tr);
    }});

    function filterOrdersTable() {{
      const term = document.getElementById('orderSearch').value.toLowerCase();
      const rows = tbody.getElementsByTagName('tr');
      for (let i = 0; i < rows.length; i++) {{
        const text = rows[i].textContent.toLowerCase();
        rows[i].style.display = text.includes(term) ? '' : 'none';
      }}
    }}
  </script>
</body>
</html>"""


def generate_dashboard(
    db_path: Path | str | None = None,
    output_path: Path | str | None = None,
    account_id: str | None = None,
) -> Path:
    """Read analytics from SQLite DB and generate self-contained HTML dashboard file."""
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
