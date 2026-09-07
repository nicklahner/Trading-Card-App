/**
 * Provider factory.
 * Returns a ProviderRegistry wired to either fake (test/dev) or live implementations.
 */

export type { ProviderRegistry } from './registry';
export type {
  CardIdentifier,
  TextExtractor,
  CatalogProvider,
  CompsProvider,
  ModelPriceProvider,
  CertProvider,
} from './interfaces';
export type {
  ImageRef,
  Sale,
  SaleType,
  Parallel,
  GradePriceTable,
  GradeKey,
  Grader,
  CatalogCard,
  CatalogQuery,
  CardExtraction,
  IdentifyCandidate,
  ExternalRef,
  CertResult,
  UnavailableReason,
  CompsResult,
  ModelPriceResult,
  Field,
} from './types';

import type { ProviderRegistry } from './registry';
import { FakeCardSightIdentifier, FakeCardSightCatalog, FakeCardSightComps } from './cardsight/fake';
import { FakeSportsCardsProPrices, FakeSportsCardsProCatalog } from './sportscardspro/fake';
import { FakeClaudeVisionExtractor } from './anthropic/fake';

export function createProviders(mode: 'fake' | 'live'): ProviderRegistry {
  if (mode === 'live') {
    throw new Error('Live providers not implemented yet');
  }

  return {
    cardIdentifier: new FakeCardSightIdentifier(),
    textExtractor: new FakeClaudeVisionExtractor(),
    cardSightCatalog: new FakeCardSightCatalog(),
    sportsCardsProCatalog: new FakeSportsCardsProCatalog(),
    compsProvider: new FakeCardSightComps(),
    modelPriceProvider: new FakeSportsCardsProPrices(),
  };
}
