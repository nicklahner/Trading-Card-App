import { describe, it, expect } from 'vitest';
import { CardExtractionSchema } from './schema';

// Deep-clone the fake data so mutations don't leak between tests.
// Dates aren't used here, so structuredClone / JSON round-trip is fine.
function rawExtraction() {
  return structuredClone({
    kind: 'raw',
    players: [
      { name: 'CJ Stroud', confidence: 0.98, evidence: 'Name printed on front: "C.J. STROUD"' },
    ],
    team: { value: 'Houston Texans', confidence: 0.95, evidence: 'Texans logo and jersey visible' },
    position: { value: 'QB', confidence: 0.90, evidence: 'Quarterback throwing stance' },
    set_year: { value: 2023, confidence: 0.95, evidence: 'Copyright 2023 on back' },
    copyright_year: { value: 2023, confidence: 0.97, evidence: '© 2023 Panini America' },
    manufacturer: { value: 'Panini', confidence: 0.99, evidence: 'Panini logo on back' },
    set_name: { value: 'Prizm', confidence: 0.97, evidence: '"PRIZM" logo on front' },
    subset_or_insert: { value: null, confidence: 0.90 },
    card_number: { value: '301', confidence: 0.98, evidence: '#301 on back' },
    rookie_logo_printed: { value: true, confidence: 0.95, evidence: 'RC logo in bottom corner' },
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
      description: 'Standard base card with no special finish or refractor pattern',
    },
    slab: null,
    photo_quality: {
      glare: 'none',
      blur: 'none',
      card_fully_in_frame: true,
      suggest_retake: [],
    },
    front_text: ['PRIZM', 'C.J. STROUD', 'TEXANS', 'QB'],
    back_text: ['301', 'CJ Stroud', 'Houston Texans', '© 2023 Panini America, Inc.'],
  });
}

function slabExtraction() {
  return structuredClone({
    kind: 'slab',
    players: [
      { name: 'CJ Stroud', confidence: 0.96, evidence: 'Label reads "C.J. Stroud"' },
    ],
    team: { value: 'Houston Texans', confidence: 0.85, evidence: 'Texans jersey visible through case' },
    position: { value: 'QB', confidence: 0.80 },
    set_year: { value: 2023, confidence: 0.97, evidence: 'Label reads "2023 Panini Prizm"' },
    copyright_year: { value: 2023, confidence: 0.70 },
    manufacturer: { value: 'Panini', confidence: 0.97, evidence: 'Label reads "Panini Prizm"' },
    set_name: { value: 'Prizm', confidence: 0.97, evidence: 'Label reads "2023 Panini Prizm"' },
    subset_or_insert: { value: null, confidence: 0.85 },
    card_number: { value: '301', confidence: 0.97, evidence: 'Label reads "#301"' },
    rookie_logo_printed: { value: true, confidence: 0.75, evidence: 'RC logo partially visible' },
    autograph: {
      present: false,
      type: null,
      certification: 'none_visible',
      confidence: 0.90,
    },
    memorabilia: { value: false, confidence: 0.90 },
    serial: {
      printed: null,
      number: null,
      print_run: null,
      readable: 'none_visible',
      confidence: 0.88,
    },
    finish: {
      base_color: 'silver',
      border_color: null,
      pattern: 'none',
      refractor_sheen_visible: 'cannot_tell',
      parallel_name_printed: null,
      description: 'Cannot determine finish through slab case',
    },
    slab: {
      grader: 'PSA',
      grade: 10,
      grade_label: 'GEM MT',
      auto_grade: null,
      cert_number: '12345678',
      subgrades: null,
      label_text: '2023 Panini Prizm CJ Stroud #301 GEM MT 10',
    },
    photo_quality: {
      glare: 'minor',
      blur: 'none',
      card_fully_in_frame: true,
      suggest_retake: [],
    },
    front_text: ['PSA', 'GEM MT 10', '2023 Panini Prizm', 'C.J. Stroud', '#301'],
    back_text: ['12345678', 'PSA'],
  });
}

describe('CardExtractionSchema', () => {
  it('accepts a valid raw extraction', () => {
    const result = CardExtractionSchema.safeParse(rawExtraction());
    expect(result.success).toBe(true);
  });

  it('accepts a valid slab extraction', () => {
    const result = CardExtractionSchema.safeParse(slabExtraction());
    expect(result.success).toBe(true);
  });

  it('rejects missing required field (kind)', () => {
    const data = rawExtraction();
    delete (data as Record<string, unknown>).kind;
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects confidence > 1', () => {
    const data = rawExtraction();
    data.team.confidence = 1.5;
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects confidence < 0', () => {
    const data = rawExtraction();
    data.players[0].confidence = -0.1;
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects invalid kind enum value', () => {
    const data = rawExtraction();
    (data as Record<string, unknown>).kind = 'graded';
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects unknown keys (strict mode)', () => {
    const data = rawExtraction();
    (data as Record<string, unknown>).surprise_field = 'nope';
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects invalid autograph certification value', () => {
    const data = rawExtraction();
    (data.autograph as Record<string, unknown>).certification = 'self_signed';
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });

  it('rejects invalid grader in slab', () => {
    const data = slabExtraction();
    (data.slab as Record<string, unknown>).grader = 'FAKE_GRADER';
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(false);
  });
});
