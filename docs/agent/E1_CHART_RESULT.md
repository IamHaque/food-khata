# E1 chart result

- Added separate monthly fee rounding adjustment; refunds remain separate from provider paid.
- Added top-restaurant and fee-percentage insights alongside platform, gated at five delivered orders.
- Dashboard rejects non-finite output before caching; synthetic recovery test passes.
- Full synthetic suite: 86 passed, 10 subtests passed, 1 warning; Ruff check and format passed before final schema default adjustment.
- Remaining: account-isolation coverage for every chart, multi-item order-count coverage, and empty/one/NULL coverage need expansion; finite safety outside dashboard is not verified.
- Behavior, Food and Places page work remains outside this task. No real database used; changes uncommitted.
Root final verification:87tests+10subtests/Ruff pass, including expanded account/multiitem/NULL assertions. Finite data guard verified for dashboard; other endpoints require final API review.
