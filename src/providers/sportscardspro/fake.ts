/**
 * Fake SportsCardsPro provider implementations for tests and local dev.
 * Returns hardcoded fixture data for NFL football cards.
 * All prices in integer cents.
 */

import type { CatalogProvider, ModelPriceProvider } from '../interfaces';
import type {
  CatalogQuery,
  CatalogCard,
  ExternalRef,
  Parallel,
  GradePriceTable,
  ModelPriceResult,
} from '../types';

// ---------------------------------------------------------------------------
// Fixture data
// ---------------------------------------------------------------------------

const SCP_PARALLELS: Parallel[] = [
  { id: 'scp-par-base', name: 'Base', printRun: null, printRunKind: 'fixed' },
  { id: 'scp-par-silver', name: 'Silver', printRun: null, printRunKind: 'fixed' },
  { id: 'scp-par-blue', name: 'Blue', printRun: 199, printRunKind: 'fixed' },
  { id: 'scp-par-red', name: 'Red', printRun: 99, printRunKind: 'fixed' },
  { id: 'scp-par-gold', name: 'Gold', printRun: 10, printRunKind: 'fixed' },
];

const SCP_CATALOG_CARDS: CatalogCard[] = [
  {
    provider: 'sportscardspro',
    cardId: 'scp-card-stroud-prizm-2023',
    playerName: 'CJ Stroud',
    year: 2023,
    setName: '2023 Panini Prizm',
    subsetOrInsert: null,
    cardNumber: '301',
    isRookie: true,
    isAutograph: false,
    isMemorabilia: false,
    parallels: SCP_PARALLELS,
    setRef: { provider: 'sportscardspro', id: 'scp-set-2023-prizm' },
  },
  {
    provider: 'sportscardspro',
    cardId: 'scp-card-mahomes-optic-2023',
    playerName: 'Patrick Mahomes',
    year: 2023,
    setName: '2023 Panini Donruss Optic',
    subsetOrInsert: null,
    cardNumber: '1',
    isRookie: false,
    isAutograph: false,
    isMemorabilia: false,
    parallels: SCP_PARALLELS.slice(0, 4),
    setRef: { provider: 'sportscardspro', id: 'scp-set-2023-optic' },
  },
];

const PRICE_TABLES: Record<string, GradePriceTable> = {
  'scp-prod-stroud-base': {
    productId: 'scp-prod-stroud-base',
    productName: 'CJ Stroud #301',
    setName: '2023 Panini Prizm',
    salesVolumeYearly: 1250,
    prices: {
      'RAW': 4200,
      'PSA:10': 14500,
      'BGS:10': 16000,
      'BGS:10B': 45000,
      'CGC:10': 13000,
      'CGC:10P': 28000,
      'SGC:10': 11000,
      'TAG:10': 10500,
      'ACE:10': 9800,
      'GRADED:9.5': 11500,
      'GRADED:9': 8500,
      'GRADED:8': 5500,
      'GRADED:7': 4800,
    },
  },
  'scp-prod-stroud-silver': {
    productId: 'scp-prod-stroud-silver',
    productName: 'CJ Stroud [Silver] #301',
    setName: '2023 Panini Prizm',
    salesVolumeYearly: 380,
    prices: {
      'RAW': 22000,
      'PSA:10': 65000,
      'BGS:10': 72000,
      'BGS:10B': 185000,
      'SGC:10': 55000,
      'GRADED:9.5': 48000,
      'GRADED:9': 35000,
      'GRADED:8': 28000,
    },
  },
  'scp-prod-mahomes-base': {
    productId: 'scp-prod-mahomes-base',
    productName: 'Patrick Mahomes #1',
    setName: '2023 Panini Donruss Optic',
    salesVolumeYearly: 420,
    prices: {
      'RAW': 150,
      'PSA:10': 800,
      'BGS:10': 900,
      'SGC:10': 650,
      'GRADED:9.5': 500,
      'GRADED:9': 350,
    },
  },
  'scp-prod-stroud-blue': {
    productId: 'scp-prod-stroud-blue',
    productName: 'CJ Stroud [Blue /199] #301',
    setName: '2023 Panini Prizm',
    salesVolumeYearly: 85,
    prices: {
      'RAW': 8500,
      'PSA:10': 32000,
      'BGS:10': 35000,
      'SGC:10': 27000,
      'GRADED:9.5': 24000,
      'GRADED:9': 18000,
    },
  },
};

// ---------------------------------------------------------------------------
// FakeSportsCardsProPrices
// ---------------------------------------------------------------------------

export class FakeSportsCardsProPrices implements ModelPriceProvider {
  async getPrices(
    productIds: string[],
  ): Promise<Map<string, ModelPriceResult>> {
    const results = new Map<string, ModelPriceResult>();
    for (const id of productIds) {
      const table = PRICE_TABLES[id];
      if (table) {
        results.set(id, { status: 'ok', table });
      } else {
        results.set(id, {
          status: 'unavailable',
          reason: 'invalid_payload',
        });
      }
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// FakeSportsCardsProCatalog
// ---------------------------------------------------------------------------

export class FakeSportsCardsProCatalog implements CatalogProvider {
  async search(q: CatalogQuery): Promise<CatalogCard[]> {
    return SCP_CATALOG_CARDS.filter((card) => {
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
    return SCP_PARALLELS;
  }
}
