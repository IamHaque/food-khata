# Account and filter UI
Implemented directly by root after worker no-op: shared FilterProvider/useFilters, account search/selector, all model controls, chips/clear, local saved preset, theme control, opaque scoped styles and local Inter font.
Root verified7Node+7Vitest,typecheck,lint,build and synthetic browser checks (scope pruning, reload/search preservation, presets, theme, singleaccount and360px containment). Existing main.jsx and export flow unchanged at /legacy.
Amounts debounce250ms; invalid account options prune only after metadata scope matches current account and placeholder data clears. Saved preset is validated through the same filter model before URL update.
Remaining: actual pages, detailed design-system coverage, responsive/a11y/full race stress audit and dependency findings. Native multi-selects provide a functional baseline; keyboard/help refinement remains polish.
