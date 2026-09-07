import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/db/client';
import { ReviewForm } from './review-form';

// ---------------------------------------------------------------------------
// Types for serialized data passed to client
// ---------------------------------------------------------------------------

export interface ReviewCandidate {
  index: number;
  provider: string;
  cardId: string;
  parallelId: string | null;
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  parallelName: string | null;
  isRookie: boolean;
  imageUrl?: string;
  score: number;
  scpProductName?: string;
  estValueCents?: number;
}

export interface ReviewPhoto {
  id: string;
  side: string;
  url: string;
}

export interface CatalogParallel {
  id: string;
  name: string;
  printRun: number | null;
}

export interface ReviewExtraction {
  playerName: string | null;
  year: number | null;
  setName: string | null;
  subset: string | null;
  cardNumber: string | null;
  parallelName: string | null;
  printRun: number | null;
  isAuto: boolean;
  isMemorabilia: boolean;
  isRookie: boolean;
  serialNumber: number | null;
}

export interface ReviewPageData {
  itemId: string;
  photos: ReviewPhoto[];
  candidates: ReviewCandidate[];
  extraction: ReviewExtraction | null;
  flags: string[];
  wasReady: boolean;
  estValueMaxCents: number | null;
  valueAtRiskCents: number | null;
  // Current item defaults
  storage: string;
  conditionKind: string;
  rawConditionTier: string | null;
  /** Set name carried from the previous card in the session, for fast manual entry. */
  sessionSetName: string | null;
  /** Whether this card is unmatched (no catalog match). */
  unmatched: boolean;
  /** SCP product found via text search for unmatched cards. */
  scpProductName: string | null;
}

// ---------------------------------------------------------------------------
// Page (server component)
// ---------------------------------------------------------------------------

export default async function ReviewItemPage(props: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await props.params;

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      card: true,
      photos: true,
      identifications: {
        where: { status: { in: ['needs_review', 'ready'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
  });

  if (!item || item.status !== 'needs_review') notFound();

  const identification = item.identifications[0];
  if (!identification) notFound();

  // Parse candidates from JSON
  const rawCandidates = (identification.candidates ?? []) as Array<{
    provider: string;
    cardId: string;
    parallelId: string | null;
    playerName: string;
    year: number;
    setName: string;
    subsetOrInsert: string | null;
    cardNumber: string;
    parallelName: string | null;
    isRookie: boolean;
    imageUrl?: string;
    score: number;
    scpProductName?: string;
    estValueCents?: number;
  }>;

  const candidates: ReviewCandidate[] = rawCandidates
    .slice(0, 3)
    .map((c, i) => ({
      index: i,
      ...c,
    }));

  // Parse extraction
  const rawExtraction = identification.extraction as Record<string, unknown> | null;
  let extraction: ReviewExtraction | null = null;
  if (rawExtraction) {
    const field = <T,>(name: string): T | null => {
      const f = rawExtraction[name] as { value?: T } | undefined;
      return f?.value ?? null;
    };
    const players = rawExtraction.players as Array<{ name: string }> | undefined;
    extraction = {
      playerName: players?.[0]?.name ?? null,
      year: field<number>('set_year') ?? field<number>('copyright_year'),
      setName: field<string>('set_name'),
      subset: field<string>('subset_or_insert'),
      cardNumber: field<string>('card_number'),
      parallelName:
        (rawExtraction.finish as { parallel_name_printed?: string } | undefined)
          ?.parallel_name_printed ?? null,
      printRun:
        (rawExtraction.serial as { print_run?: number } | undefined)
          ?.print_run ?? null,
      isAuto:
        (rawExtraction.autograph as { present?: boolean } | undefined)
          ?.present ?? false,
      isMemorabilia: field<boolean>('memorabilia') ?? false,
      isRookie: field<boolean>('rookie_logo_printed') ?? false,
      serialNumber:
        (rawExtraction.serial as { number?: number } | undefined)?.number ??
        null,
    };
  }

  // Build photos list ordered: front, back, front_tilt, others
  const sideOrder = ['front', 'back', 'front_tilt', 'label', 'serial_closeup'];
  const sortedPhotos = [...item.photos].sort(
    (a, b) => sideOrder.indexOf(a.side) - sideOrder.indexOf(b.side),
  );

  const photos: ReviewPhoto[] = sortedPhotos.map((p) => ({
    id: p.id,
    side: p.side,
    url: `/api/photos/${p.gcsPath}`,
  }));

  // Look up the set name from the most recently confirmed card in the same session
  let sessionSetName: string | null = null;
  if (item.scanSessionId) {
    const prevItem = await prisma.item.findFirst({
      where: {
        scanSessionId: item.scanSessionId,
        status: 'owned',
        cardId: { not: null },
      },
      orderBy: { updatedAt: 'desc' },
      include: { card: true },
    });
    if (prevItem?.card) {
      sessionSetName = prevItem.card.setName;
    }
  }

  // Check if unmatched (no_catalog_match flag)
  const unmatched = identification.flags.includes('no_catalog_match');

  // Check for SCP product from identification data
  const identData = identification.candidates as Array<Record<string, unknown>> | null;
  const scpProductName = (identData?.[0] as Record<string, unknown> | undefined)?.scpProductName as string | null ?? null;

  const data: ReviewPageData = {
    itemId: item.id,
    photos,
    candidates,
    extraction,
    flags: identification.flags,
    wasReady: identification.wasReady,
    estValueMaxCents: identification.estValueMaxCents,
    valueAtRiskCents: identification.valueAtRiskCents,
    storage: item.storage,
    conditionKind: item.conditionKind,
    rawConditionTier: item.rawConditionTier,
    sessionSetName,
    unmatched,
    scpProductName,
  };

  return (
    <div className="mx-auto max-w-lg">
      <Link href="/review" className="mb-4 inline-block text-sm text-primary">
        &larr; Review Queue
      </Link>
      <ReviewForm data={data} />
    </div>
  );
}
