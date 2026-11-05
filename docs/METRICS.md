# Metrics and filters

All filters apply to orders. Empty lists mean no restriction, including an explicit
empty `statuses`; the default status is `DELIVERED`. Dates and amount bounds are
inclusive. City matches either the restaurant or delivery city; locality matches
the restaurant locality. Cuisine matches restaurant cuisine. Veg and cuisine predicates
match orders containing at least one matching item, independently. Search is a
literal, case-insensitive SQLite substring match on restaurant or item name.
`compare` is metadata for a caller and does not change the selected period.

Meal slots use local order time and half-open hours: breakfast 05–11, lunch
11–15, snack 15–18, dinner 18–22, late night 22–05. Weekend is Saturday and
Sunday. Invalid dates, reversed bounds, and non-finite amounts are rejected.

Orders counts all selected statuses; valid order count and spend include only
DELIVERED orders. AOV is spend / valid count. Discounts and advertised savings
are separate delivered-order sums, each with its own rate: amount / (spend +
amount) × 100. Fees are stored net delivery fee + packaging + platform fees;
the delivery fee discount is not subtracted again. Tax, tips, restaurants,
dishes and average non-null rating cover delivered orders in scope. Dish count
is distinct item names across those orders, including all their items. Refunds
sum all selected orders, including cancelled orders. Fee percentage is fees /
spend × 100. Zero denominators and absent ratings return null. Money and rates
are rounded to two decimals at the response boundary. Monthly counts cover the
selected scope; monthly spend covers delivered orders.

Monthly rounding remainder is assigned to the final month so the displayed
series reconciles to the rounded KPI when stored values have fractional paise.

