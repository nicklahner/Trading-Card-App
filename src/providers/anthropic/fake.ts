/**
 * Fake Claude Vision extractor for tests and local dev.
 * Returns a hardcoded extraction matching a 2023 Prizm CJ Stroud RC.
 */

import type { TextExtractor } from '../interfaces';
import type { ImageRef, CardExtraction } from '../types';

export class FakeClaudeVisionExtractor implements TextExtractor {
  async extract(
    _images: ImageRef[],
    kind: 'raw' | 'slab',
  ): Promise<CardExtraction> {
    if (kind === 'slab') {
      return FAKE_SLAB_EXTRACTION;
    }
    return FAKE_RAW_EXTRACTION;
  }
}

const FAKE_RAW_EXTRACTION: CardExtraction = {
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
};

const FAKE_SLAB_EXTRACTION: CardExtraction = {
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
};
