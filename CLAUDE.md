# Card Tracker — working agreements for Claude Code
- Source of truth for product/design: docs/DESIGN.md. Build milestones in order; don't add out-of-scope features.
- Money stored, summed, and displayed = integer cents. Valuation math may use floats internally (ln/exp); round value, low and high once, half-up, before any money threshold is evaluated (§7.7 step 11b). Format only in UI.
- /src/domain is pure (no I/O) and must stay ≥95% covered. Valuation engine is a pure function; bump ALGORITHM_VERSION on any behavior/default change.
- All external APIs go through /src/providers interfaces with live + fake implementations. Tests and CI use fakes only. Never call paid APIs in CI.
- NEVER scrape websites (eBay, 130point, Card Ladder, TCDB, Beckett, grader cert pages). If data isn't available via our licensed APIs, stop and ask Nick.
- CardSight raw payloads only in provider_cache with TTL; persist derived values + IDs only.
- Respect rate limits (SportsCardsPro 1 req/s). Retry 429/5xx with backoff. Record api_usage.
- Every valuation stores method, confidence, range, flags, algorithm_version. Never show a value without its confidence.
- Missing/zero provider prices mean "no data", never $0.
- Don't log secrets or signed URLs. Strip EXIF on every image.
- Before changing a [DECISION] in DESIGN.md, ask Nick. [TUNABLE] values go in config.
- Engine rule changes need a matching test update in the same commit. Never generate or update expected values for frozen valuation or reporting fixtures by running src/. They come from /tools/oracle or hand computation. If the engine disagrees with an example, stop and report which rule is ambiguous; never edit expected values to match code.
- When a vendor API differs from DESIGN.md, write an ADR in docs/adr/ and adapt the adapter, not the domain types, where possible.
- Commands: pnpm dev | pnpm test | pnpm e2e | pnpm job:nightly [--date YYYY-MM-DD] | pnpm cache:purge-all --provider cardsight | pnpm smoke:identify <images> | pnpm smoke:value <itemId> (smoke = real APIs, manual only) | pnpm validate [--config candidate.json]

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
