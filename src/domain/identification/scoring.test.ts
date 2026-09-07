import { describe, it, expect } from 'vitest';
import { scoreCandidate, jaroWinkler } from './scoring';
import type { CardExtraction, IdentifyCandidate } from '../../providers/types';

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
    front_text: ['Justin Herbert', 'Prizm', '325'],
    back_text: ['2020 Panini'],
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<IdentifyCandidate> = {}): IdentifyCandidate {
  return {
    provider: 'cardsight',
    cardId: 'cs-123',
    parallelId: null,
    confidence: 0.95,
    playerName: 'Justin Herbert',
    year: 2020,
    setName: 'Prizm',
    subsetOrInsert: null,
    cardNumber: '325',
    parallelName: null,
    isRookie: true,
    ...overrides,
  };
}

// --- Tests ---

describe('jaroWinkler', () => {
  it('returns 1 for identical strings', () => {
    expect(jaroWinkler('Justin Herbert', 'Justin Herbert')).toBe(1);
  });

  it('returns high score for similar strings', () => {
    expect(jaroWinkler('Justin Herbert', 'Justin Hebert')).toBeGreaterThan(0.9);
  });

  it('returns low score for different strings', () => {
    expect(jaroWinkler('Justin Herbert', 'Joe Burrow')).toBeLessThan(0.7);
  });

  it('handles empty strings', () => {
    expect(jaroWinkler('', 'test')).toBe(0);
    expect(jaroWinkler('test', '')).toBe(0);
  });
});

describe('scoreCandidate', () => {
  it('scores a full match highly', () => {
    const extraction = makeExtraction();
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight');
    expect(result.score).toBeGreaterThan(0.9);
    expect(result.rejects).toHaveLength(0);
  });

  it('scores a partial match with wrong year lower', () => {
    const extraction = makeExtraction();
    const candidate = makeCandidate({ year: 2021 });
    const fullMatch = scoreCandidate(extraction, makeCandidate(), 0, 'cardsight');
    const partialMatch = scoreCandidate(extraction, candidate, 0, 'cardsight');
    expect(partialMatch.score).toBeLessThan(fullMatch.score);
  });

  it('scores a partial match with wrong card number lower', () => {
    const extraction = makeExtraction();
    const candidate = makeCandidate({ cardNumber: '999' });
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight');
    expect(result.score).toBeLessThan(0.9);
  });

  it('hard rejects on serial mismatch', () => {
    const extraction = makeExtraction({
      serial: {
        printed: '5/10',
        number: 5,
        print_run: 10,
        readable: 'yes',
        confidence: 0.99,
      },
    });
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight', {
      catalogPrintRun: 25,
      catalogPrintRunKind: 'fixed',
    });
    expect(result.score).toBe(0);
    expect(result.rejects).toHaveLength(1);
    expect(result.rejects[0]).toContain('serial_mismatch');
  });

  it('does not reject serial when print run kind is variable', () => {
    const extraction = makeExtraction({
      serial: {
        printed: '5/10',
        number: 5,
        print_run: 10,
        readable: 'yes',
        confidence: 0.99,
      },
    });
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight', {
      catalogPrintRun: 25,
      catalogPrintRunKind: 'variable',
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.rejects).toHaveLength(0);
  });

  it('hard rejects on auto disagree with manufacturer_certified', () => {
    const extraction = makeExtraction({
      autograph: {
        present: true,
        type: 'on_card',
        certification: 'manufacturer_certified',
        confidence: 0.95,
      },
    });
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight', {
      catalogIsAuto: false,
    });
    expect(result.score).toBe(0);
    expect(result.rejects.some((r) => r.includes('auto_disagree'))).toBe(true);
  });

  it('does not reject auto when confidence is low', () => {
    const extraction = makeExtraction({
      autograph: {
        present: true,
        type: 'on_card',
        certification: 'manufacturer_certified',
        confidence: 0.5,
      },
    });
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight', {
      catalogIsAuto: false,
    });
    expect(result.score).toBeGreaterThan(0);
  });

  it('hard rejects on memorabilia disagree', () => {
    const extraction = makeExtraction({
      memorabilia: { value: true, confidence: 0.95 },
    });
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight', {
      catalogIsMemo: false,
    });
    expect(result.score).toBe(0);
    expect(result.rejects.some((r) => r.includes('memo_disagree'))).toBe(true);
  });

  it('renormalizes weights when fields are missing', () => {
    const extraction = makeExtraction({
      set_year: { value: null, confidence: 0 },
      set_name: { value: null, confidence: 0 },
      card_number: { value: null, confidence: 0 },
      subset_or_insert: { value: null, confidence: 0 },
    });
    const candidate = makeCandidate();
    // Only player + cardsight_rank should contribute
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight');
    expect(result.score).toBeGreaterThan(0);
    expect(result.reasons.length).toBeLessThan(6);
  });

  it('sportscardspro mode omits cardsight_rank', () => {
    const extraction = makeExtraction();
    const candidate = makeCandidate();
    const result = scoreCandidate(extraction, candidate, 0, 'sportscardspro');
    expect(result.reasons.every((r) => !r.startsWith('cardsight_rank'))).toBe(
      true,
    );
  });

  it('distinguishes Prizm from Prizm Draft Picks in set scoring', () => {
    const extraction = makeExtraction({
      set_name: { value: 'Prizm Draft Picks', confidence: 0.95 },
    });
    const candidate = makeCandidate({ setName: 'Prizm' });
    const result = scoreCandidate(extraction, candidate, 0, 'cardsight');
    // Should score low on set due to distinguishing token 'draft picks'
    const setReason = result.reasons.find((r) => r.startsWith('set='));
    expect(setReason).toBeDefined();
    const setScore = parseFloat(setReason!.split('=')[1]);
    expect(setScore).toBeLessThan(0.5);
  });
});
