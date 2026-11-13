# Client Directory

Admin client directory. `mock/client-directory.html` is the visual reference; `BUILD.md` is the build spec (Next.js + Drizzle + Neon).

## UI work: always run the taste skill

Before writing or changing any UI (the mock, a page, a component, CSS), invoke the `taste-skill:design-taste-frontend` skill and apply its anti-slop rules. Do this even for small styling requests.

This is an admin tool, not a marketing site. Skip the skill's marketing pipeline (heroes, photographs, moments, `gate.mjs`), but keep these rules every time:

- **No solid line borders or rules to separate things.** Separate with tonal surface tiers (`--sunk`, `--card`, `--accent`, `--lift`), spacing and type weight. This covers table headers, rows, cards, tabs and section dividers. The one exception: the thin `--edge` outline on KPI cards, chart cards and the table card, which the user asked for.
- **Status is tinted, not filled.** Use `color-mix(... 16%, transparent)` with coloured text. Solid gold (`--primary`) is only for the main action, the selected state and the logo.
- **Real icons only.** Use inline SVG, never emoji or Unicode glyphs (✓ ⚠ ✕ ☰).
- **Hover micro-motion:** clickable cards lift 2px, buttons press on click, links draw an underline. Respect `prefers-reduced-motion`.
- **Copy:** no filler or stock phrases. Run `node <taste-skill>/scripts/copy-lint.mjs <file> --kind software` on changed pages.

After any UI change, check it in the browser in both themes at 1440 and 375 wide, with no sideways scroll, before saying it is done.

## Other rules

- The Scraper repo (`../Scraper`) is scrape-only. Never edit it from here.
- Mock data is made up. Never put real client names, emails or numbers in the mock.
