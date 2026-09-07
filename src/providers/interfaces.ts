/**
 * Provider interfaces (DESIGN.md §3.4).
 * All external services sit behind these interfaces so sources can be
 * swapped, mocked in tests and compared.
 */

import type {
  ImageRef,
  IdentifyCandidate,
  CardExtraction,
  CatalogQuery,
  CatalogCard,
  ExternalRef,
  Parallel,
  CompsResult,
  ModelPriceResult,
  Grader,
  CertResult,
} from './types';

/** CardSightIdentifier, (later) XimilarIdentifier */
export interface CardIdentifier {
  identify(images: ImageRef[]): Promise<IdentifyCandidate[]>;
}

/** ClaudeVisionExtractor */
export interface TextExtractor {
  extract(
    images: ImageRef[],
    kind: 'raw' | 'slab',
  ): Promise<CardExtraction>;
}

/** CardSightCatalog, SportsCardsProCatalog */
export interface CatalogProvider {
  search(q: CatalogQuery): Promise<CatalogCard[]>;
  getParallels(setRef: ExternalRef): Promise<Parallel[]>;
}

/** CardSightComps, (later) CardHedgeComps */
export interface CompsProvider {
  getSales(
    ref: { cardId: string; parallelId: string | null },
    opts?: { period?: '3m' | '1y'; asOfDate?: Date },
  ): Promise<CompsResult>;
}

/** SportsCardsProPrices */
export interface ModelPriceProvider {
  getPrices(
    productIds: string[],
  ): Promise<Map<string, ModelPriceResult>>;
}

/** (optional) PsaCertProvider, CardHedgeCertProvider */
export interface CertProvider {
  lookup(grader: Grader, cert: string): Promise<CertResult | null>;
}
