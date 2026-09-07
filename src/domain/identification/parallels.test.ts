import { describe, it, expect } from 'vitest';
import { resolveParallel, checkVariation } from './parallels';
import type { CardExtraction, Parallel } from '../../providers/types';

// --- Test helpers ---

function makeExtraction(overrides: Partial<CardExtraction> = {}): CardExtraction {
  return {
    kind: 'raw',
    players: [{ name: 'Justin Herbert', confidence: 0.99, evidence: 'front' }],
    team: { value: 'LAC', confidence: 0.9 },
    position: { value: 'QB', confidence: 0.9 },
    set_year: { value: 2020, confidence: 0.95 },
    copyright_year: { value: null, confidence: 0 },
    manufacturer: { value: 'Panini', confidence: 0.9 },
    set_name: { value: 'Prizm', confidence: 0.95 },
    subset_or_insert: { value: null, confidence: 0 },
    card_number: { value: '325', confidence: 0.99 },
    rookie_logo_printed: { value: true, confidence: 0.95 },
    autograph: {
      present: false,
      type: null,
      certification: 'none_visible',
      confidence: 0.95,
    },
    memorabilia: { value: false, confidence: 0.95 },
    serial: {
      printed: null,
      number: null,
      print_run: null,
      readable: 'none_visible',
      confidence: 0,
    },
    finish: {
      base_color: null,
      border_color: null,
      pattern: 'none',
      refractor_sheen_visible: 'no',
      parallel_name_printed: null,
      description: 'standard base card',
    },
    slab: null,
    photo_quality: {
      glare: 'none',
      blur: 'none',
      card_fully_in_frame: true,
      suggest_retake: [],
    },
    front_text: [],
    back_text: [],
    ...overrides,
  };
}

const BASE: Parallel = { id: 'base', name: 'Base', printRun: null, printRunKind: 'fixed' };
const SILVER: Parallel = { id: 'silver', name: 'Silver', printRun: null, printRunKind: 'fixed' };
const GOLD: Parallel = { id: 'gold-10', name: 'Gold', printRun: 10, printRunKind: 'fixed' };
const RED: Parallel = { id: 'red-299', name: 'Red', printRun: 299, printRunKind: 'fixed' };
const BLUE: Parallel = { id: 'blue-199', name: 'Blue', printRun: 199, printRunKind: 'fixed' };
const JERSEY_NUM: Parallel = {
  id: 'jersey-number',
  name: 'Jersey Number',
  printRun: null,
  printRunKind: 'variable',
};

describe('resolveParallel', () => {
  describe('serial-based resolution', () => {
    it('resolves to exactly one match on print run', () => {
      const extraction = makeExtraction({
        serial: {
          printed: '5/10',
          number: 5,
          print_run: 10,
          readable: 'yes',
          confidence: 0.99,
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER, GOLD, RED],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('gold-10');
      expect(result.flags).not.toContain('parallel_uncertain');
    });

    it('flags serial_mismatch when no parallels match print run', () => {
      const extraction = makeExtraction({
        serial: {
          printed: '5/50',
          number: 5,
          print_run: 50,
          readable: 'yes',
          confidence: 0.99,
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER, GOLD, RED],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      expect(result.flags).toContain('serial_mismatch');
    });

    it('includes variable print run parallels in candidates', () => {
      const extraction = makeExtraction({
        serial: {
          printed: '5/10',
          number: 5,
          print_run: 10,
          readable: 'yes',
          confidence: 0.99,
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, GOLD, JERSEY_NUM],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      // Both Gold /10 and Jersey Number match — should flag uncertain
      expect(result.flags).toContain('parallel_uncertain');
    });
  });

  describe('finish-based resolution', () => {
    it('resolves by printed parallel name', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'no',
          parallel_name_printed: 'Red',
          description: 'red parallel',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER, RED, BLUE],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('red-299');
    });

    it('resolves by color when no printed name', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: 'blue',
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'no',
          parallel_name_printed: null,
          description: 'blue card',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER, RED, BLUE],
        cardsightTopParallelId: 'blue-199',
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('blue-199');
    });
  });

  describe('base vs silver rule', () => {
    it('does not auto-resolve base vs silver from flat photo without agreement', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'cannot_tell',
          parallel_name_printed: null,
          description: 'standard card',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      expect(result.flags).toContain('parallel_uncertain');
    });

    it('resolves silver when CardSight + vision agree and no storage', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'yes',
          parallel_name_printed: null,
          description: 'refractor sheen visible',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER],
        cardsightTopParallelId: 'silver',
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('silver');
      expect(result.flags).not.toContain('parallel_uncertain');
    });

    it('does not resolve silver when card is in storage (tilt unreliable)', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'yes',
          parallel_name_printed: null,
          description: 'refractor sheen visible',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER],
        cardsightTopParallelId: 'silver',
        sessionStorage: 'top_loader',
      });
      expect(result.flags).toContain('parallel_uncertain');
    });

    it('resolves base when CardSight + vision agree (no refractor)', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'no',
          parallel_name_printed: null,
          description: 'no sheen',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER],
        cardsightTopParallelId: 'base',
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('base');
    });

    it('resolves when parallel name is printed even with base+silver present', () => {
      const extraction = makeExtraction({
        finish: {
          base_color: null,
          border_color: null,
          pattern: 'none',
          refractor_sheen_visible: 'no',
          parallel_name_printed: 'Silver Prizm',
          description: 'silver printed on card',
        },
      });
      const result = resolveParallel({
        extraction,
        catalogParallels: [BASE, SILVER],
        cardsightTopParallelId: null,
        sessionStorage: null,
      });
      expect(result.resolvedParallelId).toBe('silver');
    });
  });

  it('returns no_catalog_parallels flag when empty', () => {
    const result = resolveParallel({
      extraction: makeExtraction(),
      catalogParallels: [],
      cardsightTopParallelId: null,
      sessionStorage: null,
    });
    expect(result.flags).toContain('no_catalog_parallels');
  });
});

describe('checkVariation', () => {
  it('returns true when multiple cards share set+number+player', () => {
    const candidates = [
      { setName: 'Prizm', cardNumber: '325', playerName: 'Justin Herbert' },
      { setName: 'Prizm', cardNumber: '325', playerName: 'Justin Herbert' },
    ];
    expect(checkVariation(candidates)).toBe(true);
  });

  it('returns false when cards differ', () => {
    const candidates = [
      { setName: 'Prizm', cardNumber: '325', playerName: 'Justin Herbert' },
      { setName: 'Prizm', cardNumber: '326', playerName: 'Joe Burrow' },
    ];
    expect(checkVariation(candidates)).toBe(false);
  });

  it('returns false for single candidate', () => {
    expect(
      checkVariation([
        { setName: 'Prizm', cardNumber: '325', playerName: 'Justin Herbert' },
      ]),
    ).toBe(false);
  });
});
