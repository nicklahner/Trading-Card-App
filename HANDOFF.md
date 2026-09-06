# Handing Card Tracker to Claude Code

Everything here goes in a fresh git repo. `docs/DESIGN.md` is the plan (v2, after the adversarial review); `CLAUDE.md` holds the rules Claude Code reloads every session.

## 1. Set up the repo (5 minutes)

```bash
mkdir -p ~/dev/card-tracker && cd ~/dev/card-tracker
# copy the contents of this bundle into that folder, then:
git init && git add -A && git commit -m "Design doc and working agreements"
code .            # open in VS Code
claude            # start Claude Code in the repo
```

## 2. Before you start M0.5 (not needed for M0)

- SportsCardsPro **Legendary** ($49/mo) — the only tier with API access. Copy the 40-character token.
- **CardSight** free key (upgrade to Pro before loading the real collection).
- **Anthropic API key** for the card-reading vision calls.
- A **GCP project** (billing on) — used from M5; M0–M4 run locally on Docker Postgres.
- Photos of **~20 real cards**, front and back: at least 5 base, 5 parallels (2 of them base-vs-Silver lookalikes), 3 numbered, 2 autos, 5 in toploaders, 5 in penny sleeves.

Put secrets in `.env.local` (never commit). `.env.example` lists every variable.

## 3. Work one milestone per session

The plan is built in stages: M0 → M0.5 → M1 → M2 → M3 → M4 → M5. Each has acceptance criteria in §13. Give Claude Code one milestone at a time, on its own branch, and start a fresh session (`/clear`) between milestones so it re-reads the plan instead of drifting.

**Kickoff prompt (first session):**

> Read docs/DESIGN.md end to end before writing any code — it's long, so read it in chunks — then read CLAUDE.md.
>
> Build **M0 only** (§13). Don't start M0.5 or any later milestone.
>
> First, give me a short plan: the files you'll create, the Prisma models from §5 you'll define, and anything in the doc that's ambiguous or that you'd do differently. Wait for my OK before writing code.
>
> Rules for this repo: build milestones in order; treat items marked [DECISION] as fixed unless I say otherwise; put [TUNABLE] values in config; never scrape any website; and when a vendor API differs from the doc, write an ADR in docs/adr/ instead of changing the doc's domain types.
>
> When M0's acceptance criteria pass, stop and tell me how to verify them myself.

**Every later milestone:**

> Read docs/DESIGN.md §13 and the sections it references for **M<n>**, plus CLAUDE.md and docs/adr/. Plan first, wait for my OK, then build M<n> only. Stop at its acceptance criteria and tell me how to verify them.

## 4. The two places to slow down

**M0.5, the vendor spike.** This is the checkpoint that protects the whole plan. It calls the real APIs with your 20 cards and answers nine questions in `docs/adr/0001-vendor-spike.md`, then applies a go/no-go test. If it fails, don't push through — the plan tells Claude Code to stop and ask you whether to switch the comps source or run model-only. Read that ADR yourself.

**M3, the valuation engine.** This is where accuracy is won or lost. Ask Claude Code to show the two worked examples in §7.12 passing, and skim §7.4's confidence table so you know what "high confidence" is supposed to mean.

## 5. Useful habits

- Ask for a plan before code on anything non-trivial, and use plan mode for bigger steps.
- One branch and one PR per milestone; keep commits small.
- If Claude Code proposes something that isn't in the plan, ask which section it comes from. Additions were deliberately gated out during review.
- When a vendor behaves differently than expected, the answer is a new ADR, not a quiet code change.
- Re-run the adversarial plan review (the skill) if the design changes substantially — for example if the comps source has to change after M0.5.

## 6. What to check at each gate

| Milestone | What you verify |
|---|---|
| M0 | `pnpm dev` runs offline with fake data; a non-allowlisted Google login is rejected; CI green |
| M0.5 | ADR-0001 answers all nine questions and records the go/no-go result |
| M1 | On your phone: add 3 cards by hand, edit one, mark one sold |
| M2 | Identification report on your 20 real cards: per-field accuracy, and every uncertain parallel flagged |
| M3 | §7.12 examples pass exactly; nightly job values the whole seed; a simulated vendor outage carries values forward instead of writing new ones |
| M4 | Dashboard total equals the sum of the collection list; totals disclose unvalued and unconfirmed cards |
| M5 | Deployed behind your Google login; nightly job succeeds 3 days running; first validation report |
