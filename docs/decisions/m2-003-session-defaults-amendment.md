# M2-003: Extend scan_session.defaults to carry year and manufacturer

**Date:** 2026-09-07
**Context:** DESIGN §5.1 defines `scan_session.defaults` as `{ storage, set_hint }`. For not-in-catalog cards (the majority of Nick's collection), the user must enter set, year, manufacturer, and storage per card. Carrying all four from the session eliminates ~160 redundant taps across a 40-card box.

**Decision (DESIGN §5.1 amendment, approved by Nick):** Extend `scan_session.defaults` to accept:
```json
{ "storage": "toploader", "set_hint": "Topps Flagship", "year": 2026, "manufacturer": "Topps" }
```

The column is already `Json?` — no migration needed. The `createScanSession` action accepts the new keys. The batch header UI that edits these fields is built in Phase 3.

**Consequence:** Session defaults can carry all four carry-forward fields. `set_hint` pre-fills set name, `year` and `manufacturer` pre-fill those identity fields. Condition is never carried from session defaults (per DESIGN §5.1). Until Phase 3's batch header UI ships, year and manufacturer remain per-card fields in the form.
