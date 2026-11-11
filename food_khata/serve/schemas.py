import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator


class ResponseModel(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    date_from: date | None = None
    date_to: date | None = None
    account_ids: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(
        default_factory=lambda: ["DELIVERED"],
        description="Repeat for multiple statuses; statuses= selects all statuses.",
    )
    cities: list[str] = Field(default_factory=list)
    localities: list[str] = Field(default_factory=list)
    restaurant_ids: list[str] = Field(default_factory=list)
    cuisines: list[str] = Field(default_factory=list)
    veg: Literal["all", "veg", "nonveg", "unknown"] = "all"
    payment_methods: list[str] = Field(default_factory=list)
    amount_min: float | None = None
    amount_max: float | None = None
    meal_slots: list[Literal["breakfast", "lunch", "snack", "dinner", "late_night"]] = Field(
        default_factory=list
    )
    day_type: Literal["all", "weekday", "weekend"] = "all"
    verified_only: bool = False
    anomaly: Literal["all", "review"] = "all"
    search: str | None = None
    compare: Literal["none", "previous_period", "previous_year"] = "none"

    @field_validator("date_from", "date_to", mode="before")
    @classmethod
    def iso_date(cls, value):
        if value is None or (isinstance(value, date) and not isinstance(value, datetime)):
            return value
        if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            raise ValueError("date must be an ISO YYYY-MM-DD date")
        return value

    @model_validator(mode="after")
    def ordered_bounds(self):
        if self.date_from and self.date_to and self.date_from > self.date_to:
            raise ValueError("date_from must not be after date_to")
        if self.amount_min is not None and self.amount_max is not None:
            if self.amount_min > self.amount_max:
                raise ValueError("amount_min must not exceed amount_max")
        return self


class Metadata(ResponseModel):
    filters_applied: Filters
    generated_at: datetime


class AccountOption(ResponseModel):
    id: str
    label: str
    platforms: list[str]
    order_count: int
    date_from: str | None
    date_to: str | None


class RestaurantOption(ResponseModel):
    id: str
    name: str


class FilterOptions(Metadata):
    accounts: list[AccountOption]
    all_accounts: list[AccountOption]
    restaurants: list[RestaurantOption]
    platforms: list[str]
    statuses: list[str]
    cities: list[str]
    localities: list[str]
    cuisines: list[str]
    payment_methods: list[str]
    date_from: str | None
    date_to: str | None
    amount_min: float | None
    amount_max: float | None


class ImportHealth(ResponseModel):
    account_id: str
    platform: str
    history_complete: bool
    details_complete: bool


class Health(Metadata):
    imports: list[ImportHealth]
    history_complete: bool
    details_complete: bool
    verified_percent: float | None
    null_rates: dict[str, float | None]
    duplicate_orders: int
    reconciliation_anomalies: int
    note: str


class KPIs(ResponseModel):
    orders: int
    valid_order_count: int
    spend: float
    aov: float | None
    total_discount: float
    reported_savings: float
    discount_rate: float | None
    reported_savings_rate: float | None
    fees: float
    fee_percentage: float | None
    tax: float
    tips: float
    refunds: float
    unique_restaurants: int
    unique_dishes: int
    average_rating: float | None


class Month(ResponseModel):
    month: str | None
    orders: int
    spend: float


class CalendarDay(ResponseModel):
    date: str | None
    orders: int
    spend: float


class KPIDeltas(ResponseModel):
    orders: float | None
    valid_order_count: float | None
    spend: float | None
    aov: float | None
    total_discount: float | None
    reported_savings: float | None
    discount_rate: float | None
    reported_savings_rate: float | None
    fees: float | None
    fee_percentage: float | None
    tax: float | None
    tips: float | None
    refunds: float | None
    unique_restaurants: float | None
    unique_dishes: float | None
    average_rating: float | None


class Comparison(ResponseModel):
    date_from: date
    date_to: date
    kpis: KPIs
    percent_change: KPIDeltas


class Waterfall(ResponseModel):
    subtotal: float
    food_discount: float
    net_delivery: float
    packaging: float
    platform: float
    tax: float
    tip: float
    other: float
    residual: float
    provider_paid: float
    refunds: float


class ChartLeader(ResponseModel):
    key: str
    name: str
    quantity: int
    amount: float


class PlatformChart(ResponseModel):
    platform: str
    orders: int
    spend: float
    discounts: float
    advertised_savings: float
    fees: float


class FeeMonth(ResponseModel):
    month: str | None
    order_count: int
    net_delivery: float
    packaging: float
    platform: float
    tax: float
    total_fees: float
    rounding_adjustment: float


class InsightPatch(ResponseModel):
    platforms: list[str] = []
    restaurant_ids: list[str] = []


class Insight(ResponseModel):
    key: Literal["most_frequent_platform", "top_restaurant", "fee_percentage"]
    text: str
    value: str
    filter_patch: InsightPatch


class BehaviorRow(ResponseModel):
    key: str
    orders: int
    spend: float


class HistogramRow(ResponseModel):
    key: str
    orders: int


class GapRow(ResponseModel):
    days: int
    orders: int


class Behavior(ResponseModel):
    timing_unavailable_reason: str | None
    date_unavailable_reason: str | None
    hour_weekday: list[BehaviorRow]
    meals: list[BehaviorRow]
    day_type: list[BehaviorRow]
    aov_histogram: list[HistogramRow]
    gaps: list[GapRow]
    longest_streak: int | None
    longest_gap: int | None
    orders_per_week: float | None


class PlaceLabel(ResponseModel):
    label: str
    city: str
    orders: int
    spend: float
    fee: float


class PlaceDistance(ResponseModel):
    distance_km: float
    fee: float


class Places(ResponseModel):
    labels: list[PlaceLabel]
    distances: list[PlaceDistance]
    distance_unavailable_reason: str | None
    unsupported_reason: str | None


class CuisineRow(ResponseModel):
    name: str
    orders: int
    spend: float


class DietRow(ResponseModel):
    diet: str
    item_lines: int
    quantity: int
    line_total: float


class LoyaltyRow(ResponseModel):
    key: str
    name: str
    orders: int
    spend: float
    aov: float


class VisitMonth(ResponseModel):
    month: str
    new_orders: int
    repeat_orders: int


class DietMonth(ResponseModel):
    month: str
    veg: int
    non_veg: int
    unknown: int


class FoodCharts(ResponseModel):
    diet_monthly: list[DietMonth] = []
    cuisines: list[CuisineRow]
    diet: list[DietRow]
    loyalty: list[LoyaltyRow]
    new_repeat: list[VisitMonth]
    cuisine_unavailable_reason: str | None
    diet_unavailable_reason: str | None
    orders_without_dates: int


class DailySpend(ResponseModel):
    date: str
    spend: float
    cumulative: float
    rolling_30: float


class YearSpend(ResponseModel):
    year: int
    month: int
    spend: float


class FeeScatter(ResponseModel):
    amount: float
    fees: float
    fee_percent: float | None


class DiscountItem(ResponseModel):
    label: str
    amount: float


class SpendingCharts(ResponseModel):
    discount_breakdown: list[DiscountItem] = []
    daily: list[DailySpend]
    years: list[YearSpend]
    fee_scatter: list[FeeScatter]
    unallocated_spend: float


class MonthKPIs(KPIs):
    month: str


class WaterfallStep(ResponseModel):
    label: str
    amount: float
    baseline: float
    height: float
    direction: Literal["up", "down", "total"]


class Charts(ResponseModel):
    kpi_history: list[MonthKPIs]
    waterfall_steps: list[WaterfallStep]
    food: FoodCharts
    spending: SpendingCharts
    places: Places
    behavior: Behavior
    monthly: list[Month]
    calendar: list[CalendarDay]
    cost_waterfall: Waterfall
    top_restaurants: list[ChartLeader]
    top_dishes: list[ChartLeader]
    platforms: list[PlatformChart]
    monthly_fee_components: list[FeeMonth]
    insights: list[Insight]


Section = Literal["overview", "spending", "food", "behavior", "places"]


class DashboardRequest(Filters):
    """Filters plus the optional sections the page needs; unlisted sections come back empty (C-2, additive)."""

    sections: list[Section] | None = None


class Dashboard(Metadata):
    kpis: KPIs
    charts: Charts
    comparison: Comparison | None
    data_complete: bool


class Order(ResponseModel):
    fees: float
    id: str
    account_label: str
    account_id: str
    platform_order_id: str
    order_timestamp: str
    order_time: str
    payment_method: str | None
    user_rating: float | None
    food_discount: float | None
    delivery_fee_discount: float | None
    other_charges: float | None
    source_complete: bool
    reconciliation_difference: float | None
    platform: str
    order_date: str
    order_status: str
    restaurant_name: str | None
    address_label: str | None
    city: str | None
    items_summary: str | None
    final_amount_paid: float
    item_subtotal: float | None
    total_discount: float | None
    reported_savings: float | None
    delivery_fee: float | None
    packaging_fee: float | None
    platform_fee: float | None
    total_tax: float | None
    tip: float | None
    refund_amount: float | None
    financial_verified: bool


class Orders(Metadata):
    rows: list[Order]
    total: int
    page: int
    page_size: int
    filtered_total_amount: float


class Item(ResponseModel):
    item_name: str
    quantity: int
    unit_price: float | None
    total_price: float | None
    is_veg: bool | None
    category: str | None


class Bill(ResponseModel):
    discount_items: list[DiscountItem]
    reconciliation_label: str
    reconciliation_status: Literal["matches", "off", "unknown"]
    order: Order
    items: list[Item]
    reconciliation_difference: float | None
    full_address: str | None
    source_bill: JsonValue = None
    discount_breakdown: JsonValue = None


class PriceMonth(ResponseModel):
    month: str | None
    unit_price: float | None
    quantity: int


class Leader(ResponseModel):
    key: str
    price_trend: list[PriceMonth] = []
    name: str
    quantity: int
    amount: float


class Leaders(Metadata):
    rows: list[Leader]
    total: int
    page: int
    page_size: int


class SlimOrder(ResponseModel):
    id: str
    order_date: str
    platform: str
    order_status: str
    final_amount_paid: float


class Slim(Metadata):
    rows: list[SlimOrder]
    truncated: bool = False



