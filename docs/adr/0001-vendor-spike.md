# ADR-0001: Vendor spike (M0.5)

**Status:** Complete
**Date:** 2026-09-06
**Decision owner:** Nick
**Scope:** What CardSight and SportsCardsPro actually return for NFL cards, recorded before M1 builds against guessed shapes. See DESIGN.md §13 M0.5.

Record field names, shapes and counts only — never copies of sale records (DESIGN.md §3.3).

## Test set
Fifteen of Nick's real cards, front and back. Adjusted from the planned 20.

| # | Card (year, set, player, #, parallel) | Holder | Notes |
|---|---|---|---|
| 1 | 2026 Topps Flagship, Eli Heidenreich RC, #398, Base | Toploader | |
| 2 | 2026 Topps Flagship, Emanuel Henderson Jr. RC, Base | Toploader | Identify returned wrong card (Low) |
| 3 | 2026 Topps Flagship, Isiah Pacheco, #103, Pink parallel | Toploader | 0 detections from identify |
| 4 | 2025 Topps Flagship (35th Anniv), Malachi Fields RC, Base | Toploader | 0 detections; not in CardSight catalog |
| 5 | 2026 Topps Flagship, Makai Lemon RC, #319, Base | Toploader | |
| 6 | 2025 Topps Flagship (35th Anniv), Jalen Hurts, Base | Toploader | Partial: detected 1991 Topps insert set, no card ID |
| 7 | 2025 Topps Flagship (35th Anniv), Ty Simpson RC, Base | Penny sleeve | 0 detections |
| 8 | 2026 Topps Flagship, Alvin Kamara, BTP-25, Big Ticket Player insert | Toploader | 0 detections |
| 9 | 2026 Topps Flagship, Omarion Hampton RC, #107, Holo/Refractor parallel | Penny sleeve | Identify returned wrong card (Low) |
| 10 | 2026 Topps Flagship, Abdul Carter RC, #150, Base | Toploader | Identify returned wrong card (Low) |
| 11 | 2026 Topps Flagship, Brian Thomas Jr., Profiles insert | Penny sleeve | 0 detections |
| 12 | 2026 Topps Flagship, Malaki Starks, Base | Toploader | Identify returned wrong card (High) |
| 13 | 2026 Topps Flagship, Mike Evans, #156, Base | Penny sleeve | Identify returned wrong card (Low) |
| 14 | 2026 Topps Flagship, Milton Williams, #142, Base | Penny sleeve | Identify returned wrong card (Medium) |
| 15 | 2026 Topps Flagship, America's Duo (DAL), #296, Base | Penny sleeve | |

### Coverage gaps vs plan

| Category | Plan | Actual | Verdict |
|---|---|---|---|
| Base | ≥5 | ~10 | OK |
| Parallels | ≥5 (≥2 base-vs-Silver/Holo) | 2 (#3 Pink, #9 Holo). 0 base-vs-Silver/Holo pairs | **Thin** |
| Numbered | ≥3 | 0 | **Missing** |
| Autos | ≥2 | 0 | **Missing** |
| Toploaders | ≥5 | 8 | OK |
| Penny sleeves | ≥5 | 7 | OK |

**What this test set cannot tell us:** Whether the APIs handle serial-numbered cards, auto detection, base-vs-Silver disambiguation, or older/higher-value card sets (Prizm, Optic, Select). All 15 cards are from the same brand-new 2026 Topps Flagship release. See "Recommendation" below.

### Deferred
Claude vision extraction (no Anthropic API key). The Anthropic-dependent parts of §6.3 (step 2b) are deferred to M2. This does not affect the vendor spike questions.

## Questions

### 1. Are the published per-record fields populated for NFL cards?

**Yes, partially.** For auction records:

| Field | Populated? | Notes |
|---|---|---|
| `title` | Yes | eBay listing title, present on all records |
| `listing_type` | Yes | `"auction"` or `"fixed"` |
| `url` | Yes | Redirects through `showme.cards` to eBay `itm/` URLs |
| `image_url` | Yes | Present on records |
| `parallel_id` | **No** | Field absent (undefined) on all records tested — not null, not a UUID, simply missing |
| `parallel_name` | **No** | Same — absent on all records |
| `date` | Yes | ISO 8601 with timezone: `2026-09-05T04:26:54Z` (UTC). For fixed records, microsecond precision scrape timestamps |
| `price` | Yes | USD float (e.g., `5`, `1.25`, `0.99`). NOT cents |
| `source` | Yes | `"ebay"` on all records tested |

**Key finding:** `parallel_id` and `parallel_name` are defined in the PricingRecord schema as optional (`string | null`) but are **never populated** for any football card tested. This is the root cause of the isolation failure (Q2).

**Price units:** USD dollars as a float, not cents. The adapter must multiply by 100 and round.

### 2. Do base (`parallel_id='null'`) and parallel requests return only matching records?

**No. Isolation fails across all releases tested, including established sets.**

- `pricing.get(cardId, { parallel_id: 'null' })`: Returns **all** records for the card regardless of parallel. Records have no `parallel_id` field (it is `undefined`, not `null`).
- `pricing.get(cardId, { parallel_id: <UUID> })`: Returns **0 records** for every parallel tested, because no records are tagged with a parallel UUID.

#### Follow-up test on established sets (2026-09-06)

Tested three high-volume cards from older releases to rule out data-maturity effects:

| Card | Release | Raw records (base request) | parallel_id | Parallel bleeding visible in titles |
|---|---|---|---|---|
| 2020 Prizm Justin Herbert #325 | 6 years old | 7 raw, 16 graded | **UNDEFINED on all** | Yes: "Lazer Prizm" ($33) mixed with base ($4.25) |
| 2023 Prizm C.J. Stroud #6 Prizmatic | 3 years old | 3 raw, 8 graded | **UNDEFINED on all** | N/A (insert, fewer parallels) |
| 2024 Donruss Optic Caleb Williams #201 | 2 years old | 81 raw, 53 graded | **UNDEFINED on all** | Yes: "purple", "Green Hyper", "PINK", "HOLO" all in base request |

`parallel_id` and `parallel_name` are **never populated** on any PricingRecord for any football card tested, regardless of release year or sales volume. The query parameter `parallel_id` on `pricing.get` exists but is ineffective.

**Price contamination is severe on high-volume cards.** The Caleb Williams base request returns raw prices from $3.25 (base) to $29 (numbered parallel) — a 9x spread. Herbert: $4.25 (base) to $33 (Lazer Prizm) — an 8x spread. Using these mixed comps as "base" values would be wildly inaccurate.

Additionally, `catalog.search` results include `parallelName` (string) but **no `parallelId` (UUID)**. There is no route to obtain a parallel UUID through search. Parallel UUIDs are only available via `catalog.parallels.list`, which requires a `releaseId` that search results don't provide.

**Conclusion:** This is a platform-wide API limitation for football cards, not a data-lag issue.

### 3. Row cap and `as_of_date` paging on the busiest card

Tested on Makai Lemon #319 (busiest card, 7 total auction records).

- Default `limit` returns up to 500 (documented). With `limit=5`, the API returned 5 records plus a warning message:
  ```json
  {"type":"warning","message":"Returned the maximum 5 listings for this card; older sales exist beyond this page. To page further back, set as_of_date to the oldest date in this response and query again."}
  ```
- **`as_of_date` format:** Must be `YYYY-MM-DD` (date only). ISO datetime strings are rejected with `VALIDATION_ERROR`.
- **Paging works:** Page 1 (as_of_date=2026-09-13): 5 records, newest 2026-09-11. Page 2 (as_of_date=2026-08-31): 4 records, newest 2026-08-31. **1 overlap** on the boundary date (the record dated 2026-08-31 appears in both pages). Adapter should dedupe by `url` or `date+price` when paging.
- **`query` echo:** The response echoes `as_of_date` in the `query` object (defaults to today when omitted). Also echoes `parallel_id`, `grade_id`, `period`, `listing_type`.
- **No record count cap was hit** with 7 records (well below 500). Would need a higher-volume card (e.g., a Prizm rookie) to stress-test the 500 cap.

### 4. For ≥10 `fixed` records: sold, or still listed?

**Fixed records are active asking prices (BIN), not completed sales.**

Evidence:
1. The PricingRecord schema documents: `listing_type: "fixed" = a Buy It Now asking price (ask side). NOT necessarily a completed sale.`
2. Fixed record dates have microsecond precision (e.g., `2026-09-13T10:17:30.654609Z`) — these are scrape/index timestamps, not eBay listing end dates.
3. URLs redirect to live eBay `itm/` pages (confirmed via redirect follow on `showme.cards/i4aYn` → `ebay.com/itm/398388006023`).
4. Volume: Makai Lemon has 123 fixed vs 13 auction records. The ratio (10:1 ask-to-sale) is consistent with BIN listings, not completed sales.

**Fixed records must not be used as comps.** The design already specifies `listing_type: 'auction'` for comps requests (§3.4, §7.13).

Collected 18 fixed records across 6 cards. Titles include parallels mixed in (same isolation issue as auction records): e.g., "Eli Heidenreich 2026 Topps Flagship Football RC #398 Canvas /50" in a base request.

### 5. Do prices include shipping?

**No shipping field exists** on PricingRecord. The response fields are: `title, price, date, source, listing_type, url, image_url`. No `shipping`, `shipping_cost`, or equivalent.

The `price` field is documented as "the final sale price (the 'bid' side)" for auctions. eBay auction prices are the hammer price excluding shipping. **Prices almost certainly exclude shipping**, matching eBay's standard presentation.

For the valuation engine: this is consistent with §7.3 treating comps as item price only. Shipping is accounted for in §7.9 (net value / selling cost estimate), not in comps.

### 6. How does `catalog.parallels.list` expose print runs and SP/SSP image variations?

**323 parallel entries** found for 2026 Topps Flagship Football (release `7d7b6650`), representing **72 unique parallel names**.

Response shape: `{ parallels: [...], total_count, skip, take }`. Each entry:

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | Unique per parallel per set (multiple entries for the same name across different sub-sets within the release) |
| `name` | string | e.g., "Gold", "Holo Foil", "Pink", "FoilFractor" |
| `numberedTo` | number \| null | Fixed print run. `null` for unnumbered parallels (Holo Foil, Rainbow Foil, etc.) |
| `isPartial` | boolean | Present on some entries. Indicates the parallel doesn't apply to all cards in the set |
| `setId` | UUID | Which sub-set within the release |
| `setName` | string | e.g., "Base Set" |
| `releaseId`, `releaseName`, `releaseYear` | strings | Parent release context |
| `cardCount` | number | How many cards in the set have this parallel |

**Key observations:**
- **No `printRunKind` field.** The schema doesn't distinguish "fixed" vs "variable" (per-player) print runs. All print runs are expressed as `numberedTo`. The DESIGN.md `Parallel.printRunKind` type will need to be inferred: if `numberedTo` is present, assume 'fixed'; if null, 'fixed' with unknown run or unnumbered. Variable-run parallels (stat-line, jersey-number) would need to be identified by name pattern or manual mapping.
- **`isPartial`** is useful: it flags parallels that only apply to a subset of cards (e.g., True Photo Variation, short prints). This helps with variation detection (§6.5 step 6) but doesn't directly map to SP/SSP — there's no rarity tier field.
- **Duplicate names across sub-sets**: "Gold" appears 4+ times (once per sub-set like Base Set, inserts, etc.), each with its own UUID. The adapter should filter by `setId` when looking up parallels for a specific card.
- **No image-variation flag.** SP/SSP image variations aren't distinguished from other parallels. True Photo Variation appears as a separate parallel entry in SportsCardsPro (see Q8), but CardSight's parallel list doesn't tag it as an image variation.

Sample parallels with print runs:
- FoilFractor: /1, Platinum: /1, SuperFractor: /1, Rose Gold: /1
- Red, Red Crackle, Red Ink, etc.: /5
- Black: /10, Orange: /25, No Name: /35, Canvas, Gold: /50
- Independence Day: /76, Green: /99, Blue: /150, Aqua Refractor: /199
- Purple: /250, Yellow Holo Foil: /399, Pink: /1000, Pink Holo Foil: /1200
- Holo Foil, Rainbow Foil, Diamante Foil, Crackle Foil, Football, Sandglitter: null (unnumbered)

### 7. Identify response shape

**Shape:** `{ success: boolean, requestId: string, processingTime: number, detections: CardDetection[], messages?: ServerMessage[] }`

**CardDetection:** `{ confidence: 'High' | 'Medium' | 'Low', card: DetectedCard, grading?: {...} }`

**DetectedCard fields returned:**
| Field | Populated? |
|---|---|
| `id` | Yes (UUID), except when only a set-level match (card #6) |
| `segmentId` | Yes (same UUID for all: football segment) |
| `releaseId` | Yes |
| `setId` | Yes |
| `year` | Yes (string, e.g., "2026") |
| `manufacturer` | Yes ("Topps") |
| `releaseName` | Yes ("Topps Flagship Football") |
| `setName` | Yes ("Base Set", "1991 Topps" for the retro insert) |
| `name` | Yes when card-level match; absent for set-level only |
| `number` | Yes when card-level match |
| `description` | Not seen on any result |
| `numberedTo` | Not seen (no numbered cards in test set) |
| `attributes` | Yes — array of strings: team tags ("NFL-PIT"), "RC" for rookies |
| `variationOf` | Not seen |
| `fields` | Not seen |
| `parallelSuggestions` | **Not populated on any result.** Field exists in schema but was never returned |
| `suggestions` | **Not populated.** Schema says only on Medium/Low confidence, but not seen even on Low |

**Confidence mapping:** Categorical 'High' / 'Medium' / 'Low'. DESIGN.md's mapping (0.9 / 0.7 / 0.4) is confirmed as reasonable.

**Identification accuracy on this test set:** 3/15 correct top-1 (20%). 5/15 returned 0 detections. 6/15 returned the wrong card. 1/15 partial (set but no card). This is poor, but:
- All photos were sideways (rotated 90°), which likely hurts image matching
- 2025 35th Anniversary cards (#4, #6, #7) use a retro design that may not be trained yet
- Insert cards (#8, #11) have non-standard designs
- The design pipeline uses identify as one of multiple signals (combined with Claude vision extraction, which was skipped here)

**`parallelSuggestions` not returning** is significant — the feature is documented as beta in v4.0.0. For parallel resolution (§6.5), we'll rely on `catalog.parallels.list` + extraction signals, not on identify's parallel suggestions.

### 8. SportsCardsPro `/api/products`: result count for a modern Topps rookie without the parallel term

**The 20-result cap documented in DESIGN.md does not match current API behavior.** The API returns **up to 100 results** per query.

| Query | Results |
|---|---|
| "2026 Topps Flagship Makai Lemon" | 100 (capped) |
| "2026 Topps Flagship Jalen Hurts" | 100 (capped) |
| "2026 Topps Flagship Omarion Hampton" | 93 |
| "2026 Topps Flagship Abdul Carter" | 88 |
| "2026 Topps Flagship Mike Evans" | 81 |
| "2026 Topps Flagship Isiah Pacheco" | 72 |
| "2026 Topps Flagship Eli Heidenreich" | 70 |
| "2026 Topps Flagship Milton Williams" | 65 |

**The parallel family IS truncated at 100** for popular players (Lemon: 100 returned but likely more exist with 72 unique parallel names × multiple sub-sets). The §6.3 step 7 linkage logic (3 queries: without parallel, with parallel name, with print run) should still find the right product in most cases.

**Response shape:** `{ products: [...] }` (not a bare array). Each product:

| Field | Notes |
|---|---|
| `id` | Numeric string (e.g., "14136924") |
| `console-name` | Set name: "Football Cards 2026 Topps Flagship" |
| `product-name` | Card + parallel: "Makai Lemon #319" or "Makai Lemon [Gold] #319" |
| `loose-price` | RAW/ungraded price in **pennies** (integer). `0` or absent = no value |
| `graded-price` | Generic graded price in pennies |
| `bgs-10-price` | BGS 10 price in pennies |
| `condition-17-price` through `condition-20-price` | Grade-specific prices in pennies |
| `new-price` | PSA 10 equivalent price in pennies |
| `sales-volume` | Yearly sales count |
| `release-date` | Date string |
| `genre` | "Football Cards" |

**Price field mapping to DESIGN.md GradePriceTable:**
- `loose-price` → `RAW`
- `new-price` → likely PSA:10
- `bgs-10-price` → BGS:10
- `condition-17-price` through `condition-20-price` → cross-grader grades (need to confirm exact mapping via Appendix B)
- `0` or absent → no value (DESIGN.md: "Missing/zero provider prices mean 'no data', never $0")

**Parallel bracket pattern:** `[Gold]`, `[Holo Pink]`, `[True Photo Variation]`, etc. Base cards have no bracket. This matches the §6.3 step 7 hard reject pattern perfectly.

### 9. Projected §7.4 method mix across these cards

With the isolation failure (Q2), applying §7.13 base-card guard (base cards get no comps, model only):

| Method | Count | Cards |
|---|---|---|
| `model_only` | ~8 | Base cards with SCP values ($0.99–$2.00): #1, #5, #10, #12, #13, #14, #6, #15 |
| `unpriced` | ~5 | Cards without SCP matches or not in CardSight catalog: #4, #7, #8, #11, #2 |
| `comps_only` (WEAK) | 0 | No usable isolated comps for any card |
| `comps_strong`/`blend` | 0 | Would require ≥3 isolated auction records |

If we ignore the isolation failure and use the mixed (base+parallel) comps:

| Method | Count | Notes |
|---|---|---|
| `model_primary` (WEAK tier + M) | ~4 | Cards with 1–7 mixed comps and an SCP value |
| `comps_only` (WEAK, no M) | ~1 | Cards with mixed comps but no SCP match |
| `model_only` | ~5 | Cards with SCP value but 0 comps |
| `unpriced` | ~5 | No comps, no SCP value |

**This mix is dominated by the test set being low-value base cards, not by API limitations.** A collection of Prizm/Optic rookies, autos, and numbered cards would show a very different distribution.

## Go/no-go

### (a) Base and parallel records are isolated for every card tested

**FAIL.**

The `parallel_id` field on PricingRecord is never populated for any football card, across all releases tested (2020 Prizm, 2023 Prizm, 2024 Donruss Optic, 2026 Topps Flagship). This is a platform-wide API limitation, not a data-lag issue. The `parallel_id='null'` request returns all records indiscriminately — base, Silver, Holo, numbered, everything mixed together. Price contamination is severe: 8–9x spreads between base and parallel sales on the same card.

### (b) ≥60% of cards with a SportsCardsPro RAW value ≥ $10 have ≥1 raw auction sale in 180 days

**CANNOT EVALUATE** on the 15-card test set (all sub-$10 base cards). However, the established-set follow-up confirms robust sales volumes: Herbert (23 records), Caleb Williams (134 records). If isolation worked, criterion (b) would pass easily for established cards. The criterion is not the problem.

**Result:** **NO-GO on criterion (a) → resolved via ADR-0002 (title-filtered comps).**

CardSight's `parallel_id` field is never populated. Nick chose **option 3: title-filtered comps** with three safeguards (ADR-0002):
1. **Model-anchored trim** — drop comps above K×M (K=2.5) to catch leaked parallels. Flag `title_filter_unreliable` when >30% are dropped.
2. **No-model conservative rule** — when base card has no SCP model, use quantile 0.35 instead of 0.50, cap confidence at low.
3. **Fail closed on vocabulary** — if `catalog.parallels.list` pagination is incomplete, skip comps entirely and use model-only. Never use a truncated vocabulary.

DESIGN.md §7.2, §7.4, §7.7 amended. ALGORITHM_VERSION bumped to 1.1.0.

## Consequences for the build

Pending Nick's decision on the path forward. Consequences common to all options:

1. **CardSight prices are in USD float, not cents.** Adapter must `Math.round(price * 100)` to convert to integer cents.

2. **`as_of_date` format is `YYYY-MM-DD`.** The adapter must convert dates, not pass ISO datetimes. Paging produces 1-record overlap on boundary dates; dedupe by URL when paging.

3. **SportsCardsPro response shape is `{ products: [...] }`,** not a bare array. Result cap is 100, not the 20 assumed in DESIGN.md. The `product-name` bracket pattern `[Parallel Name]` works exactly as designed for §6.3 step 7 hard reject.

4. **`catalog.parallels.list` has no `printRunKind` field.** Infer 'fixed' when `numberedTo` is present. The `isPartial` flag helps identify short prints. No SP/SSP rarity tier field exists.

5. **`catalog.search` results lack `parallelId` and `releaseId`.** Parallel UUIDs are only available via `catalog.parallels.list` (which requires a `releaseId` from identify, not from search).

6. **`parallelSuggestions` on identify is not returning** (beta). Don't depend on it; use `catalog.parallels.list` + extraction signals for parallel resolution.

7. **`parallel_id` and `parallel_name` on PricingRecord are always absent.** Treat `undefined` same as `null`. The §3.4 adapter check ("reject any record with a non-null parallel_id mismatch") will never fire; records simply have no parallel attribution.

8. **Fakes need to match observed shapes:** absent `parallel_id`/`parallel_name` on PricingRecord, `{ products: [...] }` wrapper on SCP response, 72+ parallels per release.

### If model-primary (option 2):

- §7.4 table effectively collapses to `model_only` for all cards (comps tier = NONE because the base-card guard rejects all untagged records).
- SportsCardsPro becomes the sole value source for RAW. Comps from CardSight would only serve as a divergence cross-check (compare the mixed-parallel median against M; flag `divergent` but don't blend).
- Confidence is capped at medium for `model_only` with `sales_volume ≥ 24` (§7.4), low otherwise.

### If title-filtered comps (option 3):

- Build a parallel-name exclusion filter in the adapter: for a base-card request, reject any record whose title matches a known parallel name (from `catalog.parallels.list`). This is fragile (sellers misspell, abbreviate, or omit parallel names) but better than no filtering.
- For a parallel-card request, reject any record whose title does NOT contain the parallel name. Same fragility caveat.
- Cap confidence at medium for title-filtered comps. Flag `title_filtered_comps` so the "Why this value" view can explain the limitation.
- This is new engine behavior not in DESIGN.md; would need Nick's sign-off and a new ADR.
