/**
 * Live SportsCardsPro (PriceCharting) provider implementations.
 * Base URL: https://www.pricecharting.com
 * Auth: query param t={SPORTSCARDSPRO_TOKEN}
 * Rate limit: 1 request per second.
 * All prices returned from the API are in integer cents (pennies).
 */

import type { CatalogProvider, ModelPriceProvider } from '../interfaces';
import type {
  CatalogQuery,
  CatalogCard,
  ExternalRef,
  Parallel,
  GradePriceTable,
  ModelPriceResult,
  UnavailableReason,
} from '../types';
import { LocalRateLimiter, type RateLimiter } from '@/lib/rate-limiter';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://www.pricecharting.com';
const PROVIDER = 'sportscardspro';
const RATE_LIMIT_INTERVAL_MS = 1_000;
const MAX_RESULTS = 100;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToken(): string {
  const token = process.env.SPORTSCARDSPRO_TOKEN;
  if (!token) {
    throw new Error('SPORTSCARDSPRO_TOKEN env var is not set');
  }
  return token;
}

function classifyError(err: unknown): UnavailableReason {
  if (err instanceof Response || (err && typeof err === 'object' && 'status' in err)) {
    const status = (err as { status: number }).status;
    if (status === 429) return 'rate_limited';
    if (status >= 500) return 'server_error';
    if (status === 400 || status === 404) return 'invalid_payload';
  }

  if (err instanceof TypeError && (err as Error).message?.includes('fetch')) {
    return 'timeout';
  }

  // Network / abort errors
  if (err instanceof DOMException || (err instanceof Error && err.name === 'AbortError')) {
    return 'timeout';
  }

  return 'server_error';
}

async function checkedFetch(url: string): Promise<unknown> {
  const res = await fetch(url);

  if (!res.ok) {
    const err = Object.assign(new Error(`SportsCardsPro API ${res.status}`), {
      status: res.status,
    });
    throw err;
  }

  return res.json();
}

/**
 * Map PriceCharting price fields to our standard GradeKey format.
 * Field names from the PriceCharting API response.
 */
const PRICE_FIELD_MAP: Record<string, string> = {
  'price': 'RAW',
  'graded-price': 'GRADED:9',
  'psa-10-price': 'PSA:10',
  'psa-9-price': 'GRADED:9',
  'psa-8-price': 'GRADED:8',
  'psa-7-price': 'GRADED:7',
  'psa-6-price': 'GRADED:6',
  'psa-5-price': 'GRADED:5',
  'psa-4-price': 'GRADED:4',
  'psa-3-price': 'GRADED:3',
  'psa-2-price': 'GRADED:2',
  'psa-1-price': 'GRADED:1',
  'bgs-10-price': 'BGS:10',
  'bgs-10-pristine-price': 'BGS:10B',
  'bgs-9-5-price': 'GRADED:9.5',
  'bgs-9-price': 'GRADED:9',
  'cgc-10-price': 'CGC:10',
  'cgc-10-pristine-price': 'CGC:10P',
  'sgc-10-price': 'SGC:10',
  'tag-10-price': 'TAG:10',
  'ace-10-price': 'ACE:10',
};

function buildPriceTable(product: Record<string, unknown>): GradePriceTable {
  const prices: Record<string, number> = {};

  for (const [field, gradeKey] of Object.entries(PRICE_FIELD_MAP)) {
    const value = product[field];
    if (typeof value === 'number' && value > 0) {
      // Only set if we haven't already mapped a higher-priority field to this key.
      // First writer wins (e.g. psa-9-price and graded-price both map to GRADED:9).
      if (!(gradeKey in prices)) {
        prices[gradeKey] = value;
      }
    }
  }

  return {
    productId: String(product['id'] ?? ''),
    productName: String(product['product-name'] ?? product['name'] ?? ''),
    setName: String(product['console-name'] ?? product['set-name'] ?? ''),
    salesVolumeYearly:
      typeof product['sales-volume'] === 'number' ? product['sales-volume'] : undefined,
    prices,
  };
}

function buildQueryString(q: CatalogQuery): string {
  if (q.query) return q.query;

  const parts: string[] = [];
  if (q.year) parts.push(String(q.year));
  if (q.setName) parts.push(q.setName);
  if (q.playerName) parts.push(q.playerName);
  if (q.cardNumber) parts.push(`#${q.cardNumber}`);
  return parts.join(' ');
}

function mapProductToCatalogCard(product: Record<string, unknown>): CatalogCard {
  const productName = String(product['product-name'] ?? product['name'] ?? '');
  const consoleName = String(product['console-name'] ?? product['set-name'] ?? '');
  const productId = String(product['id'] ?? '');

  // Extract parallel name from brackets in product name, e.g. "Player [Silver] #123"
  const bracketMatch = productName.match(/\[([^\]]+)\]/);
  const parallelName = bracketMatch ? bracketMatch[1] : 'Base';

  // Extract card number from product name (e.g. "#301")
  const numberMatch = productName.match(/#(\S+)/);
  const cardNumber = numberMatch ? numberMatch[1] : '';

  // Extract year from console/set name (first 4-digit number)
  const yearMatch = consoleName.match(/\b(19|20)\d{2}\b/);
  const year = yearMatch ? parseInt(yearMatch[0], 10) : 0;

  // Extract player name: everything before the first bracket or hash
  const playerName = productName
    .replace(/\s*\[.*$/, '')
    .replace(/\s*#\S*$/, '')
    .trim();

  // Detect attributes from product name
  const lowerName = productName.toLowerCase();
  const isAutograph = lowerName.includes('auto') || lowerName.includes('autograph');
  const isMemorabilia =
    lowerName.includes('relic') ||
    lowerName.includes('patch') ||
    lowerName.includes('jersey') ||
    lowerName.includes('memorabilia');

  // Extract print run from parallel name (e.g. "Blue /199")
  const printRunMatch = parallelName.match(/\/(\d+)/);
  const printRun = printRunMatch ? parseInt(printRunMatch[1], 10) : null;

  const parallel: Parallel = {
    id: productId,
    name: parallelName.replace(/\s*\/\d+/, '').trim(),
    printRun,
    printRunKind: 'fixed',
  };

  return {
    provider: PROVIDER,
    cardId: productId,
    playerName,
    year,
    setName: consoleName,
    subsetOrInsert: null,
    cardNumber,
    isRookie: false, // PriceCharting API does not indicate rookie status
    isAutograph,
    isMemorabilia,
    parallels: [parallel],
    setRef: { provider: PROVIDER, id: consoleName },
    imageUrl:
      typeof product['image-url'] === 'string' ? product['image-url'] : undefined,
  };
}

// ---------------------------------------------------------------------------
// LiveSportsCardsProCatalog
// ---------------------------------------------------------------------------

export class LiveSportsCardsProCatalog implements CatalogProvider {
  private rateLimiter: RateLimiter;

  constructor(rateLimiter?: RateLimiter) {
    this.rateLimiter = rateLimiter ?? new LocalRateLimiter();
  }

  async search(q: CatalogQuery): Promise<CatalogCard[]> {
    const token = getToken();
    const queryText = buildQueryString(q);
    if (!queryText) return [];

    await this.rateLimiter.acquire(PROVIDER, RATE_LIMIT_INTERVAL_MS);

    const url = `${BASE_URL}/api/products?q=${encodeURIComponent(queryText)}&t=${encodeURIComponent(token)}`;
    const data = (await checkedFetch(url)) as { products?: Record<string, unknown>[] };

    const products = data.products ?? [];
    return products.slice(0, MAX_RESULTS).map(mapProductToCatalogCard);
  }

  async getParallels(setRef: ExternalRef): Promise<Parallel[]> {
    // SportsCardsPro has no dedicated parallels endpoint.
    // Best-effort: search for the set name and collect unique parallels.
    const results = await this.search({ query: setRef.id });

    const seen = new Map<string, Parallel>();
    for (const card of results) {
      for (const p of card.parallels) {
        if (!seen.has(p.name)) {
          seen.set(p.name, p);
        }
      }
    }

    return Array.from(seen.values());
  }
}

// ---------------------------------------------------------------------------
// LiveSportsCardsProPrices
// ---------------------------------------------------------------------------

export class LiveSportsCardsProPrices implements ModelPriceProvider {
  private rateLimiter: RateLimiter;

  constructor(rateLimiter?: RateLimiter) {
    this.rateLimiter = rateLimiter ?? new LocalRateLimiter();
  }

  async getPrices(
    productIds: string[],
  ): Promise<Map<string, ModelPriceResult>> {
    const token = getToken();
    const results = new Map<string, ModelPriceResult>();

    for (const id of productIds) {
      try {
        await this.rateLimiter.acquire(PROVIDER, RATE_LIMIT_INTERVAL_MS);

        const url = `${BASE_URL}/api/product?id=${encodeURIComponent(id)}&t=${encodeURIComponent(token)}`;
        const product = (await checkedFetch(url)) as Record<string, unknown>;

        const table = buildPriceTable(product);
        results.set(id, { status: 'ok', table });
      } catch (err: unknown) {
        results.set(id, {
          status: 'unavailable',
          reason: classifyError(err),
        });
      }
    }

    return results;
  }
}
