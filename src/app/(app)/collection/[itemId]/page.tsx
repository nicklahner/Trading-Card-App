import Link from 'next/link';
import { notFound } from 'next/navigation';
import { prisma } from '@/db/client';
import { CardDetailActions } from './actions-panel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

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

function playerName(players: unknown): string {
  if (!Array.isArray(players) || players.length === 0) return 'Unknown';
  return players.map((p: { name?: string }) => p.name ?? '?').join(' / ');
}

const RAW_TIER_LABELS: Record<string, string> = {
  market: 'Pack-fresh (Market)',
  nm_mt: 'Near Mint-Mint',
  ex_mt: 'Excellent-Mint',
  ex: 'Excellent',
  vg: 'Very Good',
  poor: 'Poor',
};

const STORAGE_LABELS: Record<string, string> = {
  toploader: 'Toploader',
  penny_sleeve: 'Penny sleeve',
  binder: 'Binder',
  magnetic: 'Magnetic case',
  slab: 'Slab',
  none: 'None',
  unknown: 'Unknown',
};

const ACQUIRED_VIA_LABELS: Record<string, string> = {
  purchase: 'Purchase',
  pack_pull: 'Pack pull',
  trade: 'Trade',
  gift: 'Gift',
  unknown: 'Unknown',
};

// ---------------------------------------------------------------------------
// Photo display
// ---------------------------------------------------------------------------

function PhotoGallery({
  photos,
}: {
  photos: { id: string; side: string; gcsPath: string }[];
}) {
  if (photos.length === 0) return null;

  const front = photos.find((p) => p.side === 'front');
  const back = photos.find((p) => p.side === 'back');
  const others = photos.filter((p) => p.side !== 'front' && p.side !== 'back');

  return (
    <div className="mb-6 flex gap-3 overflow-x-auto">
      {front && (
        <img
          src={`/api/photos/${front.gcsPath.replace('/photos/', '/thumbnails/')}`}
          alt="Front"
          className="h-48 w-auto rounded-lg object-contain"
        />
      )}
      {back && (
        <img
          src={`/api/photos/${back.gcsPath.replace('/photos/', '/thumbnails/')}`}
          alt="Back"
          className="h-48 w-auto rounded-lg object-contain"
        />
      )}
      {others.map((p) => (
        <img
          key={p.id}
          src={`/api/photos/${p.gcsPath.replace('/photos/', '/thumbnails/')}`}
          alt={p.side}
          className="h-48 w-auto rounded-lg object-contain"
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

function Badges({
  card,
}: {
  card: { isAuto: boolean; isMemorabilia: boolean; isRookie: boolean };
}) {
  const badges: { label: string; color: string }[] = [];
  if (card.isRookie) badges.push({ label: 'RC', color: 'bg-green-100 text-green-700' });
  if (card.isAuto) badges.push({ label: 'Auto', color: 'bg-purple-100 text-purple-700' });
  if (card.isMemorabilia) badges.push({ label: 'Mem', color: 'bg-amber-100 text-amber-700' });
  if (badges.length === 0) return null;
  return (
    <div className="flex gap-2">
      {badges.map((b) => (
        <span
          key={b.label}
          className={`rounded px-2 py-0.5 text-xs font-medium ${b.color}`}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info row helper
// ---------------------------------------------------------------------------

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex justify-between py-1.5 text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function CardDetailPage(props: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = await props.params;

  const item = await prisma.item.findUnique({
    where: { id: itemId },
    include: {
      card: true,
      photos: true,
    },
  });

  if (!item) notFound();

  const card = item.card;
  const basis = costBasis(item);
  const isDraftOrReview = item.status === 'draft' || item.status === 'needs_review';

  return (
    <div className="mx-auto max-w-lg">
      {/* Back to collection */}
      <Link href="/collection" className="mb-4 inline-block text-sm text-blue-600">
        &larr; Collection
      </Link>

      {/* Photos */}
      <PhotoGallery photos={item.photos} />

      {/* Card identity */}
      {card ? (
        <section className="mb-6">
          <h1 className="text-xl font-semibold">{playerName(card.players)}</h1>
          <p className="mt-1 text-sm text-gray-500">
            {card.year} {card.setName}
            {card.subset ? ` - ${card.subset}` : ''} #{card.cardNumber}
          </p>
          <div className="mt-2 space-y-0.5">
            <InfoRow
              label="Parallel"
              value={card.parallel ?? 'Base'}
            />
            {card.printRun && (
              <InfoRow label="Print run" value={`/${card.printRun}`} />
            )}
            {item.serialNumber && (
              <InfoRow label="Serial" value={`#${item.serialNumber}`} />
            )}
          </div>
          <div className="mt-2">
            <Badges card={card} />
          </div>
        </section>
      ) : (
        <section className="mb-6">
          <h1 className="text-xl font-semibold">Unlinked card</h1>
          <p className="mt-1 text-sm text-gray-400">
            This item has not been linked to a card identity yet.
          </p>
        </section>
      )}

      {/* Condition */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Condition</h2>
        <div className="divide-y rounded border">
          <div className="p-3">
            {item.conditionKind === 'graded' ? (
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {item.grader ?? 'Graded'}{' '}
                  {item.grade != null ? Number(item.grade) : '?'}
                  {item.gradeLabel ? ` (${item.gradeLabel})` : ''}
                </p>
                {item.autoGrade != null && (
                  <p className="text-xs text-gray-500">
                    Auto grade: {Number(item.autoGrade)}
                  </p>
                )}
                {item.certNumber && (
                  <p className="text-xs text-gray-500">
                    Cert #{item.certNumber}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm font-medium">
                Raw &mdash;{' '}
                {RAW_TIER_LABELS[item.rawConditionTier ?? 'market'] ?? item.rawConditionTier}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Storage */}
      <section className="mb-6">
        <InfoRow
          label="Storage"
          value={STORAGE_LABELS[item.storage] ?? item.storage}
        />
      </section>

      {/* Cost basis */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-gray-700">Cost basis</h2>
        <div className="divide-y rounded border">
          <div className="space-y-0.5 p-3">
            <InfoRow
              label="Acquired via"
              value={ACQUIRED_VIA_LABELS[item.acquiredVia] ?? item.acquiredVia}
            />
            {item.costPriceCents != null ? (
              <>
                <InfoRow label="Price" value={formatCents(item.costPriceCents)} />
                {item.costTaxCents > 0 && (
                  <InfoRow label="Tax" value={formatCents(item.costTaxCents)} />
                )}
                {item.costShippingCents > 0 && (
                  <InfoRow label="Shipping" value={formatCents(item.costShippingCents)} />
                )}
                {item.costFeesCents > 0 && (
                  <InfoRow label="Fees" value={formatCents(item.costFeesCents)} />
                )}
                {item.costGradingCents > 0 && (
                  <InfoRow label="Grading" value={formatCents(item.costGradingCents)} />
                )}
                <div className="border-t pt-1.5">
                  <InfoRow
                    label="Total cost basis"
                    value={basis != null ? formatCents(basis) : 'N/A'}
                  />
                </div>
              </>
            ) : (
              <p className="py-1 text-sm text-gray-400">Cost unknown</p>
            )}
          </div>
        </div>
      </section>

      {/* Sold info */}
      {item.status === 'sold' && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Sale</h2>
          <div className="divide-y rounded border">
            <div className="space-y-0.5 p-3">
              {item.soldOn && (
                <InfoRow
                  label="Sold date"
                  value={new Date(item.soldOn).toLocaleDateString()}
                />
              )}
              {item.soldPriceCents != null && (
                <InfoRow label="Sold price" value={formatCents(item.soldPriceCents)} />
              )}
              {item.soldFeesCents != null && item.soldFeesCents > 0 && (
                <InfoRow label="Sold fees" value={formatCents(item.soldFeesCents)} />
              )}
              {item.soldShippingCents != null && item.soldShippingCents > 0 && (
                <InfoRow label="Sold shipping" value={formatCents(item.soldShippingCents)} />
              )}
              {/* Realized G/L */}
              {basis != null && item.soldPriceCents != null && (() => {
                const netProceeds =
                  item.soldPriceCents -
                  (item.soldFeesCents ?? 0) -
                  (item.soldShippingCents ?? 0);
                const gl = netProceeds - basis;
                return (
                  <div className="border-t pt-1.5">
                    <InfoRow
                      label="Realized G/L"
                      value={
                        <span
                          className={
                            gl >= 0 ? 'text-green-600' : 'text-red-600'
                          }
                        >
                          {gl >= 0 ? '+' : ''}
                          {formatCents(gl)}
                        </span>
                      }
                    />
                  </div>
                );
              })()}
            </div>
          </div>
        </section>
      )}

      {/* Notes */}
      {item.notes && (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-gray-700">Notes</h2>
          <p className="whitespace-pre-wrap rounded border p-3 text-sm">
            {item.notes}
          </p>
        </section>
      )}

      {/* Action buttons (client component) */}
      <CardDetailActions
        itemId={item.id}
        status={item.status}
        isDraftOrReview={isDraftOrReview}
      />
    </div>
  );
}
