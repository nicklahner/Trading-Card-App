'use client';

import { useState, useTransition, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  createScanSession,
  createDraftItem,
  uploadPhoto,
  triggerIdentification,
  retryIdentification,
} from '@/app/(app)/actions';

// ---------------------------------------------------------------------------
// Client-side EXIF removal + resize
// ---------------------------------------------------------------------------

function processImageClientSide(file: File): Promise<Blob> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxDim = 2400;
      let { width, height } = img;
      if (width > height && width > maxDim) {
        height = (height * maxDim) / width;
        width = maxDim;
      } else if (height > maxDim) {
        width = (width * maxDim) / height;
        height = maxDim;
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')!.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => resolve(blob!), 'image/jpeg', 0.9);
    };
    img.src = URL.createObjectURL(file);
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardStatus = 'draft' | 'identifying' | 'needs_review' | 'failed';

interface ScannedCard {
  itemId: string;
  seq: number;
  frontUploaded: boolean;
  backUploaded: boolean;
  thumbnailUrl: string | null;
  status: CardStatus;
}

type ScanPhase =
  | { kind: 'setup' }
  | { kind: 'capture'; sessionId: string; label: string }
  | { kind: 'done'; sessionId: string; label: string };

// ---------------------------------------------------------------------------
// Setup form
// ---------------------------------------------------------------------------

function SetupForm({
  onStart,
}: {
  onStart: (sessionId: string, label: string) => void;
}) {
  const [label, setLabel] = useState('');
  const [storage, setStorage] = useState('unknown');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setLabelError(true);
      return;
    }
    setLabelError(false);
    setError(null);
    startTransition(async () => {
      try {
        const defaults = storage !== 'unknown' ? { storage } : undefined;
        const result = await createScanSession(label.trim(), defaults);
        onStart(result.sessionId, label.trim());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to create session');
      }
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-4 text-xl font-semibold">Scan Cards</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <label className="block">
          <span className="text-sm font-medium">Session label</span>
          <input
            type="text"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value);
              if (e.target.value.trim()) setLabelError(false);
            }}
            placeholder="e.g. Toploader box 1"
            data-testid="session-label-input"
            className={`mt-1 block w-full rounded border px-3 py-2 text-sm ${labelError ? 'border-destructive' : ''}`}
          />
          {labelError && (
            <p className="mt-1 text-xs text-destructive">Please enter a session label.</p>
          )}
        </label>
        <label className="block">
          <span className="text-sm font-medium">Default storage (optional)</span>
          <select
            value={storage}
            onChange={(e) => setStorage(e.target.value)}
            data-testid="session-storage-select"
            className="mt-1 block w-full rounded border px-3 py-2 text-sm"
          >
            <option value="unknown">No default</option>
            <option value="toploader">Toploader</option>
            <option value="penny_sleeve">Penny sleeve</option>
            <option value="binder">Binder</option>
            <option value="magnetic">Magnetic case</option>
            <option value="slab">Slab</option>
            <option value="none">None</option>
          </select>
        </label>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          data-testid="scan-start-button"
          className="w-full rounded bg-primary py-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {pending ? 'Starting...' : 'Start Scanning'}
        </button>
      </form>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Capture view
// ---------------------------------------------------------------------------

function CaptureView({
  sessionId,
  label,
  onDone,
}: {
  sessionId: string;
  label: string;
  onDone: () => void;
}) {
  const [cards, setCards] = useState<ScannedCard[]>([]);
  const [currentStep, setCurrentStep] = useState<'front' | 'back' | 'between'>('front');
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const frontInputRef = useRef<HTMLInputElement>(null);
  const backInputRef = useRef<HTMLInputElement>(null);

  // TODO: IndexedDB resilience — store captured photos in IndexedDB before upload
  // so they survive page refreshes or network failures. Re-upload on reconnect.

  const handleCapture = useCallback(
    async (side: 'front' | 'back', file: File) => {
      setError(null);
      setUploading(true);
      try {
        let itemId = currentItemId;

        // If capturing front, create a new draft item first
        if (side === 'front') {
          const result = await createDraftItem(sessionId);
          itemId = result.itemId;
          setCurrentItemId(itemId);
        }

        if (!itemId) {
          throw new Error('No active item');
        }

        // Process image client-side (resize + strip EXIF)
        const processed = await processImageClientSide(file);
        const formData = new FormData();
        formData.append('file', processed, `${side}.jpg`);
        await uploadPhoto(itemId, side, formData);

        // Build thumbnail URL for session tray
        const thumbUrl = `/api/photos/thumbnails/${itemId}/${side}.jpg`;

        if (side === 'front') {
          const seq = cards.length + 1;
          setCards((prev) => [
            ...prev,
            {
              itemId,
              seq,
              frontUploaded: true,
              backUploaded: false,
              thumbnailUrl: thumbUrl,
              status: 'draft' as CardStatus,
            },
          ]);
          setCurrentStep('back');
        } else {
          // Update the last card to mark back as uploaded and trigger identification
          setCards((prev) =>
            prev.map((c, i) =>
              i === prev.length - 1
                ? { ...c, backUploaded: true, status: 'identifying' as CardStatus }
                : c,
            ),
          );
          // Auto-trigger identification when back photo is uploaded
          triggerIdentification(itemId).catch(() => {
            setCards((prev) =>
              prev.map((c) =>
                c.itemId === itemId
                  ? { ...c, status: 'failed' as CardStatus }
                  : c,
              ),
            );
          });
          setCurrentStep('between');
        }
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [currentItemId, sessionId, cards.length],
  );

  function handleNextCard() {
    setCurrentItemId(null);
    setCurrentStep('front');
  }

  function handleSkipBack() {
    // Trigger identification with front-only photo
    if (currentItemId) {
      setCards((prev) =>
        prev.map((c) =>
          c.itemId === currentItemId
            ? { ...c, status: 'identifying' as CardStatus }
            : c,
        ),
      );
      triggerIdentification(currentItemId).catch(() => {
        setCards((prev) =>
          prev.map((c) =>
            c.itemId === currentItemId
              ? { ...c, status: 'failed' as CardStatus }
              : c,
          ),
        );
      });
    }
    setCurrentStep('between');
  }

  function handleRetry(itemId: string) {
    setCards((prev) =>
      prev.map((c) =>
        c.itemId === itemId
          ? { ...c, status: 'identifying' as CardStatus }
          : c,
      ),
    );
    retryIdentification(itemId).catch(() => {
      setCards((prev) =>
        prev.map((c) =>
          c.itemId === itemId
            ? { ...c, status: 'failed' as CardStatus }
            : c,
        ),
      );
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{label}</h1>
        <span className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">
          {cards.length} scanned
        </span>
      </div>

      {error && (
        <p className="mb-4 rounded bg-destructive/10 p-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Capture area */}
      <div className="mb-6 flex flex-col items-center gap-4 rounded-lg border-2 border-dashed p-8">
        {uploading ? (
          <div className="text-center">
            <div className="mb-2 text-2xl">...</div>
            <p className="text-sm text-muted-foreground">Uploading...</p>
          </div>
        ) : currentStep === 'front' ? (
          <>
            <button
              type="button"
              onClick={() => frontInputRef.current?.click()}
              data-testid="capture-front-button"
              className="rounded-lg bg-primary px-8 py-6 text-lg font-medium text-primary-foreground"
            >
              Front
            </button>
            <p className="text-xs text-ct-text-subtle">
              Capture the front of the card
            </p>
            <input
              ref={frontInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCapture('front', file);
                // Reset so the same file can be re-selected
                e.target.value = '';
              }}
            />
          </>
        ) : currentStep === 'back' ? (
          <>
            <button
              type="button"
              onClick={() => backInputRef.current?.click()}
              data-testid="capture-back-button"
              className="rounded-lg bg-primary px-8 py-6 text-lg font-medium text-primary-foreground"
            >
              Back
            </button>
            <p className="text-xs text-ct-text-subtle">
              Capture the back of the card
            </p>
            <button
              type="button"
              onClick={handleSkipBack}
              className="text-sm text-muted-foreground underline"
            >
              No back photo
            </button>
            <input
              ref={backInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleCapture('back', file);
                e.target.value = '';
              }}
            />
          </>
        ) : (
          /* between cards */
          <>
            <div className="text-center">
              <p className="mb-1 text-sm font-medium text-ct-positive">
                Card #{cards.length} captured
              </p>
              <p className="text-xs text-ct-text-subtle">
                {cards[cards.length - 1]?.backUploaded
                  ? 'Front + Back'
                  : 'Front only'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleNextCard}
              className="rounded-lg bg-primary px-8 py-4 text-sm font-medium text-primary-foreground"
            >
              Next card
            </button>
          </>
        )}
      </div>

      {/* Session tray */}
      {cards.length > 0 && (
        <section className="mb-6">
          <h2 className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
            Session tray
          </h2>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {cards.map((card) => (
              <div
                key={card.itemId}
                className="flex flex-col items-center"
              >
                {card.thumbnailUrl ? (
                  <img
                    src={card.thumbnailUrl}
                    alt={`Card ${card.seq}`}
                    className="h-16 w-12 rounded border object-cover"
                  />
                ) : (
                  <div className="flex h-16 w-12 items-center justify-center rounded border bg-muted text-xs text-ct-text-subtle">
                    ?
                  </div>
                )}
                <span className="mt-0.5 text-xs text-ct-text-subtle">
                  #{card.seq}
                </span>
                {/* Status chip */}
                <span
                  className={`mt-0.5 rounded px-1 text-[10px] font-medium ${
                    card.status === 'draft'
                      ? 'bg-muted text-muted-foreground'
                      : card.status === 'identifying'
                        ? 'bg-ct-info/20 text-primary'
                        : card.status === 'needs_review'
                          ? 'bg-ct-caution/20 text-ct-caution'
                          : 'bg-destructive/10 text-destructive'
                  }`}
                >
                  {card.status === 'draft'
                    ? 'draft'
                    : card.status === 'identifying'
                      ? 'ID...'
                      : card.status === 'needs_review'
                        ? 'review'
                        : 'failed'}
                </span>
                {card.status === 'failed' && (
                  <button
                    type="button"
                    onClick={() => handleRetry(card.itemId)}
                    className="mt-0.5 text-[10px] text-primary underline"
                  >
                    retry
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Done button */}
      <button
        type="button"
        onClick={onDone}
        className="w-full rounded border border-border py-3 text-sm font-medium text-muted-foreground"
      >
        Done
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function ScanPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<ScanPhase>({ kind: 'setup' });

  if (phase.kind === 'setup') {
    return (
      <SetupForm
        onStart={(sessionId, label) =>
          setPhase({ kind: 'capture', sessionId, label })
        }
      />
    );
  }

  if (phase.kind === 'capture') {
    return (
      <CaptureView
        sessionId={phase.sessionId}
        label={phase.label}
        onDone={() =>
          setPhase({ kind: 'done', sessionId: phase.sessionId, label: phase.label })
        }
      />
    );
  }

  // Done phase
  return (
    <div className="mx-auto max-w-lg py-12 text-center">
      <h1 className="mb-2 text-xl font-semibold">Session complete</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        &ldquo;{phase.label}&rdquo; session ended. Cards will appear in your
        collection once identification is complete.
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={() => setPhase({ kind: 'setup' })}
          className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground"
        >
          New session
        </button>
        <button
          type="button"
          onClick={() => router.push('/collection')}
          className="rounded border px-4 py-2 text-sm text-muted-foreground"
        >
          View collection
        </button>
      </div>
    </div>
  );
}
