# M1-002: Scanned drafts visible in collection list

**Date:** 2026-09-06
**Context:** Scan-session items stay in `draft` until identification runs (M2). If the collection list only shows `owned` items, photographed cards silently disappear.

**Decision:** The collection list shows a "Scanned, waiting for identification (N)" section at the top when draft items exist. Each draft shows its thumbnail and session label. An inline note explains: "Card identification arrives in a future update. You can delete these or keep them for later." This follows §5.1 which says drafts older than 30 min appear in Review with Resume/Delete.

**Consequence:** Collection list query includes `draft` and `identifying` statuses in a separate section above the owned list.
