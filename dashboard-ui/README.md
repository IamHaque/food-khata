# Dashboard frontend

React + Vite, compiled Tailwind, official shadcn/ui components and Recharts.
Run `npm ci`, `npm test`, `npm run build`. Python embeds the checked-in build
in the generated HTML. No server or external assets are needed to open it.

`npm run test:browser` exercises the built application offline using Chromium.
Install its browser with `npx playwright install chromium`, or set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` to an existing Chromium executable.

Button, Card, Dialog, Popover and Tooltip sources come from the official
https://ui.shadcn.com/r/styles/new-york registry under the MIT license in
SHADCN-LICENSE. Build output retains dependency notices and the Inter font license.
