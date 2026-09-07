'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { searchCatalog, getParallels, createItem } from '@/app/(app)/actions';

// ---------------------------------------------------------------------------
// Types mirroring provider shapes
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

// ---------------------------------------------------------------------------
// Step 1: Search
// ---------------------------------------------------------------------------

function SearchStep({
  onSelect,
}: {
  onSelect: (card: CatalogCard) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogCard[]>([]);
  const [searched, setSearched] = useState(false);
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

  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">Search for a card</h2>
      <form onSubmit={handleSearch} className="mb-4 flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. 2023 Prizm Justin Jefferson"
          data-testid="search-input"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          data-testid="search-button"
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
        >
          {pending ? '...' : 'Search'}
        </button>
      </form>

      {searched && results.length === 0 && (
        <p className="text-sm text-muted-foreground">No results found.</p>
      )}

      <ul className="space-y-2">
        {results.map((card) => (
          <li key={`${card.provider}-${card.cardId}`}>
            <button
              type="button"
              onClick={() => onSelect(card)}
              className="w-full rounded border p-3 text-left active:bg-muted"
            >
              <p className="text-sm font-medium">{card.playerName}</p>
              <p className="text-xs text-muted-foreground">
                {card.year} {card.setName}
                {card.subsetOrInsert ? ` - ${card.subsetOrInsert}` : ''} #
                {card.cardNumber}
              </p>
              <div className="mt-1 flex gap-2">
                {card.isRookie && (
                  <span className="rounded bg-ct-positive/20 px-1.5 text-xs text-ct-positive">
                    RC
                  </span>
                )}
                {card.isAutograph && (
                  <span className="rounded bg-primary/20 px-1.5 text-xs text-primary">
                    Auto
                  </span>
                )}
                {card.isMemorabilia && (
                  <span className="rounded bg-ct-caution/20 px-1.5 text-xs text-ct-caution">
                    Mem
                  </span>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2: Pick parallel
// ---------------------------------------------------------------------------

function ParallelStep({
  card,
  onSelect,
  onBack,
}: {
  card: CatalogCard;
  onSelect: (parallel: Parallel | null) => void;
  onBack: () => void;
}) {
  const [parallels, setParallels] = useState<Parallel[] | null>(null);
  const [pending, setPending] = useState(true);

  // Fetch parallels on mount
  useEffect(() => {
    let cancelled = false;
    getParallels(card.setRef).then((p) => {
      if (!cancelled) {
        setParallels(p as Parallel[]);
        setPending(false);
      }
    });
    return () => { cancelled = true; };
  }, [card.setRef]);

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm text-primary"
      >
        &larr; Back to search
      </button>
      <h2 className="mb-1 text-lg font-semibold">{card.playerName}</h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {card.year} {card.setName} #{card.cardNumber}
      </p>
      <h3 className="mb-2 text-sm font-medium">Pick a parallel</h3>

      {pending && <p className="text-sm text-ct-text-subtle">Loading parallels...</p>}

      {parallels !== null && (
        <ul className="space-y-1">
          {/* Base option */}
          <li>
            <button
              type="button"
              onClick={() => onSelect(null)}
              className="w-full rounded border p-2 text-left text-sm active:bg-muted"
            >
              Base
            </button>
          </li>
          {parallels.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onSelect(p)}
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3: Details form
// ---------------------------------------------------------------------------

interface DetailsFormData {
  serialNumber: string;
  conditionKind: 'raw' | 'graded';
  rawTier: string;
  grader: string;
  grade: string;
  certNumber: string;
  storage: string;
  acquiredVia: string;
  costPrice: string;
  costTax: string;
  costShipping: string;
  costFees: string;
  notes: string;
}

function DetailsStep({
  card,
  parallel,
  onSubmit,
  onBack,
}: {
  card: CatalogCard;
  parallel: Parallel | null;
  onSubmit: (data: DetailsFormData) => void;
  onBack: () => void;
}) {
  const [form, setForm] = useState<DetailsFormData>({
    serialNumber: '',
    conditionKind: 'raw',
    rawTier: 'market',
    grader: 'PSA',
    grade: '',
    certNumber: '',
    storage: 'toploader',
    acquiredVia: 'unknown',
    costPrice: '',
    costTax: '',
    costShipping: '',
    costFees: '',
    notes: '',
  });

  function set<K extends keyof DetailsFormData>(key: K, val: DetailsFormData[K]) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(form);
  }

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm text-primary"
      >
        &larr; Back to parallels
      </button>
      <h2 className="mb-1 text-lg font-semibold">{card.playerName}</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {card.year} {card.setName} #{card.cardNumber}
        {parallel ? ` — ${parallel.name}` : ' — Base'}
      </p>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Serial number (only if numbered parallel) */}
        {parallel?.printRun && (
          <label className="block">
            <span className="text-sm font-medium">Serial number</span>
            <input
              type="number"
              value={form.serialNumber}
              onChange={(e) => set('serialNumber', e.target.value)}
              placeholder={`1-${parallel.printRun}`}
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
        )}

        {/* Condition */}
        <fieldset>
          <legend className="text-sm font-medium">Condition</legend>
          <div className="mt-1 flex gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="conditionKind"
                checked={form.conditionKind === 'raw'}
                onChange={() => set('conditionKind', 'raw')}
              />
              Raw
            </label>
            <label className="flex items-center gap-1 text-sm">
              <input
                type="radio"
                name="conditionKind"
                checked={form.conditionKind === 'graded'}
                onChange={() => set('conditionKind', 'graded')}
              />
              Graded
            </label>
          </div>

          {form.conditionKind === 'raw' && (
            <select
              value={form.rawTier}
              onChange={(e) => set('rawTier', e.target.value)}
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

          {form.conditionKind === 'graded' && (
            <div className="mt-2 space-y-2">
              <select
                value={form.grader}
                onChange={(e) => set('grader', e.target.value)}
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
                value={form.grade}
                onChange={(e) => set('grade', e.target.value)}
                placeholder="Grade (e.g. 10)"
                className="block w-full rounded border px-3 py-2 text-sm"
              />
              <input
                type="text"
                value={form.certNumber}
                onChange={(e) => set('certNumber', e.target.value)}
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
            value={form.storage}
            onChange={(e) => set('storage', e.target.value)}
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="toploader">Toploader</option>
            <option value="penny_sleeve">Penny sleeve</option>
            <option value="binder">Binder</option>
            <option value="magnetic">Magnetic case</option>
            <option value="none">None</option>
          </select>
        </label>

        {/* Cost basis */}
        <fieldset>
          <legend className="text-sm font-medium">Cost basis</legend>
          <select
            value={form.acquiredVia}
            onChange={(e) => set('acquiredVia', e.target.value)}
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
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
              value={form.costPrice}
              onChange={(e) => set('costPrice', e.target.value)}
              placeholder="Price ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costTax}
              onChange={(e) => set('costTax', e.target.value)}
              placeholder="Tax ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costShipping}
              onChange={(e) => set('costShipping', e.target.value)}
              placeholder="Shipping ($)"
              className="rounded border px-3 py-2 text-sm"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              value={form.costFees}
              onChange={(e) => set('costFees', e.target.value)}
              placeholder="Fees ($)"
              className="rounded border px-3 py-2 text-sm"
            />
          </div>
        </fieldset>

        {/* Notes */}
        <label className="block">
          <span className="text-sm font-medium">Notes</span>
          <textarea
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded bg-primary py-3 text-sm font-medium text-primary-foreground"
        >
          Review &amp; Add
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dollar string -> integer cents (rounding half-up)
// ---------------------------------------------------------------------------

function dollarsToCents(val: string): number | null {
  if (!val.trim()) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return Math.round(n * 100);
}

// ---------------------------------------------------------------------------
// Main page component
// ---------------------------------------------------------------------------

type Step =
  | { kind: 'search' }
  | { kind: 'parallel'; card: CatalogCard }
  | { kind: 'details'; card: CatalogCard; parallel: Parallel | null }
  | {
      kind: 'confirm';
      card: CatalogCard;
      parallel: Parallel | null;
      form: DetailsFormData;
    };

export default function AddCardPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'search' });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleConfirm(
    card: CatalogCard,
    parallel: Parallel | null,
    form: DetailsFormData,
  ) {
    setError(null);
    startTransition(async () => {
      try {
        const payload = {
          year: card.year,
          manufacturer: card.setName.split(' ')[0] || card.setName, // best guess
          setName: card.setName,
          subset: card.subsetOrInsert ?? null,
          cardNumber: card.cardNumber,
          players: [{ name: card.playerName, team: null, position: null }],
          parallel: parallel?.name ?? null,
          printRun: parallel?.printRun ?? null,
          isAuto: card.isAutograph,
          isMemorabilia: card.isMemorabilia,
          isRookie: card.isRookie,
          licensed: 'unknown' as const,
          cardsightCardId: card.cardId,
          cardsightParallelId: parallel?.id ?? null,
          referenceImageUrl: card.imageUrl ?? null,

          conditionKind: form.conditionKind,
          rawConditionTier:
            form.conditionKind === 'raw' ? form.rawTier : null,
          grader:
            form.conditionKind === 'graded' ? form.grader : null,
          grade:
            form.conditionKind === 'graded' && form.grade
              ? parseFloat(form.grade)
              : null,
          certNumber:
            form.conditionKind === 'graded' && form.certNumber
              ? form.certNumber
              : null,
          storage: form.storage,
          acquiredVia: form.acquiredVia,
          costPriceCents: dollarsToCents(form.costPrice),
          costTaxCents: dollarsToCents(form.costTax) ?? 0,
          costShippingCents: dollarsToCents(form.costShipping) ?? 0,
          costFeesCents: dollarsToCents(form.costFees) ?? 0,
          serialNumber:
            form.serialNumber ? parseInt(form.serialNumber, 10) : null,
          notes: form.notes,
        };

        const result = await createItem(payload);
        router.push(`/collection/${result.itemId}`);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Something went wrong');
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Add Card</h1>

      {step.kind === 'search' && (
        <SearchStep
          onSelect={(card) => setStep({ kind: 'parallel', card })}
        />
      )}

      {step.kind === 'parallel' && (
        <ParallelStep
          card={step.card}
          onSelect={(parallel) =>
            setStep({ kind: 'details', card: step.card, parallel })
          }
          onBack={() => setStep({ kind: 'search' })}
        />
      )}

      {step.kind === 'details' && (
        <DetailsStep
          card={step.card}
          parallel={step.parallel}
          onSubmit={(form) =>
            setStep({
              kind: 'confirm',
              card: step.card,
              parallel: step.parallel,
              form,
            })
          }
          onBack={() => setStep({ kind: 'parallel', card: step.card })}
        />
      )}

      {step.kind === 'confirm' && (
        <div>
          <button
            type="button"
            onClick={() =>
              setStep({
                kind: 'details',
                card: step.card,
                parallel: step.parallel,
              })
            }
            className="mb-3 text-sm text-primary"
          >
            &larr; Back to details
          </button>
          <h2 className="mb-3 text-lg font-semibold">Confirm</h2>

          <div className="mb-4 space-y-1 rounded border p-3 text-sm">
            <p className="font-medium">{step.card.playerName}</p>
            <p className="text-muted-foreground">
              {step.card.year} {step.card.setName} #{step.card.cardNumber}
            </p>
            <p className="text-muted-foreground">
              Parallel: {step.parallel?.name ?? 'Base'}
              {step.parallel?.printRun
                ? ` /${step.parallel.printRun}`
                : ''}
            </p>
            {step.form.serialNumber && (
              <p className="text-muted-foreground">
                Serial: #{step.form.serialNumber}
              </p>
            )}
            <p className="text-muted-foreground">
              Condition:{' '}
              {step.form.conditionKind === 'graded'
                ? `${step.form.grader} ${step.form.grade}`
                : `Raw (${step.form.rawTier})`}
            </p>
            <p className="text-muted-foreground">Storage: {step.form.storage}</p>
            <p className="text-muted-foreground">
              Acquired via: {step.form.acquiredVia}
            </p>
            {step.form.costPrice && (
              <p className="text-muted-foreground">
                Cost: ${step.form.costPrice}
                {step.form.costTax ? ` + $${step.form.costTax} tax` : ''}
                {step.form.costShipping
                  ? ` + $${step.form.costShipping} ship`
                  : ''}
                {step.form.costFees
                  ? ` + $${step.form.costFees} fees`
                  : ''}
              </p>
            )}
            {step.form.notes && (
              <p className="text-ct-text-subtle">{step.form.notes}</p>
            )}
          </div>

          {error && (
            <p className="mb-3 text-sm text-destructive">{error}</p>
          )}

          <button
            type="button"
            disabled={pending}
            onClick={() =>
              handleConfirm(step.card, step.parallel, step.form)
            }
            data-testid="confirm-add-button"
            className="w-full rounded bg-ct-positive py-3 text-sm font-medium text-background disabled:opacity-50"
          >
            {pending ? 'Adding...' : 'Add to Collection'}
          </button>
        </div>
      )}
    </div>
  );
}
