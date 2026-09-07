# Card Tracker — UI Design Plan (V2)

**Owner:** Nick · **Status:** v2: incorporates adversarial multi-reviewer review (QA-gated), 2026-09-15
**Audience:** Claude Code (implementer). Companion to `docs/DESIGN.md`; this document governs **how the app looks and behaves**, not what it computes.

> **How to use this (Claude Code):** Build in the phase order in §12. Tokens and components first, screens second. Never hardcode a color, size or piece of copy that §2 or §9 defines. Where this document and `docs/DESIGN.md` disagree on behavior, DESIGN.md wins and you raise it. Items marked **[DECISION]** need Nick before changing; **[TUNABLE]** values live in config or tokens.
>
> **Citations.** Every statement in this document about pipeline behavior, data shape or lifecycle cites its `docs/DESIGN.md` section inline. A statement with no citation is a UI-layer decision and must not contradict DESIGN.md. Walk the citations once before Phase 3 and list any that no longer match.

---

## 1. Why this exists

The app works and looks like a form. Using it on real cards surfaced four failures that are design problems, not bugs:

1. **Unreadable.** Light-theme components render on a dark page: white text on white candidate cards, near-invisible section headings, photos in white letterboxes.
2. **Data-entry shaped.** The review screen asks the user to fill a long form. It should ask him to *confirm or correct* one proposed answer.
3. **Jargon.** "parallel resolution failed" means nothing to a novice collector. Every enum leaked to the screen is a small failure.
4. **Wrong defaults.** A 25%-confidence candidate pre-filled the identity fields; a "no candidates" card showed an empty form even though the photo had been read successfully.

Nick is new to the hobby. He will process a few hundred cards, mostly on a phone, mostly in batches at a table. Every second and every moment of doubt multiplies by the size of the collection.

### 1.1 Fixes carried over from the 2026-09-15 review session

Every problem found while reviewing real cards is tracked here. **Phase 0 ships before any visual work** — these are correctness, not polish.

| # | Problem observed | Severity | Where handled | Phase |
|---|---|---|---|---|
| F1 | A 25%-confidence candidate ("Bruce Matthews 1994 Topps #85") pre-filled identity for a Brian Thomas Jr. card | **Correctness** | §5.4 pre-fill rules | **0** |
| F2 | "No candidates" cards showed an empty form although the photo extraction had read player, year and card number | **Correctness** | §5.2 state C, §5.4 | **0** |
| F3 | Candidate box renders white text on white; headings near-invisible; photo in a white letterbox | High | §3.0 shadcn wiring, §3.1 tokens, §12 Phase 1 four-layer contrast check (§13.1) | 1 |
| F4 | "parallel resolution failed" and other raw enums shown to the user | High | §6 copy map | 1 |
| F5 | Review screen is a long form rather than a confirm/correct decision | High | §5 | 3 |
| F6 | Desktop layout pinned left with a large empty gutter | Medium | §3.4 | 1 |
| F7 | Scan page validation bubble ("Please fill out this field") detached from its field, floating near the nav | Medium | §7.1 (native constraint-validation popup — named cause and fix) | **0** |
| F8 | Confidence percentage shown as the headline signal on queue rows | Medium | §5.5 (state chip, not a percentage) | 3 |
| F9 | Set name carry-forward between unmatched cards unverified in practice | Medium | §5.2 state C and §5.5 batch header, sourced from `scan_session.defaults.set_hint` (DESIGN §5.1); year and manufacturer need §5.5's `defaults` jsonb amendment | 3 |
| F10 | Extraction reads card number correctly on only 9/15 and year on 8/15 real cards; wrong numbers silently link wrong prices | **Correctness** | §15 addendum (crop-beside-field, unverified state) | 3 |

**Phase 0 — Correctness fixes (do first, independent of the redesign):** F1, F2 and F7. These can ship on the current UI.

F2 is not a data bug. DESIGN §5.1 persists `identification.extraction` as jsonb — the data was always there; the defect is that the review component never read it. A unit test of a pure `decidePrefill()` passes perfectly while the screen stays blank, so F2 needs a **component/integration test asserting rendered input values**. Phase 0 therefore:

1. **Captures both bugs as named fixtures from the real cards** — `f1-weak-candidate.json` (the Brian Thomas Jr. extraction with the 0.25 "Bruce Matthews 1994 Topps" candidate) and `f2-no-candidate.json` (a real extraction with player, year and card number read, and an empty candidate list).
2. **Tests both shapes:** one unit test per §5.4 row against a pure `decidePrefill(identification)` in `/src/domain/review`, **plus** a component test rendering the current review screen with each fixture and asserting the rendered field values.
3. **Routes the review screen through `decidePrefill`.**
4. **Fixes F7** per §7.1: the floating bubble is the browser's native constraint-validation popup, and the fix is two lines. Test it, because the failure mode is "marked fixed, still broken".

**Scope note:** Phase 0 delivers correct *values*. `SourceChip`s arrive with the component layer (Phase 2); until then the source renders as plain text ("from photo"), because shipping correct values with **no** indication of where they came from is half of what F1 was about. `decidePrefill` returns the source per field from day one so nothing is rewired later.

## 2. Design principles

1. **Confirm, don't compose.** The app proposes; the user accepts or corrects. A screen that starts empty has failed unless nothing could be read.
2. **The photo is the truth.** The user's own photo is always visible next to whatever the app claims. Any doubt is resolved by looking, not by reading field names.
3. **Honest uncertainty.** Never present a guess as fact. Show what is known, what is uncertain, and what it's based on — in words a novice understands.
4. **Cheap to be unsure.** "Not sure" is always available and never a dead end. Nothing forces a guess. **"Not sure" always moves the card forward — it never parks it** (§5.2 B); parking a card is a separate, quieter action called Skip.
5. **Quiet surface, loud content.** The interface is neutral and restrained; the card photos and the numbers carry the color.
6. **Almost nothing is unrecoverable, and the exceptions say so before they happen.** Confirms are recoverable (§5.8); delete is not, and its copy says so first. Mistakes found later are correctable through Edit identity and the Recently confirmed strip, not only through a timed undo.
7. **Phone first, desktop deliberate.** Designed at 375px; desktop is a considered layout, not a stretched one.

---

## 3. Visual system (tokens) **[DECISION]**

**Direction: quiet utility.** Dark-first, restrained, data-forward. The card images provide color.

Tokens are the single source of truth. They live as CSS custom properties, exposed to Tailwind through theme config. **No component may hardcode a hex value, font size, spacing value or radius.**

### 3.0 Wiring (do this first)

This is F3's actual mechanism. §3.1 invents a semantic set, and shadcn/ui primitives (Dialog, Select, Popover, Toast, Input) style themselves internally with `bg-background`, `bg-popover`, `border-input`, `ring-ring` — which resolve to **shadcn's own variables**, not to anything below. Until those variables are redefined in terms of the plan's tokens, "wrapped so tokens apply" does nothing. Note also that `--accent` is itself a shadcn variable name meaning *hover surface*, so defining it as the primary action would turn every menu hover bright blue while leaving buttons unstyled.

**Read the Tailwind major version from `package.json` and follow the matching branch below.**

- **v4:** declare tokens once in `app/globals.css` inside `@theme inline`. There is no colors block in `tailwind.config`.
- **v3:** declare the custom properties in `app/globals.css` and map them in `tailwind.config` by **replacing** `theme.colors` wholesale — not `extend` (§12 Phase 1, layer 1).

**Renaming.** The plan's `--accent` / `--accent-contrast` become **`--action` / `--action-contrast`**, and every plan token is namespaced **`--ct-*`** (`--ct-bg`, `--ct-surface`, `--ct-action`, …) so a plan token can never collide with a shadcn variable of the same name. §3.1 and the rest of this document use the namespaced names.

**Mapping.** Redefine every shadcn variable in terms of the plan's tokens, **and** declare the matching Tailwind theme color entry — both halves are required, because layer 1 of §12 Phase 1 deletes the default palette and shadcn's own utility classes (`bg-background`, `bg-popover`, `border-input`) must still resolve afterwards.

| shadcn variable | Value | Tailwind theme color entry |
|---|---|---|
| `--background` / `--foreground` | `var(--ct-bg)` / `var(--ct-text)` | `--color-background`, `--color-foreground` |
| `--card` / `--card-foreground` | `var(--ct-surface)` / `var(--ct-text)` | `--color-card`, `--color-card-foreground` |
| `--popover` / `--popover-foreground` | `var(--ct-surface-raised)` / `var(--ct-text)` | `--color-popover`, `--color-popover-foreground` |
| `--primary` / `--primary-foreground` | `var(--ct-action)` / `var(--ct-action-contrast)` | `--color-primary`, `--color-primary-foreground` |
| `--secondary` / `--secondary-foreground` | `var(--ct-surface-raised)` / `var(--ct-text)` | `--color-secondary`, `--color-secondary-foreground` |
| `--muted` / `--muted-foreground` | `var(--ct-surface-raised)` / `var(--ct-text-muted)` | `--color-muted`, `--color-muted-foreground` |
| `--accent` / `--accent-foreground` (shadcn's *hover surface*) | `var(--ct-surface-raised)` / `var(--ct-text)` | `--color-accent`, `--color-accent-foreground` |
| `--destructive` / `--destructive-foreground` | `var(--ct-negative)` / `var(--ct-bg)` | `--color-destructive`, `--color-destructive-foreground` |
| `--border` | `var(--ct-border)` | `--color-border` |
| `--input` | `var(--ct-border-strong)` | `--color-input` |
| `--ring` | `var(--ct-action)` | `--color-ring` |
| `--chart-1` … `--chart-5` | from the semantic set: `--ct-action`, `--ct-positive`, `--ct-info`, `--ct-caution`, `--ct-text-muted` | `--color-chart-1` … `--color-chart-5` |

Then pin `class="dark"` on `<html>` in `app/layout.tsx`, set `color-scheme: dark` on `:root`, add `<meta name="theme-color" content="#0B0C0E">`, and **do not read `prefers-color-scheme` in V1**. (The viewport meta must not set `user-scalable=no` or `maximum-scale` — see §4 `PhotoViewer` and §12 Phase 1.)

### 3.1 Color

Neutral ramp (dark-first). Semantic names are what components use; raw ramp values are never referenced directly in components.

| Semantic token | Role | Dark value | Min ratio, against what |
|---|---|---|---|
| `--ct-bg` | App background | `#0B0C0E` | background |
| `--ct-surface` | Cards, panels | `#141619` | background |
| `--ct-surface-raised` | Popovers, sheets, sticky bars | `#1B1E23` | background |
| `--ct-border` | Hairlines, dividers **only** | `#282C33` | 1.19 on `--ct-surface-raised` — decorative, never the sole indicator of a control |
| `--ct-border-strong` | Input borders, focus targets | `#6B7484` **(was `#3A404A`)** | 3.55 on `--ct-surface-raised` (4.15 on `--ct-bg`) — clears 3:1 |
| `--ct-text` | Primary text | `#F2F4F7` | 15.17 on `--ct-surface-raised` |
| `--ct-text-muted` | Secondary text, labels | `#A3ABB8` | 7.22 on `--ct-surface-raised` |
| `--ct-text-subtle` | Tertiary, metadata | `#868F9D` **(was `#727A88`)** | 5.12 on `--ct-surface-raised` (5.99 on `--ct-bg`) — clears 4.5:1 |
| `--ct-action` | Primary action, selection | `#4C8DFF` | 5.22 on `--ct-surface-raised` (6.11 on `--ct-bg`) |
| `--ct-action-contrast` | Text on `--ct-action` | `#0B0C0E` | 6.11 on `--ct-action` |
| `--ct-positive` | Gains, success | `#3FB98A` | 6.78 on `--ct-surface-raised` |
| `--ct-negative` | Losses, destructive | `#E5695F` | 5.19 on `--ct-surface-raised` |
| `--ct-caution` | Needs attention | `#E0A33E` | 7.54 on `--ct-surface-raised` |
| `--ct-info` | Neutral informational | `#7FA8D9` | 6.77 on `--ct-surface-raised` |

The two changed values are corrections against §3.1's own stated AA rule: `--ct-text-subtle` at `#727A88` scored 3.86 against `--ct-surface-raised` where body text needs 4.5:1, and `--ct-border-strong` at `#3A404A` scored 1.60 where a meaningful boundary needs 3:1. Phase 1's acceptance gate was therefore unsatisfiable as written. §3 is **[DECISION]**, so these proceed without waiting but are **flagged to Nick explicitly** rather than landing silently.

**Confidence and state colors are semantic, never decorative:**

| Token | Use |
|---|---|
| `--ct-conf-high` | = `--ct-positive` |
| `--ct-conf-medium` | = `--ct-info` |
| `--ct-conf-low` | = `--ct-caution` |
| `--ct-conf-none` | **Own value at `--ct-text-muted` strength — `#A3ABB8`.** "No value" is a *state*, not metadata, and it is the state most of the collection occupies for months (§8.1). It no longer aliases `--ct-text-subtle`. |

**Rules:**
- Every text/background pair must meet **WCAG AA: 4.5:1** for body text, **3:1** for large text (≥18.66px bold or ≥24px) and for meaningful UI boundaries (input borders, focus rings, chart strokes).
- Color is never the only signal. Confidence shows a **word plus a shape**: **High = filled circle, Medium = half-filled circle, Low = hollow circle, No value = dash** — the same four shapes everywhere confidence appears (badge, queue row, collection column, chart legend), so a novice learns one vocabulary. Gains and losses show **a `+`/`−` sign *and* an up/down caret glyph** (one glyph of difference between `−$4.20` and `+$4.20` at `--text-sm` is a weak differentiator). Flags show an icon plus text.
- A light theme is **not** built in V1, but tokens are structured so one can be added by swapping values only. Components must not assume dark.
- `--ct-border` is **decorative separation only** — dividers and hairlines. Any boundary that is the sole indicator of an interactive control or of a selected state uses `--ct-border-strong` or `--ct-action`.
- The selected `CandidateCard` border uses **`--ct-action`** plus its checkmark, not `--ct-border-strong`. Selection is an answer, not a boundary.
- The primary button is **`--ct-action-contrast` on `--ct-action`** (6.11:1), never `--ct-text` on `--ct-action` (2.9:1) — shadcn's default `bg-primary text-primary-foreground` pairing otherwise produces exactly the failing one, which is why §3.0 maps `--primary-foreground` explicitly.
- The focus ring is **2px `--ct-action` with a 2px `--ct-bg` offset** (6.11:1 on `--ct-bg`).
- **Restraint applies to color and ornament, never to legibility or reach.**

### 3.2 Type

System font stack (no web font in V1 — one less request, native rendering on iOS).

**The scale is authored in `rem` against a 16px root.** The px figures below are the 1.0 rendering, not the definition — this is what makes the 200% text check in §9 and §13 meaningful.

| Token | Size / line height | Use |
|---|---|---|
| `--text-display` | 1.75rem / 2.125rem (28 / 34), semibold | Screen titles, dashboard headline value |
| `--text-title` | 1.25rem / 1.75rem (20 / 28), semibold | Section titles, card identity line |
| `--text-body` | 1rem / 1.5rem (16 / 24) | Default. **Never below 16px for inputs** (iOS zooms on focus otherwise) |
| `--text-sm` | 0.875rem / 1.25rem (14 / 20) | Secondary text, table cells on desktop, `FlagChip` labels |
| `--text-xs` | 0.75rem / 1rem (12 / 16) | Metadata, chip text. Never for anything the user must read to act. **12px chip text is body text for contrast purposes and gets no large-text exemption; never pair it with `--ct-text-subtle`.** |

Numerals in tables, values and money use `font-variant-numeric: tabular-nums`.

### 3.3 Space, radius, elevation, motion

- **Spacing scale** (`--space-1` … `--space-8`): 4, 8, 12, 16, 24, 32, 48, 64. Nothing off-scale.
- **Radius:** `--radius-sm` 6, `--radius-md` 10, `--radius-lg` 16, `--radius-full`. Photos and cards use `--radius-md`.
- **Elevation:** two levels only — flat (`--ct-surface`) and raised (`--ct-surface-raised` + a soft shadow). No layered shadow system.
- **Motion:** 120ms ease-out for state changes, 200ms for sheets and transitions. Anything longer is decoration. Respect `prefers-reduced-motion: reduce` by dropping to instant.
- **Reduced motion covers keyframes, not just transitions.** Under `prefers-reduced-motion: reduce`: skeletons are a static fill with no shimmer — this is a `@keyframes` animation, not a transition, and must be disabled explicitly; chart entry animations are off; card-to-card advance is instant with focus moved to the new card's heading (§5.3).

### 3.4 Layout and breakpoints

| Width | Layout |
|---|---|
| < 640 (phone, baseline 375) | Single column, 16px gutters, sticky bottom action bar, bottom nav |
| 640–1023 (tablet) | Single column, max 640px, centered |
| ≥ 1024 (desktop) | Content max-width **1120px, centered**. Review screen becomes a two-pane split (photo left, decision right). Collection becomes a table. |

**The current "narrow column pinned left with an empty gutter" is a bug, not a layout.** Every screen must be centered and use the width it's given.

**Viewport units and safe areas (phone).** Use **`dvh`, never `vh`** — iOS Safari's `vh` ignores the collapsing toolbar, so a `45vh` photo plus a fixed bar puts the primary action under Safari's chrome regardless of the percentage. Add `viewport-fit=cover` to the viewport meta (without `user-scalable=no` or `maximum-scale`, per §9), `padding-bottom: env(safe-area-inset-bottom)` on the sticky action bar, `overscroll-behavior: contain` on scroll containers, and `scroll-padding-bottom` equal to the bar height so no focused field sits behind it — a fixed bar over §5.3's in-place editors is **WCAG 2.2 SC 2.4.11 Focus Not Obscured (Minimum), Level AA**, failure technique F110, which hits desktop keyboard users too.

---

## 4. Component inventory

shadcn/ui primitives under `components/ui/` are **vendored source, edited in place** — not a dependency to wrap. Theming happens once, via the §3.0 variable mapping; a primitive is edited directly only when a variable cannot express the change. **Do not create wrapper components around primitives** — screens import them directly. Every component ships with its states: default, hover, focus-visible, active, disabled, loading, error.

### New components (build these)

**Shell**
- `AppShell` — top bar on desktop, bottom tab bar on phone: **Home · Collection · Add · Review**. Home is the dashboard (before M3, the collection summary — §8.1); **Add** is a sheet with two paths, "Photograph cards" (→ `/scan`, default, visually primary) and "Type it in" (→ the M1 search-and-add route, §7.1). Settings and Validation move to a header overflow. The bottom tab bar is **hidden on the review screen**, or four nav slots and the action bar compete for the same 90px.
  **Review badge:** counts items **awaiting a decision** — `needs_review` plus failed identifications plus incomplete-scan drafts — and explicitly **not** `unpriced`, which is the permanent steady state and would make the badge non-zero forever. Accessible name: "Review, 6 cards waiting".
- `PageHeader` — title, optional back affordance, optional right-side action.
- `StickyActionBar` — phone: fixed bottom bar holding the primary action. Never let the primary action scroll out of reach. States include **keyboard-open**: anchored with `window.visualViewport` (`height` + `offsetTop`) plus a Done control, because the iOS software keyboard does **not** resize the layout viewport, so neither `dvh` nor safe-area padding covers it — and §5.3 makes field editing the primary interaction, so this fires on nearly every card.

**Content**
- `PhotoViewer` — front/back/extra photos. Fills its frame on a **`--ct-surface`** background (never white), pinch/double-tap to zoom, swipe between sides, a visible label per side, rotate control. **Gestures are never the only way in:** button equivalents for **zoom in / zoom out / previous side / next side** (rotate-by-button and zoom-percentage announcements can wait for Phase 4). On desktop, gesture-only is unreachable by keyboard (§13.9); on iOS, VoiceOver intercepts pinch and swipe. The image's accessible name is its side label ("Front of card, your photo") — never a generated description, which would be a second source of false authority about the user's own photo. Loading = skeleton, failure = a retry tile; a card with no photo renders a labelled placeholder tile with "Add photos", never a broken image or blank frame. Loads the thumbnail first and swaps to the full-size original on zoom (§10.1).
- `IdentityLine` — the canonical one-line rendering of a card: `2026 Topps Flagship · Milton Williams · #142 · Base`. Used in the queue, review screen, collection and card detail so the same card always reads the same way. **Rendering contract:** order is year · set (+subset) · player(s) · #number · parallel (+/print run) · serial · grade; two players render as "Name & Name", three or more as "Name +2"; **Base is shown explicitly, never omitted**; player, number and parallel never truncate; a `lines` prop (1 | 2), max two lines then ellipsis. **Truncation is visual only — the element's accessible name is always the full identity string.**
- `SourceChip` — where a fact came from: **From photo** / **From catalog** / **From this batch** / **Default** / **You entered**. Muted but never below the §9 contrast and target rules; always present on identity fields.
- `FlagChip` — plain-language warning with an icon: "Not sure which version", "Not in catalog", "Couldn't read the serial". Label text is `--text-sm`, not `--text-xs`, since it is both tappable and consequential. Tapping opens the matching `HelpPanel` and offers the fix. Non-blocking flags render as chips **below** the primary action; the blocking one becomes the question (§5.2 B).
- `LocationChip` — the session label and `#seq` together: "Toploader box 1 · #37" (DESIGN §6.2). Rendered on every queue row, the capture screen, every tray chip, retake prompts, the review screen and card detail. Without it, "which version is this?" is unanswerable with 200 cards on the table.
- `IdentityUnverifiedChip` — text ("Version not verified") plus the hollow-circle confidence shape, never color alone, so a card confirmed through "Not sure" never reads as settled on a collection row.
- `ValueDisplay` — value, range, and a confidence word. Never a value without its confidence. **Ships with a pre-valuation state (§8.1), and that is the *first* state built** — it is the only one that renders for the first several weeks.
- `ConfidenceBadge` — High / Medium / Low / No value: word plus color plus **the named shapes in §3.1** (filled / half-filled / hollow circle / dash). Also ships with the pre-valuation state (§8.1): no badge at all rather than an empty one.
- `FieldRow` — a labeled fact in read mode; tap to edit in place. Shows its `SourceChip`. **This replaces the form.** Read mode is a `<button>` whose accessible name is `<label>: <value>, from <source>` (§5.3).
- `CandidateCard` — a proposed match. **The text-only layout is the default and is designed and snapshotted first:** `IdentityLine`, match reasons in plain language ("card number and year match, set name differs"), estimated raw value. DESIGN §5.1 hotlinks `reference_image_url` *only if permitted*, so **absent is the normal case**; when an image exists it occupies a **fixed-aspect slot that reserves its space whether or not it loads**, carries `alt=""` (the card's accessible name is its `IdentityLine` plus reasons), and **collapses silently to the text layout on failure** — never to a broken-image icon. Test the failed-load collapse. Selected state uses a `--ct-action` border and a checkmark, never a background swap.
- `Picker` — the most complex control in the app (set → parallel with print runs, grader, condition, storage, search-and-add). **Built once**, or the parallel chooser gets built twice with different behavior and §13.9 cannot pass. Searchable bottom sheet on phone, popover on desktop; sectioned with secondary text; "Not in the list" free-text escape; satisfies the APG combobox/listbox keyboard contract (type to filter, arrows to move, Enter to select, Esc to close returning focus to the trigger). Parallel-picker specifics in §5.2 B.
- `SessionTray` — per-card `#seq` chip with status and a one-line plain-English failure reason; retake requests pinned at the top (DESIGN §6.2). Without it a card that fails identification mid-batch is invisible until Review.
- `HelpPanel` — renders `src/ui/help/`. The V1 set is DESIGN §6.7(d)'s three panels plus "Not in the catalogs — what that means" and the condition tiers. **The content is written in Phase 1 alongside the copy map**, or `FlagChip`'s "tapping explains" has nothing behind it.
- `DuplicateDialog` — DESIGN §6.7 step 0: "You already have #23/99 (Toploader box 1 · #12)", with **Delete this scan** / **It's a different copy**.
- `EmptyState`, `ErrorState`, `Skeleton`, `Toast` (with Undo; `role="status"`, tabbable, bound to a documented shortcut), `ConfirmSheet` — used for genuinely destructive, non-undoable actions, which after §5.8 means **delete**.

**Data**
- `StatTile` — dashboard KPI: label, big number, secondary context line. A tile that cannot render its primary number is **absent, not empty** (§7.4a).
- `CollectionRow` / `CollectionCard` — table row on desktop (44px row at `--text-sm`), card on phone.
- `SparkLine`, `ValueChart`, `AllocationBars` — **inline SVG written directly, not a charting library** (§7.6); follow the `dataviz` skill conventions for form and labelling.

### Primitives used as-is after theming

Dialog, Sheet, Select, Popover, Command, Toast, Input, Textarea, Button, Checkbox, Switch, Tabs, Badge, Separator, Skeleton and Tooltip are used **directly from `components/ui/`** once §3.0's mapping is in place. They get no wrappers. Where one of them needs behavior this document specifies (the `Picker`'s search-and-sections, `DuplicateDialog`'s actions), the new component composes the primitive rather than replacing or re-styling it.

---

## 5. The review screen (the one that matters)

This is where the user spends his time. It is a **decision surface**, not a form.

### 5.0 Parity checklist

Phase 3 **re-skins and re-sequences the existing review screen. It is not a greenfield rebuild.** Every control below exists in DESIGN §6.7 and must still exist and work afterwards:

- Serial input, validated `serial ≤ print_run`.
- Raw / Graded, with the plain-language condition picker **and its inline value-effect line verbatim**: *"Light wear: ~$18 instead of ~$30 (rough estimate)"*.
- Grader, grade, cert number.
- Auto (with type), Memorabilia, and Rookie with the `rookie_conflict` warning.
- Storage.
- Collapsible cost basis, with the pack-pull $0 hint (§7.4 states the full wording).
- Per-candidate estimated RAW value.
- The linked SportsCardsPro product name.
- Per-flag help panels.
- The buttons **Confirm**, **Skip**, **Not a card / delete**, **Rescan**.

*Everything in DESIGN §6.7 is present. §5 changes how it is surfaced, not what is captured. Removing any item is **[DECISION]**.*

### 5.1 Layout

> **See §16** for visual match confirmation — reference image or session-sibling photo shown beside the user's photo. It changes the layout of states A and B and of bulk confirm, conditional on image availability.

**Phone:** the photo occupies the top of the viewport at **`max-height: 40dvh`** and **collapses on interaction, not by state** — to a thumbnail strip on scroll or when an editor opens, and to 64px while editing, tapping to re-expand. (Collapsing *by state* was rejected: in state B the photo is exactly what gets tilted against the reference image to answer the question, so shrinking it there fights §2 principle 2.) Below it: the proposed identity as an `IdentityLine`, the blocking question if there is one, flags as chips, then a sticky bottom bar with the primary action. **The decision column keeps at least 280px.** Below 700px height, state B caps at the top candidate expanded plus two collapsed to one line each.

See §3.4 for `dvh`, `viewport-fit=cover`, safe-area padding and `scroll-padding-bottom`, and §4 `StickyActionBar` for the keyboard-open state.

**Desktop (≥1024):** two panes. Left: photo, large. Right: decision column. **Above the fold at 900px height: the photo, the `IdentityLine`, the flags and the primary action** — details may scroll. (Stated this way rather than "nothing below the fold", which invites shrinking type below the §3.2 floors.)

### 5.2 The states

Which state a card is in is decided by the pipeline (DESIGN §6.3 step 8), not by the UI. The mapping is fixed:

| Pipeline result | UI state | What a screen reader announces on arrival |
|---|---|---|
| `ready` | **A. Confident match** | "Confident match. <IdentityLine>. Add to collection." |
| `needs_review`, read-time `low_stakes` — no `always` flag, and every `at_risk` flag has a known, non-partial `value_at_risk_cents` below `REVIEW_THRESHOLD` (DESIGN §6.3 step 8, §5.3) | **A with caveat** — single-tap confirm plus one muted line naming what is unverified and the dollar at stake | "Confident match, version not verified, about $4 at stake. <IdentityLine>." |
| `needs_review` with a blocking flag (`always`, or `at_risk` at or above `REVIEW_THRESHOLD`, or value at risk unknown or partial) | **B. Uncertain** | "Needs a look. <IdentityLine>. Question: which version is this?" |
| `no_catalog_match` | **C. Not in catalog** — blocking mode `always`, **never bulk-eligible** | "Not in the catalogs. Fill in what the app read from your photo." |
| identification `failed` | **D. Couldn't identify** | "Couldn't identify this card. <reason>." |
| `redemption` | **E. Redemption** — `always`-blocking | "This is a redemption voucher." |

**The mechanism.** Review state is produced by a single exported function, **`deriveReviewState(identification, flagRegistry, cfg)`** in `/src/domain/review`, returning `{ state, blockingFlag, valueAtRiskCents, bulkGroup }`. The UI imports it and renders the result. It never recomputes status, never re-reads blocking modes, never compares a score to a threshold. One unit test per row of DESIGN §6.3 step 8 crossed with §5.3's blocking modes, reading `REVIEW_THRESHOLD` from config so a tunable change flows through. **Fixtures store raw inputs — flags, scores, `value_at_risk_cents`, `value_at_risk_partial` — never a derived state string**, or the tunable DESIGN built specifically so cheap cards stop costing attention becomes the one knob nobody can turn safely.

**A. Confident match** (cross-source agreement, no blocking flags)
- Shows: photo, `IdentityLine`, `LocationChip`, and a single line saying where it came from ("Found in the card database, and your photo agrees").
- Primary: **Add to collection**. Secondary: **Check the details** (§5.3).
- Target: one tap.
- **The one permitted interruption in the one-tap path** is the duplicate block below. Nothing else may interrupt it.

**A with caveat** (`low_stakes`) — identical, plus one muted line: *"Version not verified — about $4 at stake."* Still one tap.

**B. Uncertain** (candidates exist but weak or disputed, or a flag blocks)
- Shows: photo, up to **3** `CandidateCard`s with plain-language reasons, and **one** question — see the priority rule below.
- Identity fields are pre-filled per **§5.4** (which is the single source of the rule; this section does not restate it).
- Primary: **Add to collection**, enabled once the blocking question is answered. Then **two distinct secondary actions**, with Not sure visually primary of the pair:
  - **"Not sure — add it anyway"**, sub-line *"We'll use the lower value and flag it. You can fix it any time."* Per DESIGN §6.7(b) this confirms the item as `owned` against the **lowest-value plausible candidate**, writes `item.identity_unverified`, adds the valuation flag, caps confidence at low, and records `explicit_fields`. The toast names the upside in dollars: *"Added as Base. If it turns out to be Silver it's worth about $30 — we'll flag it."*
  - **"Skip for now"**, quieter — leaves the item in `needs_review`. This is the action that sets a card aside; "Not sure" does not.

**One blocking question at a time.** `parallel_uncertain` + `photo_quality` + `no_back_photo` is an ordinary outcome for a phone photo of a sleeved base card; rendered as a uniform chip row, none of them reads as *the thing you must answer*. The UI picks the **highest-priority blocking flag** — `always` before blocking `at_risk`; within `at_risk`, highest `value_at_risk_cents` first — and renders it as the question with its choices directly under the identity line, **with the dollar stake in plain words** ("Silver is worth about $30 more than Base"). Non-blocking flags render as `FlagChip`s below the primary action. When one is answered the next takes its place. The answered field is recorded in `identification.explicit_fields` per DESIGN §6.7(a). **The first time a given blocking flag type appears in a session, its `HelpPanel` is expanded inline above the question** (§8); on later cards it collapses to the marker.

**The disabled Confirm carries its reason inline**, and uses `aria-disabled="true"` rather than the `disabled` attribute so it stays focusable and can be heard, with the reason wired through `aria-describedby`; activating it moves focus to the unanswered question. A `disabled` button is removed from the tab order and announces nothing.

**The parallel picker** (the app's highest-stakes control — DESIGN §6.5 step 5 says this decision can swing value 5–20×). Chrome/Prizm-style sets carry 20–40 parallels, so: show only parallels still plausible after DESIGN §6.5's filtering; **pre-select the pipeline's most likely candidate per DESIGN §6.5 step 4 — not Base** (see the cross-reference in state C, which is a different rule for a different situation); each option shows print run and estimated raw value (DESIGN §6.7c); "Show all parallels" reveals the rest; searchable above 8 options; and a persistent **"What am I looking at?"** row at the top opening the Base-vs-Silver help panel. The picker is the moment of need, and prose-level glossary markers never reach it.

**C. Not in catalog** (no usable candidate)
- Shows: photo, a one-line explanation ("This set isn't in the price catalogs yet — common for brand-new releases"), and identity fields **pre-filled per §5.4** with `SourceChip`s.
- Required to save: **player, year, manufacturer, set, card number, parallel**. Manufacturer and parallel are components of `identity_key`, which DESIGN §5.1 makes **immutable after creation** — a guessed or null value is uncorrectable without re-pointing `card_id`. Everything else is optional and collapsed (§5.2.1).
- **Parallel defaults to Base**, labelled *"Base — tap if this is a parallel"*. **This default applies to state C only**, where no candidate exists and no pipeline parallel resolution has happened. In state B the picker pre-selects the pipeline's most-likely parallel (above, per DESIGN §6.5 step 4) — the two rules must not be confused.
- Set and storage are pre-filled from `scan_session.defaults` (`set_hint` and `storage`, DESIGN §5.1); **year and manufacturer require the §5.5 amendment adding those two keys to the `defaults` jsonb**, and until it lands they are per-card fields. All four, once available, carry the `SourceChip` "From this batch", and one edit in the §5.5 batch header fixes every remaining card. See §5.5.
- Primary: **Add to collection**. The card is saved unlinked and re-links automatically when catalogs catch up — and the confirmation says so in the same words the collection and dashboard use: *"Saved. This one's not priced yet — we check nightly and fill in values automatically."* (§7.4a).
- **When `extraction.kind == 'not_a_card'`, show the not-a-card branch instead of state C proper.** DESIGN §6.3 step 3 sets `no_catalog_match` for that case too, so a photo of a receipt, a sticker or a sleeve would otherwise be told its set isn't in the catalogs and then asked for six required identity fields. The branch is: photo, *"This doesn't look like a card"*, with **Delete this scan** primary and **It is a card, let me enter it** secondary, which drops into state C proper. (This is distinct from "Extraction read nothing" below, which is the unreadable-photo case.)
- Consecutive state-C cards sharing the session defaults render in the batch mode described in **§5.7**.

**D. Couldn't identify** (`failed`)
- Photo, one plain sentence from the copy map per `failure_reason`, and three exits: **Try again** (primary), **Retake photos**, and **Enter it myself** — which drops into state C with whatever extraction exists, and is the only exit that still works after the physical card is back in the box.
- The card is **never** removed from the queue or the session tray.

**E. Redemption** — `always`-blocking. The explanation from the copy map ("This is a voucher you mail in — the actual card comes later, not in the pack") plus the custom-card flow.

**Duplicate blocked on confirm.** DESIGN §6.7 step 0 interrupts the confirm with *"You already have #23/99 (Toploader box 1 · #12)"* and the actions **Delete this scan** / **It's a different copy** (`DuplicateDialog`). Without this branch an agent ships a confirm that silently fails the first time two of the same card come out of a box. Note that the check keys on same `card_id` **and** same non-null `serial_number`, so it never fires for unserialled base cards — which is correct, and is why §7.2 and the confirm line in §5.5 explain multiple copies rather than blocking them.

**Incomplete scan.** Drafts older than 30 minutes offer **Resume** / **Delete**, in the session tray and as an **"Unfinished scans (N)"** band above the queue. This is what happens when the phone sleeps mid-batch. (Justified by DESIGN §5.1's draft lifecycle and §6.7's review surface.)

**Extraction read nothing.** Composing §5.4's "no value" row with state C's required fields would otherwise yield **six blank required fields** on a glare-ruined photo — F2 in a new costume, on the most common card type, in a plan whose first principle forbids exactly that. **Do not show the form.** Show the photo, *"This photo didn't come out — the app couldn't read anything on it"*, with **Retake** primary and "Enter it by hand" secondary.

### 5.2.1 Fields that always exist but rarely need attention

The disclosure layer that keeps §5.0's parity from resurrecting the form:

- **Condition** defaults to raw / `market`, rendered as a `FieldRow` reading *"Condition: Typical raw card"* with a `SourceChip` "Default".
- **Storage** comes from `scan_session.defaults` with the chip "From this session". Session defaults never set condition (DESIGN §5.1).
- **Serial, toggles, cost basis and notes** are collapsed under one **"More details"**, expanded only when a flag makes one of them the blocking question.

**The visible correctable defaults are what make one-tap confirm honest** rather than a confirm that silently accepts unstated values.

### 5.3 Correction surface

Tapping a field turns it into an editor in place. No modal, no separate edit page. Pickers, not free text, wherever a list exists (set → parallel list with print runs; grader; condition) — all through the one `Picker` in §4. Free text is the escape hatch, labeled "Not in the list".

**"Check the details"** (state A's secondary action, renamed from "Something's wrong", which reads as reporting a bug rather than editing a card) **expands the same card in place** into the state-B/C decision surface. It never navigates away and never clears what was proposed: every field arrives pre-filled from the confirmed candidate with its `SourceChip`, so correcting one field costs one edit. The primary action stays **Add to collection**; a secondary **"Never mind"** collapses back to state A, discarding edits. Focus moves to the first editable field on expand and returns to the trigger on collapse. This is also the surface reached from every audit spot-check row (§5.5).

**Focus and keyboard contract** (referenced by §13.9):

| Element / event | Contract |
|---|---|
| `FieldRow`, read mode | A `<button>` whose accessible name is `<label>: <value>, from <source>`. Activating it swaps in the editor with focus moved into it. |
| Editor open, **Enter** | Commits the field and returns focus to the trigger. |
| Editor open, **Escape** | Cancels and returns focus to the trigger. The editor is the **single Escape owner** while open, so the binding is not duplicated. |
| Editor open, primary action | **Not Enter-activatable** — reached by Tab. Otherwise Enter confirms the card and discards uncommitted text, an identity-changing action on immutable data. |
| Candidates | A `radiogroup` with roving tabindex; arrows move, Space/Enter selects. |
| Auto-advance | Focus moves programmatically to the **new card's heading** (`tabindex="-1"`), not its primary action — so the identity is announced *before* the action is reachable. Tab then reaches the action. |
| Undo toast | `role="status"`, tabbable, and bound to a documented shortcut. |

**Edits are local until confirm — no per-keystroke round-trip** (§5.5.1).

### 5.4 Pre-fill rules **[DECISION]**

Keyed on **both** inputs: the candidate's score and the per-field extraction confidence. Named constants `PREFILL_MIN_CANDIDATE_SCORE` (0.80) and `PREFILL_MIN_EXTRACTION_CONF` (0.70) live **in the flag registry / review config module in `/src/domain/review`, alongside `REVIEW_THRESHOLD` (DESIGN §5.3) and the 0.85 (`ready`) and 0.8 (SCP link) thresholds of DESIGN §6.3 step 8 and §6.4** — four numbers in one file rather than four numbers in three. They are domain constants and do **not** belong in DESIGN §14's env-var layer.

| Candidate score | Field extraction confidence | What fills the field |
|---|---|---|
| ≥ `PREFILL_MIN_CANDIDATE_SCORE` (0.80) **[TUNABLE]** | any | **The candidate.** `SourceChip` "From catalog" |
| < 0.80 | ≥ `PREFILL_MIN_EXTRACTION_CONF` (0.70) **[TUNABLE]** | **The photo extraction.** The candidate appears as a suggestion the user can tap to apply, never as the default |
| < 0.80 | < 0.70 | **A dimmed suggestion the user must tap to accept** — never a filled value, announced as a suggestion, and it does **not** count as "answered" |
| No candidate | ≥ 0.70 | The photo extraction |
| No candidate | < 0.70 | Dimmed suggestion as above |
| Any | no value for the field | Blank, and the field is marked "Couldn't read this" |

**Field mapping:** player ← `players[0].name`; year ← `set_year`, else `copyright_year` shown as *"Year on the card may be the copyright year"*; card number ← `card_number`; set ← `set_name` **as a picker seed, never a saved value**; serial ← `serial.printed` only when `readable = 'yes'`; rookie ← `rookie_logo_printed` at ≥ 0.8; auto ← only when `certification = 'manufacturer_certified'`.

**Parallel, print run and subset are taken from the resolved candidate (DESIGN §6.5) or left blank with "Not sure which version".** They are never inferred from finish descriptors. A printed parallel name (`finish.parallel_name_printed`) reaches the UI through the pipeline's resolution, not as a direct pre-fill.

Handle the shapes "has no value" doesn't cover: `players` is an array, `serial.readable` is four-valued, `autograph.present` is nullable.

**"Answered"** means: read above the extraction floor, taken from a candidate, or user-touched. The §5.6 interaction counts are measured against that definition.

Every pre-filled field carries a `SourceChip`. This directly fixes the Brian Thomas Jr. case, where a 25% "Bruce Matthews 1994 Topps" match populated the form.

### 5.5 Queue and batch flow

- Queue order, progress, resumption and completion: **§5.5.1**.
- Each row: thumbnail, `IdentityLine` (max two lines), `LocationChip`, state chip (Confident / Needs a look / Not in catalog / Couldn't identify) and the `ConfidenceBadge` shape. **No percentages.**
- **Density:** the queue shows **at least 8 rows at 375×640**, row height ≤ 64px, `IdentityLine` capped at two lines. Asserted in §13.
- **A persistent, editable batch header** sits above the queue: *"This batch: 2026 Topps Flagship · 2026 · Toploader — change"*. It is a real labelled control, not a caption, and it edits `scan_session.defaults` (DESIGN §5.1) so **one edit fixes every remaining card instead of one**. Set, year, manufacturer and storage come from it; condition never does. For a mostly-manual collection this is the largest single time saving available: without it a 40-card box costs four redundant taps per card — 160 taps to restate four facts stated once. **F9's verification is concrete:** scan two cards from different sets in one session; the second shows the batch default with a visible "From this batch" chip that one tap clears.
- **What `scan_session.defaults` actually holds today is `{storage, set_hint}`** (DESIGN §5.1) — `set_hint` is the field F9 needs, and `storage` is what §5.2.1 already reads. **Year and manufacturer are not in that column.** Carrying them has two possible mechanisms: **(a) add `year` and `manufacturer` keys to the `defaults` jsonb** — a DESIGN §5.1 amendment, to be raised per §0's rule, and cheap because the column is already jsonb and nothing reads it positionally; or **(b) derive them from the last card confirmed in the session**, as §14 item 5 describes. **This plan takes (a).** The batch header stays the single editable source of all four fields, which is the only version of this that keeps "one edit fixes every remaining card" true; (b) would make the header a caption over values it cannot set. Until the amendment lands, the header carries set and storage only, and year and manufacturer are per-card fields — which is a slower build, not a different one.
- **Filters** (the Identification tab): All / Needs a look / Not in catalog / Couldn't identify / **Unverified identity (N)** / **Skipped (N)** / Spot check. Neither the unverified pile nor the skipped pile may be invisible (DESIGN §8.2).
- **"Unfinished scans (N)"** band above the queue (§5.2).

**Two bulk groups, not one** — two distinct populations need two distinct mechanisms:

1. **"Add N confident cards"** — state A only, with a compact preview list and per-row opt-out.
2. **"Confirm N low-value cards — version not verified, at most $X at stake"** — applies Not-sure semantics (DESIGN §6.7b), each row carrying the front thumbnail, the candidate `IdentityLine`, its estimated value and a per-row opt-out; bulk confirm sets `item.storage` from the session default. **Render the dollar figure, never the enum**; `REVIEW_THRESHOLD` is a DESIGN §5.3 tunable (default $5).

*Cards flagged `no_catalog_match` are `always`-blocking and reach neither group. Their fast path is the batch mode in §5.7.*

**The audit sample.** After each bulk confirm, **10% (minimum 2)** of the confirmed cards, low-stakes first, return as **Audit** items — a visually distinct "Spot check" row with a banner saying *why*: **"You confirmed this in a batch. Quick double-check — this is normal, not an error."** Actions: **Looks right** / **Fix it** (which opens §5.3). Without the distinct treatment, a confirmed card silently reappearing reads as the app losing work, and gets re-confirmed without being re-checked — which destroys both the accuracy metric the audit feeds (§7.5) and trust in the confirm button.

**Accessible semantics for the bulk groups** — they commit dozens of cards at one tap and are the least legible interaction non-visually. Each group is a `<fieldset>` whose legend names the group **and its stake**; each opt-out is a checkbox whose accessible name is the card's `IdentityLine` plus value, never a bare checkbox beside a thumbnail; the action button carries the live count and the stake in its own accessible name; opt-out changes and the result are announced ("11 cards added. 2 came back for a spot check."). Audit rows carry "Spot check" in their accessible name too.

**After each confirm:** advance automatically to the next card, with a toast carrying **Undo** (§5.8) and naming its card.

**Multiple copies are normal.** At confirm, an informational line — never a block: *"You already have 2 of this card. That's fine — this will be your 3rd copy."*

**"Recently confirmed"** — a persistent strip showing the last 5 cards as thumbnail + `IdentityLine` + `#seq`, each tappable straight into edit, **with no timer**. A mistake noticed seven cards later is outside any toast lifetime, and a timed auto-dismissing toast cannot be the only recovery path (SC 2.2.1); it is also unreachable by keyboard, since focus has just moved to the next card. Paired with the "Added today" filter in §7.2, this covers the real failure at a fraction of the cost of undo machinery.

### 5.5.1 Queue order, progress, resumption and completion

The queue is a **live query** ordered by `est_value_max_cents` desc (DESIGN §6.7): confirming a card removes it, and a background `identify` finishing inserts a new one — so "4 of 15" becomes "4 of 17" then "5 of 16". That reads as the app losing track, makes a finite job feel infinite, and is nondeterministic, so any E2E asserting it is flaky by construction. Therefore:

- **Snapshot the ordered item-id list on entry.** Items finishing identification mid-session append at the end and never reorder the current run.
- **Freeze the denominator at session open.** Render *"Reviewed 4 · 11 to go"*, with late arrivals on a separate quiet line (*"+3 more ready"*, tappable to fold in). The number in front of the user never grows or jumps.
- **Resume by the last item acted on**, with a header saying where it picked up — *"Picking up after #37 — Milton Williams"* — carrying the session label and `#seq` so it maps to the physical stack, and saying so explicitly when that card was confirmed elsewhere rather than silently relocating. It must survive an iOS Safari tab reload, which happens routinely mid-batch. (A last-item-id resume was chosen over an opaque URL cursor: same guarantees, no protocol with its own stale-cursor and back-button failure modes.)
- **Completion.** Skipped items stay in `needs_review`, so a session with three skips never empties and never reads as finished. When only skips remain: *"You've been through all 15. 3 set aside"* with a **Review the 3** action — never an empty state.
- **Component boundary.** The route is a server component resolving the queue and the current item and passing serialized props; the card surface is one client component owning draft edits, the pending-confirm state and the undo window; confirm is a server action returning the next item id, advanced optimistically. **Field edits are local until confirm — no per-keystroke round-trip.**

Queue ordering is an open question — see §14.

### 5.6 Speed targets **[TUNABLE]**

**The budgets are DESIGN §1.3's**, inherited rather than competed with: **≤ 8 s for a bulk-confirmed card, ≤ 40 s for a single review**, and **25 s per card median for capture** (§7.1a). Review is only part of the evening; getting 200 cards in is capture **plus** review.

**What is gated in CI is counted interactions, not seconds.** An interaction is one Playwright `click`, `fill`, `press` or `selectOption`; scrolling and hovering do not count; opening a picker and choosing a value counts as two. Gate on a counted E2E over a committed **40-card fixture queue** (32 state C sharing one set, 6 state A, 2 state B — the realistic distribution):

| Case | Ceiling |
|---|---|
| State A | **exactly 1** |
| State B with one blocking question | **≤ 6** (open the picker, choose, confirm, with headroom for one correction) |
| State C with the batch header carried | **≤ 4** — measured with set, storage, year and manufacturer all carried, i.e. after §5.5's `defaults` jsonb amendment. Until it lands, year and manufacturer are per-card and the ceiling is **≤ 6**; the counted E2E asserts whichever is in force, never both |
| Degraded state C (extraction read only two of the required fields) | **≤ 5** |
| Capture, per card | **no more than two shutter taps plus at most one Next card tap** (§7.1a) |
| Aggregate for the 40-card run | **≤ 160** (32×4 + 6×1 + 2×6 = 146, leaving deliberate slack for one correction). Until §5.5's `defaults` amendment lands, **≤ 224** on the same arithmetic at the ≤ 6 state-C ceiling |

Exact counts, so adding a tap fails the build rather than drifting. **Run the same E2E through the keyboard path**, or §13.9's "keyboard-complete" passes at three times the interaction cost.

The wall-clock figures are **calibration for Nick's own session, explicitly not gates** — seconds vary with reading speed, are not reproducible in CI, and reading speed is exactly what changes at 200% text. His 15-card run stays a **required non-gate step** so the agent cannot self-certify Phase 3. **If the counts pass and the clock does not, the fix is layout (§5.1) or the batch mode (§5.7) — never removing required fields.**

### 5.7 Batch rendering for repeated cards

This is the **rendering consequence of the session defaults in §5.5**, not a second mechanism. When consecutive queue items share the session defaults, **those fields render read-only with a per-card "Change for this card" override**, so per-card work reduces to confirming the extracted player name and card number. How defaults are chosen, stored and edited is §5.5's batch header and `scan_session.defaults` (DESIGN §5.1) — this section does not restate it, including which fields the column carries: set and storage today, year and manufacturer once §5.5's `defaults` jsonb amendment lands.

This is the only fast path available to `always`-blocked `no_catalog_match` cards, which can never join a bulk group (§5.5). Whether they should is an open question — see §14.

### 5.8 Undo, precisely

**Undo is a delayed commit, not a compensating rollback.** A confirm's writes fire when the undo window closes (~30 s) or when the next card is advanced past, whichever comes first. Until then the operation is **pending**, and **Undo simply cancels it**. Nothing is written, so there is nothing to clean up: no orphaned `card` rows, no `identification_correction` rows to delete, no valuation to roll back, no queued `value-item` to cancel. Stack depth is 1; a bulk confirm is one pending unit.

The toast **names its card** ("Undid Milton Williams #142"), because auto-advance means it refers to something no longer on screen.

**Fallback, stated now so it is not escalated later:** if delayed commit proves impractical against the existing M2 confirm path, **drop the timed undo entirely** and rely on the Recently confirmed strip (§5.5) and Edit identity. **Do not build compensating deletes.**

**Once a `valuation` row exists**, there is no undo — DESIGN §5.1 forbids hard delete at that point. The path is **Edit identity**, which re-points `card_id`, re-runs SCP linkage and re-values, and **must say so** rather than pretending to be an undo.

**Delete is not undoable.** It is the one action that uses `ConfirmSheet`, with copy that says so before it happens.

## 6. Copy rules

Plain language is a feature, not polish. Every enum that reaches the screen must be translated through one shared copy map (`src/ui/copy.ts`) — a token must never render raw.

**1. Compile-time exhaustiveness is the F4 guard, not a scan.** `src/ui/copy.ts` exports one **total `Record<T, string>` per enum family**: `IdentificationFlag`, `ValuationFlag`, `ValuationMethod`, `Confidence`, `ConfidenceReason`, `ItemStatus`, `IdentificationStatus`, `FailureReason`, `Storage`, `AcquiredVia`, `RawConditionTier`, `AutoType`, `SaleType`, `CompExclusionReason`. Because the key type is the domain union, TypeScript **fails the build** when DESIGN adds a value. The string actually seen on screen — "parallel resolution failed" — was a hand-written developer phrase matching no enum at all, which is why a scan alone would have been green on the bug it is named for.

**2. A lint rule forbidding enum-shaped string literals in JSX** — any literal matching `/^[a-z]+(_[a-z]+)+$/`. That is what catches hand-written developer phrases and raw tokens without flagging every heading, button and label in the app.

**3. The runtime scan is narrow:** a generic `/\b[a-z]+_[a-z_]+\b/` over visible text, **excluding `[data-advanced]`**, implemented by **extending DESIGN's existing assertion** rather than writing a second one.

**4. Precedence: where §6 and DESIGN §8.2 both define a string, DESIGN wins.** The two currently define confidence copy differently. Import the four confidence sentences and the six raw condition tiers from DESIGN §8.2 and §6.7 verbatim.

**5. Never name a vendor in user copy.** "Matched by CardSight" means nothing to a novice and quietly teaches trust in a brand he has never heard of. Use *"Found in the card database, and your photo agrees."*

**6. Ship a `/dev/copy` route in Phase 1** rendering every string on one page — the only artifact that catches copy that is present-but-wrong, which no test can and a human can, in thirty seconds. (Folded into `/dev/gallery`, §12 Phase 2.)

**Examples of tone** — the full map is the code, not this table:

| Internal | On screen |
|---|---|
| `parallel_uncertain` / "parallel resolution failed" | "Not sure which version this is" |
| `no_catalog_match` | "Not in the price catalogs yet" |
| `providers_disagree` | "Two sources disagree — worth a look" |
| `serial_unreadable` | "Couldn't read the serial number" |
| `thin_market` | "Few recent sales" |
| `model_only` | "Estimated — no recent sales found" |
| `comps_strong` | "Based on recent sales" |
| `unpriced` | "No value yet" |
| `manual` | "You set this value" |
| `condition_adjusted` | "Adjusted for condition" |
| `identity_unverified` | "Version not verified" |
| `redemption` | "This is a voucher you mail in — the actual card comes later, not in the pack" |
| `quota_exhausted` | "We've used this month's lookups. Try again next month or enter it yourself." |

The two `always`-blocking entries above are mandatory: `redemption` names a concept a new collector has never encountered, and the raw word leaves him with no idea what he is holding. Also required before first use: `photo_quality`, `no_back_photo`, `variation_possible`, `serial_mismatch`, `rookie_conflict`, `no_scp_match`, `provider_unavailable`, `image_unreadable`.

Tone: direct, second person, no exclamation marks, no cheerleading. Errors say what happened and what to do next. Never blame the user.

**Glossary on demand:** hobby terms (parallel, serial numbered, insert, raw) are rendered as **the whole word with a dotted underline, inside a button padded to a 44px hit height** — never a separate small glyph, which can satisfy neither §9's size rule nor its adjacent-spacing rule. Activating it opens the matching `HelpPanel`: one sentence with an example.

---

## 7. Other screens

### 7.1 Scan
Big capture targets, running count, per-card status chips (`SessionTray`), retry on failures. Capture tips collapsed behind "How to get good photos".

**Session label and `#seq`** (DESIGN §6.2): the label is **prompted once per session, pre-filled from the previous label, and required on the first session**, with its reason attached — *"Name the box so you can find the card again — the app numbers each card as you go."* A timestamp default is unfindable on a table and is not used. The label and `#seq` render as a `LocationChip` on the capture screen, every tray chip, retake prompts, the review screen and card detail.

**One-time inline capture note:** *"Keep the cards in a stack in the order you shoot them. When the app asks about card #12, that's the 12th card down."*

**Consequences are stated once, at the moment of skipping** — e.g. "No back photo — we can't check the version later."

**F7 — the detached validation bubble.** The floating "Please fill out this field" popup is the **browser's native constraint-validation popup**. Add `noValidate` to the form, validate in the client, render each error in a `<p id="err-{field}">` referenced by the input's `aria-describedby` with `aria-invalid="true"`, and move focus to the first invalid field on submit. Test it, because the failure mode is "marked fixed, still broken". (Phase 0 — §1.1.)

**Manual entry has an entry point:** the **Add** tab's "Type it in" (§4 `AppShell`) routes to the existing M1 search-and-add route, falling through to the custom-card form — the same surface as §5.2 state C minus the photo — when nothing matches. This is a route and a sheet, **not a new screen**; do not write a fresh spec for shipped code.

### 7.1a Capture speed

Capture is the larger share of the evening and DESIGN §1.3 budgets it at **25 s per card median**, so it cannot be treated as free:

- The camera **stays live between shots** and never returns to a gallery or a form.
- Capturing the front **advances to the back automatically** (compatible with DESIGN §6.2).
- Capturing the back writes the card and returns to Front for the next one. The **Next card** control stays in place — the interaction ceiling is the gate, the exact affordance is DESIGN's.
- Required interactions per card: **no more than two shutter taps plus at most one Next card tap** (§5.6).
- Tilt and serial close-ups are opt-in and never interrupt the loop.
- Retake requests **queue to the tray** (DESIGN §6.2) rather than interrupting mid-stack.

### 7.1b Review
Three tabs, per DESIGN §8.2: **Identification**, **Valuation flags**, **Unpriced**. The Identification tab ships now with its filters, the "Unfinished scans (N)" band and the badge rule (§4, §5.5). **Valuation flags and Unpriced are M3/M4 surfaces and are specified as stubs in Phase 5** alongside the dashboard. The split is justified by DESIGN §5.1 and §6.7: neither tab has data to show before M3 exists.

### 7.2 Collection
Phone: cards with thumbnail, `IdentityLine`, value, confidence (word plus the §3.1 shape); **at least 6 cards per phone screen**. Desktop: table with sortable columns, sticky header, tabular numerals, **44px rows at `--text-sm`**. Filters as chips that show what's active and clear in one tap, including **"Added today"** (the non-timed recovery path, §5.5) and **"Newly priced (N)"** — a filter chip in the same pattern as the others, which is how the automatic re-link becomes visible (§7.4a); it is not a notification surface. Search by player. "Scanned, waiting for identification" appears as a clearly separated section, never mixed with owned cards, and unpriced cards carry the §7.4a sentence as a section header rather than a $0.

Before M3, the value and confidence columns are **absent** rather than empty and the confidence sort option is hidden — §8.1.

Multiple copies of an unserialled card are legitimate and are **not** collapsed in V1 (see §12, later-phase list).

Desktop table accessibility — sortable headers as `<button>`s inside `<th scope="col">` with `aria-sort`, a polite announcement of the new order and row count, `scroll-padding-top` equal to the sticky header height (the same SC 2.4.11 problem as the review screen, from the opposite edge), and filter chips as toggles with `aria-pressed` — **lands in Phase 4** (§12).

### 7.3 Card detail
Photo gallery, `IdentityLine`, `LocationChip`, `ValueDisplay`, then: "Why this value" (expandable, sales list with included/excluded reasons), value history, grade ladder, cost basis, actions. On desktop, two columns: photos left, facts right.

**The "Why this value → Advanced" collapsible** (required by DESIGN §8.2) shows algorithm version, method, comps tier and reason codes **as raw tokens**. It is the **one place raw tokens are permitted**, it carries `data-advanced`, and §6's runtime scan excludes it. Build it — otherwise the exemption is invisible to whoever builds this screen and the panel simply does not get built.

For a card confirmed through "Not sure", the detail page carries the upside line: *"If it turns out to be Silver it's worth about $30 — we'll flag it."*

Before M3, the value panel and "Why this value" are replaced by one line: *"Card values arrive with the next update."* (§8.1.)

### 7.4 Dashboard (M4 — designed now so M4 builds into the system)
- Top: total value, with the confidence mix as a single honest line ("$412 · 68% based on recent sales").
- Tiles: cards owned, unvalued count, and — **conditionally** — cost basis and unrealized gain/loss.
- **Cost basis and G/L are absent, not empty.** DESIGN §8.2 keeps both tiles rendered with *"On N of M cards (P% of value) with known cost"* and hides only the G/L percentage below 50% coverage, along with the chart's cost-basis line. With no mechanism in V1 to record per-card cost on pack pulls, that renders *"On 0 of 200 cards"* indefinitely, so this plan applies §7.4a's absent-not-empty rule instead and suppresses both tiles. **This is a departure from DESIGN §8.2's rendering — raise it per §0.** Cards pulled from packs carry `acquired_via = pack_pull` with no per-card cost, and box-cost allocation is deferred to V1.1, so **no mechanism exists in V1** to cross that threshold. In their place, one line in the Collection-at-a-glance block: *"Most of these came from packs, so there's no per-card cost to compare against. Gain/loss turns on once you've entered costs for cards worth half your collection."* — a fact, not an instruction he cannot follow.
- Extend DESIGN §6.7's $0 cost warning with the missing alternative: *"Leave it blank. Blank means unknown, which is honest; $0 means free, which would count the whole card as profit. Splitting a box price across its cards is coming later."*
- Value over time chart, with gaps drawn as gaps.
- Top movers, allocation bars (4 cuts), needs-attention counts as tappable chips.
- **Empty and early states matter most here.** See §7.4a: the real case is not "15 cards, half unpriced" but ~200 cards, nearly all unpriced, for months.

### 7.4a The mostly-unpriced dashboard

State-C cards are saved unlinked and valued `unpriced` until a catalog links them, so this is the dashboard that actually renders for the first several months. Walked through DESIGN §8.2's own thresholds it degrades to: cost basis "On 0 of 200"; G/L% hidden below 50% coverage; the chart needing 2 snapshots; movers needing items ≥ $5; allocation by set as one bar at 100% — a stack of suppressed modules under a **$0 headline**.

**One rule: a module that cannot render its primary number is not rendered.** Modules have entry thresholds and are **absent, not empty**, below them.

In their place, one **"Collection at a glance"** block:
- Cards owned.
- **"Not priced yet — 198 cards"** as the primary number, **never $0**, with one honest line: *"These are from sets the price guides haven't added yet. We check nightly and fill in values automatically."*
- The confidence mix as §7.4's single honest line.
- One contextual next action.

The same sentence is mirrored as a Collection section header (§7.2) and as the post-confirm line in §5.2 C.

**The automatic re-link must be visible.** §5.2 C promises a card re-links when catalogs catch up and nothing would otherwise say it happened. Surface it as the **"Newly priced (N)"** filter chip on Collection (§7.2), announced politely rather than silently changing the number. It gets a §8 case and a fixture.

### 7.5 Settings / Validation
Plain. Fee and shipping settings with explanations of what they affect. API usage with a simple bar toward the monthly quota.

**Validation reports identification accuracy alongside valuation accuracy.** It **reads DESIGN §9.2's existing identification metrics** — it does not define new computation. From the `identification_correction` rows written on every confirm (DESIGN §6.7 step 3): the share of confirms where nothing was changed, and the correction rate per field (player, set, card number, parallel, serial) in plain terms — *"You corrected the version on 3 of 40 cards."* **Bulk-confirmed and audited cards are broken out separately from single reviews**, because that is where an error is least likely to be seen. Valuation error stays in the same plain terms ("Off by 12% on average for cards with recent sales").

### 7.6 Charts
**Charts are inline SVG written directly, not a charting library.** The three charts needed — a sparkline, a value-over-time line with gaps drawn as gaps, and horizontal allocation bars — are each under a hundred lines, and a library would collide with four constraints at once: §3.1 forbids hardcoded colors (libraries take colors as props or theme objects); §3.3's reduced-motion rule is a transition override that misses library mount animations; §10 has no bundle allowance and a chart library is typically the largest client dependency; and §9's text-alternative and keyboard requirements differ sharply between SVG and canvas renderers.

Colors come from the token custom properties applied via class names, so charts re-theme with everything else and §3.1 holds with no runtime shim. **No entry animations at all.** Every chart renders a visually hidden table of its values and a text line carrying the key number, per §9. Follow the `dataviz` skill conventions for form and labelling; no gridline clutter; labels over legends where possible.

**Recorded now, built in Phase 5 (see §12):** stacked and allocation bars need an inline value or percentage label per segment and a 1px `--ct-bg` separator between adjacent fills, because color alone never distinguishes two touching fills. The measurement that settles it: `--ct-positive` `#3FB98A` and `--ct-info` `#7FA8D9` are **1.00:1 against each other** — luminance-identical — and both are ~1.11:1 against `--ct-caution` `#E0A33E`. The dashboard's confidence-mix bar, its single most important honesty device, is unreadable in greyscale, in a screenshot, or on a sunlit phone, and fails SC 1.4.11's 3:1 for adjacent meaningful fills by a factor of three.

---

## 8. States, errors, and edge cases

Every screen defines four states: **loading** (skeletons matching final layout, never spinners over content), **empty** (explains what will appear and the one action to make it appear), **error** (what happened, what to do, retry), **partial** (some data missing — say which, don't hide it).

**Adding a state to §5.2 or to the list below means adding a fixture (§12 Phase 1). A state with no fixture is not built.** Each case has a named fixture in `/fixtures/ui/` and at least one test that renders it.

Specific cases to design, not discover:

- First run: no cards at all — plus the first-run teaching content below.
- Small collection: 15 cards, all cheap, half unpriced.
- **Mostly unpriced: ~200 cards, nearly all unpriced** (§7.4a) — the real early state.
- **A collection where no card has a known cost** (§7.4) — the normal pack-pull case.
- **Newly priced:** cards that re-linked overnight and now have values (§7.4a).
- A card with no photo (hand-added) — `PhotoViewer` renders a labelled placeholder tile with "Add photos", never a broken image or blank frame.
- A card whose photo failed to upload.
- Values stale because last night's refresh failed.
- Offline mid-scan: queued uploads, clear status, nothing lost.
- **The phone locks mid-capture.**
- **Camera permission denied.**
- **Quota exhausted partway through a batch:** cards stay in the tray with **one aggregated explanation and a single "Retry all"** action — not 60 individual errors.
- A value that changed a lot overnight.
- **Couldn't identify (one case per `failure_reason`), redemption, duplicate blocked on confirm, incomplete scan draft, extraction read nothing, not a card** (§5.2).
- **An audited card reappearing after a bulk confirm** (§5.5).
- **"Check the details" expanded from state A** (§5.3).
- **Multiple legitimate copies of the same unserialled card** (§5.5, §7.2).
- **Before valuation exists** — §8.1.

**First-run content** — three **static, dismissible screens**, shown once and reachable afterwards from the header overflow (where Settings and Validation live, §4 `AppShell`): *"What this app will ask you"* (it proposes, you confirm; most brand-new cards aren't in the price catalogs yet, and that's normal, not an error), *"What a parallel is"* (the same card in different finishes; usually the biggest single thing that changes value, and a flat photo often can't tell them apart — which is why the app will ask), and *"What Not sure does"*. **No carousel, no tour framework, no progress dots, no per-screen state beyond one dismissed flag.**

The reason this is not left to the glossary: the first thing the app does on a first batch is block a card with *"Which version is this?"* and a picker of parallel names, at a moment of maximum time pressure with 200 cards on the table. The rational response to that, untaught, is to tap "Not sure" on essentially every card — which now correctly **commits** them all at the lowest value (§5.2 B).

**One rule at the moment of need:** the first time a given blocking flag type appears in a session, its `HelpPanel` is **expanded inline above the question**; on later cards it collapses to the marker. That is one boolean per flag type — help where it is needed, no tax on card 40.

### 8.1 Before valuation exists (M2 → M3)

M3 (valuation) is not built either, and this plan is written throughout as though values exist: `ValueDisplay` is "never a value without its confidence", §7.2 puts value and confidence on every row and makes confidence sortable, §7.3 has a "Why this value" drawer. **None of that data exists after Phase 4 ships** — there are no `valuation` rows at all until M3. This is not loading, not empty, not error, not partial: it is a feature that has not been built yet, on a screen that has. Do **not** reach for DESIGN §8.2's "Valuing… / Valuation failed · Retry", which implies a fault rather than a milestone.

**Identification-time value estimates are the exception and do exist from M2.** DESIGN §5.1 stores `est_value_max_cents` and `value_at_risk_cents` on the `identification` row, and DESIGN §6.3 step 7 writes them during SportsCardsPro linkage, which DESIGN §13 puts in M2 — available at exactly the moment the review queue renders. They are what keep §5.5.1's queue order and §5.5's bulk-group stake lines ("at most $X at stake") working before any `valuation` row is written. Neither may be suppressed here.

- `ValueDisplay` renders *"Values coming soon"* in `--ct-text-muted`, with no number and no confidence badge — **never $0, never a blank slot, never "Valuation failed"**.
- The collection's value and confidence columns are **absent** rather than empty; the confidence sort option is hidden.
- Card detail's value panel and "Why this value" are replaced by one line: *"Card values arrive with the next update."*
- The dashboard is not reachable from the nav until M3; Home shows the collection summary (§4).
- This is the **first** state built for `ValueDisplay` and `ConfidenceBadge`, because it is the only one that renders for the first several weeks.

---

## 9. Accessibility **[DECISION]**

- **Contrast:** AA minimum, verified by the four layered checks in §12 Phase 1 — the rendered-DOM sweep is the one that catches F3, not the token matrix.
- **Targets:** **44×44 for primary actions and every control in `/review` and `/scan`; 24×24 absolute minimum elsewhere**, achieved by an invisible expanded hit area (`::after { position: absolute; inset: -Npx }`) rather than by enlarging the chip — visual size and hit size are separate. **8px minimum spacing** between adjacent targets. Verified by a Playwright bounding-box sweep asserting size **and non-overlap**: adjacent expanded hit areas in a flex row produce overlapping boxes, a worse mis-tap failure than a small target. (axe's own rule checks 24×24 per SC 2.5.8 and has no rule at all for the spacing clause, so axe passing is not evidence here.)
- **Focus:** a visible focus ring on every interactive element, meeting 3:1 against its background. Split the verification, because **axe cannot evaluate `:focus-visible`**: ring *contrast* comes from the token matrix (§3.1 sets the ring to `--ct-action`, 6.11:1 on `--ct-bg`); ring *presence* comes from a Playwright tab sweep asserting every focusable element's computed outline or box-shadow is non-empty and non-transparent.
- **Keyboard:** operable end to end on desktop, including the review flow and the collection table. The contract is the table in §5.3; `PhotoViewer` has button equivalents for zoom and side (§4). Collection-table specifics land in Phase 4 (§7.2).
- **Semantics:** real buttons and labels, form fields with associated labels.
- **Live regions.** One polite region per screen carrying a **debounced aggregate** — *"Identifying: 3 done, 1 needs a retake, 11 remaining"* — because a per-card announcement in a 15-card batch queues until it lags reality by a minute. `role="alert"` is reserved for blocking failures and fires at most once per cause. The Review badge carries an accessible name ("Review, 6 cards waiting").
- **Motion:** honor `prefers-reduced-motion`, including keyframe animations (§3.3).
- **Text:** the type scale is authored in `rem` (§3.2). **Text scales with the browser and OS text-size setting; verified at a 32px root (≈200%) at 375 and 1280 with no clipping, no horizontal scroll and the sticky bar still reachable.** No text in images.
  The **iOS Dynamic Type claim is dropped**: it reaches web content only via `font: -apple-system-body` on the root with rem children, needs a platform guard, misbehaves on desktop Safari, and cannot be exercised in Playwright or on macOS — an unverifiable claim in exchange for real complexity.
  Note that the 200% text check and the 375×640 fit check (§13) are the **same test**: at a 32px root the photo-plus-decision layout has no room for the decision, so assert them together.
- **Zoom:** the viewport meta must not set `user-scalable=no` or `maximum-scale`, and a test asserts it (§12 Phase 1). One stray meta tag from a template silently invalidates every zoom claim in this section app-wide.

---

## 10. Performance budget

Measured in Playwright on the `largeCollection500` fixture at the iPhone 14 viewport under **4× CPU throttle and Fast 3G** — a budget with no named device, network profile or metric is one the agent measures unthrottled in CI, where everything passes:

- Review screen **LCP < 2.5s**, **INP < 200ms** on confirm.
- Dashboard **LCP < 2.5s**.
- **CLS < 0.1** everywhere.
- No frame over 50ms during a programmatic full-list scroll.
- Reconcile explicitly with DESIGN M4's own phrasing (< 2s, unthrottled mobile viewport) so one number is satisfied, not two.

**Render all rows. Do not virtualize in V1** — 500 rows with 400px thumbnails and `loading="lazy"` is well within the budget above, and a virtualized sortable table with a sticky header plus a variable-height phone list is multi-day work that also breaks keyboard navigation and focus management. **Above ~2,000 cards, paginate before virtualizing.** Keeping the measured budget is what makes "render all rows" a decision rather than a guess.

### 10.1 Photo delivery

Lists and queue rows use the **400px server thumbnail** DESIGN §6.2 already writes; `PhotoViewer` loads the thumbnail first and **swaps to the 2400px original on zoom**. Use a plain `<img>` with explicit `width` and `height` from `item_photo` and `loading="lazy"` — **not `next/image`**: the URLs are authorized per request and gain nothing from the optimizer. The route path, cache key and streaming design are the implementer's.

---

## 11. What this does not change

- Any valuation math, provider behavior, or data model in `docs/DESIGN.md`.
- The pipeline's decisions about which state a card is in. The UI renders those decisions; it does not make them — mechanically, through the single `deriveReviewState` function in §5.2, never through a derivation written in the UI layer.
- Milestone scope: this is a UI layer over M1–M2 as built, with M4 screens specified but built in M4.

---

## 12. Build plan

**Two rules over every phase.**

1. **You may not delete or `.skip` an existing test.** If a test encodes behavior this document changes, update the assertion and record it in `CHANGELOG.md` with the reason. This is **machine-enforced**, not a policy sentence: a CI check asserts that the test count in the M1/M2 spec files never decreases and that no `.skip`, `.only` or `test.fixme` appears in them — a rule an agent can satisfy by editing a CHANGELOG is a rule it will satisfy by editing a CHANGELOG. Phases 3 and 4 rebuild exactly the screens M1 and M2 test, so without this the cheapest resolution to a wall of red is rewriting the tests, at which point a silent loss of shipped functionality (§5.0) becomes undetectable.
2. **Every phase ends by writing `docs/phases/PHASE-N.md`** containing: the command run and the pass/fail line for every test named in that phase; the M1/M2 test counts before and after (must not decrease); files added or changed under `/fixtures/ui/`; and the URLs of any page Nick is asked to look at. **An agent may not mark a phase complete on its own assessment.** Two gates additionally require Nick's reply — **Phase 2** (looking at `/dev/gallery` and `/dev/copy` once, the only check that catches copy which is grammatical, present, correctly typed and wrong) and **Phase 3** (his real-card session). Other phases proceed on the report plus green tests.

**Every phase acceptance includes:** `pnpm test` and `pnpm test:e2e`, including the M1 and M2 suites, are green.

**Phase 0 — Correctness fixes (ship first, on the current UI)**
- F1, F2 and F7 per §1.1: the two named fixtures, the `decidePrefill` unit tests, **the component test asserting rendered field values**, the review screen routed through `decidePrefill`, and the native-validation-bubble fix in §7.1.
- **Acceptance:** both fixtures render with the correct field values in a component test; submitting the scan form with an empty required field shows an inline error next to that field and no native bubble.

**Phase 1 — Foundations (the color change is itself a visual change; expect the app to go dark here)**
- Token layer in CSS custom properties, **§3.0's shadcn variable mapping**, `class="dark"`, `color-scheme`, `theme-color`.
- **Layer 1 — delete Tailwind's default palette** (v4: `--color-*: initial;` at the top of `@theme`, then declare only semantic colors; v3: replace `theme.colors` wholesale, do not `extend`). After this, `bg-white` and `text-slate-400` **are not generated** — two lines of config that remove a whole class of defect.
- **Layer 2 — class blocklist lint** for what survives: Tailwind palette classes, arbitrary color values (`#`, `rgb(`, `hsl(`, `oklch(`), and unwrapped shadcn semantic classes (`bg-background`, `bg-card`, `bg-popover`, `text-*-foreground`) **in app and feature code**. `components/ui/**` is **exempt from the shadcn semantic-class rule** — those classes are correct inside the vendored primitives under §3.0's theming approach. The Tailwind-palette and arbitrary-value rules stay global. **The lint rule is the mechanism that actually fails the build.**
- **Layer 3 — rendered-DOM computed-style sweep.** Playwright resolves each text-bearing element's computed `color` against the first non-transparent ancestor `background-color` and asserts 4.5:1 / 3:1, at 375 and 1280, over **`/review` in every state (with a Dialog, a Select and a Toast open) plus the component gallery**. **A resolved background that is a gradient or image with no `background-color` fallback is a FAILURE, not a skip** — that is the white-letterbox case verbatim.
- **Layer 4 — axe** asserting `results.incomplete` is empty as well as `results.violations` for the `color-contrast` rule. axe reports contrast as *incomplete* over background images and transparency and the conventional assertion passes on incompletes — and §5.1 puts text and chips over photos. Any waiver carries an inline comment naming the pair and its measured ratio.
- Keep the **generated token matrix** (every text token × every background at 4.5:1, every boundary token × every background at 3:1, with named exclusions) as a palette sanity check — not as the F3 guard.
- `src/ui/copy.ts` with one total `Record` per enum family (§6), **the `HelpPanel` content**, and **the first-run content** (§8) — written here, with the copy map.
- **`/dev/copy`** route (folded into `/dev/gallery` in Phase 2).
- **`/fixtures/ui/index.ts`** — the **only** source of test data for every UI test, each fixture a valid `identification` + `item` + `card` per DESIGN §5.1: `confidentMatch`, `uncertainParallel`, `variationPossible`, `notInCatalog`, `notInCatalogPartialExtraction`, `notInCatalogNoExtraction`, `notACard`, `identifyFailed` (one per `failure_reason`), `identifyFailedQuota`, `redemption`, `incompleteScanDraft`, `duplicateBlocked`, `auditItem`, `unverifiedIdentity`, `slabGraded`, `longNameCard`, `itemNoPhoto`, `photoUploadFailed`, `unpricedItem`, `staleValuation`, `bigMove`, `emptyCollection`, `batchSameSet40`, `preValuationCollection`, `mostlyUnpricedCollection`, `largeCollection500` (generated, **seeded RNG**, or the perf numbers aren't comparable run to run).
- **Test-selector pass:** stable `data-testid` attributes on every element the M1/M2 specs select, with those specs updated. No behavior change.
- Convert the screens **not** scheduled for rebuild (Settings, Validation). Screens that are scheduled are converted in the phase that rebuilds them — Phase 1 makes a non-token color impossible to survive: the class is not generated, and the blocklist lint fails the build on what is.
- **Acceptance:** all four contrast layers run and are green; no Tailwind palette class or arbitrary color value is generated, and the blocklist lint fails the build on any that are written; every fixture loads and renders without error; `/dev/copy` renders every string; **a test asserts the viewport meta sets neither `user-scalable=no` nor `maximum-scale`**.

**Phase 2 — Components**
- Build the §4 inventory with all states, in isolation.
- **DOM/text snapshots** for every component in every state at **375 and 1280** — cheap, reviewable as a diff, and what keeps missing labels and wrong copy visible.
- The rendered-contrast sweep over the same fixtures; **axe over a `/dev/gallery` route** rendering every component state.
- **Pixel snapshots for at most ~8 canonical views** (review states A–E, `/dev/copy`, the small-collection dashboard, the collection list) at 375 and 1280, generated **inside CI's container** with animations disabled and `maxDiffPixelRatio` set. §3.2's system font stack resolves differently on macOS and in a Linux container, so a large pixel-baseline suite is red on day one for rasterisation reasons and gets `--update-snapshots`, after which it asserts nothing.
- **Drop 768 entirely** — §3.4 gives that width no distinct layout rules; replace with a no-horizontal-scroll and centered-container check.
- **Acceptance:** every component renders in every state; DOM snapshots committed; axe clean on `/dev/gallery`; **Nick has looked at `/dev/gallery` and `/dev/copy` once and replied.**

**Phase 3 — Review screen**
- **Re-skin and re-sequence the existing review screen. It is not a greenfield rebuild.**
- §5.0 parity, §5.2's states and `deriveReviewState`, §5.2.1, §5.3, §5.4, §5.5 bulk groups and audit, §5.5.1, §5.7, §5.8.
- **Acceptance:** every §5.0 parity item is reachable; the M2 E2E suite passes **with no further changes in this phase** — any assertion Phase 1's selector pass touched is already recorded in `CHANGELOG.md`, and Phase 3 adds nothing to that list; the counted-interaction E2E in §5.6 meets its exact ceilings on the 40-card fixture queue, through both the pointer and the keyboard path. Then the two human-in-the-loop measurements, recorded in `PHASE-3.md` and requiring Nick's reply: **time per card** on his real session, and **the per-field identification correction rate plus the audit outcome rate** from the Validation page (§7.5). Also report the `ready` / `low_stakes` / single-review split on that batch. The §13.11 fit check and the §13.12 200%-text check run here, together, against every review state.

**Phase 4 — Scan, Collection, Card detail**
- Rebuild against §7.1–7.3, including §7.1a's capture loop, the `SessionTray`, `LocationChip`, and the "Type it in" entry point.
- **Desktop collection-table accessibility** (§7.2): sortable headers as `<button>`s inside `<th scope="col">` with `aria-sort`, polite announcement of new order and row count, `scroll-padding-top` equal to the sticky header height, filter chips with `aria-pressed`.
- **Acceptance:** E2E flows pass at 375 and 1280; no horizontal scroll at any width; **every value surface renders correctly against `preValuationCollection`** (§8.1).

**Phase 5 — Dashboard and Settings specs ready for M4**
- Components and layouts built and snapshot-tested with fixture data, wired in M4.
- Charts as inline SVG (§7.6), including **chart segment labelling and allocation accessibility** — per-segment value or percentage labels and a 1px `--ct-bg` separator between adjacent fills (the measurement is recorded in §7.6).
- **Review's Valuation-flags and Unpriced tabs as stubs** (§7.1b).
- **Acceptance:** the `mostlyUnpricedCollection` fixture produces a dashboard with **no empty modules and no placeholder text**; no new client dependency was added for charting; the contrast sweep runs over the dashboard fixtures.

**Later — recorded so it is not re-litigated, not built now**

- **A dismissible 80%-of-quota banner on `/scan`, once per session.** Not needed at a few hundred cards against a 5k/month plan; add it when the collection size or the refresh schedule makes exhaustion mid-batch plausible. The `quota_exhausted` copy entry ships in Phase 1 (§6) and the aggregated tray retry ships with §8's case list, so the failure is already handled — only the advance warning is deferred.
- **Duplicate row collapsing in the collection** (Phase 4 at the earliest): items sharing a `card_id` with no serial collapse to one row with an expandable "×3" count chip — a real control named "3 copies, expand", not a decorative badge — with copies differing in condition, grade or cost staying individually visible. The confirm-time line in §5.5 buys most of the benefit for one string.
- **The full catalog search-and-add screen** (after Phase 5): DESIGN §6.1 flow 3 — query, catalog results with values, parallel picker, serial, condition, storage, cost basis. Low value in year one, since the sets owned aren't in the catalogs and search falls straight through to the custom-card form. §7.1's route and sheet deliver the missing entry point now. Revisit when singles start being bought online.

---

## 13. Acceptance criteria (whole plan)

1. **No text/background pair below AA in the rendered DOM** — asserted by the Phase 1 **layer 3** computed-style sweep at 375 and 1280 over `/review` in every state (Dialog, Select and Toast open) and the component gallery, with a gradient or image background lacking a `background-color` fallback counted as a **failure**. The token matrix is a palette sanity check, not this criterion.
2. **No raw enum token appears in the UI.** The guard is the compile-time total `Record` per enum family (§6); the lint rule forbidding enum-shaped JSX literals (`/^[a-z]+(_[a-z]+)+$/`); and the narrowed runtime scan, which excludes `[data-advanced]` (§7.3).
3. **No non-token color survives** — Tailwind's default palette is deleted so those classes are never generated (Phase 1 layer 1), and the class blocklist lint is the mechanism that fails the build on what survives.
4. **Counted interactions meet §5.6's exact ceilings** on the 40-card fixture queue, through both the pointer and the keyboard path. Wall-clock seconds are calibration, not a gate.
5. **Identity fields are never pre-filled from a candidate below the floor, or from an extraction field below its own floor** — one named unit test per row of §5.4, including the extraction-confidence rows.
6. **Every screen and every §8 case has a named fixture and a DOM/text snapshot** covering loading, empty, error and partial.
7. No horizontal scrolling at 375px; no pinned-left layout at 1280px.
8. **Undo behaves per §5.8**, integration-tested: an undone confirm has written **nothing** — no status change, no `card` row, no `identification_correction` rows, no queued `value-item` — and a committed confirm has written each of them exactly once. Delete is not undoable and says so before it happens.
9. **Keyboard-complete review flow and collection table** on desktop, as a keyboard-only E2E that also asserts `document.activeElement` after auto-advance (the new card's heading) and the live-region text.
10. Performance budgets in §10 met on the seeded `largeCollection500` fixture under the stated throttling.
11. **At 375×640, in every review state and with the keyboard open**, the blocking question and the primary action are visible without scrolling, and no focused element is obscured by the sticky bar.
12. **At a 32px root (≈200%)** at 375 and 1280: no clipping, no horizontal scroll, sticky bar still reachable. Asserted together with criterion 11 — it is the same test.
13. **Focus-ring presence** on every focusable element (tab sweep, non-empty and non-transparent outline or box-shadow), and **target size and non-overlap** per §9 (bounding-box sweep). Neither is covered by axe.
14. **Density:** the review queue shows **≥ 8 rows at 375×640** with row height ≤ 64px and `IdentityLine` capped at two lines; the collection list shows **≥ 6 cards** per phone screen; the desktop collection table uses a **44px row at `--text-sm`**. Snapshot-asserted.
15. **`IdentityLine` renders identically across queue, review, collection and card detail**, with a 375px snapshot against `longNameCard` asserting the two-line cap and that the accessible name is the full identity string.
16. **Every test passing before Phase 1 passes after Phase 5**, or its replacement is named in `CHANGELOG.md`; the M1/M2 test counts never decrease.
17. **Identification accuracy is recorded, not just speed.** After Nick's Phase 3 session the Validation page shows the per-field correction rate and the audit outcome rate, recorded in the phase report alongside time per card; Phase 3 is not complete on the time figure alone. Read against DESIGN §1.3's targets — **≥ 85% top-1 correct on all fields except parallel, ≥ 70% parallel correct, and zero "wrong top-1 parallel without `parallel_uncertain`"** — and against the audit comparison: audited cards corrected more often than single-reviewed ones is a genuine signal. Either is **a finding to raise against DESIGN §14's tunables, not a UI problem to optimise away.**
18. **A first-session E2E from an empty database** covers the first-run content, the required session label, and the one-per-session inline help expansion.

---

## 14. Open questions for Nick

1. **Bottom tab bar vs top nav on phone** — bottom is easier one-handed at a table. [Bottom]
2. **Light theme** — build now or leave tokens ready? [Leave ready, build later]
3. **App name and icon** — "Card Tracker" as placeholder, or something you'd rather see on your home screen? [Card Tracker]
4. **[DECIDED 2026-09-16 — scan order]** Review queue order: scan order or value order? DESIGN §6.7 orders by `est_value_max_cents` desc, *"because mistakes on expensive cards cost the most"*. For ~200 cards whose value is null or near-identical that ordering is effectively arbitrary, it decouples the queue from the physical stack, and it breaks the set carry-forward F9 exists to fix. Value-ordering optimises the cost of a mistake; scan-ordering optimises the cost of every card, and when nearly every card is under $8 the second dominates. This needs a one-sentence DESIGN amendment, which is your call, not the implementer's. **Whichever wins, §5.5.1's frozen denominator is required either way.** [Scan order (`session_seq` asc) when reviewing from a scan tray; value-descending for the global Review queue where sessions mix; offered as a two-chip toggle — an *addition* to DESIGN §6.7, not a contradiction]
5. **[DECIDED 2026-09-16 — not now; revisit with Phase 3 timing data]** A bulk path for not-in-catalog cards? `no_catalog_match` is blocking mode `always`, so the dominant cohort can never bulk-confirm (§5.5); §5.7's batch rendering removes most of the per-card cost without touching DESIGN. A genuine carve-out — letting a state-C card join a bulk group when set, year and manufacturer were carried from a card confirmed this session and player plus card number cleared the extraction floor — would **amend DESIGN §5.3's blocking semantics**, with valuation consequences. If it is ever built it needs **a higher audit rate than the 10% set for low-stakes**, because those confirms create `card` rows whose `identity_key` is immutable: a bad `set_hint` produces a silent run of permanently wrong cards. [Don't build it now — raise it as post-M2 tuning with evidence from Phase 3's measured batch, not as a Phase 3 dependency]

**Decisions recorded 2026-09-16 (Nick):**
- **Q4 — queue order:** scan order (`session_seq` asc) when reviewing from a scan tray; value-descending for the global Review queue where sessions mix; offered as a two-chip toggle. Treat as an addition to DESIGN §6.7, and record it there.
- **Q5 — bulk path for not-in-catalog cards:** do not build now. Revisit after Phase 3 produces measured batch timings. §5.7's batch rendering is the mitigation in the meantime.

---

## 15. Addendum — card number verification (added 2026-09-16 from measured accuracy)

Measured on Nick's 15 real cards after the M2 fixes: **card number correct on 9/15 extractions, year on 8/15**. For cards not in any catalog — the majority — the extraction *is* the saved identity, and a wrong card number silently links the wrong price later. Both the vision model and local OCR agreed on the same wrong digits in several cases, so agreement is not proof.

This adds one UI requirement, not a new subsystem:

- **Card number is the field most likely to be wrong.** In review states B and C, render it with the **back-photo crop of the number region shown at readable size next to the field**, so verifying is looking rather than squinting.
- When the vision model and OCR disagree, mark the field **unverified** (`SourceChip`: "Couldn't confirm") and require an explicit tap before the card can be saved. Never silently pick one reading.
- The same treatment applies to **year** when the copyright line was unreadable — common when a card is photographed inside a toploader.
- Phase: **3**, with the rest of the review screen. Acceptance: on the committed fixture queue, every card whose number is unverified shows the crop, and no card saves with an unverified number without an explicit confirmation.

---

## 16. Addendum — visual match confirmation (added 2026-09-16)

**Why:** comparing two pictures is far faster and more reliable for a novice than reading four text fields. It is the single biggest available speed gain for both single-card review and bulk confirm, and it plays to what the human is good at.

### 16.1 Availability must be verified first **[DECISION pending]**

Do not build against an assumption. Before implementing, establish and record in an ADR:

1. Do CardSight identify detections or catalog card records carry an image URL? (Pricing records are known to carry `image_url`; catalog and identify are unconfirmed.)
2. If not, does SportsCardsPro provide a product image, and do its terms permit displaying it inside a private, single-user app?
3. Cost: extra calls, image sizes, phone bandwidth.

**Never scrape an image, and never hotlink where the terms don't allow it.** If neither source permits it, §16.3's fallback is the whole feature.

### 16.2 If a reference image is available

- **States A and B:** show the reference image beside the user's photo, same size, clearly labeled ("Your photo" / "What we think it is"). The user's photo is always on the left (or top on phone) — it is the truth (§2.2).
- **The image is a fast filter, not the whole check.** A near-miss reference — same player, same pose, different set or parallel — looks right. Card number and parallel remain visible as text next to the pair, per §5.2. The `IdentityLine` is never replaced by the image.
- **Bulk confirm becomes a grid:** each row is your photo, the reference, and the `IdentityLine`, with a per-row opt-out. This makes the 10% audit cheaper too, since a wrong card is visible rather than inferred.
- Images are lazily loaded with explicit dimensions (§10), and a failed or missing image degrades to the text layout without shifting the page.

### 16.3 Fallback when no reference exists (the normal path today)

Most of Nick's cards are not in any catalog, so this is not an edge case:

- **Use his own confirmed photos as the reference.** Once a card from a set has been confirmed this session, its photo is a valid visual reference for the next card from the same set — same design, same borders, same layout. Show "Your previously confirmed card from this set" with the `IdentityLine` of that card.
- This makes batch review of a single set (the common case) fast without any vendor image at all, and it is free.
- When neither a catalog image nor a session sibling exists, fall back to the text layout — which remains the default per CH-30.

### 16.4 Phase and acceptance

**Phase 3**, with the review screen. Acceptance: on the committed fixture queue, every card shows either a reference image, a session-sibling photo, or the text layout, with no layout shift between them; bulk confirm renders as a grid when images are present; and a missing image never blocks a confirm.

