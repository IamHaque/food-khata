# Baseline "Before" Screenshots (S-001 Scenario 2)

Captured as part of **S-001 Scenario 2: Capture "before" screenshots** for all 7 existing dashboard routes across desktop (`1440x900`) and mobile (`390x844`) viewports in both **light** and **dark** theme modes.

## Summary

- **Total routes captured**: 7 (`/`, `/spending`, `/food`, `/behavior`, `/places`, `/ledger`, `/data-health`)
- **Resolutions**: `1440x900` (desktop), `390x844` (mobile)
- **Modes**: Light, Dark
- **Total screenshots**: 28
- **Failures / Anomalies**: 0 (all 28 succeeded)

## Screenshot Inventory

### 1. Overview (`/`)
- Desktop Light (`1440x900`): [`overview-light-1440x900.png`](overview-light-1440x900.png)
- Desktop Dark (`1440x900`): [`overview-dark-1440x900.png`](overview-dark-1440x900.png)
- Mobile Light (`390x844`): [`overview-light-390x844.png`](overview-light-390x844.png)
- Mobile Dark (`390x844`): [`overview-dark-390x844.png`](overview-dark-390x844.png)

### 2. Spending (`/spending`)
- Desktop Light (`1440x900`): [`spending-light-1440x900.png`](spending-light-1440x900.png)
- Desktop Dark (`1440x900`): [`spending-dark-1440x900.png`](spending-dark-1440x900.png)
- Mobile Light (`390x844`): [`spending-light-390x844.png`](spending-light-390x844.png)
- Mobile Dark (`390x844`): [`spending-dark-390x844.png`](spending-dark-390x844.png)

### 3. Food (`/food`)
- Desktop Light (`1440x900`): [`food-light-1440x900.png`](food-light-1440x900.png)
- Desktop Dark (`1440x900`): [`food-dark-1440x900.png`](food-dark-1440x900.png)
- Mobile Light (`390x844`): [`food-light-390x844.png`](food-light-390x844.png)
- Mobile Dark (`390x844`): [`food-dark-390x844.png`](food-dark-390x844.png)

### 4. Behavior (`/behavior`)
- Desktop Light (`1440x900`): [`behavior-light-1440x900.png`](behavior-light-1440x900.png)
- Desktop Dark (`1440x900`): [`behavior-dark-1440x900.png`](behavior-dark-1440x900.png)
- Mobile Light (`390x844`): [`behavior-light-390x844.png`](behavior-light-390x844.png)
- Mobile Dark (`390x844`): [`behavior-dark-390x844.png`](behavior-dark-390x844.png)

### 5. Places (`/places`)
- Desktop Light (`1440x900`): [`places-light-1440x900.png`](places-light-1440x900.png)
- Desktop Dark (`1440x900`): [`places-dark-1440x900.png`](places-dark-1440x900.png)
- Mobile Light (`390x844`): [`places-light-390x844.png`](places-light-390x844.png)
- Mobile Dark (`390x844`): [`places-dark-390x844.png`](places-dark-390x844.png)

### 6. Ledger (`/ledger`)
- Desktop Light (`1440x900`): [`ledger-light-1440x900.png`](ledger-light-1440x900.png)
- Desktop Dark (`1440x900`): [`ledger-dark-1440x900.png`](ledger-dark-1440x900.png)
- Mobile Light (`390x844`): [`ledger-light-390x844.png`](ledger-light-390x844.png)
- Mobile Dark (`390x844`): [`ledger-dark-390x844.png`](ledger-dark-390x844.png)

### 7. Data Health (`/data-health`)
- Desktop Light (`1440x900`): [`data-health-light-1440x900.png`](data-health-light-1440x900.png)
- Desktop Dark (`1440x900`): [`data-health-dark-1440x900.png`](data-health-dark-1440x900.png)
- Mobile Light (`390x844`): [`data-health-light-390x844.png`](data-health-light-390x844.png)
- Mobile Dark (`390x844`): [`data-health-dark-390x844.png`](data-health-dark-390x844.png)

## Reproduction

To regenerate or update these screenshots:
```bash
node docs/redesign/capture-before.mjs
```
The script serves the production preview build (`dashboard-ui/dist`) and intercepts API endpoints with the mocked test dataset context.
