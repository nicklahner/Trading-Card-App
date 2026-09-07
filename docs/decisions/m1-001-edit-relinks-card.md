# M1-001: Edit re-links item to a different card

**Date:** 2026-09-06
**Context:** M1 creates items as `owned` via search-and-add. Hard delete is restricted to `draft`/`needs_review` (§5.1). Without valuations (M3), there's no history to protect, but the lifecycle rule still applies.

**Decision:** The edit page includes a "Change card" action that re-runs the catalog search and re-links the item to a different card (or creates a new card row). This is simpler and safer than relaxing the hard-delete restriction, which would need to be un-relaxed in M3.

**Consequence:** `updateItem` server action accepts identity-field changes and calls `buildIdentityKey` to find-or-create the target card, then updates `item.card_id`. The old card row is left in place (other items may reference it).
