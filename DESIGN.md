# Design

The design system for Client Directory, an internal admin tool. Read this before you build or change any UI.

- Visual reference: `mock/client-directory.html`
- Tokens and global CSS: `src/app/globals.css`
- Primitives: `src/components/ui/` (shadcn on Base UI)
- App building blocks: `src/components/shared/`

The palette is **Metric Slate Gold**, shared with the Scraper app (same values as `../Scraper/frontend/src/app/globals.css`). Do not edit the Scraper from this repo.

## Principles

1. **Admin tool, not a marketing site.** Dense, calm, fast to scan. No heroes, photographs, illustrations or decorative motion.
2. **One accent.** Gold (`--primary`) is the only brand colour. Use it solid only for the main action, the selected state and the logo.
3. **Tone, not lines.** Separate things with surface tiers, spacing and type weight. No solid borders or rules between rows, cells, tabs or sections.
4. **Status is tinted, not filled.** Status colours appear as a 16% tint with coloured text.
5. **Both themes are first-class.** Dark is the default; light follows the OS or the saved choice. Check every change in both.
6. **Plain copy.** Short, specific labels. No filler or stock phrases.

## Colour

All colours are CSS variables on `:root` (dark) and `html[data-theme="light"]`. Tailwind exposes each one as a colour (`bg-card`, `text-primary-text`, `border-edge`, and so on). Never hard-code a hex value in a component.

### Surfaces (darkest to lightest in dark mode)

| Token | Dark | Light | Use |
|---|---|---|---|
| `--sidebar` | `#12171c` | `#ffffff` | Sidebar background |
| `--field` | `#151a1f` | `#ffffff` | Text input fill (dark mode) |
| `--background` | `#1a1f24` | `#f4f6f8` | Page background |
| `--sunk` | `#1e242a` | `#f7f8fa` | Recessed areas: group rows, inputs (light), wells |
| `--card` | `#232930` | `#ffffff` | Cards, table card, sheets |
| `--secondary` / `--muted` | `#293138` | `#eceff3` | Secondary buttons, quiet fills |
| `--lift` | `#2a3139` | `#eef1f4` | Hover state of a card, row or input |
| `--accent` / `--head` / `--popover` | `#2d353e` | `#e6eaef` / `#e3e8ee` / `#ffffff` | Table header, pressed/selected fills, neutral pills, menus |

Rule of thumb: a child surface is one tier away from its parent. Hover moves one tier up (`hover:bg-lift`).

### Text

| Token | Dark | Light | Use |
|---|---|---|---|
| `--foreground` | `#dee3ea` | `#1a1f24` | Body text |
| `--muted-foreground` | `#aeb8c4` | `#5a6572` | Secondary text, micro-labels, placeholders (at 70%) |
| `--primary-text` | `#ffc513` | `#8a6500` | Gold as text: links, counts, sorted header. Use this, not `--primary`, for gold text (contrast in light mode) |

### Accent and status

| Token | Dark | Light | Use |
|---|---|---|---|
| `--primary` | `#ffc513` | `#ffc513` | Main action fill, selected state, logo, focus ring (dark) |
| `--primary-foreground` | `#1a1f24` | `#1a1f24` | Text on gold |
| `--success` | `#6fd3a6` | `#146c45` | Good / paid / matched |
| `--warning` | `#ffc513` | `#8a5a00` | Needs attention / not set |
| `--info` | `#8db4ff` | `#1f55b8` | New / informational |
| `--destructive` | `#ffb4ab` | `#c62828` | Errors, delete, invalid |
| `--notify` | `#ef4444` | `#dc2626` | Hot count badge in the sidebar only |

### Lines

| Token | Dark | Light | Use |
|---|---|---|---|
| `--edge` | `#3d4651` | `#d3d9e0` | The **only** allowed outline: KPI cards, chart cards, the table card |
| `--input` | `#76828f` | `#c5ccd5` | Form control outline |
| `--ring` | `#ffc513` | `#b58500` | Focus ring |
| `--border` | `#4b5663` | `#dfe4ea` | shadcn default; avoid for new separators |

## Status tints

Status never uses a solid fill. Use `Pill` from `src/components/shared/pills.tsx`:

```tsx
<Pill tone="success">Paid</Pill>
```

| Tone | Classes |
|---|---|
| `gold` | `bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-primary-text` |
| `info` / `success` / `warning` / `danger` | same pattern with that colour |
| `neutral` | `bg-accent text-foreground` |
| `muted` | `bg-accent text-muted-foreground` |

Existing domain pills: `EngagementPill` (Active / Inactive / Not set, plus New), `StageSteps` (four-step Gmail stage bar: Inquiry, Quoted, Invoiced, Paid), `EntityTag`.

Status dots on KPI cards use the solid colour at `size-2`; that is a marker, not a fill.

## Typography

- **Sans:** Manrope 400/500/600/700 (`--font-sans`), loaded in `src/app/layout.tsx`.
- **Mono:** Geist Mono (`--font-mono`), for IDs and codes only.
- Numbers in tables, counts and KPIs use `tabular-nums`.

| Role | Classes |
|---|---|
| Page title | `text-2xl sm:text-[1.75rem] font-bold tracking-tight` |
| Card / table title | `text-[15px] font-semibold text-muted-foreground` |
| KPI value | `text-2xl sm:text-4xl font-bold tracking-tight tabular-nums` |
| Micro-label | `text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground` |
| Table header | `text-xs font-bold tracking-wide` |
| Body | `text-sm` |
| Pill | `text-xs font-semibold` |
| Helper text | `text-sm text-muted-foreground` |

Hierarchy comes from weight and colour first, size second.

## Spacing, radius, elevation

- Tailwind's 4px scale. Card padding `px-4 py-3` (phone) to `px-5 py-4` (sm+). Table cells `px-3 py-2.5`.
- `--radius: 0.5rem`. Controls and buttons `rounded-lg`; cards and the table card `rounded-2xl`; pills `rounded-full`; tags `rounded-md`.
- No drop shadows for separation. Elevation is a lighter tier. Popovers and dialogs may keep the primitive's shadow.

## Layout

- **Shell** (`src/components/shell/app-shell.tsx`): left sidebar, 16rem wide, collapses to 4rem at `lg+`. State lives in `html[data-sidebar]`, set before paint from `localStorage["directory.sidebar.collapsed"]`. Below `lg` the sidebar is a drawer.
- **Nav order:** Clients, Probity, Needs company, Inquiries, OPS suppliers, Department emails, Import, Accounts. Each item has a Lucide icon and an optional count badge; a "hot" badge uses `--notify`.
- **Page** (`PageShell`, `PageHeader`): title, optional description and note on the left; actions on the right; wraps on narrow screens.
- **Typical page:** header, a row of KPI cards (clickable ones act as filters), then one `DataTableCard`.
- **Record detail:** a right-side `Sheet` (`ClientSheet`) with tabs: Company, Contacts, Activity, Record.
- **Breakpoints:** phone 375, `md` shows desktop-only columns, `lg` docks the sidebar, `2xl` shows wide-only columns. No sideways page scroll at any width; only the table body may scroll horizontally.

## Components

Use what exists before adding anything.

| Need | Use |
|---|---|
| Any data list | `DataTableCard` (`shared/data-table-card.tsx`): title, count, search, sortable headers, row numbers, pager, group rows, loading / error / empty states |
| Metric | `KpiCard` (`shared/kpi-card.tsx`): micro-label with dot, big value, required context line; `onClick` + `pressed` make it a filter |
| Page heading | `PageHeader` |
| Nothing to show | `EmptyState` with a Lucide icon, title, optional description and one secondary action |
| Loading | `Loadable`, `PlaceholderRows`, `.skeleton-sweep` |
| Error | `ErrorState` with retry |
| Destructive confirm | `ConfirmDialog` |
| Form field | `Field` / `RecordField`, `.field-input`, `.field-select` |
| Freshness | `LastUpdatedNote`, `MasterUploadNote` |
| Scrape progress | `ScrapeBar` with `.scrape-sweep` |
| Toasts | `sonner` via `components/ui/sonner.tsx` |

### Buttons (`components/ui/button.tsx`)

| Variant | When |
|---|---|
| `default` (solid gold) | The one main action on a screen |
| `secondary` | Most other actions |
| `ghost` | Toolbar and icon-only actions |
| `outline` | Rare; prefer `secondary` |
| `destructive` | Delete and other irreversible actions (tinted, not filled) |
| `link` | Inline text actions |

Sizes: `xs` 24px, `sm` 28px, `default` 32px, `lg` 36px, plus `icon*` squares. Every icon-only button needs an `aria-label`.

### Tables

- Header row: `bg-head`, bold xs text. The sorted column tints to `color-mix(primary 14%, head)` with `text-primary-text`.
- Rows have no lines. Hover and focus use `bg-lift`. Group headings use `bg-sunk`.
- Clickable rows are focusable (`tabIndex=0`), open on Enter/Space, and carry an `aria-label`.
- Sort cycles asc, desc, off. Empty values sort last.
- Page sizes: 10, 25, 50, 100 (default 25).

### Forms

- Inputs: `.field-input`, tonal fill (`bg-sunk`, `bg-field` in dark), `hover:bg-lift`, gold ring on focus, red ring with `aria-invalid`.
- Selects: `.field-select`, native select with an SVG chevron.
- Labels sit above fields. Errors appear below the field in `text-destructive`.

## Icons

- **Lucide** (`lucide-react`) only. Default `size-4`; `size-3.5` in headers; `size-8` in empty states.
- Decorative icons get `aria-hidden`.
- Never use emoji or Unicode glyphs (✓ ⚠ ✕ ☰) as icons.

## Motion

| Pattern | Implementation |
|---|---|
| Clickable card lifts 2px | `.lift-hover` |
| Button press | `active:translate-y-px` (built into `Button`) |
| Link underline draws in | `.link-draw` |
| Loading | `.skeleton-sweep`, 1.4s linear |
| Running scrape | `.scrape-sweep` |
| Sidebar collapse | 0.2s `cubic-bezier(0.2, 0, 0, 1)` |

Durations stay at 0.15 to 0.2s. `prefers-reduced-motion: reduce` turns off all transitions and animations globally; the scrape bar falls back to a flat gold bar.

## Theming

- `html[data-theme="dark" | "light"]`, set before paint in `src/app/layout.tsx` from `localStorage["directory.theme"]`, else the OS preference.
- Add a new colour by defining it in both `:root` and `html[data-theme="light"]`, then mapping it in the `@theme` block as `--color-<name>`.
- Gold text in light mode must use `--primary-text` (`#8a6500`); raw `#ffc513` fails contrast on white.

## Accessibility

- Visible focus ring on every interactive element (`focus-visible:ring-2 ring-ring`).
- Pointer cursor on interactive roles; `not-allowed` on disabled controls (set globally).
- Sortable headers set `aria-sort`. Pressable KPI cards set `aria-pressed`. Stage bars carry an `aria-label`.
- Every control has a label; icon-only buttons have `aria-label`.
- Colour is never the only signal: pills carry text, dots sit next to a label.

## Copy

- Sentence case for titles, labels and buttons.
- Name the thing and the action: "Add client", "Attach all", not "Submit" or "Get started".
- Empty states say what is missing and what to do next, in one line.
- No filler ("seamlessly", "powerful", "unlock"). Run the copy linter on changed pages:
  `node <taste-skill>/scripts/copy-lint.mjs <file> --kind software`
- Mock data is invented. Never put real client names, emails or numbers in the mock or in screenshots.

## Do and don't

| Do | Don't |
|---|---|
| Separate with `bg-sunk` / `bg-card` / `bg-lift` and spacing | Add `border-b` between rows, tabs or sections |
| `Pill tone="warning"` | `bg-warning text-black` |
| One solid gold button per screen | Gold on secondary actions or decoration |
| `text-primary-text` for gold text | `text-primary` for text in light mode |
| Lucide SVG icons | Emoji or Unicode glyphs |
| Reuse `DataTableCard`, `KpiCard`, `PageHeader` | Build a one-off table or card |
| Outline only KPI, chart and table cards with `border-edge` | Outline other cards |

## Checklist before calling UI done

1. Applied the rules above (taste skill, admin mode).
2. Copy lint passes on changed pages.
3. Checked in the browser, dark and light, at 1440 and 375 wide.
4. No sideways scroll, no console errors, no unlabeled controls.
5. Keyboard: tab order is sensible, focus is visible, rows and dialogs work with Enter, Space and Escape.
6. Reduced motion: nothing moves.
