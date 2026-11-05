import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, JsonValue, field_validator, model_validator


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


class Metadata(BaseModel):
    filters_applied: Filters
    generated_at: datetime


class AccountOption(BaseModel):
    id: str
    label: str
    platforms: list[str]
    order_count: int
    date_from: str | None
    date_to: str | None


class RestaurantOption(BaseModel):
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


class ImportHealth(BaseModel):
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


class KPIs(BaseModel):
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


class Month(BaseModel):
    month: str | None
    orders: int
    spend: float


class CalendarDay(BaseModel):
    date: str | None
    orders: int
    spend: float


class KPIDeltas(BaseModel):
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


class Comparison(BaseModel):
    date_from: date
    date_to: date
    kpis: KPIs
    percent_change: KPIDeltas


class Charts(BaseModel):
    monthly: list[Month]
    calendar: list[CalendarDay]


class Dashboard(Metadata):
    kpis: KPIs
    charts: Charts
    comparison: Comparison | None
    data_complete: bool


class Order(BaseModel):
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


class Item(BaseModel):
    item_name: str
    quantity: int
    unit_price: float | None
    total_price: float | None
    is_veg: bool | None
    category: str | None


class Bill(BaseModel):
    order: Order
    items: list[Item]
    reconciliation_difference: float | None
    full_address: str | None
    source_bill: JsonValue = None
    discount_breakdown: JsonValue = None


class PriceMonth(BaseModel):
    month: str | None
    unit_price: float | None
    quantity: int


class Leader(BaseModel):
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


class SlimOrder(BaseModel):
    id: str
    order_date: str
    platform: str
    order_status: str
    final_amount_paid: float


class Slim(Metadata):
    rows: list[SlimOrder]
