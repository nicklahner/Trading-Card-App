'use client';

import { useState, useTransition, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  uploadPhoto,
  markSold,
  removeItem,
  deleteItem,
} from '@/app/(app)/actions';

// ---------------------------------------------------------------------------
// Dollar string -> integer cents
// ---------------------------------------------------------------------------

function dollarsToCents(val: string): number {
  if (!val.trim()) return 0;
  const n = parseFloat(val);
  if (isNaN(n)) return 0;
  return Math.round(n * 100);
}

// ---------------------------------------------------------------------------
// Actions panel
// ---------------------------------------------------------------------------

export function CardDetailActions({
  itemId,
  status,
  isDraftOrReview,
}: {
  itemId: string;
  status: string;
  isDraftOrReview: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Expandable sections
  const [showPhotos, setShowPhotos] = useState(false);
  const [showSold, setShowSold] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Photo upload state
  const [uploading, setUploading] = useState<string | null>(null);
  const frontRef = useRef<HTMLInputElement>(null);
  const backRef = useRef<HTMLInputElement>(null);

  // Sold form state
  const [soldDate, setSoldDate] = useState('');
  const [soldPrice, setSoldPrice] = useState('');
  const [soldFees, setSoldFees] = useState('');
  const [soldShipping, setSoldShipping] = useState('');

  async function handlePhotoUpload(
    side: 'front' | 'back',
    file: File,
  ) {
    setError(null);
    setUploading(side);
    try {
      const formData = new FormData();
      formData.append('file', file);
      await uploadPhoto(itemId, side, formData);
      router.refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Photo upload failed');
    } finally {
      setUploading(null);
    }
  }

  function handleMarkSold(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await markSold(itemId, {
          soldOn: soldDate,
          soldPriceCents: dollarsToCents(soldPrice),
          soldFeesCents: dollarsToCents(soldFees),
          soldShippingCents: dollarsToCents(soldShipping),
        });
        router.refresh();
        setShowSold(false);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to mark as sold');
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      try {
        await removeItem(itemId);
        router.push('/collection');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to remove item');
      }
    });
  }

  function handleDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deleteItem(itemId);
        router.push('/collection');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to delete item');
      }
    });
  }

  return (
    <section className="space-y-3 pb-8">
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      {/* Edit button */}
      <button
        type="button"
        onClick={() => router.push(`/collection/${itemId}/edit`)}
        className="w-full rounded border border-blue-600 py-2.5 text-sm font-medium text-blue-600"
      >
        Edit
      </button>

      {/* Add photos (expandable) */}
      <div className="rounded border">
        <button
          type="button"
          onClick={() => setShowPhotos(!showPhotos)}
          className="flex w-full items-center justify-between p-3 text-sm font-medium"
        >
          Add photos
          <span className="text-gray-400">{showPhotos ? '\u2212' : '+'}</span>
        </button>
        {showPhotos && (
          <div className="border-t p-3 space-y-3">
            {/* Front photo */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Front
              </label>
              <input
                ref={frontRef}
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload('front', file);
                }}
              />
              {uploading === 'front' && (
                <p className="mt-1 text-xs text-gray-400">Uploading...</p>
              )}
            </div>
            {/* Back photo */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">
                Back
              </label>
              <input
                ref={backRef}
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload('back', file);
                }}
              />
              {uploading === 'back' && (
                <p className="mt-1 text-xs text-gray-400">Uploading...</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mark as sold (expandable) — only for owned items */}
      {status === 'owned' && (
        <div className="rounded border">
          <button
            type="button"
            onClick={() => setShowSold(!showSold)}
            className="flex w-full items-center justify-between p-3 text-sm font-medium"
          >
            Mark as sold
            <span className="text-gray-400">{showSold ? '\u2212' : '+'}</span>
          </button>
          {showSold && (
            <form onSubmit={handleMarkSold} className="border-t p-3 space-y-3">
              <label className="block">
                <span className="text-xs font-medium text-gray-500">
                  Sold date
                </span>
                <input
                  type="date"
                  value={soldDate}
                  onChange={(e) => setSoldDate(e.target.value)}
                  required
                  className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-500">
                  Sold price ($)
                </span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={soldPrice}
                  onChange={(e) => setSoldPrice(e.target.value)}
                  required
                  className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">
                    Fees ($)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={soldFees}
                    onChange={(e) => setSoldFees(e.target.value)}
                    className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-xs font-medium text-gray-500">
                    Shipping ($)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={soldShipping}
                    onChange={(e) => setSoldShipping(e.target.value)}
                    className="mt-1 block w-full rounded border px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <button
                type="submit"
                disabled={pending}
                className="w-full rounded bg-green-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {pending ? 'Saving...' : 'Confirm sale'}
              </button>
            </form>
          )}
        </div>
      )}

      {/* Remove */}
      {status === 'owned' && (
        <div>
          {!showRemoveConfirm ? (
            <button
              type="button"
              onClick={() => setShowRemoveConfirm(true)}
              className="w-full rounded border border-red-300 py-2.5 text-sm font-medium text-red-600"
            >
              Remove
            </button>
          ) : (
            <div className="rounded border border-red-300 p-3 space-y-2">
              <p className="text-sm text-gray-600">
                Remove this card from your collection? This can be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={pending}
                  className="flex-1 rounded bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pending ? 'Removing...' : 'Yes, remove'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRemoveConfirm(false)}
                  className="flex-1 rounded border py-2 text-sm font-medium text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Delete (draft/needs_review only) */}
      {isDraftOrReview && (
        <div>
          {!showDeleteConfirm ? (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full rounded bg-red-600 py-2.5 text-sm font-medium text-white"
            >
              Delete
            </button>
          ) : (
            <div className="rounded border border-red-300 p-3 space-y-2">
              <p className="text-sm text-gray-600">
                Permanently delete this draft? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pending}
                  className="flex-1 rounded bg-red-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {pending ? 'Deleting...' : 'Yes, delete'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded border py-2 text-sm font-medium text-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
