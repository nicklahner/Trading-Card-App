# ADR-0002: Title-filtered comps as the V1 isolation mechanism

**Status:** Accepted
**Date:** 2026-09-06
**Decision owner:** Nick
**Depends on:** ADR-0001 (parallel isolation fails; `parallel_id` never populated on CardSight pricing records)

## Context

ADR-0001 showed that CardSight's `parallel_id` query parameter is ineffective: all sale records arrive untagged. The question is whether we can approximate parallel isolation by matching listing titles against a known vocabulary of parallel names from `catalog.parallels.list`.

## Analysis

### Data set
168 auction records across three established cards, all fetched with `parallel_id='null'` (i.e., unfiltered):

| Card | Year | RAW records | Graded records | Total |
|---|---|---|---|---|
| Panini Prizm Justin Herbert #325 | 2020 | 7 | 16 | 23 |
| Panini Prizm C.J. Stroud #6 Prizmatic | 2023 | 3 | 8 | 11 |
| Donruss Optic Caleb Williams #201 | 2024 | 81 | 53 | 134 |

### 1. Title coverage

**168/168 records (100%) have a non-empty title.** Every record has a seller-written eBay listing title. No records would be dropped by a "no title = exclude" rule on this data set.

### 2. Parallel-name matching (truncated vs complete vocabulary)

The initial test used the first 100 entries from `catalog.parallels.list` for each release. Because the API sorts alphabetically and returns one entry per parallel per sub-set, this captured only the first ~20 unique names (A through C for Prizm, A through G for Optic).

| Vocabulary | Williams RAW classified as "base" | Actually base | Leaked parallels |
|---|---|---|---|
| **Truncated** (19 names, A–G) | 64 / 81 | 6 | 58 |
| **Complete** (~45 names, estimated) | 13 / 81 | 6 | 7 |

With the **truncated** vocabulary, title filtering is useless — 72% of parallel records leak through as "base."

With a **complete** vocabulary (all parallel names paginated from the API), title filtering catches 68 of 75 true parallel records (91%). The remaining 7 are from sellers who wrote no parallel name in the title (e.g., "Panini 2024 Donruss Optic Caleb Williams #201 Chicago Bears Rated Rook" at $34.51, almost certainly a parallel given the price).

Ambiguity (title matching multiple parallel names): **0/168 records** matched more than one parallel name after deduplication. Two records matched both "Silver" and "Holo" (the card is a "Silver Holo" — a specific parallel). The longest-match-wins dedup resolves these correctly.

Herbert: with a complete vocabulary, 2 of 7 RAW records caught as parallel ("Lazer Prizm" $33, "Orange Disco" $33). The remaining 5 at $3.85–$7.50 are consistent with base pricing.

### 3. Base card filtering: price sanity

For Caleb Williams with a complete vocabulary, the surviving "base" records split into:

| Bucket | Count | Price range | Assessment |
|---|---|---|---|
| Confident base (≤$10) | 6 | $3.25–$4.75, median $4.00 | Consistent. SCP base estimate ≈ $4–5 |
| Ambiguous (>$10, no parallel keyword) | 7 | $14.50–$34.51 | Almost certainly parallels — sellers omitted the name |

**The 6 confident base records give a clean median of ~$4.** This is plausible for a 2024 Optic base Rated Rookie.

**The 7 ambiguous records are dangerous.** If they survive into comps, the combined pool of 13 records has a median of ~$14.50 — a 3.5x overvaluation. The §7.2 outlier removal does NOT catch this because the 7 leaked records are numerous enough (7 vs 6 true base) to pull the median toward themselves.

**However**, the §7.4 divergence check (`d = |ln(C/M)|`) would detect this: if M = $4 (SCP) and C = $14.50 (contaminated comps), d = 1.29, which exceeds the 0.69 threshold for `divergent_2x`. Confidence would be capped at low. This is acceptable as a safety net but not as a substitute for clean filtering.

### 4. Grade information

Grade splitting is reliable. CardSight structures the pricing response as `raw.records` + `graded[company].grades[value].records`. Every graded record carries a company and grade via the response structure, not the title.

| Grade key | Herbert | Stroud | Williams | Notes |
|---|---|---|---|---|
| RAW | 7 | 3 | 81 | |
| PSA:10 | 6 | 5 | 9 | |
| PSA:9 | 5 | 1 | 29 | |
| PSA:8 | 1 | — | 7 | |
| PSA:5–7 | — | — | 6 | |
| SGC:10 | 3 | — | — | |
| SGC:9.5 | — | 2 | — | |
| BGS:9.5 | 1 | — | — | |
| CGC:9 | — | — | 1 | |
| SGC:9 | — | — | 1 | |

**0 RAW records contained grading-company keywords in the title.** The API's raw/graded split is trustworthy; no title-based grade filtering is needed.

The same parallel-leakage problem applies to graded records: a PSA 10 Holo and a PSA 10 base sell at very different prices, and they're mixed together in the same grade group. Title filtering applies equally to graded records.

### 5. Honest read

**Title filtering with a complete vocabulary is the best available V1 option. It is not clean, but it is dramatically better than no filtering.**

What it gets right:
- 91% of parallel records caught on the hardest test card (Williams, 81 RAW records)
- 0% ambiguous matches
- 100% title coverage (no records dropped for missing titles)
- The confident base survivors produce a sane median (~$4 for Williams)

What it gets wrong:
- **~9% false-negative rate**: sellers who omit the parallel name. These records are typically 3–8x the base price and will contaminate the comps median if numerous enough.
- **Vocabulary must be fully paginated.** A truncated vocabulary is catastrophically worse than no vocabulary. Paginating `catalog.parallels.list` (4–5 pages per release, ~15 API calls total for a collection) is non-negotiable.
- **Outlier removal doesn't save us** when leakage is numerous. The divergence check against SCP model does, but only when M exists.
- **For parallel-specific comps (valuing a Silver card), it's weaker.** "Title contains Silver" catches Silver Holo, Silver Prizm, and Silver records — but they may be different sub-parallels with different values.

My recommendation: **use it as the V1 comps mechanism**, with:
1. Full vocabulary pagination as a hard requirement
2. "No title" = exclude
3. Confidence cap at medium for all title-filtered comps (new reason code `title_filtered`)
4. Lean on the existing divergence check (§7.4) as the safety net against leakage
5. Track and log the filter's accuracy in M3 (compare title-filtered median vs SCP model for each card) so we can quantify real-world contamination and tune thresholds

This is option 3 from ADR-0001.

## Decision

Pending Nick's approval.

## Proposed changes if approved

1. **CardSight comps adapter:** fetch with `parallel_id='null'` (since the parameter is ineffective anyway), then title-filter records using the full parallel vocabulary for the card's release. For base: exclude records whose title matches any parallel name. For a specific parallel: include only records whose title matches that parallel's name(s). Exclude records with no title (edge case, 0% today).

2. **Vocabulary cache:** paginate `catalog.parallels.list` for each release the first time parallels are needed, cache the full list for 7 days (same TTL as the existing parallels cache in §6.5). Store in `provider_cache`.

3. **Confidence:** add `title_filtered` to the §7.4 confidence table, capping at medium. This applies whenever the comps came through title filtering (i.e., always, until CardSight fixes `parallel_id`).

4. **Metrics (M3):** for every card valued with title-filtered comps, log `comps_median`, `scp_model_value`, and `filter_survival_rate` (records surviving ÷ total). Alert if median-to-model divergence exceeds 0.41 (50%) on more than 20% of cards.

5. **No change to DESIGN.md §7.2–7.4 math.** Title filtering is an adapter-level concern; the engine sees a `Sale[]` that has already been filtered. The only engine change is the new `title_filtered` confidence cap.

6. **Fakes:** update fake CardSight comps to return records with realistic titles (including some parallel names) so the title filter can be tested.
