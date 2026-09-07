import { describe, it, expect } from 'vitest';
import { canTransition, canHardDelete, type ItemStatus } from './status';

const ALL_STATUSES: ItemStatus[] = ['draft', 'identifying', 'needs_review', 'owned', 'sold', 'removed'];

describe('canTransition', () => {
  // Valid transitions
  const validCases: [ItemStatus, ItemStatus][] = [
    ['draft', 'identifying'],
    ['draft', 'needs_review'],
    ['identifying', 'needs_review'],
    ['needs_review', 'owned'],
    ['owned', 'sold'],
    ['owned', 'removed'],
  ];

  it.each(validCases)('%s → %s returns true', (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  // Build invalid transitions: all pairs that are NOT in validCases
  const invalidCases: [ItemStatus, ItemStatus][] = [];
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const isValid = validCases.some(([f, t]) => f === from && t === to);
      if (!isValid) {
        invalidCases.push([from, to]);
      }
    }
  }

  it.each(invalidCases)('%s → %s returns false', (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });
});

describe('canHardDelete', () => {
  it.each<[ItemStatus, boolean]>([
    ['draft', true],
    ['identifying', false],
    ['needs_review', true],
    ['owned', false],
    ['sold', false],
    ['removed', false],
  ])('canHardDelete(%s) returns %s', (status, expected) => {
    expect(canHardDelete(status)).toBe(expected);
  });
});
