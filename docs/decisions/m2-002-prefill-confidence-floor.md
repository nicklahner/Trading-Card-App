# M2-002: Pre-fill confidence floor for review form

**Date:** 2026-09-07
**Context:** A candidate scoring 25% ("Bruce Matthews 1994 Topps #85") was pre-filling the form for a Brian Thomas Jr. card. Meanwhile, cards with no candidates showed empty forms even when the extraction had read player, card number, and year off the photos.

**Decision:** The review form uses a pre-fill decision table:

| Condition | Pre-fill source | Show candidate as |
|---|---|---|
| Top candidate score >= 0.80 | Candidate fields | Selected (pre-applied) |
| Top candidate score < 0.80 | Extraction fields | Tappable suggestion banner |
| No candidates | Extraction fields | "No candidates found" |

The threshold (0.80) is a TUNABLE constant (`PREFILL_CONFIDENCE_FLOOR` in `src/domain/identification/prefill.ts`).

When pre-filling from extraction: set name falls back to the session carry-forward value. Auto, memorabilia, serial, and print run always come from extraction regardless of source.

**Consequence:** Low-confidence matches are visible but don't pollute the form. Unmatched cards arrive with whatever the photo extraction read, not empty. The decision logic is a pure function (`computePrefill`) with 11 unit tests covering the full decision table.
