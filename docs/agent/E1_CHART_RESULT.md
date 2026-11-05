# E1-T6A result — incomplete

- Added typed calendar and comparison response models; comparisons include baseline KPIs and percentage changes.
- Synthetic test covers leap day, account isolation, multi-item order count, zero baseline and previous period.
- Full suite: 80 passed, 10 subtests passed; Ruff check and format passed.
- Remaining: waterfall, restaurant/dish leaders, platform/monthly fee components, insights, and broader edge/reconciliation tests.
- Behavior, food and places datasets remain for the next task.
- Root added rounding remainder and invalid/minimum date guards; three targeted calendar/comparison tests pass. No comparison is returned when derived bounds are invalid or prior range is unrepresentable.

