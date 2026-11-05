# Verification

The completed implementation was checked locally on Windows with Python 3.14:

- 32 offline unittest tests passed.
- Ruff lint and formatting checks passed.
- CLI `--help` completed successfully.
- A wheel built successfully with `pip wheel --no-deps --no-build-isolation`.
- The independent Git root resolves to `food-khata/`; the parent repository's
  existing source files, credentials, and exports were not modified.
- A live Zomato sync using the existing authenticated session saved 65 orders and
  65 matching details, with complete history/detail coverage and no errors.
- A second live sync completed with zero detail requests, preserving all 65 orders.
- The persisted archive is inside the checkout's ignored `.food-khata/` directory.
  Existing home-directory account data was copied there; the original was preserved.
- Validated exports were subsequently merged offline into the explicitly selected
  account: 66 Zomato orders and 388 Swiggy orders, each with valid details. Existing
  valid records were preserved, prior archives were backed up, and source exports
  were unchanged. Network request methods were blocked during this import.

Regression tests cover the independent review's two findings: an unrecognized
Zomato final page leaves history incomplete, and a saved Swiggy session returning
no customer ID reaches the login flow.

Zomato authentication regression tests also check the original consent `cc` field,
form and token-response headers, and stage-specific HTTP 500 errors without
credential output or automatic OTP retries.

CI is configured for Python 3.11/3.14 on Windows/Linux, but those remote jobs have
not run. Real OTP delivery, lifetime coverage, and cross-platform execution
have not been verified locally. Treat offline tests
as evidence for application behavior with synthetic API responses, not as proof
that the unofficial endpoints currently accept real account requests.
