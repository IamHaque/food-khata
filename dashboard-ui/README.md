# Dashboard frontend

This is a normal React + Vite app, separate from Python. It uses Tailwind and
official shadcn/ui cards, selects, calendars, table, chart, sheet and tooltip components.

From the repository root, export the data:

```
food-khata export --output dashboard-ui/public/data/dashboard.json
```

Then in this directory run `npm ci` and `npm run dev`. The app fetches
`/data/dashboard.json`, or accepts any valid export through **Load data**.
It is one continuous dashboard page without routing or tabs. Invalid imports show
an error while keeping the current data. No raw provider JSON is shown in receipts.

`npm test` checks calculations and input validation. `npm run build` creates `dist/`;
`npm run preview` serves the build locally. `npm run test:browser` starts and closes
a temporary Vite preview for Chromium interaction tests. Install the browser using
`npx playwright install chromium`, or set `PLAYWRIGHT_CHROMIUM_EXECUTABLE`.

Do not publish private exports in `public/data` or builds containing them. Data
files and build output are gitignored. Refresh/reload the export after a new sync.
Official component sources: https://ui.shadcn.com/r/styles/new-york (MIT;
SHADCN-LICENSE). Production build includes dependency license notices.
