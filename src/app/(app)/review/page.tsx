import Link from 'next/link';
import { prisma } from '@/db/client';
import { bulkConfirmIdentifications } from '@/app/(app)/actions';
import { revalidatePath } from 'next/cache';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function playerName(players: unknown): string {
  if (!Array.isArray(players) || players.length === 0) return 'Unknown';
  return players.map((p: { name?: string }) => p.name ?? '?').join(' / ');
}

function Thumbnail({ photoPath }: { photoPath: string | null }) {
  if (!photoPath) {
    return (
      <div className="flex h-12 w-9 items-center justify-center rounded bg-muted text-xs text-ct-text-subtle">
        ?
      </div>
    );
  }
  const thumbPath = photoPath.replace('/photos/', '/thumbnails/');
  return (
    <img
      src={`/api/photos/${thumbPath}`}
      alt=""
      className="h-12 w-9 rounded object-cover"
    />
  );
}

// ---------------------------------------------------------------------------
// Candidate type (matches JSON stored in identification.candidates)
// ---------------------------------------------------------------------------

interface StoredCandidate {
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOW_STAKE_THRESHOLD_CENTS = 1000; // $10

// ---------------------------------------------------------------------------
// Bulk confirm form (server action wrapper)
// ---------------------------------------------------------------------------

function BulkConfirmButton({
  itemIds,
  label,
  count,
  variant,
}: {
  itemIds: string[];
  label: string;
  count: number;
  variant: 'ready' | 'low-stakes';
}) {
  async function handleBulkConfirm() {
    'use server';
    await bulkConfirmIdentifications(itemIds);
    revalidatePath('/', 'layout');
  }

  const colors =
    variant === 'ready'
      ? 'bg-ct-positive text-background'
      : 'bg-primary text-primary-foreground';

  return (
    <form action={handleBulkConfirm}>
      <div className="flex items-center justify-between rounded border p-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{count} cards</p>
        </div>
        <button
          type="submit"
          className={`rounded px-4 py-2 text-sm font-medium ${colors}`}
        >
          Confirm All
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ReviewQueuePage() {
  // Fetch items needing review with their latest identification and card
  const items = await prisma.item.findMany({
    where: { status: 'needs_review' },
    include: {
      card: true,
      photos: { where: { side: 'front' }, take: 1 },
      identifications: {
        where: { status: { in: ['needs_review', 'ready'] } },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl py-12 text-center">
        <h1 className="mb-2 text-xl font-semibold">Review Queue</h1>
        <p className="text-muted-foreground">No cards need review right now.</p>
        <Link
          href="/collection"
          className="mt-4 inline-block text-sm text-primary"
        >
          Back to collection
        </Link>
      </div>
    );
  }

  // Build enriched list with identification data
  type MatchSource = 'cardsight' | 'catalog_search' | 'unmatched';

  type EnrichedItem = (typeof items)[number] & {
    ident: (typeof items)[number]['identifications'][number] | null;
    topCandidate: StoredCandidate | null;
    estValueMaxCents: number | null;
    valueAtRiskCents: number | null;
    wasReady: boolean;
    hasAlwaysFlag: boolean;
    hasBlockingFlag: boolean;
    matchSource: MatchSource;
    displayFlags: string[];
  };

  const enriched: EnrichedItem[] = items.map((item) => {
    const ident = item.identifications[0] ?? null;
    const candidates = (ident?.candidates ?? []) as unknown as StoredCandidate[];
    const topCandidate = candidates[0] ?? null;

    // Determine match source
    const flags = ident?.flags ?? [];
    let matchSource: MatchSource = 'catalog_search';
    if (flags.includes('no_catalog_match')) {
      matchSource = 'unmatched';
    } else if (topCandidate?.provider === 'cardsight') {
      matchSource = 'cardsight';
    }

    // Flags to display on the row (skip internal-only flags)
    const displayFlags = flags.filter((f: string) =>
      ['parallel_uncertain', 'variation_possible', 'no_catalog_match',
       'auto_uncertain', 'serial_mismatch', 'photo_quality'].includes(f),
    );

    const hasAlwaysFlag = flags.some((f: string) =>
      ['no_catalog_match', 'redemption'].includes(f),
    );
    const hasBlockingFlag = flags.length > 0;

    return {
      ...item,
      ident,
      topCandidate,
      estValueMaxCents: ident?.estValueMaxCents ?? null,
      valueAtRiskCents: ident?.valueAtRiskCents ?? null,
      wasReady: ident?.wasReady ?? false,
      hasAlwaysFlag,
      hasBlockingFlag,
      matchSource,
      displayFlags,
    };
  });

  // Sort: expensive first, then numbered/auto cards, then rest
  enriched.sort((a, b) => {
    // Cards with value come first, sorted high to low
    const aVal = a.estValueMaxCents ?? -1;
    const bVal = b.estValueMaxCents ?? -1;

    // Priority: numbered/auto cards that need attention
    const aCard = a.card;
    const bCard = b.card;
    const aPriority =
      (aCard?.printRun != null && aCard.printRun <= 99) || aCard?.isAuto
        ? 1
        : 0;
    const bPriority =
      (bCard?.printRun != null && bCard.printRun <= 99) || bCard?.isAuto
        ? 1
        : 0;

    // High value first
    if (aVal !== bVal) return bVal - aVal;
    // Then priority cards
    if (aPriority !== bPriority) return bPriority - aPriority;
    return 0;
  });

  // Partition into bulk-confirmable groups
  const readyItems = enriched.filter(
    (i) => i.wasReady && !i.hasBlockingFlag,
  );
  const lowStakeItems = enriched.filter(
    (i) =>
      !i.wasReady &&
      !i.hasAlwaysFlag &&
      i.valueAtRiskCents != null &&
      i.valueAtRiskCents < LOW_STAKE_THRESHOLD_CENTS,
  );

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-4 text-xl font-semibold">
        Review Queue ({items.length})
      </h1>

      {/* Bulk confirm sections */}
      <div className="mb-6 space-y-3">
        {readyItems.length > 0 && (
          <BulkConfirmButton
            itemIds={readyItems.map((i) => i.id)}
            label={`Confirm ${readyItems.length} ready cards`}
            count={readyItems.length}
            variant="ready"
          />
        )}
        {lowStakeItems.length > 0 && (
          <BulkConfirmButton
            itemIds={lowStakeItems.map((i) => i.id)}
            label={`Confirm ${lowStakeItems.length} low-stakes cards`}
            count={lowStakeItems.length}
            variant="low-stakes"
          />
        )}
      </div>

      {/* Single-card queue */}
      <ul className="space-y-2">
        {enriched.map((item) => {
          const photo = item.photos[0] ?? null;
          const candidate = item.topCandidate;
          const candidateName = candidate
            ? `${candidate.playerName} - ${candidate.year} ${candidate.setName}`
            : 'No candidate';

          const sourceLabel: Record<MatchSource, string> = {
            cardsight: 'CardSight',
            catalog_search: 'Catalog',
            unmatched: 'Unmatched',
          };
          const sourceColor: Record<MatchSource, string> = {
            cardsight: 'bg-ct-info/20 text-primary',
            catalog_search: 'bg-primary/20 text-primary',
            unmatched: 'bg-ct-caution/20 text-ct-caution',
          };

          return (
            <li key={item.id}>
              <Link
                href={`/review/${item.id}`}
                className="flex items-center gap-3 rounded border p-3 active:bg-muted"
              >
                <Thumbnail photoPath={photo?.gcsPath ?? null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {candidateName}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {/* Match source badge */}
                    <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${sourceColor[item.matchSource]}`}>
                      {sourceLabel[item.matchSource]}
                    </span>
                    {item.estValueMaxCents != null && (
                      <span className="text-xs text-muted-foreground">
                        est. {formatCents(item.estValueMaxCents)}
                      </span>
                    )}
                    {item.wasReady && (
                      <span className="rounded bg-ct-positive/10 px-1.5 py-0.5 text-xs text-ct-positive">
                        ready
                      </span>
                    )}
                    {/* Display flags */}
                    {item.displayFlags.map((flag) => (
                      <span key={flag} className="rounded bg-ct-caution/10 px-1.5 py-0.5 text-xs text-ct-caution">
                        {flag.replace(/_/g, ' ')}
                      </span>
                    ))}
                    {item.hasAlwaysFlag && item.displayFlags.length === 0 && (
                      <span className="rounded bg-ct-caution/10 px-1.5 py-0.5 text-xs text-ct-caution">
                        needs attention
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-ct-text-subtle">&rsaquo;</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
