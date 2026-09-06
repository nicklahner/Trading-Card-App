# ADR-0001: Vendor spike (M0.5)

**Status:** Not started
**Date:**
**Decision owner:** Nick
**Scope:** What CardSight and SportsCardsPro actually return for NFL cards, recorded before M1 builds against guessed shapes. See DESIGN.md §13 M0.5.

Record field names, shapes and counts only — never copies of sale records (DESIGN.md §3.3).

## Test set
Twenty of Nick's real cards, front and back: ≥5 base, ≥5 parallels (≥2 base-vs-Silver/Holo lookalikes), ≥3 numbered, ≥2 autos, ≥5 in toploaders, ≥5 in penny sleeves.

| # | Card (year, set, player, #, parallel) | Holder | Notes |
|---|---|---|---|
| 1 | | | |

## Questions

### 1. Are the published per-record fields populated for NFL cards?
(title, listing_type, url, parallel_id, parallel_name, date format and timezone, price units)

### 2. Do base (`parallel_id='null'`) and parallel requests return only matching records?

### 3. Row cap and `as_of_date` paging on the busiest card

### 4. For ≥10 `fixed` records: sold, or still listed?
(confirms they are asking prices, not sales)

### 5. Do prices include shipping?

### 6. How does `catalog.parallels.list` expose print runs and SP/SSP image variations?
(fixed runs vs per-player, e.g. stat-line and jersey-number parallels)

### 7. Identify response shape
(detections, confidence tier, parallelSuggestions)

### 8. SportsCardsPro `/api/products`: result count for a modern Prizm/Optic rookie without the parallel term
(does the 20-result cap truncate the parallel family?)

### 9. Projected §7.4 method mix across these cards
(comps-based / model_only / unpriced)

## Go/no-go
- (a) Base and parallel records are isolated for every card tested: **pass / fail**
- (b) ≥60% of cards with a SportsCardsPro RAW value ≥ $10 have ≥1 raw auction sale in 180 days: **pass / fail**

**Result:** GO / NO-GO
If either fails, stop and ask Nick whether to use Card Hedge as the V1 `CompsProvider` or to run model-primary.

## Consequences for the build
(Schema, adapter and fake changes that follow from the answers above.)
