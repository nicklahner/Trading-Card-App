/**
 * Fake CardSight provider implementations for tests and local dev.
 * Returns hardcoded fixture data for NFL football cards.
 */

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
} from '../types';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const FAKE_PARALLELS: Parallel[] = [
  { id: 'cs-par-base', name: 'Base', printRun: null, printRunKind: 'fixed' },
  { id: 'cs-par-silver', name: 'Silver', printRun: null, printRunKind: 'fixed' },
  { id: 'cs-par-blue', name: 'Blue', printRun: 199, printRunKind: 'fixed' },
  { id: 'cs-par-red', name: 'Red', printRun: 99, printRunKind: 'fixed' },
  { id: 'cs-par-gold', name: 'Gold', printRun: 10, printRunKind: 'fixed' },
  { id: 'cs-par-black', name: 'Black', printRun: 1, printRunKind: 'fixed' },
  { id: 'cs-par-green-scope', name: 'Green Scope', printRun: 75, printRunKind: 'fixed' },
  { id: 'cs-par-neon-green-pulsar', name: 'Neon Green Pulsar', printRun: 25, printRunKind: 'fixed' },
];

const FAKE_CATALOG_CARDS: CatalogCard[] = [
  {
    provider: 'cardsight',
    cardId: 'cs-card-stroud-prizm-2023',
    playerName: 'CJ Stroud',
    year: 2023,
    setName: 'Prizm',
    subsetOrInsert: null,
    cardNumber: '301',
    isRookie: true,
    isAutograph: false,
    isMemorabilia: false,
    parallels: FAKE_PARALLELS,
    setRef: { provider: 'cardsight', id: 'cs-set-2023-prizm' },
  },
  {
    provider: 'cardsight',
    cardId: 'cs-card-richardson-prizm-2024',
    playerName: 'Anthony Richardson',
    year: 2024,
    setName: 'Prizm',
    subsetOrInsert: null,
    cardNumber: '215',
    isRookie: false,
    isAutograph: false,
    isMemorabilia: false,
    parallels: FAKE_PARALLELS,
    setRef: { provider: 'cardsight', id: 'cs-set-2024-prizm' },
  },
  {
    provider: 'cardsight',
    cardId: 'cs-card-mahomes-optic-2023',
    playerName: 'Patrick Mahomes',
    year: 2023,
    setName: 'Donruss Optic',
    subsetOrInsert: null,
    cardNumber: '1',
    isRookie: false,
    isAutograph: false,
    isMemorabilia: false,
    parallels: FAKE_PARALLELS.slice(0, 5),
    setRef: { provider: 'cardsight', id: 'cs-set-2023-optic' },
  },
  {
    provider: 'cardsight',
    cardId: 'cs-card-stroud-prizm-2023-auto',
    playerName: 'CJ Stroud',
    year: 2023,
    setName: 'Prizm',
    subsetOrInsert: 'Rookie Autographs',
    cardNumber: 'RA-CS',
    isRookie: true,
    isAutograph: true,
    isMemorabilia: false,
    parallels: FAKE_PARALLELS.slice(0, 4),
    setRef: { provider: 'cardsight', id: 'cs-set-2023-prizm' },
  },
];

const FAKE_SALES: Sale[] = [
  {
    providerSaleId: 'cs-sale-001',
    soldAt: new Date('2024-08-15T14:30:00Z'),
    priceCents: 4500,
    shippingCents: 499,
    saleType: 'auction',
    marketplace: 'ebay',
    gradeKey: 'RAW',
    title: '2023 Panini Prizm CJ Stroud RC #301 Base',
  },
  {
    providerSaleId: 'cs-sale-002',
    soldAt: new Date('2024-08-10T09:15:00Z'),
    priceCents: 5200,
    shippingCents: 399,
    saleType: 'auction',
    marketplace: 'ebay',
    gradeKey: 'RAW',
    title: '2023 Prizm CJ Stroud Rookie #301',
  },
  {
    providerSaleId: 'cs-sale-003',
    soldAt: new Date('2024-08-12T18:00:00Z'),
    priceCents: 15000,
    saleType: 'auction',
    marketplace: 'ebay',
    gradeKey: 'PSA:10',
    title: '2023 Prizm CJ Stroud RC #301 PSA 10 Gem Mint',
  },
  {
    providerSaleId: 'cs-sale-004',
    soldAt: new Date('2024-07-28T11:45:00Z'),
    priceCents: 12500,
    saleType: 'fixed_price',
    marketplace: 'ebay',
    gradeKey: 'PSA:9',
    title: '2023 Prizm CJ Stroud RC PSA 9',
  },
  {
    providerSaleId: 'cs-sale-005',
    soldAt: new Date('2024-08-05T16:20:00Z'),
    priceCents: 25000,
    shippingCents: 0,
    saleType: 'auction',
    marketplace: 'ebay',
    gradeKey: 'RAW',
    title: '2023 Prizm CJ Stroud Silver RC #301',
  },
];

// ---------------------------------------------------------------------------
// FakeCardSightIdentifier
// ---------------------------------------------------------------------------

export class FakeCardSightIdentifier implements CardIdentifier {
  async identify(_images: ImageRef[]): Promise<IdentifyCandidate[]> {
    return [
      {
        provider: 'cardsight',
        cardId: 'cs-card-stroud-prizm-2023',
        parallelId: 'cs-par-base',
        confidence: 0.92,
        playerName: 'CJ Stroud',
        year: 2023,
        setName: 'Prizm',
        subsetOrInsert: null,
        cardNumber: '301',
        parallelName: 'Base',
        isRookie: true,
      },
      {
        provider: 'cardsight',
        cardId: 'cs-card-stroud-prizm-2023',
        parallelId: 'cs-par-silver',
        confidence: 0.78,
        playerName: 'CJ Stroud',
        year: 2023,
        setName: 'Prizm',
        subsetOrInsert: null,
        cardNumber: '301',
        parallelName: 'Silver',
        isRookie: true,
      },
      {
        provider: 'cardsight',
        cardId: 'cs-card-richardson-prizm-2024',
        parallelId: 'cs-par-base',
        confidence: 0.45,
        playerName: 'Anthony Richardson',
        year: 2024,
        setName: 'Prizm',
        subsetOrInsert: null,
        cardNumber: '215',
        parallelName: 'Base',
        isRookie: false,
      },
    ];
  }
}

// ---------------------------------------------------------------------------
// FakeCardSightCatalog
// ---------------------------------------------------------------------------

export class FakeCardSightCatalog implements CatalogProvider {
  async search(q: CatalogQuery): Promise<CatalogCard[]> {
    return FAKE_CATALOG_CARDS.filter((card) => {
      if (q.year !== undefined && card.year !== q.year) return false;
      if (q.setName && !card.setName.toLowerCase().includes(q.setName.toLowerCase())) return false;
      if (q.playerName && !card.playerName.toLowerCase().includes(q.playerName.toLowerCase())) return false;
      if (q.cardNumber && card.cardNumber !== q.cardNumber) return false;
      if (q.query) {
        const lower = q.query.toLowerCase();
        const haystack = `${card.year} ${card.setName} ${card.playerName} ${card.cardNumber}`.toLowerCase();
        return haystack.includes(lower);
      }
      return true;
    });
  }

  async getParallels(_setRef: ExternalRef): Promise<Parallel[]> {
    return FAKE_PARALLELS;
  }
}

// ---------------------------------------------------------------------------
// FakeCardSightComps
// ---------------------------------------------------------------------------

export class FakeCardSightComps implements CompsProvider {
  async getSales(
    ref: { cardId: string; parallelId: string | null },
    opts?: { period?: '3m' | '1y'; asOfDate?: Date },
  ): Promise<CompsResult> {
    // Return sales only for the Stroud base card; empty for others.
    if (ref.cardId !== 'cs-card-stroud-prizm-2023') {
      return { status: 'ok', sales: [] };
    }

    let sales = FAKE_SALES;

    // Filter to matching parallel (base vs silver).
    if (ref.parallelId === 'cs-par-silver') {
      sales = sales.filter((s) => s.title?.includes('Silver'));
    } else if (ref.parallelId === 'cs-par-base' || ref.parallelId === null) {
      sales = sales.filter((s) => !s.title?.includes('Silver'));
    }

    // Apply period filter.
    if (opts?.period === '3m') {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - 3);
      sales = sales.filter((s) => s.soldAt >= cutoff);
    }

    // Apply asOfDate filter.
    if (opts?.asOfDate) {
      sales = sales.filter((s) => s.soldAt <= opts.asOfDate!);
    }

    return { status: 'ok', sales };
  }
}
