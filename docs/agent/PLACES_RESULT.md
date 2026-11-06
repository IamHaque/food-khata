Places: charts.places.labels (label, city, orders, spend, fee), distances (distance_km, fee), distance_unavailable_reason, unsupported_reason.
Distances use delivered orders and are suppressed above 80% invalid coordinates. Maps are unsupported.
Synthetic coverage: scope, item multiplicity, 111 km, invalid coordinates, empty scope, address privacy.
Ruff passed; synthetic Places test passed. Full pytest collection blocked by missing httpx2 and scripts import under pytest entry point. Zero-distance and exact 80% boundary remain untested.
Root full97tests+10subtests/Ruff pass; zero-distance/exact80% cases added. Server fees centralized; all response models reject nonfinite numbers; middleware sanitizes response-validation failures without logging private rows. API/parity rerun zero mismatches.
