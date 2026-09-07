/**
 * Identification pipeline orchestrator. Per DESIGN.md §6.3.
 * This is an integration point — tested via smoke:identify, not unit tests.
 */

import type { ProviderRegistry } from '../../providers/registry';
import type {
  ImageRef,
  CardExtraction,
  IdentifyCandidate,
  CatalogCard,
  Parallel,
} from '../../providers/types';
import type { CardIdentity } from '../identity/types';
import { readFile } from 'node:fs/promises';
import { extractWithOrientationRetry } from '../../lib/extract-with-orientation';
import { verifyCardNumber, type CardNumberVerification } from '../../lib/card-number-verify';
import { scoreCandidate, jaroWinkler, type ScoringContext } from './scoring';
import { resolveParallel } from './parallels';
import { scoreSCPCandidate } from './scp-linkage';
import { normalize } from '../identity/aliases';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ScoredCandidate {
  provider: string;
  cardId: string;
  parallelId: string | null;
  parallelName: string | null;
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  isRookie: boolean;
  score: number;
  reasons: string[];
  rejects: string[];
  scpProductId: string | null;
  scpProductName: string | null;
  estValueCents: number | null;
  resolvedParallelId: string | null;
  resolvedParallelName: string | null;
}

export interface IdentificationResult {
  status: 'ready' | 'needs_review';
  extraction: CardExtraction;
  candidates: ScoredCandidate[];
  chosenCandidateIndex: number | null;
  overallConfidence: number;
  flags: string[];
  wasReady: boolean;
  estValueMaxCents: number | null;
  valueAtRiskCents: number | null;
  valueAtRiskPartial: boolean;
  failureReason: string | null;
  error: string | null;
  unmatched: boolean;
  unmatchedIdentity: CardIdentity | null;
  /** SCP product ID found via text search (for unmatched cards). */
  scpProductId?: string | null;
  /** SCP product name found via text search (for unmatched cards). */
  scpProductName?: string | null;
  /** Set name derived from SCP catalog lookup (not from extraction). */
  derivedSetName?: string | null;
  /** Card number cross-check result. */
  cardNumberVerification?: CardNumberVerification | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MAX_CANDIDATES = 5;
const MIN_SCORE_THRESHOLD = 0.3;

function identifyCandidateToScored(
  c: IdentifyCandidate,
  score: number,
  reasons: string[],
  rejects: string[],
): ScoredCandidate {
  return {
    provider: c.provider,
    cardId: c.cardId,
    parallelId: c.parallelId,
    parallelName: c.parallelName,
    playerName: c.playerName,
    year: c.year,
    setName: c.setName,
    subsetOrInsert: c.subsetOrInsert,
    cardNumber: c.cardNumber,
    isRookie: c.isRookie,
    score,
    reasons,
    rejects,
    scpProductId: null,
    scpProductName: null,
    estValueCents: null,
    resolvedParallelId: null,
    resolvedParallelName: null,
  };
}

function catalogToIdentifyCandidate(c: CatalogCard): IdentifyCandidate {
  return {
    provider: c.provider,
    cardId: c.cardId,
    parallelId: null,
    confidence: 0,
    playerName: c.playerName,
    year: c.year,
    setName: c.setName,
    subsetOrInsert: c.subsetOrInsert,
    cardNumber: c.cardNumber,
    parallelName: null,
    isRookie: c.isRookie,
  };
}

function buildUnmatchedIdentity(extraction: CardExtraction): CardIdentity {
  const year =
    extraction.copyright_year.value ?? extraction.set_year.value ?? 0;
  const playerName =
    extraction.players.length > 0 ? extraction.players[0].name : 'Unknown';

  return {
    year,
    manufacturer: extraction.manufacturer.value ?? 'Unknown',
    setName: extraction.set_name.value ?? 'Unknown',
    subset: extraction.subset_or_insert.value ?? null,
    cardNumber: extraction.card_number.value ?? '',
    players: extraction.players.map((p) => ({
      name: p.name,
      team: extraction.team.value,
      position: extraction.position.value,
    })),
    parallel: extraction.finish.parallel_name_printed ?? null,
    printRun: extraction.serial.print_run ?? null,
    isAuto: extraction.autograph.present === true,
    autoType: extraction.autograph.type === 'facsimile'
      ? null
      : extraction.autograph.type ?? null,
    isMemorabilia: extraction.memorabilia.value === true,
    isRookie: extraction.rookie_logo_printed.value === true,
    variation: null,
    licensed: 'unknown',
  };
}

/** Flags with blocking mode `always` (§5.3). */
const ALWAYS_FLAGS = new Set(['no_catalog_match', 'redemption']);

/** Flags with blocking mode `at_risk` (§5.3). */
const AT_RISK_FLAGS = new Set([
  'parallel_uncertain',
  'serial_unreadable',
  'serial_mismatch',
  'providers_disagree',
  'auto_uncertain',
  'photo_quality',
  'no_back_photo',
  'variation_possible',
]);

function hasAlwaysOrAtRiskFlag(flags: string[]): boolean {
  return flags.some((f) => ALWAYS_FLAGS.has(f) || AT_RISK_FLAGS.has(f));
}

/** Normalize a card number for comparison: strip leading '#', trim, lowercase. */
function normalizeCardNumber(v: string): string {
  return v.replace(/^#/, '').trim().toLowerCase();
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

export async function runIdentificationPipeline(opts: {
  images: ImageRef[];
  providers: ProviderRegistry;
  sessionStorage: string | null;
}): Promise<IdentificationResult> {
  const { images, providers, sessionStorage } = opts;
  const flags: string[] = [];

  // Step 1: images are passed in

  // Step 2: parallel calls — CardSight identify + vision extract (with orientation retry)
  let detections: IdentifyCandidate[] = [];
  let extraction: CardExtraction;

  const [detectionsResult, extractionResult] = await Promise.allSettled([
    providers.cardIdentifier.identify(images),
    extractWithOrientationRetry(providers.textExtractor, images, 'raw'),
  ]);

  // Extraction is required — hard failure if it fails
  if (extractionResult.status === 'rejected') {
    throw new Error(
      `Vision extraction failed: ${extractionResult.reason instanceof Error ? extractionResult.reason.message : String(extractionResult.reason)}`,
    );
  }
  extraction = extractionResult.value.extraction;
  const rotations = extractionResult.value.rotationsApplied;
  for (const [side, degrees] of Object.entries(rotations)) {
    if (degrees !== 0) {
      flags.push(`${side}_rotated_${degrees}`);
    }
  }

  // CardSight can fail gracefully
  if (detectionsResult.status === 'fulfilled') {
    detections = detectionsResult.value;
  } else {
    flags.push('cardsight_failed');
  }

  // Step 2b: Card number verification — crop back photo + OCR cross-check
  let cardNumberVerification: CardNumberVerification | null = null;
  const backImage = images.find((img) => img.side === 'back');
  if (backImage) {
    try {
      const backUrl = backImage.url;
      let backBuf: Buffer;
      if (backUrl.startsWith('data:')) {
        const match = backUrl.match(/^data:[^;]+;base64,(.+)$/);
        backBuf = match ? Buffer.from(match[1], 'base64') : Buffer.alloc(0);
      } else {
        const path = backUrl.startsWith('file://') ? backUrl.slice(7) : backUrl;
        backBuf = await readFile(path);
      }
      if (backBuf.length > 0) {
        cardNumberVerification = await verifyCardNumber(
          backBuf,
          extraction.card_number.value,
        );
        if (cardNumberVerification.flag) {
          flags.push(cardNumberVerification.flag);
        }
        // If OCR found a number and model didn't, use the OCR value
        if (!extraction.card_number.value && cardNumberVerification.ocrValue) {
          extraction = {
            ...extraction,
            card_number: {
              value: cardNumberVerification.ocrValue,
              confidence: 0.6,
              evidence: 'OCR from cropped back photo',
            },
          };
        }
      }
    } catch {
      // Card number verification is best-effort
    }
  }

  // Step 3: Kind-based early exits
  if (extraction.kind === 'not_a_card') {
    return {
      status: 'needs_review',
      extraction,
      candidates: [],
      chosenCandidateIndex: null,
      overallConfidence: 0,
      flags: ['no_catalog_match'],
      wasReady: false,
      estValueMaxCents: null,
      valueAtRiskCents: null,
      valueAtRiskPartial: false,
      failureReason: 'Image does not appear to be a trading card.',
      error: null,
      unmatched: true,
      unmatchedIdentity: null,
    };
  }

  if (extraction.kind === 'redemption') {
    return {
      status: 'needs_review',
      extraction,
      candidates: [],
      chosenCandidateIndex: null,
      overallConfidence: 0,
      flags: ['redemption'],
      wasReady: false,
      estValueMaxCents: null,
      valueAtRiskCents: null,
      valueAtRiskPartial: false,
      failureReason: 'Card appears to be a redemption.',
      error: null,
      unmatched: false,
      unmatchedIdentity: null,
    };
  }

  if (extraction.kind === 'slab') {
    flags.push('slab');
  }

  // Step 4: Build candidate set
  const topDetections = detections.slice(0, MAX_CANDIDATES);
  const hasStrongDetections =
    topDetections.length > 0 && topDetections[0].confidence >= 0.5;

  // If CardSight returned nothing or only low-confidence results, try catalog search
  if (!hasStrongDetections) {
    const query = {
      year: extraction.copyright_year.value ?? extraction.set_year.value ?? undefined,
      setName: extraction.set_name.value ?? undefined,
      playerName:
        extraction.players.length > 0
          ? extraction.players[0].name
          : undefined,
      cardNumber: extraction.card_number.value ?? undefined,
    };

    try {
      const catalogResults =
        await providers.cardSightCatalog.search(query);
      const catalogCandidates = catalogResults
        .slice(0, MAX_CANDIDATES)
        .map(catalogToIdentifyCandidate);

      // Merge: keep unique by cardId, detections first
      const seen = new Set(topDetections.map((d) => `${d.provider}:${d.cardId}`));
      for (const c of catalogCandidates) {
        const key = `${c.provider}:${c.cardId}`;
        if (!seen.has(key)) {
          topDetections.push(c);
          seen.add(key);
        }
      }
    } catch {
      flags.push('catalog_search_failed');
    }
  }

  // Step 5: Score each candidate against extraction
  const scored: ScoredCandidate[] = topDetections
    .slice(0, MAX_CANDIDATES)
    .map((candidate, rank) => {
      const ctx: ScoringContext = {};
      const mode =
        candidate.provider === 'sportscardspro' ? 'sportscardspro' : 'cardsight';
      const { score, reasons, rejects } = scoreCandidate(
        extraction,
        candidate,
        rank,
        mode,
        ctx,
      );
      return identifyCandidateToScored(candidate, score, reasons, rejects);
    });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Step 8: Unmatched path — no candidates above threshold
  if (
    scored.length === 0 ||
    scored[0].score < MIN_SCORE_THRESHOLD
  ) {
    const identity = buildUnmatchedIdentity(extraction);

    // Try SCP text search from extraction fields even without CardSight match.
    // SCP may have the set/card even when CardSight doesn't.
    // Also derive set name from SCP results (the model can't read it).
    let scpProductId: string | null = null;
    let scpProductName: string | null = null;
    let scpEstValueCents: number | null = null;
    let derivedSetName: string | null = null;
    try {
      const playerName = extraction.players[0]?.name;
      const year = extraction.copyright_year.value ?? extraction.set_year.value;
      const cardNumber = extraction.card_number.value;
      if (playerName) {
        const queryParts = [year, playerName, cardNumber].filter(Boolean);
        const scpResults = await providers.sportsCardsProCatalog.search({
          query: queryParts.join(' '),
        });
        if (scpResults.length > 0) {
          const bestScp = scpResults[0];
          scpProductId = bestScp.cardId;
          scpProductName = `${bestScp.playerName} #${bestScp.cardNumber}`;
          // Derive set name from SCP (e.g. "2026 Topps Flagship Football")
          if (bestScp.setName) {
            derivedSetName = bestScp.setName;
          }
          // Try to get a price
          const prices = await providers.modelPriceProvider.getPrices([bestScp.cardId]);
          const priceResult = prices.get(bestScp.cardId);
          if (priceResult && priceResult.status === 'ok') {
            scpEstValueCents = priceResult.table.prices['RAW'] ?? null;
          }
        }
      }
    } catch {
      // SCP linkage for unmatched cards is best-effort
    }

    // Override set name: SCP-derived > extraction (which is unreliable) > null
    if (derivedSetName) {
      identity.setName = derivedSetName;
    }

    return {
      status: 'needs_review',
      extraction,
      candidates: scored,
      chosenCandidateIndex: scored.length > 0 ? 0 : null,
      overallConfidence: scored.length > 0 ? scored[0].score : 0,
      flags: [...flags, 'no_catalog_match'],
      wasReady: false,
      estValueMaxCents: scpEstValueCents,
      valueAtRiskCents: null,
      valueAtRiskPartial: scpProductId == null,
      failureReason: 'No catalog candidate scored above threshold.',
      error: null,
      unmatched: true,
      unmatchedIdentity: identity,
      scpProductId,
      scpProductName,
      derivedSetName,
      cardNumberVerification,
    };
  }

  const topCandidate = scored[0];

  // Step 6: Parallel resolution on the top candidate
  let catalogParallels: Parallel[] = [];
  try {
    catalogParallels = await providers.cardSightCatalog.getParallels({
      provider: topCandidate.provider,
      id: topCandidate.cardId,
    });
  } catch {
    flags.push('parallel_fetch_failed');
  }

  if (catalogParallels.length > 0) {
    const parallelResult = resolveParallel({
      extraction,
      catalogParallels,
      cardsightTopParallelId: topCandidate.parallelId,
      sessionStorage,
    });
    topCandidate.resolvedParallelId = parallelResult.resolvedParallelId;
    const matchedParallel = catalogParallels.find(
      (p) => p.id === parallelResult.resolvedParallelId,
    );
    topCandidate.resolvedParallelName = matchedParallel?.name ?? null;
    flags.push(...parallelResult.flags);
  }

  // Step 7: SCP linkage on top candidates (up to 3 calls)
  const scpLinkageLimit = Math.min(scored.length, 3);
  for (let i = 0; i < scpLinkageLimit; i++) {
    const candidate = scored[i];
    const resolvedParallelName =
      i === 0
        ? topCandidate.resolvedParallelName
        : candidate.parallelName;

    try {
      const scpResults = await providers.sportsCardsProCatalog.search({
        year: candidate.year,
        setName: candidate.setName,
        playerName: candidate.playerName,
        cardNumber: candidate.cardNumber,
      });

      if (scpResults.length > 0) {
        // Score each SCP result and pick the best
        let bestScpScore = -1;
        let bestScp: CatalogCard | null = null;

        for (const scpCard of scpResults) {
          const { score: scpScore, rejects: scpRejects } = scoreSCPCandidate(
            extraction,
            scpCard,
            resolvedParallelName,
          );
          if (scpRejects.length === 0 && scpScore > bestScpScore) {
            bestScpScore = scpScore;
            bestScp = scpCard;
          }
        }

        if (bestScp) {
          candidate.scpProductId = bestScp.cardId;
          candidate.scpProductName = `${bestScp.year} ${bestScp.setName} ${bestScp.playerName} #${bestScp.cardNumber}`;

          // Fetch model price for the best SCP match
          try {
            const priceMap = await providers.modelPriceProvider.getPrices([
              bestScp.cardId,
            ]);
            const priceResult = priceMap.get(bestScp.cardId);
            if (priceResult && priceResult.status === 'ok') {
              // Use RAW price as estimate; integer cents
              const rawPrice = priceResult.table.prices['RAW'];
              if (rawPrice != null) {
                candidate.estValueCents = rawPrice;
              }
            }
          } catch {
            // Model price fetch is best-effort
          }
        }
      }
    } catch {
      // SCP linkage is best-effort
      if (i === 0) flags.push('scp_linkage_failed');
    }
  }

  // Step 9: Status assignment — cross-source agreement gate
  // CardSight must have returned at least one detection (not failed)
  const cardsightAvailable = detections.length > 0;

  // Player name agreement: Jaro-Winkler >= 0.9 or canonical match
  const extractedPlayer =
    extraction.players.length > 0 ? extraction.players[0].name : null;
  const playerAgreement =
    extractedPlayer != null &&
    (jaroWinkler(extractedPlayer, topCandidate.playerName) >= 0.9 ||
      normalize(extractedPlayer) === normalize(topCandidate.playerName));

  // Year agreement: exact match, or extraction year is null (don't block on missing year)
  const extractedYear =
    extraction.copyright_year.value ?? extraction.set_year.value;
  const yearAgreement =
    extractedYear == null || extractedYear === topCandidate.year;

  // Card number agreement: normalized match
  const extractedCardNumber = extraction.card_number.value;
  const cardNumberAgreement =
    extractedCardNumber != null &&
    normalizeCardNumber(extractedCardNumber) ===
      normalizeCardNumber(topCandidate.cardNumber);

  // No `always` or `at_risk` flags
  const hasBlockingFlag = hasAlwaysOrAtRiskFlag(flags);

  // Extraction did NOT flag `image_may_be_rotated`
  const imageRotationFlagged =
    extraction.photo_quality.suggest_retake.includes('image_may_be_rotated');

  const wouldBeReady =
    cardsightAvailable &&
    playerAgreement &&
    yearAgreement &&
    cardNumberAgreement &&
    !hasBlockingFlag &&
    !imageRotationFlagged;

  const status: 'ready' | 'needs_review' = wouldBeReady
    ? 'ready'
    : 'needs_review';

  // Compute value-at-risk: max estimate among top candidates
  let estValueMaxCents: number | null = null;
  let valueAtRiskCents: number | null = null;
  let valueAtRiskPartial = false;

  for (const c of scored) {
    if (c.estValueCents != null) {
      if (estValueMaxCents == null || c.estValueCents > estValueMaxCents) {
        estValueMaxCents = c.estValueCents;
      }
    }
  }

  if (status === 'needs_review' && estValueMaxCents != null) {
    valueAtRiskCents = estValueMaxCents;
    // Partial if not all candidates have prices
    valueAtRiskPartial = scored.some((c) => c.estValueCents == null);
  }

  return {
    status,
    extraction,
    candidates: scored,
    chosenCandidateIndex: 0,
    overallConfidence: topCandidate.score,
    flags,
    wasReady: wouldBeReady,
    estValueMaxCents,
    valueAtRiskCents,
    valueAtRiskPartial,
    failureReason: null,
    error: null,
    unmatched: false,
    unmatchedIdentity: null,
    cardNumberVerification,
  };
}
