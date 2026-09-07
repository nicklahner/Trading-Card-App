import { describe, it, expect } from 'vitest';
import { buildIdentityKey, type CardIdentity } from './types';

const baseCard: CardIdentity = {
  year: 2020,
  manufacturer: 'Panini',
  setName: 'Prizm',
  subset: null,
  cardNumber: '325',
  players: [{ name: 'Justin Herbert', team: 'LAC', position: 'QB' }],
  parallel: null,
  printRun: null,
  isAuto: false,
  autoType: null,
  isMemorabilia: false,
  isRookie: true,
  variation: null,
  licensed: 'nflpa_only',
};

describe('buildIdentityKey', () => {
  it('produces a stable key for a base card', () => {
    const key = buildIdentityKey(baseCard);
    expect(key).toBe('2020|panini|prizm||325|justin-herbert|||0|0|');
    expect(buildIdentityKey(baseCard)).toBe(key);
  });

  it('distinguishes parallels', () => {
    const silver = { ...baseCard, parallel: 'Silver' };
    expect(buildIdentityKey(silver)).not.toBe(buildIdentityKey(baseCard));
    expect(buildIdentityKey(silver)).toContain('silver');
  });

  it('distinguishes auto vs non-auto', () => {
    const auto = { ...baseCard, isAuto: true, autoType: 'on_card' as const };
    expect(buildIdentityKey(auto)).not.toBe(buildIdentityKey(baseCard));
  });

  it('includes print run', () => {
    const numbered = { ...baseCard, parallel: 'Gold', printRun: 10 };
    const key = buildIdentityKey(numbered);
    expect(key).toContain('10');
  });

  it('handles multi-player cards deterministically', () => {
    const dual = {
      ...baseCard,
      players: [
        { name: 'Justin Herbert', team: 'LAC', position: 'QB' },
        { name: 'Joe Burrow', team: 'CIN', position: 'QB' },
      ],
    };
    const reversed = {
      ...dual,
      players: [...dual.players].reverse(),
    };
    expect(buildIdentityKey(dual)).toBe(buildIdentityKey(reversed));
  });
});
