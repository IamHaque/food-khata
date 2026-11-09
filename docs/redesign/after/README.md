# Redesign Review Pack (FX-07)

Compares the redesigned dashboard (5 routes) against the `before/` baseline across desktop (1440x900) and mobile (390x844), light/dark, emerald/indigo accents.

## Screenshots
40 baseline snapshots are stored in `dashboard-ui/e2e/visual/visual.spec.ts-snapshots/` and mirrored here as `*-desktop|mobile-{light|dark}-{emerald|indigo}.png`.

## 12 original problems checklist

| # | Original problem | Verdict |
|---|------------------|---------|
| 1 | One palette only; theme control is a plain `<select>` | Fixed - 5 accents x light/dark via custom ThemeControl |
| 2 | Chart theme reads raw HSL triplets from CSS variables | Fixed - chart-theme.ts resolves tokens |
| 3 | Hardcoded hex colors outside tokens | Fixed - semantic CSS variables + tokenColor |
| 4 | Duplicate token sets and two theme markers | Fixed - single `.dark` class + accent variables |
| 5 | Text mostly 10-12px | Fixed - min 12px captions, 14px body |
| 6 | Crowded header; filter panel above every page | Fixed - collapsible Command Palette + FilterBar |
| 7 | No drill-down from charts to filters/orders | Fixed - ECharts click handlers update FilterContext |
| 8 | Mobile has both horizontal nav and hamburger drawer | Fixed - unified responsive Sheet drawer |
| 9 | Native selects/details mixed with Radix | Fixed - unified Radix/shadcn primitives |
| 10 | Internal links and stub page in production | Fixed - dev-only gating; clean redirects |
| 11 | Bill composition shown three ways; insight chips buried | Fixed - metric cards + clear fee breakdown |
| 12 | Recharts and ECharts both shipped | Fixed - Recharts removed; unified ECharts |

## Human review
Verdict: Looks premium (DEC-FX-07).
