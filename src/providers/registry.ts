/**
 * Type definition for the providers bundle.
 * Every part of the app receives providers through this registry
 * rather than importing concrete classes directly.
 */

import type {
  CardIdentifier,
  TextExtractor,
  CatalogProvider,
  CompsProvider,
  ModelPriceProvider,
} from './interfaces';

export interface ProviderRegistry {
  /** CardSight or Ximilar image-based card identifier. */
  cardIdentifier: CardIdentifier;

  /** Vision text/field extractor (OpenAI or Claude, selected by config). */
  textExtractor: TextExtractor;

  /** CardSight catalog search. */
  cardSightCatalog: CatalogProvider;

  /** SportsCardsPro catalog search. */
  sportsCardsProCatalog: CatalogProvider;

  /** CardSight auction comps. */
  compsProvider: CompsProvider;

  /** SportsCardsPro model prices. */
  modelPriceProvider: ModelPriceProvider;
}
