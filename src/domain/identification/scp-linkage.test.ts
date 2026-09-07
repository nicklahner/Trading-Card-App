import { describe, it, expect } from 'vitest';
import { scoreSCPCandidate } from './scp-linkage';
import type { CardExtraction, CatalogCard } from '../../providers/types';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Build a minimal CardExtraction for testing. Override any fields as needed. */
function makeExtraction(overrides: Partial<CardExtraction> = {}): CardExtraction {
  return {
    kind: 'raw',
    players: [{ name: 'CJ Stroud', confidence: 0.98, evidence: 'Name on front' }],
    team: { value: 'Houston Texans', confidence: 0.95 },
    position: { value: 'QB', confidence: 0.9 },
    set_year: { value: 2023, confidence: 0.95 },
    copyright_year: { value: 2023, confidence: 0.97 },
    manufacturer: { value: 'Panini', confidence: 0.99 },
    set_name: { value: 'Prizm', confidence: 0.97 },
    subset_or_insert: { value: null, confidence: 0.9 },
    card_number: { value: '301', confidence: 0.98 },
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
      confidence: 0.92,
    },
    finish: {
      base_color: 'silver',
      border_color: null,
      pattern: 'none',
      refractor_sheen_visible: 'no',
      parallel_name_printed: null,
      description: 'Standard base card',
    },
    slab: null,
    photo_quality: {
      glare: 'none',
      blur: 'none',
      card_fully_in_frame: true,
      suggest_retake: [],
    },
    front_text: ['PRIZM', 'C.J. STROUD'],
    back_text: ['301', 'CJ Stroud'],
    ...overrides,
  };
}

/** Build a minimal CatalogCard for SCP product matching. */
function makeProduct(overrides: Partial<CatalogCard> = {}): CatalogCard {
  return {
    provider: 'sportscardspro',
    cardId: 'scp-123',
    playerName: 'CJ Stroud',
    year: 2023,
    setName: 'Prizm',
    subsetOrInsert: null,
    cardNumber: '301',
    isRookie: true,
    isAutograph: false,
    isMemorabilia: false,
    parallels: [],
    setRef: { provider: 'sportscardspro', id: 'set-prizm-2023' },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('scoreSCPCandidate', () => {
  it('returns a high score for a correct SCP match', () => {
    const extraction = makeExtraction();
    const product = makeProduct();
    const { score, rejects } = scoreSCPCandidate(extraction, product, null);

    expect(rejects).toHaveLength(0);
    expect(score).toBeGreaterThan(0.8);
  });

  it('rejects when bracketed parallel does not match resolved parallel', () => {
    const extraction = makeExtraction();
    const product = makeProduct({
      setName: 'Prizm [Silver]',
      parallels: [
        { id: 'silver-1', name: 'Silver', printRun: null, printRunKind: 'fixed' },
      ],
    });

    const { rejects } = scoreSCPCandidate(extraction, product, 'base');

    expect(rejects.length).toBeGreaterThan(0);
    expect(rejects.some((r) => r.includes('parallel_mismatch') || r.includes('bracketed_parallel_mismatch'))).toBe(true);
  });

  it('rejects color root when it does not match a longer name (red vs red wave)', () => {
    const extraction = makeExtraction();
    const product = makeProduct({
      setName: 'Prizm [Red Wave]',
    });

    // Resolved parallel is 'red' but product says 'Red Wave'
    const { rejects } = scoreSCPCandidate(extraction, product, 'Red');

    expect(rejects.length).toBeGreaterThan(0);
    expect(rejects.some((r) => r.includes('bracketed_parallel_mismatch'))).toBe(true);
  });

  it('rejects when print run in product name mismatches extraction', () => {
    const extraction = makeExtraction({
      serial: {
        printed: '05/10',
        number: 5,
        print_run: 10,
        readable: 'yes',
        confidence: 0.95,
      },
    });
    const product = makeProduct({
      setName: 'Prizm Gold /25',
    });

    const { rejects } = scoreSCPCandidate(extraction, product, 'Gold');

    expect(rejects.length).toBeGreaterThan(0);
    expect(rejects.some((r) => r.includes('print_run_mismatch'))).toBe(true);
  });

  it('does not reject when missing parallel info', () => {
    const extraction = makeExtraction();
    const product = makeProduct({
      parallels: [],
    });

    // resolvedParallel is null — should not trigger parallel rejection
    const { score, rejects } = scoreSCPCandidate(extraction, product, null);

    expect(rejects).toHaveLength(0);
    expect(score).toBeGreaterThan(0);
  });

  it('accepts when resolved parallel matches bracketed parallel exactly', () => {
    const extraction = makeExtraction();
    const product = makeProduct({
      setName: 'Prizm [Silver]',
      parallels: [
        { id: 'silver-1', name: 'Silver', printRun: null, printRunKind: 'fixed' },
      ],
    });

    const { rejects } = scoreSCPCandidate(extraction, product, 'Silver');

    expect(rejects).toHaveLength(0);
  });

  it('accepts when print run in name matches extraction', () => {
    const extraction = makeExtraction({
      serial: {
        printed: '05/10',
        number: 5,
        print_run: 10,
        readable: 'yes',
        confidence: 0.95,
      },
    });
    const product = makeProduct({
      setName: 'Prizm Gold /10',
    });

    const { rejects } = scoreSCPCandidate(extraction, product, 'Gold');

    // No print_run_mismatch reject
    expect(rejects.filter((r) => r.includes('print_run_mismatch'))).toHaveLength(0);
  });
});
