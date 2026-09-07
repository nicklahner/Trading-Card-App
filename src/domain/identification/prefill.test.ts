import { describe, it, expect } from 'vitest';
import { computePrefill, PREFILL_CONFIDENCE_FLOOR, type PrefillCandidate, type PrefillExtraction } from './prefill';

const EXTRACTION: PrefillExtraction = {
  playerName: 'Brian Thomas Jr.',
  year: 2026,
  setName: null,
  subset: null,
  cardNumber: 'TP-2',
  parallelName: null,
  isRookie: false,
  printRun: null,
  isAuto: false,
  isMemorabilia: false,
  serialNumber: null,
};

const HIGH_CANDIDATE: PrefillCandidate = {
  playerName: 'Brian Thomas Jr.',
  year: 2026,
  setName: '2026 Topps Flagship',
  subsetOrInsert: 'Pro Files',
  cardNumber: 'TP-2',
  parallelName: null,
  isRookie: false,
  score: 0.92,
};

const LOW_CANDIDATE: PrefillCandidate = {
  playerName: 'Bruce Matthews',
  year: 1994,
  setName: '1994 Topps',
  subsetOrInsert: null,
  cardNumber: '#85',
  parallelName: null,
  isRookie: false,
  score: 0.25,
};

const MEDIUM_CANDIDATE: PrefillCandidate = {
  playerName: 'Brian Thomas Jr.',
  year: 2026,
  setName: '2026 Topps',
  subsetOrInsert: null,
  cardNumber: 'TP-2',
  parallelName: null,
  isRookie: false,
  score: 0.78, // Just below floor
};

describe('computePrefill', () => {
  it('pre-fills from candidate when score >= floor', () => {
    const result = computePrefill([HIGH_CANDIDATE], EXTRACTION, null);
    expect(result.source).toBe('candidate');
    expect(result.suggestion).toBeNull();
    expect(result.fields.playerName).toBe('Brian Thomas Jr.');
    expect(result.fields.setName).toBe('2026 Topps Flagship');
    expect(result.fields.subset).toBe('Pro Files');
  });

  it('pre-fills from extraction when candidate score < floor', () => {
    const result = computePrefill([LOW_CANDIDATE], EXTRACTION, null);
    expect(result.source).toBe('extraction');
    expect(result.fields.playerName).toBe('Brian Thomas Jr.'); // from extraction, not Bruce Matthews
    expect(result.fields.year).toBe('2026'); // from extraction, not 1994
    expect(result.fields.cardNumber).toBe('TP-2'); // from extraction, not #85
  });

  it('shows low-scoring candidate as tappable suggestion', () => {
    const result = computePrefill([LOW_CANDIDATE], EXTRACTION, null);
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion!.playerName).toBe('Bruce Matthews');
    expect(result.suggestion!.score).toBe(0.25);
  });

  it('pre-fills from extraction when no candidates', () => {
    const result = computePrefill([], EXTRACTION, null);
    expect(result.source).toBe('extraction');
    expect(result.suggestion).toBeNull();
    expect(result.fields.playerName).toBe('Brian Thomas Jr.');
    expect(result.fields.year).toBe('2026');
    expect(result.fields.cardNumber).toBe('TP-2');
  });

  it('returns empty source when no candidates and no extraction', () => {
    const result = computePrefill([], null, null);
    expect(result.source).toBe('empty');
    expect(result.fields.playerName).toBe('');
    expect(result.fields.year).toBe('');
  });

  it('uses session set name when extraction has no set name', () => {
    const result = computePrefill([], EXTRACTION, '2026 Topps Flagship Football');
    expect(result.fields.setName).toBe('2026 Topps Flagship Football');
  });

  it('extraction set name wins over session set name', () => {
    const extWithSet = { ...EXTRACTION, setName: 'Pro Files' };
    const result = computePrefill([], extWithSet, '2026 Topps Flagship Football');
    expect(result.fields.setName).toBe('Pro Files');
  });

  it('candidate at exactly the floor is pre-filled', () => {
    const atFloor = { ...HIGH_CANDIDATE, score: PREFILL_CONFIDENCE_FLOOR };
    const result = computePrefill([atFloor], EXTRACTION, null);
    expect(result.source).toBe('candidate');
  });

  it('candidate just below floor is a suggestion', () => {
    const result = computePrefill([MEDIUM_CANDIDATE], EXTRACTION, null);
    expect(result.source).toBe('extraction');
    expect(result.suggestion).not.toBeNull();
    expect(result.suggestion!.score).toBe(0.78);
  });

  it('carries extraction auto/memo/serial even when pre-filling from candidate', () => {
    const extWithDetails = {
      ...EXTRACTION,
      isAuto: true,
      serialNumber: 42,
      printRun: 99,
    };
    const result = computePrefill([HIGH_CANDIDATE], extWithDetails, null);
    expect(result.source).toBe('candidate');
    expect(result.fields.isAuto).toBe(true);
    expect(result.fields.serialNumber).toBe('42');
    expect(result.fields.printRun).toBe('99');
  });

  it('multiple candidates: only the top one matters', () => {
    const result = computePrefill([LOW_CANDIDATE, HIGH_CANDIDATE], EXTRACTION, null);
    // Top is LOW_CANDIDATE (first in array), so pre-fill from extraction
    expect(result.source).toBe('extraction');
    expect(result.suggestion!.playerName).toBe('Bruce Matthews');
  });
});
