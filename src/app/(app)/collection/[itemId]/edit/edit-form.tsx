'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  searchCatalog,
  getParallels,
  updateItem,
} from '@/app/(app)/actions';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CatalogCard {
  provider: string;
  cardId: string;
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  isRookie: boolean;
  isAutograph: boolean;
  isMemorabilia: boolean;
  parallels: { id: string; name: string; printRun: number | null; printRunKind: string }[];
  setRef: { provider: string; id: string };
  imageUrl?: string;
}

interface Parallel {
  id: string;
  name: string;
  printRun: number | null;
  printRunKind: string;
}

interface InitialData {
  itemId: string;
  year: number | null;
  manufacturer: string | null;
  setName: string | null;
  subset: string | null;
  cardNumber: string | null;
  players: { name: string; team: string | null; position: string | null }[] | null;
  parallel: string | null;
  printRun: number | null;
  isAuto: boolean;
  autoType: string | null;
  isMemorabilia: boolean;
  isRookie: boolean;
  variation: string | null;
  licensed: string;
  cardsightCardId: string | null;
  cardsightParallelId: string | null;
  referenceImageUrl: string | null;
  serialNumber: number | null;
  conditionKind: string;
  rawConditionTier: string | null;
  grader: string | null;
  grade: number | null;
  gradeLabel: string | null;
  autoGrade: number | null;
  certNumber: string | null;
  storage: string;
  acquiredOn: string | null;
  acquiredVia: string;
  costPriceCents: number | null;
  costTaxCents: number;
  costShippingCents: number;
  costFeesCents: number;
  costGradingCents: number;
  notes: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function centsToStr(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toFixed(2);
}

function strToCents(val: string): number | null {
  if (!val.trim()) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

function playerName(
  players: { name: string; team: string | null; position: string | null }[] | null,
): string {
  if (!players || players.length === 0) return 'Unknown';
  return players.map((p) => p.name).join(' / ');
}

// ---------------------------------------------------------------------------
// Card search sub-flow (reuses patterns from add page)
// ---------------------------------------------------------------------------

function CardSearchFlow({
  onSelect,
  onCancel,
}: {
  onSelect: (card: CatalogCard, parallel: Parallel | null) => void;
  onCancel: () => void;
}) {
  const [step, setStep] = useState<
    | { kind: 'search' }
    | { kind: 'parallel'; card: CatalogCard }
  >({ kind: 'search' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [searched, setSearched] = useState(false);
  const [parallels, setParallels] = useState<Parallel[] | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    startTransition(async () => {
      const r = (await searchCatalog(query.trim())) as CatalogCard[];
      setResults(r);
      setSearched(true);
    });
  }

  function selectCard(card: CatalogCard) {
    setStep({ kind: 'parallel', card });
    setParallels(null);
    startTransition(async () => {
      const p = (await getParallels(card.setRef)) as Parallel[];
      setParallels(p);
    });
  }

  if (step.kind === 'parallel') {
    return (
      <div className="rounded border p-4 space-y-3">
        <button
          type="button"
          onClick={() => setStep({ kind: 'search' })}
          className="text-sm text-primary"
        >
          &larr; Back to search
        </button>
        <h3 className="text-sm font-medium">
          {step.card.playerName} &mdash; Pick parallel
        </h3>
        {pending && <p className="text-xs text-ct-text-subtle">Loading...</p>}
        {parallels && (
          <ul className="space-y-1">
            <li>
              <button
                type="button"
                onClick={() => onSelect(step.card, null)}
                className="w-full rounded border p-2 text-left text-sm active:bg-muted"
              >
                Base
              </button>
            </li>
            {parallels.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onSelect(step.card, p)}
                  className="w-full rounded border p-2 text-left text-sm active:bg-muted"
                >
                  {p.name}
                  {p.printRun ? (
                    <span className="ml-2 text-xs text-ct-text-subtle">
                      /{p.printRun}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="w-full rounded border py-2 text-sm text-muted-foreground"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="rounded border p-4 space-y-3">
      <h3 className="text-sm font-medium">Search for a different card</h3>
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 2023 Prizm Justin Jefferson"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending ? '...' : 'Search'}
        </button>
      </form>
      {searched && results.length === 0 && (
        <p className="text-xs text-ct-text-subtle">No results found.</p>
      )}
      <ul className="max-h-64 space-y-1 overflow-y-auto">
        {results.map((card) => (
          <li key={`${card.provider}-${card.cardId}`}>
            <button
              type="button"
              onClick={() => selectCard(card)}
              className="w-full rounded border p-2 text-left text-sm active:bg-muted"
            >
              <p className="font-medium">{card.playerName}</p>
              <p className="text-xs text-muted-foreground">
                {card.year} {card.setName} #{card.cardNumber}
              </p>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCancel}
        className="w-full rounded border py-2 text-sm text-muted-foreground"
      >
        Cancel
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit form
// ---------------------------------------------------------------------------

export function EditForm({ initialData }: { initialData: InitialData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCardSearch, setShowCardSearch] = useState(false);

  // Card identity state (may be updated by re-link flow)
  const [cardIdentity, setCardIdentity] = useState({
    year: initialData.year,
    manufacturer: initialData.manufacturer,
    setName: initialData.setName,
    subset: initialData.subset,
    cardNumber: initialData.cardNumber,
    players: initialData.players,
    parallel: initialData.parallel,
    printRun: initialData.printRun,
    isAuto: initialData.isAuto,
    autoType: initialData.autoType,
    isMemorabilia: initialData.isMemorabilia,
    isRookie: initialData.isRookie,
    variation: initialData.variation,
    licensed: initialData.licensed,
    cardsightCardId: initialData.cardsightCardId,
    cardsightParallelId: initialData.cardsightParallelId,
    referenceImageUrl: initialData.referenceImageUrl,
  });

  // Item field state
  const [serialNumber, setSerialNumber] = useState(
    initialData.serialNumber?.toString() ?? '',
  );
  const [conditionKind, setConditionKind] = useState(initialData.conditionKind);
  const [rawTier, setRawTier] = useState(
    initialData.rawConditionTier ?? 'market',
  );
  const [grader, setGrader] = useState(initialData.grader ?? 'PSA');
  const [grade, setGrade] = useState(
    initialData.grade != null ? initialData.grade.toString() : '',
  );
  const [certNumber, setCertNumber] = useState(initialData.certNumber ?? '');
  const [storage, setStorage] = useState(initialData.storage);
  const [acquiredOn, setAcquiredOn] = useState(initialData.acquiredOn ?? '');
  const [acquiredVia, setAcquiredVia] = useState(initialData.acquiredVia);
  const [costPrice, setCostPrice] = useState(
    centsToStr(initialData.costPriceCents),
  );
  const [costTax, setCostTax] = useState(centsToStr(initialData.costTaxCents));
  const [costShipping, setCostShipping] = useState(
    centsToStr(initialData.costShippingCents),
  );
  const [costFees, setCostFees] = useState(
    centsToStr(initialData.costFeesCents),
  );
  const [costGrading, setCostGrading] = useState(
    centsToStr(initialData.costGradingCents),
  );
  const [notes, setNotes] = useState(initialData.notes);

  function handleCardRelink(card: CatalogCard, parallel: Parallel | null) {
    setCardIdentity({
      year: card.year,
      manufacturer: card.setName.split(' ')[0] || card.setName,
      setName: card.setName,
      subset: card.subsetOrInsert ?? null,
      cardNumber: card.cardNumber,
      players: [{ name: card.playerName, team: null, position: null }],
      parallel: parallel?.name ?? null,
      printRun: parallel?.printRun ?? null,
      isAuto: card.isAutograph,
      autoType: null,
      isMemorabilia: card.isMemorabilia,
      isRookie: card.isRookie,
      variation: null,
      licensed: 'unknown',
      cardsightCardId: card.cardId,
      cardsightParallelId: parallel?.id ?? null,
      referenceImageUrl: card.imageUrl ?? null,
    });
    setShowCardSearch(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const changes: Record<string, unknown> = {
          // Identity fields (always send so re-link works)
          year: cardIdentity.year,
          manufacturer: cardIdentity.manufacturer,
          setName: cardIdentity.setName,
          subset: cardIdentity.subset,
          cardNumber: cardIdentity.cardNumber,
          players: cardIdentity.players,
          parallel: cardIdentity.parallel,
          printRun: cardIdentity.printRun,
          isAuto: cardIdentity.isAuto,
          autoType: cardIdentity.autoType,
          isMemorabilia: cardIdentity.isMemorabilia,
          isRookie: cardIdentity.isRookie,
          variation: cardIdentity.variation,
          licensed: cardIdentity.licensed,
          cardsightCardId: cardIdentity.cardsightCardId,
          cardsightParallelId: cardIdentity.cardsightParallelId,
          referenceImageUrl: cardIdentity.referenceImageUrl,

          // Item fields
          serialNumber: serialNumber ? parseInt(serialNumber, 10) : null,
          conditionKind,
          rawConditionTier: conditionKind === 'raw' ? rawTier : null,
          grader: conditionKind === 'graded' ? grader : null,
          grade:
            conditionKind === 'graded' && grade
              ? parseFloat(grade)
              : null,
          certNumber:
            conditionKind === 'graded' && certNumber ? certNumber : null,
          storage,
          acquiredOn: acquiredOn || null,
          acquiredVia,
          costPriceCents: strToCents(costPrice),
          costTaxCents: strToCents(costTax) ?? 0,
          costShippingCents: strToCents(costShipping) ?? 0,
          costFeesCents: strToCents(costFees) ?? 0,
          costGradingCents: strToCents(costGrading) ?? 0,
          notes,
        };

        await updateItem(initialData.itemId, changes);
        router.push(`/collection/${initialData.itemId}`);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Something went wrong',
        );
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Edit Card</h1>

      {error && (
        <p className="mb-4 rounded bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Card identity section */}
      <section className="mb-6">
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Card identity
        </h2>
        <div className="rounded border p-3 text-sm">
          <p className="font-medium">{playerName(cardIdentity.players)}</p>
          <p className="text-xs text-muted-foreground">
            {cardIdentity.year} {cardIdentity.setName} #{cardIdentity.cardNumber}
          </p>
          <p className="text-xs text-muted-foreground">
            Parallel: {cardIdentity.parallel ?? 'Base'}
            {cardIdentity.printRun ? ` /${cardIdentity.printRun}` : ''}
          </p>
        </div>

        {showCardSearch ? (
          <div className="mt-3">
            <CardSearchFlow
              onSelect={handleCardRelink}
              onCancel={() => setShowCardSearch(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowCardSearch(true)}
            className="mt-2 text-sm text-primary"
          >
            Change card
          </button>
        )}
      </section>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Serial number */}
        <label className="block">
          <span className="text-sm font-medium">Serial number</span>
          <input
            type="number"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="e.g. 42"
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </label>

        {/* Condition */}
        <fieldset>
          <legend className="text-sm font-medium">Condition</legend>
          <div className="mt-1 flex gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="conditionKind"
                checked={conditionKind === 'raw'}
                onChange={() => setConditionKind('raw')}
              />
              Raw
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="conditionKind"
                checked={conditionKind === 'graded'}
                onChange={() => setConditionKind('graded')}
              />
              Graded
            </label>
          </div>

          {conditionKind === 'raw' && (
            <select
              value={rawTier}
              onChange={(e) => setRawTier(e.target.value)}
              className="mt-2 block w-full rounded border px-3 py-2 text-sm"
            >
              <option value="market">Pack-fresh (Market)</option>
              <option value="nm_mt">Light wear (NM-MT)</option>
              <option value="ex_mt">Clear wear (EX-MT)</option>
              <option value="ex">Worn (EX)</option>
              <option value="vg">Heavy wear (VG)</option>
              <option value="poor">Damaged (Poor)</option>
            </select>
          )}

          {conditionKind === 'graded' && (
            <div className="mt-2 space-y-2">
              <select
                value={grader}
                onChange={(e) => setGrader(e.target.value)}
                className="block w-full rounded border px-3 py-2 text-sm"
              >
                <option value="PSA">PSA</option>
                <option value="BGS">BGS</option>
                <option value="SGC">SGC</option>
                <option value="CGC">CGC</option>
                <option value="TAG">TAG</option>
                <option value="ACE">ACE</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                type="number"
                step="0.5"
                min="1"
                max="10"
                value={grade}
                onChange={(e) => setGrade(e.target.value)}
                placeholder="Grade (e.g. 10)"
                className="block w-full rounded border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={certNumber}
                onChange={(e) => setCertNumber(e.target.value)}
                placeholder="Cert number"
                className="block w-full rounded border px-3 py-2 text-sm"
              />
            </div>
          )}
        </fieldset>

        {/* Storage */}
        <label className="block">
          <span className="text-sm font-medium">Storage</span>
          <select
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="toploader">Toploader</option>
            <option value="penny_sleeve">Penny sleeve</option>
            <option value="binder">Binder</option>
            <option value="magnetic">Magnetic case</option>
            <option value="slab">Slab</option>
            <option value="none">None</option>
            <option value="unknown">Unknown</option>
          </select>
        </label>

        {/* Cost basis */}
        <fieldset>
          <legend className="text-sm font-medium">Cost basis</legend>
          <label className="mt-2 block">
            <span className="text-xs text-muted-foreground">Acquired on</span>
            <input
              type="date"
              value={acquiredOn}
              onChange={(e) => setAcquiredOn(e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
          <select
            value={acquiredVia}
            onChange={(e) => setAcquiredVia(e.target.value)}
            className="mt-2 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="unknown">Unknown</option>
            <option value="purchase">Purchase</option>
            <option value="pack_pull">Pack pull</option>
            <option value="trade">Trade</option>
            <option value="gift">Gift</option>
          </select>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <input
              type="number"
              step="0.01"
              min="0"
              value={costPrice}
              onChange={(e) => setCostPrice(e.target.value)}
              placeholder="Price ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={costTax}
              onChange={(e) => setCostTax(e.target.value)}
              placeholder="Tax ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={costShipping}
              onChange={(e) => setCostShipping(e.target.value)}
              placeholder="Shipping ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={costFees}
              onChange={(e) => setCostFees(e.target.value)}
              placeholder="Fees ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={costGrading}
              onChange={(e) => setCostGrading(e.target.value)}
              placeholder="Grading ($)"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
        </fieldset>

        {/* Notes */}
        <label className="block">
          <span className="text-sm font-medium">Notes</span>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </label>

        {/* Buttons */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={pending}
            data-testid="save-edit-button"
            className="flex-1 rounded bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {pending ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => router.push(`/collection/${initialData.itemId}`)}
            className="flex-1 rounded border py-3 text-sm font-medium text-muted-foreground"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
