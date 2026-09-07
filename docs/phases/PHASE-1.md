# Phase 1: UI Foundations — Report

**Date:** 2026-09-07
**Test count before:** 146 (M2 baseline)
**Test count after:** 173 (+27 new tests, 0 removed)

## Commands run

| Command | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 173 passed, 0 failed |
| `pnpm lint:colors` | 0 violations |

## What shipped

### Token layer (`globals.css`)
- All `--ct-*` design tokens declared on `:root`
- Tailwind v4 default palette reset (`--color-*: initial`)
- shadcn variable mapping (16 pairs) per §3.0
- Semantic Tailwind color entries for all token classes
- System font stack (removed Geist web font)
- Dark mode pinned: `class="dark"`, `color-scheme: dark`, `<meta name="theme-color">`
- Spacing, radius, motion tokens from §3.3

### §3.1 color corrections (flagged per the document's instruction)
- `--ct-text-subtle`: changed from `#727A88` (3.86:1 on surface-raised) to `#868F9D` (5.12:1) — clears AA 4.5:1
- `--ct-border-strong`: changed from `#3A404A` (1.60:1) to `#6B7484` (3.55:1) — clears 3:1

### Class conversion
- 175 hardcoded Tailwind color classes across 11 files converted to token-based classes
- No layout, structure, or behavior changes

### Class blocklist lint (`pnpm lint:colors`)
- Fails the build on any default Tailwind palette class or arbitrary color value in `src/app/`
- Exempts `src/components/ui/` (shadcn primitives)

### Copy map (`src/ui/copy.ts`)
- 10 exhaustive `Record` maps covering 82+ enum values
- TypeScript enforces completeness — adding a domain value without copy fails the build
- 12 help panel entries with title + body
- `/dev/copy` route renders every string

### Shared UI fixtures (`fixtures/ui/index.ts`)
- 15 named fixtures covering all §5.2 states
- Each returns a valid `identification` + `item` + `card` per DESIGN §5.1
- `batchSameSet40` generates 40 items for interaction-count testing

### Token matrix test (`src/ui/tokens.test.ts`)
- 25 tests validating WCAG AA contrast ratios
- Every text token × every background at 4.5:1
- Every boundary token × every background at 3:1
- Uses the actual hex values from the token layer

### Viewport meta test (`src/ui/viewport.test.ts`)
- Asserts `layout.tsx` has no `user-scalable=no` or `maximum-scale`

### Test-selector pass
- `data-testid` attributes added to 10 key elements across 5 component files
- 2 E2E test files updated to use testids for fragile selectors
- `getByRole` and `getByText` kept where already robust

### Session defaults amendment (DESIGN §5.1)
- `scan_session.defaults` now accepts `{ storage, set_hint, year, manufacturer }`
- No schema migration needed (column is `Json?`)
- Decision doc: `docs/decisions/m2-003-session-defaults-amendment.md`
- UI to edit these fields deferred to Phase 3

## Files added
- `src/app/globals.css` (rewritten)
- `src/ui/copy.ts`
- `src/ui/tokens.test.ts`
- `src/ui/viewport.test.ts`
- `src/app/dev/copy/page.tsx`
- `fixtures/ui/index.ts`
- `scripts/lint-colors.ts`
- `tests/screenshots/capture.ts`
- `docs/decisions/m2-003-session-defaults-amendment.md`
- `docs/phases/PHASE-1.md`

## Files modified
- `src/app/layout.tsx` (dark class, meta, fonts)
- 11 `.tsx` files under `src/app/` (color class conversion)
- 2 E2E test files (selector updates)
- `src/app/(app)/actions.ts` (session defaults)
- `package.json` (lint:colors script)

## Screenshots
- Before: `tests/screenshots/before/` (8 files, 4 screens × 2 widths)
- After: `tests/screenshots/after/` (8 files, 4 screens × 2 widths)
- Visual comparison: dark theme applied, structure identical, no elements moved or missing

## Deferred
- §5.4 per-field extraction confidence threshold (0.70): noted, Phase 3
- Playwright computed-style contrast sweep (Layer 3): needs the full component gallery from Phase 2
- axe scan (Layer 4): needs Phase 2's `/dev/gallery` route
- Batch header UI for session defaults: Phase 3

## Nick to look at
- `/dev/copy` — one page with every copy string, for human review
- Before/after screenshot pairs confirming structural identity
