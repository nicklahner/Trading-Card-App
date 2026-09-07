/**
 * Provider integration guards.
 *
 * Each test reproduces a known-good query from the M0.5 spike against
 * the live API and asserts a non-empty, on-topic result.
 *
 * These catch adapter bugs that silently diverge from what the spike proved works —
 * wrong base URL, wrong field names, wrong image encoding.
 *
 * Run with: PROVIDERS_MODE=live pnpm vitest run tests/integration/
 * Requires live API keys in .env.local. Skipped in CI (no keys).
 */

import { describe, it, expect } from 'vitest';
import { config } from 'dotenv';

config({ path: '.env' });
config({ path: '.env.local', override: true });

const hasScpToken = !!process.env.SPORTSCARDSPRO_TOKEN;
const hasCsKey = !!process.env.CARDSIGHTAI_API_KEY;

describe.skipIf(!hasScpToken)('SportsCardsPro live guard', () => {
  it('search for "2026 Topps Flagship Jalen Hurts" returns football products with prices', async () => {
    const { createProviders } = await import('@/providers');
    const providers = createProviders('live');

    const results = await providers.sportsCardsProCatalog.search({
      query: '2026 Topps Flagship Jalen Hurts',
    });

    // Must return results
    expect(results.length).toBeGreaterThan(0);

    // First result must be a football card, not SpongeBob/Marvel/etc
    const top = results[0];
    expect(top.setName.toLowerCase()).toContain('topps');
    expect(top.playerName.toLowerCase()).toContain('hurts');

    // Must have a price
    const prices = await providers.modelPriceProvider.getPrices([top.cardId]);
    const pr = prices.get(top.cardId);
    expect(pr).toBeDefined();
    expect(pr!.status).toBe('ok');
    if (pr!.status === 'ok') {
      expect(pr!.table.prices['RAW']).toBeGreaterThan(0);
    }
  }, 30_000);

  it('product detail returns loose-price field (not price)', async () => {
    const { createProviders } = await import('@/providers');
    const providers = createProviders('live');

    // Known product ID from spike: Eli Heidenreich base
    const prices = await providers.modelPriceProvider.getPrices(['14140599']);
    const pr = prices.get('14140599');
    expect(pr).toBeDefined();
    expect(pr!.status).toBe('ok');
    if (pr!.status === 'ok') {
      // RAW price should exist (mapped from loose-price)
      expect(pr!.table.prices['RAW']).toBeDefined();
      expect(pr!.table.prices['RAW']).toBeGreaterThan(0);
    }
  }, 15_000);
});

describe.skipIf(!hasCsKey)('CardSight live guard', () => {
  it('identify.cardBySegment returns a detection for card 01 front', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const { createProviders } = await import('@/providers');
    const providers = createProviders('live');

    const frontPath = resolve(
      process.cwd(),
      'fixtures/cards/real/01-front.jpg',
    );

    // Check the file exists before running (test card images are gitignored)
    let exists = false;
    try {
      readFileSync(frontPath);
      exists = true;
    } catch {
      // File not present — skip gracefully
    }

    if (!exists) {
      console.log('  Skipping: fixtures/cards/real/01-front.jpg not present');
      return;
    }

    const candidates = await providers.cardIdentifier.identify([
      { url: `file://${frontPath}`, side: 'front' },
    ]);

    // Must return at least one detection
    expect(candidates.length).toBeGreaterThan(0);

    // Detection must have a card ID and a player name
    const top = candidates[0];
    expect(top.cardId).toBeTruthy();
    expect(top.playerName).toBeTruthy();
    expect(top.confidence).toBeGreaterThan(0);
  }, 30_000);
});
