/**
 * Identify job — runs the identification pipeline for items.
 *
 * 1. Finds items with status 'identifying'
 * 2. Loads photos, calls provider APIs (extract + identify + score)
 * 3. Persists the Identification record
 * 4. Updates item status to 'needs_review' (or stays 'identifying' on failure)
 */

import { join } from 'node:path';
import { prisma } from '@/db/client';
import { createProviders } from '@/providers';
import type { ProviderRegistry, ImageRef, IdentifyCandidate, CardExtraction } from '@/providers';
import { scoreCandidate, type ScoringContext } from '@/domain/identification/scoring';
import { resolveParallel } from '@/domain/identification/parallels';
import { buildIdentityKey, type CardIdentity, type PlayerInfo } from '@/domain/identity/types';

const DATA_DIR = join(process.cwd(), 'data');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getProviderMode(): 'fake' | 'live' {
  const mode = process.env.PROVIDERS_MODE ?? 'fake';
  if (mode !== 'fake' && mode !== 'live') {
    throw new Error(`Invalid PROVIDERS_MODE: ${mode}`);
  }
  return mode;
}

/**
 * Build ImageRef[] from an item's photos on disk.
 */
function buildImageRefs(
  photos: Array<{ side: string; gcsPath: string }>,
): ImageRef[] {
  return photos.map((p) => ({
    url: `file://${join(DATA_DIR, p.gcsPath)}`,
    side: p.side as ImageRef['side'],
  }));
}

/**
 * Determine the session storage default for an item.
 */
async function getSessionStorage(
  scanSessionId: string | null,
): Promise<string | null> {
  if (!scanSessionId) return null;
  const session = await prisma.scanSession.findUnique({
    where: { id: scanSessionId },
    select: { defaults: true },
  });
  if (!session?.defaults) return null;
  return (session.defaults as Record<string, string>)?.storage ?? null;
}

/**
 * Build a Card from extraction fields with no external IDs (unmatched flow).
 */
function extractionToCardIdentity(extraction: CardExtraction): CardIdentity {
  const players: PlayerInfo[] = extraction.players.map((p) => ({
    name: p.name,
    team: extraction.team.value,
    position: extraction.position.value,
  }));

  return {
    year: extraction.set_year.value ?? extraction.copyright_year.value ?? 0,
    manufacturer: extraction.manufacturer.value ?? 'Unknown',
    setName: extraction.set_name.value ?? 'Unknown',
    subset: extraction.subset_or_insert.value ?? null,
    cardNumber: extraction.card_number.value ?? '0',
    players,
    parallel: extraction.finish.parallel_name_printed ?? null,
    printRun: extraction.serial.print_run ?? null,
    isAuto: extraction.autograph.present ?? false,
    autoType: extraction.autograph.present
      ? (extraction.autograph.type as CardIdentity['autoType'] ?? 'unknown')
      : null,
    isMemorabilia: extraction.memorabilia.value ?? false,
    isRookie: extraction.rookie_logo_printed.value ?? false,
    variation: null,
    licensed: 'unknown',
  };
}

// ---------------------------------------------------------------------------
// Pipeline for a single item
// ---------------------------------------------------------------------------

interface IdentifyItemResult {
  success: boolean;
  identificationId?: string;
}

async function identifyItem(
  itemId: string,
  providers: ProviderRegistry,
): Promise<IdentifyItemResult> {
  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    include: { photos: true },
  });

  const images = buildImageRefs(item.photos);
  if (images.length === 0) {
    // No photos — mark as failed
    const identification = await prisma.identification.create({
      data: {
        itemId,
        scanSessionId: item.scanSessionId,
        status: 'failed',
        failureReason: 'image_unreadable',
        error: 'No photos available for identification',
        flags: [],
        explicitFields: [],
      },
    });
    return { success: false, identificationId: identification.id };
  }

  try {
    // Step a: Determine card kind from photos (front photo presence)
    const hasFront = images.some((i) => i.side === 'front');
    const kind: 'raw' | 'slab' = item.conditionKind === 'graded' ? 'slab' : 'raw';

    // Step b: Run text extraction (Claude Vision)
    const extraction = await providers.textExtractor.extract(images, kind);

    // Step c: Run card identification (CardSight)
    const candidates = await providers.cardIdentifier.identify(images);

    // Step d: Score candidates against extraction
    const scored = candidates.map((candidate, rank) => {
      const result = scoreCandidate(extraction, candidate, rank, 'cardsight');
      return { candidate, rank, ...result };
    });

    // Sort by score descending, filter out rejected
    const viable = scored
      .filter((s) => s.rejects.length === 0 && s.score > 0)
      .sort((a, b) => b.score - a.score);

    // Step e: Get session storage default
    const sessionStorage = await getSessionStorage(item.scanSessionId);

    // Step f: Resolve parallel for top candidate
    let resolvedParallelId: string | null = null;
    const flags: string[] = [];

    if (viable.length > 0) {
      const topCandidate = viable[0].candidate;

      // Fetch parallels from catalog for parallel resolution
      try {
        const catalogParallels = await providers.cardSightCatalog.getParallels({
          provider: topCandidate.provider,
          id: topCandidate.cardId,
        });

        const parallelResult = resolveParallel({
          extraction,
          catalogParallels,
          cardsightTopParallelId: topCandidate.parallelId,
          sessionStorage,
        });
        resolvedParallelId = parallelResult.resolvedParallelId;
        flags.push(...parallelResult.flags);
      } catch {
        flags.push('parallel_resolution_failed');
      }
    }

    // Determine overall confidence and readiness
    const topScore = viable.length > 0 ? viable[0].score : 0;
    const overallConfidence = topScore;
    const wasReady = topScore >= 0.8 && flags.length === 0;
    const chosenCandidateIndex = viable.length > 0 ? viable[0].rank : null;

    // Check for not_a_card
    if (extraction.kind === 'not_a_card') {
      flags.push('not_a_card');
    }

    // Estimate value range for risk assessment (null for now — valuation not run yet)
    const estValueMaxCents: number | null = null;
    const valueAtRiskCents: number | null = null;
    const valueAtRiskPartial = false;

    // Step g: Persist the Identification record
    const identification = await prisma.identification.create({
      data: {
        itemId,
        scanSessionId: item.scanSessionId,
        status: 'needs_review',
        extraction: extraction as unknown as import('@prisma/client').Prisma.InputJsonValue,
        candidates: viable.map((v) => ({
          ...v.candidate,
          score: v.score,
          reasons: v.reasons,
        })) as unknown as import('@prisma/client').Prisma.InputJsonValue,
        cardsightCacheKey: null,
        chosenCandidateIndex,
        overallConfidence,
        wasReady,
        estValueMaxCents,
        valueAtRiskCents,
        valueAtRiskPartial,
        flags,
        explicitFields: [],
        completedAt: new Date(),
      },
    });

    // Step h: Update item status
    const isUnmatched = viable.length === 0;

    if (isUnmatched) {
      // Create a Card from extraction fields with no external IDs (§6.1 flow 4)
      const identity = extractionToCardIdentity(extraction);
      const identityKey = buildIdentityKey(identity);

      const card = await prisma.card.upsert({
        where: { identityKey },
        create: {
          identityKey,
          year: identity.year,
          manufacturer: identity.manufacturer,
          setName: identity.setName,
          subset: identity.subset,
          cardNumber: identity.cardNumber,
          players: identity.players as unknown as import('@prisma/client').Prisma.InputJsonValue,
          parallel: identity.parallel,
          printRun: identity.printRun,
          isAuto: identity.isAuto,
          autoType: identity.autoType ?? undefined,
          isMemorabilia: identity.isMemorabilia,
          isRookie: identity.isRookie,
          variation: identity.variation,
          licensed: identity.licensed,
        },
        update: {},
      });

      await prisma.item.update({
        where: { id: itemId },
        data: { cardId: card.id, status: 'needs_review' },
      });
    } else {
      await prisma.item.update({
        where: { id: itemId },
        data: { status: 'needs_review' },
      });
    }

    return { success: true, identificationId: identification.id };
  } catch (err) {
    // On failure: create failed identification, keep item in 'identifying'
    const errorMessage = err instanceof Error ? err.message : String(err);
    const failureReason = errorMessage.includes('quota')
      ? 'quota_exhausted'
      : errorMessage.includes('unavailable') || errorMessage.includes('timeout')
        ? 'provider_unavailable'
        : 'internal';

    const identification = await prisma.identification.create({
      data: {
        itemId,
        scanSessionId: item.scanSessionId,
        status: 'failed',
        failureReason: failureReason as 'quota_exhausted' | 'provider_unavailable' | 'internal',
        error: errorMessage,
        flags: [],
        explicitFields: [],
      },
    });

    return { success: false, identificationId: identification.id };
  }
}

// ---------------------------------------------------------------------------
// Exported job function
// ---------------------------------------------------------------------------

export async function runIdentifyJob(
  opts?: { itemIds?: string[] },
): Promise<{ processed: number; succeeded: number; failed: number }> {
  const providers = createProviders(getProviderMode());

  // Find items to process
  let items: Array<{ id: string }>;

  if (opts?.itemIds && opts.itemIds.length > 0) {
    items = await prisma.item.findMany({
      where: { id: { in: opts.itemIds }, status: 'identifying' },
      select: { id: true },
    });
  } else {
    // Find all items with status 'identifying'
    items = await prisma.item.findMany({
      where: { status: 'identifying' },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  let succeeded = 0;
  let failed = 0;

  for (const item of items) {
    const result = await identifyItem(item.id, providers);
    if (result.success) {
      succeeded++;
    } else {
      failed++;
    }
  }

  return {
    processed: items.length,
    succeeded,
    failed,
  };
}
