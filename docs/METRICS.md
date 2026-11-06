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


Dashboard calendar counts selected orders and sums delivered spend by date.
Comparisons retain all non-date filters. Previous period is the disjoint inclusive
interval of equal length; previous year shifts each endpoint back one year,
clamping leap day to February 28. Missing bounds come from the filtered scope.
Percent changes are relative to the baseline and null when it is zero or absent.
Calendar rounding remainder is assigned to its final bucket to match rounded spend. Unrepresentable prior dates or invalid derived bounds return no comparison rather than failing the dashboard.

Overview waterfall uses delivered order components, with food discount negative and a
residual to match provider paid. Refunds are shown separately and are not subtracted.
Restaurant totals use order sums; dish totals use item sums. Platform savings are
advertised savings, distinct from explicit discounts. Monthly fee totals exclude tax
and reconcile to the fees KPI; the rounding remainder is shown as a separate adjustment in the final month.
Insights require at least five delivered orders.

Behavior counts use selected statuses; spend includes delivered orders only. Hour/weekday and meal rows require valid local dates and times; day type and gaps require valid dates. Hour-weekday keys are Monday-based weekday × 24 + hour. More than 80% missing required values sets the corresponding unavailable reason. Histogram lower bounds are 0, 100, 250, 500 and 1000, with the first bin also including negative values. Gaps are between consecutive orders, including same-day zero gaps; streaks count consecutive distinct order dates. Orders per week uses the inclusive observed date span.

Places groups scoped orders by normalized delivery label and city; spend and net delivery fee include delivered orders. Distance uses straight-line Haversine kilometers; over 80% invalid coordinates suppresses the distance series.

Restaurant KPI identity uses normalized name and locality; listing mode remains available in the leaderboard. Cuisine comes from restaurant cuisine. Diet uses item quantities and line totals; unknown values remain distinct. New/repeat restaurant orders use the first observed valid order in the same non-date scope, so changing date bounds does not redefine a repeat as new. Rolling 30-day spend uses the selected scope and includes the current day and preceding 29 calendar days. Invalid dates remain in KPIs and are reported as unallocated spend. Monthly KPI history reuses the central metric function; waterfall baselines and heights are server-owned.
