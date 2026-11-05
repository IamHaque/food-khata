# UI foundation progress
- Typed entry/router and seven navigation placeholders added; legacy loads unchanged at /legacy.
- Generated API types and reproducible generation script added; API client/query hooks still pending.
- Root fixed strict TS boundary: legacy JSX declared separately; new TS remains strict. Added alias configuration.
- Root verified: typecheck, lint (existing new TS only), build, seven Node tests, original synthetic browser suite at /legacy all pass.
- Existing browser and baseline scripts now target /legacy without dropping scenarios.
- Remaining: API/Zod/hooks/mocked tests, account/global URL filters, scoped themes, actual page content.
- npm audit: 11 moderate findings (router and lint dependency chains); no forced audit fix applied.
