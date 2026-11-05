import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Filters(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    date_from: date | None = None
    date_to: date | None = None
    account_ids: list[str] = Field(default_factory=list)
    platforms: list[str] = Field(default_factory=list)
    statuses: list[str] = Field(default_factory=lambda: ["DELIVERED"])
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
