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
      <div className="flex h-12 w-9 items-center justify-center rounded bg-gray-200 text-xs text-gray-400">
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
      ? 'bg-green-600 text-white'
      : 'bg-blue-600 text-white';

  return (
    <form action={handleBulkConfirm}>
      <div className="flex items-center justify-between rounded border p-3">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-gray-500">{count} cards</p>
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
        <p className="text-gray-500">No cards need review right now.</p>
        <Link
          href="/collection"
          className="mt-4 inline-block text-sm text-blue-600"
        >
          Back to collection
        </Link>
      </div>
    );
  }

  // Build enriched list with identification data
  type EnrichedItem = (typeof items)[number] & {
    ident: (typeof items)[number]['identifications'][number] | null;
    topCandidate: StoredCandidate | null;
    estValueMaxCents: number | null;
    valueAtRiskCents: number | null;
    wasReady: boolean;
    hasAlwaysFlag: boolean;
    hasBlockingFlag: boolean;
  };

  const enriched: EnrichedItem[] = items.map((item) => {
    const ident = item.identifications[0] ?? null;
    const candidates = (ident?.candidates ?? []) as unknown as StoredCandidate[];
    const topCandidate = candidates[0] ?? null;

    // Check flags
    const flags = ident?.flags ?? [];
    const hasAlwaysFlag = flags.some((f: string) =>
      ['numbered_serial', 'auto_detected', 'memorabilia_detected'].includes(f),
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
          const score =
            item.ident?.overallConfidence != null
              ? `${(Number(item.ident.overallConfidence) * 100).toFixed(0)}%`
              : '?';

          return (
            <li key={item.id}>
              <Link
                href={`/review/${item.id}`}
                className="flex items-center gap-3 rounded border p-3 active:bg-gray-50"
              >
                <Thumbnail photoPath={photo?.gcsPath ?? null} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {candidateName}
                  </p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                        Number(item.ident?.overallConfidence ?? 0) >= 0.9
                          ? 'bg-green-100 text-green-700'
                          : Number(item.ident?.overallConfidence ?? 0) >= 0.7
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {score}
                    </span>
                    {item.estValueMaxCents != null && (
                      <span className="text-xs text-gray-500">
                        est. {formatCents(item.estValueMaxCents)}
                      </span>
                    )}
                    {item.wasReady && (
                      <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">
                        ready
                      </span>
                    )}
                    {item.hasAlwaysFlag && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-600">
                        needs attention
                      </span>
                    )}
                  </div>
                </div>
                <span className="text-gray-300">&rsaquo;</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
