export type ItemStatus = 'draft' | 'identifying' | 'needs_review' | 'owned' | 'sold' | 'removed';

const VALID_TRANSITIONS: Record<ItemStatus, ItemStatus[]> = {
  draft: ['identifying', 'needs_review'], // needs_review for manual add
  identifying: ['needs_review'],
  needs_review: ['owned'],
  owned: ['sold', 'removed'],
  sold: [],
  removed: [],
};

export function canTransition(from: ItemStatus, to: ItemStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export function canHardDelete(status: ItemStatus): boolean {
  return status === 'draft' || status === 'needs_review';
}
