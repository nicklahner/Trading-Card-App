'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  confirmIdentification,
  deleteItemFromReview,
  getParallels,
} from '@/app/(app)/actions';
import type {
  ReviewPageData,
  ReviewCandidate,
  ReviewPhoto,
  CatalogParallel,
} from './page';
import { computePrefill } from '@/domain/identification/prefill';

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

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// Photo carousel
// ---------------------------------------------------------------------------

function PhotoCarousel({ photos }: { photos: ReviewPhoto[] }) {
  const [current, setCurrent] = useState(0);

  if (photos.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-lg bg-muted text-ct-text-subtle">
        No photos
      </div>
    );
  }

  return (
    <div className="relative">
      <img
        src={photos[current].url}
        alt={photos[current].side}
        className="h-72 w-full rounded-lg object-contain bg-background"
      />
      {photos.length > 1 && (
        <>
          <div className="absolute bottom-2 left-1/2 flex -translate-x-1/2 gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setCurrent(i)}
                className={`h-2 w-2 rounded-full ${
                  i === current ? 'bg-primary' : 'bg-ct-text-subtle'
                }`}
                aria-label={`View ${p.side}`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c > 0 ? c - 1 : photos.length - 1))}
            className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 px-2 py-1 text-sm shadow"
          >
            &lsaquo;
          </button>
          <button
            type="button"
            onClick={() => setCurrent((c) => (c < photos.length - 1 ? c + 1 : 0))}
            className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-background/80 px-2 py-1 text-sm shadow"
          >
            &rsaquo;
          </button>
        </>
      )}
      <p className="mt-1 text-center text-xs text-ct-text-subtle capitalize">
        {photos[current].side.replace('_', ' ')}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Candidate card component
// ---------------------------------------------------------------------------

function CandidateCard({
  candidate,
  isSelected,
  onSelect,
}: {
  candidate: ReviewCandidate;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`w-full rounded border-2 p-3 text-left transition-colors ${
        isSelected
          ? 'border-primary bg-ct-info/10'
          : 'border-muted active:bg-muted'
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{candidate.playerName}</p>
          <p className="text-xs text-muted-foreground">
            {candidate.year} {candidate.setName}
            {candidate.subsetOrInsert ? ` - ${candidate.subsetOrInsert}` : ''} #
            {candidate.cardNumber}
          </p>
          {candidate.parallelName && (
            <p className="text-xs text-ct-text-subtle">
              {candidate.parallelName}
            </p>
          )}
          {candidate.scpProductName && (
            <p className="mt-1 text-xs text-ct-text-subtle">
              SCP: {candidate.scpProductName}
            </p>
          )}
        </div>
        <div className="ml-2 flex flex-col items-end gap-1">
          <span
            className={`rounded px-1.5 py-0.5 text-xs font-medium ${
              candidate.score >= 0.9
                ? 'bg-ct-positive/20 text-ct-positive'
                : candidate.score >= 0.7
                  ? 'bg-ct-caution/20 text-ct-caution'
                  : 'bg-destructive/10 text-destructive'
            }`}
          >
            {(candidate.score * 100).toFixed(0)}%
          </span>
          {candidate.estValueCents != null && (
            <span className="text-xs text-muted-foreground">
              {formatCents(candidate.estValueCents)}
            </span>
          )}
        </div>
      </div>
      {candidate.isRookie && (
        <span className="mt-1 inline-block rounded bg-ct-positive/20 px-1.5 py-0.5 text-xs font-medium text-ct-positive">
          RC
        </span>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Review form
// ---------------------------------------------------------------------------

export function ReviewForm({ data }: { data: ReviewPageData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Candidate selection
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Pre-fill decision: candidate above floor, extraction, or empty
  const prefill = computePrefill(
    data.candidates,
    data.extraction,
    data.sessionSetName,
  );

  // Editable identity fields (initialized from prefill decision)
  const [playerNameVal, setPlayerNameVal] = useState(prefill.fields.playerName);
  const [year, setYear] = useState(prefill.fields.year);
  const [setName, setSetName] = useState(prefill.fields.setName);
  const [subset, setSubset] = useState(prefill.fields.subset);
  const [cardNumber, setCardNumber] = useState(prefill.fields.cardNumber);

  // Parallel
  const [parallelName, setParallelName] = useState(prefill.fields.parallelName);
  const [printRun, setPrintRun] = useState(prefill.fields.printRun);
  const [catalogParallels, setCatalogParallels] = useState<CatalogParallel[] | null>(null);
  const [loadingParallels, setLoadingParallels] = useState(false);

  // Serial number
  const [serialNumber, setSerialNumber] = useState(prefill.fields.serialNumber);
  const [serialError, setSerialError] = useState<string | null>(null);

  // Toggles
  const [isAuto, setIsAuto] = useState(prefill.fields.isAuto);
  const [isMemorabilia, setIsMemorabilia] = useState(prefill.fields.isMemorabilia);
  const [isRookie, setIsRookie] = useState(prefill.fields.isRookie);

  // Condition
  const [conditionKind, setConditionKind] = useState(data.conditionKind);
  const [rawTier, setRawTier] = useState(data.rawConditionTier ?? 'market');
  const [grader, setGrader] = useState('PSA');
  const [grade, setGrade] = useState('');
  const [certNumber, setCertNumber] = useState('');

  // Storage
  const [storage, setStorage] = useState(data.storage);

  // Cost basis (collapsible)
  const [showCost, setShowCost] = useState(false);
  const [acquiredVia, setAcquiredVia] = useState('unknown');
  const [acquiredOn, setAcquiredOn] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [costTax, setCostTax] = useState('');
  const [costShipping, setCostShipping] = useState('');
  const [costFees, setCostFees] = useState('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Track which flagged fields have been explicitly set
  const [explicitFields, setExplicitFields] = useState<Set<string>>(new Set());

  // ---------------------------------------------------------------------------
  // Derived state
  // ---------------------------------------------------------------------------

  // Check if any "always" flag blocks confirm
  const alwaysFlags = data.flags.filter((f) =>
    ['numbered_serial', 'auto_detected', 'memorabilia_detected'].includes(f),
  );
  const unblockedFlags = alwaysFlags.filter((f) => {
    if (f === 'numbered_serial' && explicitFields.has('serialNumber')) return false;
    if (f === 'auto_detected' && explicitFields.has('isAuto')) return false;
    if (f === 'memorabilia_detected' && explicitFields.has('isMemorabilia')) return false;
    return true;
  });
  const isBlocked = unblockedFlags.length > 0;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function handleSelectCandidate(index: number) {
    setSelectedIndex(index);
    const c = data.candidates[index];
    if (c) {
      setPlayerNameVal(c.playerName);
      setYear(c.year.toString());
      setSetName(c.setName);
      setSubset(c.subsetOrInsert ?? '');
      setCardNumber(c.cardNumber);
      setParallelName(c.parallelName ?? '');
      setIsRookie(c.isRookie);
    }
  }

  function handleLoadParallels() {
    const c = data.candidates[selectedIndex];
    if (!c) return;
    setLoadingParallels(true);
    getParallels({ provider: c.provider, id: c.cardId })
      .then((parallels) => {
        setCatalogParallels(
          (parallels as { id: string; name: string; printRun: number | null }[]).map((p) => ({
            id: p.id,
            name: p.name,
            printRun: p.printRun,
          })),
        );
      })
      .catch(() => setCatalogParallels([]))
      .finally(() => setLoadingParallels(false));
  }

  function handleSelectParallel(p: CatalogParallel | null) {
    if (p) {
      setParallelName(p.name);
      setPrintRun(p.printRun?.toString() ?? '');
    } else {
      setParallelName('');
      setPrintRun('');
    }
    setCatalogParallels(null);
  }

  function validateSerial(val: string): boolean {
    if (!val.trim()) {
      setSerialError(null);
      return true;
    }
    const num = parseInt(val, 10);
    const pr = parseInt(printRun, 10);
    if (isNaN(num) || num < 1) {
      setSerialError('Must be a positive number');
      return false;
    }
    if (!isNaN(pr) && num > pr) {
      setSerialError(`Serial must be <= print run (${pr})`);
      return false;
    }
    setSerialError(null);
    return true;
  }

  function markExplicit(field: string) {
    setExplicitFields((prev) => new Set(prev).add(field));
  }

  // Build corrections by comparing selected candidate to edited fields
  function buildCorrections() {
    const c = data.candidates[selectedIndex];
    if (!c) return [];
    const corrections: { field: string; predicted: unknown; corrected: unknown }[] = [];
    if (playerNameVal !== c.playerName)
      corrections.push({ field: 'playerName', predicted: c.playerName, corrected: playerNameVal });
    if (year !== c.year.toString())
      corrections.push({ field: 'year', predicted: c.year, corrected: parseInt(year, 10) });
    if (setName !== c.setName)
      corrections.push({ field: 'setName', predicted: c.setName, corrected: setName });
    if ((subset || null) !== (c.subsetOrInsert || null))
      corrections.push({ field: 'subset', predicted: c.subsetOrInsert, corrected: subset || null });
    if (cardNumber !== c.cardNumber)
      corrections.push({ field: 'cardNumber', predicted: c.cardNumber, corrected: cardNumber });
    return corrections;
  }

  function handleConfirm() {
    if (!validateSerial(serialNumber)) return;
    setError(null);
    startTransition(async () => {
      try {
        await confirmIdentification(data.itemId, {
          chosenCandidateIndex: selectedIndex,
          corrections: buildCorrections(),
          conditionKind,
          rawConditionTier: conditionKind === 'raw' ? rawTier : null,
          grader: conditionKind === 'graded' ? grader : null,
          grade: conditionKind === 'graded' && grade ? parseFloat(grade) : null,
          certNumber: conditionKind === 'graded' && certNumber ? certNumber : null,
          storage,
          acquiredVia,
          costPriceCents: strToCents(costPrice),
          notSure: false,
        });
        router.push('/review');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to confirm');
      }
    });
  }

  function handleNotSure() {
    setError(null);
    startTransition(async () => {
      try {
        // "Not sure" picks the lowest-value candidate
        const lowestIdx = data.candidates.reduce(
          (minIdx, c, i) =>
            (c.estValueCents ?? Infinity) <
            (data.candidates[minIdx].estValueCents ?? Infinity)
              ? i
              : minIdx,
          0,
        );
        await confirmIdentification(data.itemId, {
          chosenCandidateIndex: lowestIdx,
          corrections: [],
          conditionKind,
          rawConditionTier: conditionKind === 'raw' ? rawTier : null,
          storage,
          notSure: true,
        });
        router.push('/review');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to save');
      }
    });
  }

  function handleSkip() {
    router.push('/review');
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteItemFromReview(data.itemId);
        router.push('/review');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete');
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-6 pb-8">
      {error && (
        <p className="rounded bg-destructive/10 p-2 text-sm text-destructive">{error}</p>
      )}

      {/* Photos */}
      <PhotoCarousel photos={data.photos} />

      {/* Flag warnings */}
      {data.flags.length > 0 && (
        <div className="space-y-1">
          {data.flags.map((flag) => (
            <div
              key={flag}
              className="rounded border border-ct-caution/40 bg-ct-caution/10 px-3 py-2 text-xs text-ct-caution"
            >
              {flag.replace(/_/g, ' ')}
              {unblockedFlags.includes(flag) && (
                <span className="ml-1 font-medium">
                  -- must be explicitly set below
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Candidates */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Candidates
        </h2>
        <div className="space-y-2">
          {data.candidates.map((c) => (
            <CandidateCard
              key={c.index}
              candidate={c}
              isSelected={selectedIndex === c.index}
              onSelect={() => handleSelectCandidate(c.index)}
            />
          ))}
          {data.candidates.length === 0 && (
            <p className="text-sm text-ct-text-subtle">
              No candidates found. Fill in identity manually.
            </p>
          )}
        </div>
      </section>

      {/* Suggestion banner: low-scoring candidate not used for pre-fill */}
      {prefill.suggestion && (
        <section className="rounded border border-ct-info/40 bg-ct-info/10 p-3">
          <p className="mb-1 text-xs font-medium text-primary">
            Low-confidence match ({(prefill.suggestion.score * 100).toFixed(0)}%) — not pre-filled
          </p>
          <p className="mb-2 text-xs text-primary">
            {prefill.suggestion.playerName} - {prefill.suggestion.year} {prefill.suggestion.setName} #{prefill.suggestion.cardNumber}
          </p>
          <button
            type="button"
            onClick={() => {
              const s = prefill.suggestion!;
              setPlayerNameVal(s.playerName);
              setYear(String(s.year || ''));
              setSetName(s.setName);
              setSubset(s.subsetOrInsert ?? '');
              setCardNumber(s.cardNumber);
              setParallelName(s.parallelName ?? '');
              setIsRookie(s.isRookie);
            }}
            className="rounded bg-primary px-3 py-1 text-xs font-medium text-primary-foreground"
          >
            Apply this match
          </button>
        </section>
      )}

      {/* Pre-fill source indicator */}
      {prefill.source === 'extraction' && !prefill.suggestion && (
        <p className="text-xs text-ct-text-subtle">Fields pre-filled from photo extraction</p>
      )}

      {/* Editable identity fields */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Identity
        </h2>
        <div className="space-y-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Player</span>
            <input
              type="text"
              value={playerNameVal}
              onChange={(e) => setPlayerNameVal(e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-xs text-muted-foreground">Year</span>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <label className="block">
              <span className="text-xs text-muted-foreground">Card #</span>
              <input
                type="text"
                value={cardNumber}
                onChange={(e) => setCardNumber(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="block">
            <span className="text-xs text-muted-foreground">Set</span>
            <input
              type="text"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Subset / Insert</span>
            <input
              type="text"
              value={subset}
              onChange={(e) => setSubset(e.target.value)}
              className="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      {/* Parallel picker */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">
          Parallel
        </h2>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={parallelName}
            onChange={(e) => setParallelName(e.target.value)}
            placeholder="Base"
            className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          />
          <input
            type="number"
            value={printRun}
            onChange={(e) => setPrintRun(e.target.value)}
            placeholder="Print run"
            className="w-24 rounded border px-3 py-2 text-sm"
          />
        </div>
        {data.candidates.length > 0 && (
          <button
            type="button"
            onClick={handleLoadParallels}
            disabled={loadingParallels}
            className="mt-2 text-xs text-primary"
          >
            {loadingParallels ? 'Loading...' : 'Browse catalog parallels'}
          </button>
        )}
        {catalogParallels && (
          <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
            <li>
              <button
                type="button"
                onClick={() => handleSelectParallel(null)}
                className="w-full rounded border p-2 text-left text-sm active:bg-muted"
              >
                Base
              </button>
            </li>
            {catalogParallels.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => handleSelectParallel(p)}
                  className="w-full rounded border p-2 text-left text-sm active:bg-muted"
                >
                  {p.name}
                  {p.printRun && (
                    <span className="ml-2 text-xs text-ct-text-subtle">
                      /{p.printRun}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Serial number */}
      <section>
        <label className="block">
          <span className="text-sm font-medium">Serial number</span>
          <input
            type="number"
            value={serialNumber}
            onChange={(e) => {
              setSerialNumber(e.target.value);
              markExplicit('serialNumber');
              validateSerial(e.target.value);
            }}
            placeholder="e.g. 42"
            className={`mt-1 block w-full rounded border px-3 py-2 text-sm ${
              serialError ? 'border-destructive/40' : ''
            }`}
          />
          {serialError && (
            <p className="mt-1 text-xs text-destructive">{serialError}</p>
          )}
        </label>
      </section>

      {/* Toggles: Auto / Memorabilia / Rookie */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Attributes</h2>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isAuto}
              onChange={(e) => {
                setIsAuto(e.target.checked);
                markExplicit('isAuto');
              }}
              className="rounded"
            />
            Auto
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isMemorabilia}
              onChange={(e) => {
                setIsMemorabilia(e.target.checked);
                markExplicit('isMemorabilia');
              }}
              className="rounded"
            />
            Memorabilia
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isRookie}
              onChange={(e) => setIsRookie(e.target.checked)}
              className="rounded"
            />
            Rookie
          </label>
        </div>
      </section>

      {/* Condition */}
      <section>
        <h2 className="mb-2 text-sm font-semibold text-foreground">Condition</h2>
        <div className="flex gap-3">
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
      </section>

      {/* Storage */}
      <section>
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
      </section>

      {/* Cost basis (collapsible) */}
      <section>
        <button
          type="button"
          onClick={() => setShowCost(!showCost)}
          className="flex w-full items-center justify-between rounded border p-3 text-sm font-medium"
        >
          Cost basis
          <span className="text-ct-text-subtle">{showCost ? '\u2212' : '+'}</span>
        </button>
        {showCost && (
          <div className="mt-2 space-y-3">
            <select
              value={acquiredVia}
              onChange={(e) => setAcquiredVia(e.target.value)}
              className="block w-full rounded border px-3 py-2 text-sm"
            >
              <option value="unknown">Unknown</option>
              <option value="purchase">Purchase</option>
              <option value="pack_pull">Pack pull</option>
              <option value="trade">Trade</option>
              <option value="gift">Gift</option>
            </select>
            <label className="block">
              <span className="text-xs text-muted-foreground">Acquired on</span>
              <input
                type="date"
                value={acquiredOn}
                onChange={(e) => setAcquiredOn(e.target.value)}
                className="mt-1 block w-full rounded border px-3 py-2 text-sm"
              />
            </label>
            <div className="grid grid-cols-2 gap-2">
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
            </div>
          </div>
        )}
      </section>

      {/* Unmatched card banner */}
      {data.unmatched && (
        <section className="rounded-lg border border-ct-caution/40 bg-ct-caution/10 p-3 space-y-1">
          <p className="text-sm font-medium text-ct-caution">
            Not in catalog — creating from photo
          </p>
          <p className="text-xs text-ct-caution">
            Verify the pre-filled fields and confirm. Set name carries from your previous card
            {data.sessionSetName ? ` ("${data.sessionSetName}")` : ''}.
            {data.scpProductName ? ` SCP match: ${data.scpProductName}.` : ' No SCP match yet — can link later.'}
          </p>
        </section>
      )}

      {/* Action buttons */}
      <section className="space-y-3">
        {/* Confirm */}
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending || (!data.unmatched && isBlocked)}
          className="w-full rounded bg-ct-positive py-3 text-sm font-medium text-background disabled:opacity-50"
        >
          {pending ? 'Confirming...' : (!data.unmatched && isBlocked) ? 'Resolve flags to confirm' : data.unmatched ? 'Add to Collection' : 'Confirm'}
        </button>

        {/* Skip */}
        <button
          type="button"
          onClick={handleSkip}
          disabled={pending}
          className="w-full rounded border border-border py-3 text-sm font-medium text-muted-foreground"
        >
          Skip
        </button>

        {/* Not Sure */}
        <button
          type="button"
          onClick={handleNotSure}
          disabled={pending || data.candidates.length === 0}
          className="w-full rounded border border-ct-caution py-3 text-sm font-medium text-ct-caution disabled:opacity-50"
        >
          {pending ? 'Saving...' : 'Not Sure'}
        </button>

        {/* Not a card / Delete */}
        {!showDeleteConfirm ? (
          <button
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="w-full rounded border border-destructive/40 py-2.5 text-sm font-medium text-destructive"
          >
            Not a card / Delete
          </button>
        ) : (
          <div className="rounded border border-destructive/40 p-3 space-y-2">
            <p className="text-sm text-muted-foreground">
              Permanently delete this item and its photos?
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="flex-1 rounded bg-destructive py-2 text-sm font-medium text-background disabled:opacity-50"
              >
                {pending ? 'Deleting...' : 'Yes, delete'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 rounded border py-2 text-sm font-medium text-muted-foreground"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
