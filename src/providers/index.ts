/**
 * Provider factory.
 * Returns a ProviderRegistry wired to either fake (test/dev) or live implementations.
 *
 * Vision provider selection (live mode):
 *   - If ANTHROPIC_API_KEY is set → Claude
 *   - Else if OPENAI_API_KEY is set → OpenAI
 *   - If neither → throws
 * Override model via ANTHROPIC_VISION_MODEL or OPENAI_VISION_MODEL env vars.
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
import type { TextExtractor } from './interfaces';
import { FakeCardSightIdentifier, FakeCardSightCatalog, FakeCardSightComps } from './cardsight/fake';
import { FakeSportsCardsProPrices, FakeSportsCardsProCatalog } from './sportscardspro/fake';
import { FakeClaudeVisionExtractor } from './anthropic/fake';

/**
 * Select the live text extractor based on available API keys.
 * Claude wins when both keys are present.
 */
function createLiveTextExtractor(): TextExtractor {
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (anthropicKey) {
    const { ClaudeVisionExtractor } = require('./anthropic/extractor') as typeof import('./anthropic/extractor');
    return new ClaudeVisionExtractor({ apiKey: anthropicKey });
  }

  if (openaiKey) {
    const { OpenAIVisionExtractor } = require('./openai/extractor') as typeof import('./openai/extractor');
    return new OpenAIVisionExtractor({ apiKey: openaiKey });
  }

  throw new Error(
    'No vision provider configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.',
  );
}

export function createProviders(mode: 'fake' | 'live'): ProviderRegistry {
  if (mode === 'live') {
    const csKey = process.env.CARDSIGHTAI_API_KEY;
    const scpToken = process.env.SPORTSCARDSPRO_TOKEN;

    // Lazy-load live adapters to avoid bundling SDKs in fake mode
    const { LiveCardSightIdentifier, LiveCardSightCatalog, LiveCardSightComps } =
      require('./cardsight/live') as typeof import('./cardsight/live');
    const { LiveSportsCardsProCatalog, LiveSportsCardsProPrices } =
      require('./sportscardspro/live') as typeof import('./sportscardspro/live');

    return {
      cardIdentifier: csKey
        ? new LiveCardSightIdentifier({ apiKey: csKey })
        : new FakeCardSightIdentifier(),
      textExtractor: createLiveTextExtractor(),
      cardSightCatalog: csKey
        ? new LiveCardSightCatalog({ apiKey: csKey })
        : new FakeCardSightCatalog(),
      sportsCardsProCatalog: scpToken
        ? new LiveSportsCardsProCatalog()
        : new FakeSportsCardsProCatalog(),
      compsProvider: csKey
        ? new LiveCardSightComps({ apiKey: csKey })
        : new FakeCardSightComps(),
      modelPriceProvider: scpToken
        ? new LiveSportsCardsProPrices()
        : new FakeSportsCardsProPrices(),
    };
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
