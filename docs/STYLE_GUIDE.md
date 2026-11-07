# UI style guide: "Construction-grade amber"

**Every frontend change MUST follow this guide.** It is binding for humans and AI agents alike.
The goal is an app that looks like **one product**: modern, sleek and calm, with a confident
deep-yellow accent that recalls construction machinery.

> The values below already exist as code in `frontend/src/styles/_tokens.scss` (CSS variables)
> and `frontend/src/styles/_theme.scss` (Angular Material theme). **Use the variables, never copy
> the hex values into components.**

---

## 1. Design principles
1. **Amber is the accent, not the background.** Neutral surfaces with amber reserved for the primary
   action, active navigation, focus and key highlights. If everything is yellow, nothing stands out.
2. **Calm and spacious.** Generous whitespace, few borders, soft shadows, rounded corners.
3. **Data first.** Tables and numbers are the product: clear hierarchy, tabular numbers, aligned columns.
4. **Status is always visible and always the same.** One status vocabulary and one colour map everywhere (§3.3).
5. **Every page has the same skeleton** (§5). Users should never wonder where the main action is.

## 2. Theme modes
- Light theme is the default. Dark theme is supported through `<html data-theme="dark">`; tokens switch
  automatically. Components must look right in both, which is easy if you only use tokens.

## 3. Colour tokens

### 3.1 Brand / accent
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-primary` | `#E0A100` | `#F2B400` | Primary buttons, active nav, focus ring, key highlights |
| `--color-primary-hover` | `#C78E00` | `#FFC21A` | Hover on primary |
| `--color-primary-pressed` | `#A87700` | `#D99F00` | Active/pressed |
| `--color-on-primary` | `#1A1A1A` | `#1A1A1A` | Text/icons **on** amber (always dark, never white) |
| `--color-primary-soft` | `#FFF4D1` | `#3A3016` | Selected rows, soft highlights, info banners |
| `--color-primary-text` | `#8A6200` | `#F2B400` | Amber-tinted text/links (AA contrast on surface) |

### 3.2 Neutrals
| Token | Light | Dark | Use |
|---|---|---|---|
| `--color-bg` | `#FAFAF7` | `#121212` | App background |
| `--color-surface` | `#FFFFFF` | `#1C1C1C` | Cards, tables, dialogs, top bar |
| `--color-surface-alt` | `#F3F2EE` | `#242424` | Table header, filter bar, hover |
| `--color-sidenav` | `#1F1F1F` | `#0B0B0B` | Side navigation (charcoal in both modes) |
| `--color-border` | `#E7E5DE` | `#2E2E2E` | Dividers and outlines |
| `--color-text` | `#1A1A1A` | `#F2F2F0` | Primary text |
| `--color-text-muted` | `#5C5C57` | `#A3A39D` | Secondary text, captions, placeholders |

### 3.3 Status (fixed map, used ONLY through `<app-status-badge>`)
| Status | Token (fg / bg) | Meaning |
|---|---|---|
| `available` | `--status-available-fg/bg` (green) | Free to reserve |
| `reserved` | `--status-reserved-fg/bg` (blue) | Booked on an approved reservation |
| `in_service` | `--status-service-fg/bg` (amber) | Under maintenance |
| `defective` | `--status-defective-fg/bg` (red) | Open defect, blocked |
| `retired` | `--status-retired-fg/bg` (grey) | Out of fleet |
| `pending` | `--status-pending-fg/bg` (amber soft) | Reservation awaiting approval |
| `approved` | = available | Reservation approved |
| `rejected` / `cancelled` | = defective / retired | Reservation closed |

Semantic colours for feedback: `--color-success`, `--color-warning`, `--color-danger`, `--color-info`.

### 3.4 Charts
Series order: `--chart-1` (amber) → `--chart-2` (charcoal) → `--chart-3` (slate blue) → `--chart-4` (sand) → `--chart-5` (teal).
For status charts use the status colours. Never use the default library palette.

## 4. Typography, spacing, shape
- **Font:** Inter (loaded in `index.html`); fallback `system-ui, sans-serif`. Numbers in tables and KPIs use `font-variant-numeric: tabular-nums` (class `.num`).
- **Scale** (CSS classes in `styles.scss`):
  | Class | Size / weight | Use |
  |---|---|---|
  | `.text-display` | 32 / 700 | KPI values |
  | `h1` / `.text-h1` | 24 / 650 | Page title (one per page, inside page header) |
  | `h2` / `.text-h2` | 18 / 600 | Card / section titles |
  | `h3` / `.text-h3` | 15 / 600 | Sub-sections |
  | body | 14 / 400, line-height 1.5 | Default |
  | `.text-caption` | 12 / 500, muted | Helper text, metadata, table header |
- **Spacing:** 4px grid via `--space-1` (4px) … `--space-8` (48px). Page padding `--space-6`, gap between cards `--space-5`, inside cards `--space-5`.
- **Radius:** `--radius-sm` 8px (inputs, buttons, badges), `--radius-md` 12px (cards, dialogs), `--radius-lg` 16px (hero/KPI tiles). Badges are pills.
- **Elevation:** `--shadow-1` (cards), `--shadow-2` (menus, dialogs, hover on cards). No other shadows.
- **Motion:** 150–200ms ease-out for hover and expand transitions only. Respect `prefers-reduced-motion`.
- **Icons:** Material Symbols **Rounded**, 20px in buttons and tables, 24px in nav. Use icons with labels, not alone (except the icon buttons in table rows, which need a `matTooltip` and `aria-label`).

## 5. Layout

### 5.1 App shell (exists in `app.html`, do not fork it)
- **Sidenav** 240px, charcoal, white/70% text. The active item gets an amber 3px left bar, amber icon and white text.
  Collapses to a top-bar menu button under 960px.
- **Top bar** 64px, surface colour, bottom border: page context left; role switcher and notifications right.
- **Content:** `--color-bg`, padding `--space-6`, max width 1280px, centered.

### 5.2 Page template (MANDATORY for every routed page)
```html
<app-page-header title="Equipment" subtitle="All machines in the fleet">
  <button mat-flat-button>Add equipment</button>     <!-- the ONE primary action -->
</app-page-header>

<section class="filters-bar"> … filters … </section>  <!-- optional -->

<section class="card"> … table / content … </section>
```
- Order is always header → filters → content. Dashboards use a `.grid` of cards and KPI tiles.
- Detail pages: header with a back link plus title, then a `mat-tab-group` inside a card.

## 6. Components

| Element | Rule |
|---|---|
| **Primary button** | `mat-flat-button` (amber fill, dark text). **Max one per view**, top right in the page header or bottom right of a form/dialog. |
| **Secondary** | `mat-stroked-button`. Tertiary/cancel: `mat-button`. Destructive: `mat-flat-button` with class `danger`, always behind a confirm dialog. |
| **Tables** | `mat-table` inside `.card`, header row on `--color-surface-alt` with `.text-caption` style, 52px rows, row hover uses `--color-surface-alt`, numbers right-aligned `.num`, status column uses `<app-status-badge>`, row actions are icon buttons at the far right. Add `mat-paginator` when there are more than 20 rows. |
| **Forms** | `mat-form-field appearance="outline"`, one column on mobile, two on desktop (`.form-grid`). Validation errors inline via `mat-error`. Required fields marked by Material. Actions at the bottom right: Cancel (`mat-button`) and Save (`mat-flat-button`). |
| **Cards** | `.card`: surface, `--radius-md`, `--shadow-1`, padding `--space-5`. Title in `h2`. |
| **KPI tile** | `.kpi`: caption label, `.text-display .num` value, optional delta in success/danger. |
| **Status** | Only `<app-status-badge [status]="…">`. Never colour statuses by hand. |
| **Dialogs** | `MatDialog`, max width 560px, title in `h2`, actions bottom right. Confirm dialog for every destructive action. |
| **Feedback** | `MatSnackBar`: success 3s, error until dismissed. Messages short, in sentence case, no exclamation marks. |
| **Empty state** | Centered icon (48px, muted) + one line + primary action when relevant. Never a blank table. |
| **Loading** | `mat-progress-bar` (indeterminate) at the top of the card, or skeleton rows. No full-page spinners. |
| **Errors** | Inline error card with a retry button inside the affected card; the global interceptor shows a snackbar. |
| **Dates** | Display `dd MMM yyyy` (e.g. `12 Nov 2026`); date ranges as `12–14 Nov 2026`. Money: `1.250,00 RON`. |

## 7. Copy and tone
English, sentence case ("Add equipment", not "Add Equipment"), short, verbs on buttons ("Approve", "Report defect").
Don't write "Click here". Use the same domain words everywhere: *equipment*, *site*, *reservation*, *defect*, *intervention*.

## 8. Accessibility
- WCAG AA contrast. Amber is **never** used for body text on white (use `--color-primary-text`) and white text is **never** placed on amber.
- Visible focus ring: 2px `--color-primary` outline with 2px offset (global in `styles.scss`, don't remove it).
- Every interactive element is reachable by keyboard and has an accessible name. Icon-only buttons need an `aria-label`.
- Add a `data-testid` to the key interactive elements (used by Playwright).

## 9. Rules for agents (checklist before you finish a UI task)
- [ ] The page uses `<app-page-header>` and the page template from §5.2
- [ ] No hex/rgb colours, `px` font sizes or ad-hoc shadows in component styles. Only `var(--…)` tokens.
- [ ] No inline `style="…"`. No new global CSS outside `src/styles/`.
- [ ] Statuses rendered with `<app-status-badge>`; one primary button per view
- [ ] Empty, loading and error states implemented
- [ ] Looks right at 375px and 1440px widths and in dark mode (`document.documentElement.dataset['theme']='dark'`)
- [ ] Reused `shared/` components. A new reusable component goes in `shared/` (and gets mentioned in this guide)
- [ ] Playwright spec updated
