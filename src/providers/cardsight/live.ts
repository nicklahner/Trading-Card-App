/**
 * Live CardSight provider implementations.
 *
 * Communicates with the CardSight REST API via fetch().
 * We don't have official SDK documentation, so endpoint paths and response
 * shapes are best-effort assumptions — see TODO comments for fields that
 * need verification against the real API.
 */

import { readFile } from 'node:fs/promises';
import type { CardIdentifier, CatalogProvider, CompsProvider } from '../interfaces';
import type {
  ImageRef,
  IdentifyCandidate,
  CatalogQuery,
  CatalogCard,
  ExternalRef,
  Parallel,
  CompsResult,
  Sale,
  SaleType,
  UnavailableReason,
} from '../types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.cardsight.ai/v1';
const REQUEST_TIMEOUT_MS = 30_000;

/** DESIGN.md §6.3 — categorical confidence → numeric */
const CONFIDENCE_MAP: Record<string, number> = {
  High: 0.9,
  Medium: 0.7,
  Low: 0.4,
};
const DEFAULT_CONFIDENCE = 0.5;

const MAX_IDENTIFY_RESULTS = 5;
const PARALLELS_PAGE_LIMIT = 100;
const COMPS_PAGE_LIMIT = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function requireApiKey(): string {
  const key = process.env.CARDSIGHTAI_API_KEY;
  if (!key) {
    throw new Error(
      'CARDSIGHTAI_API_KEY environment variable is required for the live CardSight adapter',
    );
  }
  return key;
}

function headers(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function mapErrorToReason(err: unknown): UnavailableReason {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  if (err instanceof TypeError) return 'server_error'; // network failures
  return 'server_error';
}

function reasonFromStatus(status: number): UnavailableReason {
  if (status === 429) return 'rate_limited';
  if (status >= 500) return 'server_error';
  return 'invalid_payload';
}

function parseConfidence(raw: string | number | undefined): number {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') return CONFIDENCE_MAP[raw] ?? DEFAULT_CONFIDENCE;
  return DEFAULT_CONFIDENCE;
}

// TODO: Verify actual sale_type values returned by CardSight API
function parseSaleType(raw: string | undefined): SaleType {
  const map: Record<string, SaleType> = {
    auction: 'auction',
    fixed_price: 'fixed_price',
    fixed: 'fixed_price',
    best_offer: 'best_offer_accepted',
    best_offer_accepted: 'best_offer_accepted',
    best_offer_unknown_price: 'best_offer_unknown_price',
  };
  return map[raw ?? ''] ?? 'unknown';
}

// ---------------------------------------------------------------------------
// LiveCardSightIdentifier
// ---------------------------------------------------------------------------

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  gif: 'image/gif', webp: 'image/webp',
};

async function resolveImageUrl(url: string): Promise<string> {
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  const filePath = url.startsWith('file://') ? url.slice(7) : url;
  const buf = await readFile(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime = EXT_TO_MIME[ext] ?? 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export class LiveCardSightIdentifier implements CardIdentifier {
  private readonly client: InstanceType<typeof import('cardsightai').CardSightAI>;

  constructor({ apiKey }: { apiKey: string }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { CardSightAI } = require('cardsightai') as typeof import('cardsightai');
    this.client = new CardSightAI({ apiKey });
  }

  async identify(images: ImageRef[]): Promise<IdentifyCandidate[]> {
    // The SDK's cardBySegment accepts a Blob — same as the M0.5 spike.
    // Use the front image only (SDK accepts one image per call, per DESIGN.md §6.3).
    const frontImage = images.find((img) => img.side === 'front') ?? images[0];
    const imageBlob = await resolveToBlob(frontImage.url);

    const resp = await this.client.identify.cardBySegment('football', imageBlob) as {
      data?: { detections?: Array<Record<string, unknown>> };
      error?: unknown;
    };

    if (resp.error) {
      const errMsg = typeof resp.error === 'string' ? resp.error : JSON.stringify(resp.error);
      throw new Error(`CardSight identify error: ${errMsg}`);
    }

    const detections = resp.data?.detections ?? [];

    const candidates: IdentifyCandidate[] = detections.map((det) => {
      const card = det.card as Record<string, unknown> | undefined;
      return {
        provider: 'cardsight',
        cardId: (card?.id as string) ?? '',
        parallelId: null, // parallelSuggestions are separate
        confidence: parseConfidence(det.confidence as string | number | undefined),
        playerName: (card?.name as string) ?? '',
        year: parseInt(String(card?.year ?? '0'), 10) || 0,
        setName: (card?.releaseName as string) ?? (card?.setName as string) ?? '',
        subsetOrInsert: (card?.setName as string) !== 'Base Set' ? (card?.setName as string) ?? null : null,
        cardNumber: (card?.number as string) ?? '',
        parallelName: null,
        isRookie: ((card?.attributes as string[]) ?? []).some(
          (a: string) => a.toLowerCase().includes('rookie') || a.toLowerCase().includes('rc'),
        ),
        imageUrl: card?.imageUrl as string | undefined,
      };
    });

    return candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, MAX_IDENTIFY_RESULTS);
  }
}

/** Read a local or remote image and return a Blob, matching the spike's pattern. */
async function resolveToBlob(url: string): Promise<Blob> {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const res = await fetch(url);
    return await res.blob();
  }
  const filePath = url.startsWith('file://') ? url.slice(7) : url;
  const buf = await readFile(filePath);
  return new Blob([buf], { type: 'image/jpeg' });
}

// ---------------------------------------------------------------------------
// LiveCardSightCatalog
// ---------------------------------------------------------------------------

export class LiveCardSightCatalog implements CatalogProvider {
  private readonly apiKey: string;

  constructor({ apiKey }: { apiKey: string }) {
    this.apiKey = apiKey;
  }

  async search(q: CatalogQuery): Promise<CatalogCard[]> {
    const params = new URLSearchParams();
    if (q.year !== undefined) params.set('year', String(q.year));
    if (q.setName) params.set('set_name', q.setName);
    if (q.playerName) params.set('player_name', q.playerName);
    if (q.cardNumber) params.set('card_number', q.cardNumber);
    if (q.query) params.set('q', q.query);

    let res: Response;
    try {
      res = await fetchWithTimeout(`${BASE_URL}/catalog/search?${params.toString()}`, {
        method: 'GET',
        headers: headers(this.apiKey),
      });
    } catch (err) {
      throw new Error(`CardSight catalog search failed: ${mapErrorToReason(err)}`);
    }

    if (!res.ok) {
      throw new Error(
        `CardSight catalog search returned HTTP ${res.status}: ${reasonFromStatus(res.status)}`,
      );
    }

    // TODO: Verify response shape
    const json = (await res.json()) as {
      results?: Array<{
        card_id?: string;
        player_name?: string;
        year?: number;
        set_name?: string;
        subset_or_insert?: string | null;
        card_number?: string;
        is_rookie?: boolean;
        is_autograph?: boolean;
        is_memorabilia?: boolean;
        parallels?: Array<{
          id?: string;
          name?: string;
          print_run?: number | null;
          print_run_kind?: 'fixed' | 'variable';
        }>;
        set_ref?: { provider?: string; id?: string };
        image_url?: string;
      }>;
    };

    return (json.results ?? []).map((r) => ({
      provider: 'cardsight',
      cardId: r.card_id ?? '',
      playerName: r.player_name ?? '',
      year: r.year ?? 0,
      setName: r.set_name ?? '',
      subsetOrInsert: r.subset_or_insert ?? null,
      cardNumber: r.card_number ?? '',
      isRookie: r.is_rookie ?? false,
      isAutograph: r.is_autograph ?? false,
      isMemorabilia: r.is_memorabilia ?? false,
      parallels: (r.parallels ?? []).map((p) => ({
        id: p.id ?? '',
        name: p.name ?? '',
        printRun: p.print_run ?? null,
        printRunKind: p.print_run_kind ?? 'fixed',
      })),
      setRef: {
        provider: r.set_ref?.provider ?? 'cardsight',
        id: r.set_ref?.id ?? '',
      },
      imageUrl: r.image_url,
    }));
  }

  /**
   * Fetches ALL parallels for a set, paginating through every page.
   * Critical per ADR-0002 — incomplete parallel lists cause misidentification.
   */
  async getParallels(setRef: ExternalRef): Promise<Parallel[]> {
    const allParallels: Parallel[] = [];
    let cursor: string | null = null;

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        set_id: setRef.id,
        limit: String(PARALLELS_PAGE_LIMIT),
      });
      if (cursor) params.set('cursor', cursor);

      let res: Response;
      try {
        res = await fetchWithTimeout(
          `${BASE_URL}/catalog/parallels/list?${params.toString()}`,
          { method: 'GET', headers: headers(this.apiKey) },
        );
      } catch (err) {
        throw new Error(`CardSight getParallels failed: ${mapErrorToReason(err)}`);
      }

      if (!res.ok) {
        throw new Error(
          `CardSight getParallels returned HTTP ${res.status}: ${reasonFromStatus(res.status)}`,
        );
      }

      // TODO: Verify pagination shape — cursor vs offset vs next_page_token
      const json = (await res.json()) as {
        results?: Array<{
          id?: string;
          name?: string;
          print_run?: number | null;
          print_run_kind?: 'fixed' | 'variable';
        }>;
        next_cursor?: string | null;
      };

      const page = json.results ?? [];

      for (const p of page) {
        allParallels.push({
          id: p.id ?? '',
          name: p.name ?? '',
          printRun: p.print_run ?? null,
          printRunKind: p.print_run_kind ?? 'fixed',
        });
      }

      // Stop when we've exhausted all pages
      if (page.length < PARALLELS_PAGE_LIMIT || !json.next_cursor) {
        break;
      }
      cursor = json.next_cursor;
    }

    return allParallels;
  }
}

// ---------------------------------------------------------------------------
// LiveCardSightComps
// ---------------------------------------------------------------------------

export class LiveCardSightComps implements CompsProvider {
  private readonly apiKey: string;

  constructor({ apiKey }: { apiKey: string }) {
    this.apiKey = apiKey;
  }

  /**
   * Fetches comparable sales from the CardSight pricing endpoint.
   * Pages older records using as_of_date per DESIGN.md §3.1.
   */
  async getSales(
    ref: { cardId: string; parallelId: string | null },
    opts?: { period?: '3m' | '1y'; asOfDate?: Date },
  ): Promise<CompsResult> {
    const allSales: Sale[] = [];
    let asOfDate = opts?.asOfDate ?? new Date();

    // Determine the earliest date we care about based on period
    const periodMonths = opts?.period === '1y' ? 12 : 3;
    const cutoff = new Date(asOfDate);
    cutoff.setMonth(cutoff.getMonth() - periodMonths);

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const params = new URLSearchParams({
        card_id: ref.cardId,
        listing_type: 'auction',
        limit: String(COMPS_PAGE_LIMIT),
        as_of_date: asOfDate.toISOString().slice(0, 10),
      });
      // Include parallel_id even though it doesn't work per ADR-0001
      if (ref.parallelId) params.set('parallel_id', ref.parallelId);
      if (opts?.period) params.set('period', opts.period);

      let res: Response;
      try {
        res = await fetchWithTimeout(`${BASE_URL}/pricing/get?${params.toString()}`, {
          method: 'GET',
          headers: headers(this.apiKey),
        });
      } catch (err) {
        return { status: 'unavailable', reason: mapErrorToReason(err) };
      }

      if (!res.ok) {
        return { status: 'unavailable', reason: reasonFromStatus(res.status) };
      }

      // TODO: Verify response shape — field names, date format, price unit (cents vs dollars)
      const json = (await res.json()) as {
        sales?: Array<{
          sale_id?: string;
          sold_at?: string;
          price_cents?: number;
          buyer_premium_cents?: number;
          shipping_cents?: number;
          sale_type?: string;
          marketplace?: string;
          grade_key?: string;
          title?: string;
          url?: string;
        }>;
      };

      const pageSales = json.sales ?? [];

      for (const s of pageSales) {
        // Missing/zero provider prices mean "no data", never $0
        if (!s.price_cents || s.price_cents <= 0) continue;

        allSales.push({
          providerSaleId: s.sale_id,
          soldAt: new Date(s.sold_at ?? 0),
          priceCents: s.price_cents,
          buyerPremiumCents: s.buyer_premium_cents,
          shippingCents: s.shipping_cents,
          saleType: parseSaleType(s.sale_type),
          marketplace: s.marketplace ?? 'unknown',
          gradeKey: s.grade_key ?? 'RAW',
          title: s.title,
          url: s.url,
        });
      }

      // If we got fewer than the limit, there are no more pages
      if (pageSales.length < COMPS_PAGE_LIMIT) break;

      // Find the oldest sale on this page and use it as the next as_of_date
      const oldestOnPage = pageSales.reduce((oldest, s) => {
        const d = new Date(s.sold_at ?? 0);
        return d < oldest ? d : oldest;
      }, new Date());

      // Stop if we've paged past our period cutoff
      if (oldestOnPage <= cutoff) break;

      // Move the cursor back to page older records
      asOfDate = oldestOnPage;
    }

    return { status: 'ok', sales: allSales };
  }
}
