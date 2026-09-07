import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CardExtractionSchema } from './schema';
import { validateExtractionPlausibility } from './validate';

const FIXTURE_PATH = resolve(
  __dirname,
  '../../../fixtures/extractions/regression-card15-upside-down.json',
);

function loadFixture() {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));
}

/** Mimics the hallucinated extraction the model previously produced. */
function hallucinatedExtraction() {
  const base = loadFixture();
  return {
    ...base,
    players: [
      {
        name: 'Emmitt Smith',
        confidence: 0.95,
        evidence: 'Name visible on front',
      },
    ],
    set_year: { value: 1996, confidence: 0.90, evidence: '1996 printed on front' },
    copyright_year: { value: 2026, confidence: 0.85, evidence: '© 2026 The Topps Company, Inc.' },
    photo_quality: {
      ...base.photo_quality,
      suggest_retake: ['image_may_be_rotated'],
    },
  };
}

describe('Card 15 regression — upside-down front anti-fabrication', () => {
  it('fixture passes the CardExtractionSchema', () => {
    const data = loadFixture();
    const result = CardExtractionSchema.safeParse(data);
    expect(result.success).toBe(true);
  });

  it('fixture does NOT contain fabricated player names', () => {
    const data = loadFixture();
    const fabricatedNames = ['Emmitt Smith', 'Daryl Johnston'];
    for (const player of data.players) {
      expect(fabricatedNames).not.toContain(player.name);
    }
  });

  it('fixture year is NOT 1996', () => {
    const data = loadFixture();
    expect(data.set_year.value).not.toBe(1996);
  });

  it('fixture suggest_retake includes image_may_be_rotated', () => {
    const data = loadFixture();
    expect(data.photo_quality.suggest_retake).toContain('image_may_be_rotated');
  });

  it('good fixture triggers no plausibility warnings', () => {
    const data = loadFixture();
    const parsed = CardExtractionSchema.parse(data);
    const warnings = validateExtractionPlausibility(parsed);
    expect(warnings).toEqual([]);
  });

  it('hallucinated extraction triggers high-confidence-on-rotated warning', () => {
    const data = hallucinatedExtraction();
    const parsed = CardExtractionSchema.parse(data);
    const warnings = validateExtractionPlausibility(parsed);
    expect(warnings).toContain(
      'high confidence player name on potentially rotated image',
    );
  });

  it('hallucinated extraction triggers set_year/copyright_year mismatch warning', () => {
    const data = hallucinatedExtraction();
    const parsed = CardExtractionSchema.parse(data);
    const warnings = validateExtractionPlausibility(parsed);
    expect(warnings.some((w) => w.includes('disagrees with copyright_year') && w.includes('30 years'))).toBe(true);
  });
});
