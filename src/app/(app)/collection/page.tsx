import Link from 'next/link';
import { prisma } from '@/db/client';
import { deleteItem } from '@/app/(app)/actions';

// ---------------------------------------------------------------------------
// Helper: format cents as dollars
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  const dollars = cents / 100;
  return `$${dollars.toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Helper: compute total cost basis from item fields (integer cents)
// ---------------------------------------------------------------------------

function costBasis(item: {
  costPriceCents: number | null;
  costTaxCents: number;
  costShippingCents: number;
  costFeesCents: number;
  costGradingCents: number;
}): number | null {
  if (item.costPriceCents == null) return null;
  return (
    item.costPriceCents +
    item.costTaxCents +
    item.costShippingCents +
    item.costFeesCents +
    item.costGradingCents
  );
}

// ---------------------------------------------------------------------------
// Server-side delete form (no client JS needed)
// ---------------------------------------------------------------------------

function DeleteDraftButton({ itemId }: { itemId: string }) {
  async function handleDelete() {
    'use server';
    await deleteItem(itemId);
  }
  return (
    <form action={handleDelete}>
      <button
        type="submit"
        className="rounded bg-red-600 px-2 py-1 text-xs text-white"
      >
        Delete
      </button>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Thumbnail helper
// ---------------------------------------------------------------------------

function Thumbnail({ photoPath }: { photoPath: string | null }) {
  if (!photoPath) {
    return (
      <div className="flex h-12 w-9 items-center justify-center rounded bg-gray-200 text-xs text-gray-400">
        ?
      </div>
    );
  }
  // Photos served via /api/photos/...path — use thumbnail path
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
// Player name helper (players is JSON array)
// ---------------------------------------------------------------------------

function playerName(players: unknown): string {
  if (!Array.isArray(players) || players.length === 0) return 'Unknown';
  return players.map((p: { name?: string }) => p.name ?? '?').join(' / ');
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CollectionPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const filter = typeof params.filter === 'string' ? params.filter : 'owned';

  // Count items for tabs
  const [ownedCount, soldCount, allCount] = await Promise.all([
    prisma.item.count({ where: { status: 'owned' } }),
    prisma.item.count({ where: { status: 'sold' } }),
    prisma.item.count({
      where: { status: { in: ['owned', 'sold', 'removed'] } },
    }),
  ]);

  // Query drafts/identifying for the top section
  const drafts = await prisma.item.findMany({
    where: { status: { in: ['draft', 'identifying'] } },
    include: {
      photos: { where: { side: 'front' }, take: 1 },
      scanSession: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  // Query items for the selected tab
  const statusFilter =
    filter === 'sold'
      ? { status: { in: ['sold' as const] } }
      : filter === 'all'
        ? { status: { in: ['owned' as const, 'sold' as const, 'removed' as const] } }
        : { status: { in: ['owned' as const] } };

  const items = await prisma.item.findMany({
    where: statusFilter,
    include: {
      card: true,
      photos: { where: { side: 'front' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div className="mx-auto max-w-3xl">
      {/* Drafts section */}
      {drafts.length > 0 && (
        <section className="mb-6">
          <h2 className="text-sm font-semibold text-gray-700">
            Scanned — waiting for identification ({drafts.length})
          </h2>
          <p className="mb-2 text-xs text-gray-400">
            Card identification arrives in a future update.
          </p>
          <ul className="space-y-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded border p-2"
              >
                <div className="flex items-center gap-2">
                  <Thumbnail
                    photoPath={d.photos[0]?.gcsPath ?? null}
                  />
                  <span className="text-sm">
                    {d.scanSession?.label ?? 'Scan'} #{d.sessionSeq ?? '?'}
                  </span>
                </div>
                <DeleteDraftButton itemId={d.id} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Tab bar */}
      <nav className="mb-4 flex gap-2 border-b pb-2">
        {(['owned', 'sold', 'all'] as const).map((tab) => {
          const count =
            tab === 'owned'
              ? ownedCount
              : tab === 'sold'
                ? soldCount
                : allCount;
          const isActive = filter === tab;
          return (
            <Link
              key={tab}
              href={`/collection?filter=${tab}`}
              className={`rounded-full px-3 py-1 text-sm ${
                isActive
                  ? 'bg-gray-900 text-white'
                  : 'bg-gray-100 text-gray-600'
              }`}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)} ({count})
            </Link>
          );
        })}
      </nav>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-gray-500">No cards yet</p>
          <Link
            href="/collection/add"
            className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm text-white"
          >
            Add your first card
          </Link>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => {
            const card = item.card;
            const photo = item.photos[0] ?? null;
            const basis = costBasis(item);

            return (
              <li key={item.id}>
                <Link
                  href={`/collection/${item.id}`}
                  className="flex items-center gap-3 rounded border p-3 active:bg-gray-50"
                >
                  <Thumbnail photoPath={photo?.gcsPath ?? null} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {card ? playerName(card.players) : 'Unknown card'}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {card
                        ? `${card.year} ${card.setName}`
                        : 'Unlinked'}
                      {card?.parallel ? ` — ${card.parallel}` : ''}
                    </p>
                    <div className="mt-0.5 flex gap-2 text-xs text-gray-400">
                      <span>
                        {item.conditionKind === 'graded'
                          ? `${item.grader ?? '?'} ${item.grade ?? '?'}`
                          : 'Raw'}
                      </span>
                      <span>
                        {basis != null
                          ? formatCents(basis)
                          : 'Cost unknown'}
                      </span>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {/* Floating add button */}
      <Link
        href="/collection/add"
        className="fixed bottom-6 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-2xl text-white shadow-lg"
      >
        +
      </Link>
    </div>
  );
}
