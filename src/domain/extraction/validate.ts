import type { ValidatedCardExtraction } from './schema';

/**
 * Post-extraction plausibility checks.
 * Returns a list of warning strings for anything suspicious.
 * An empty array means no warnings.
 */
export function validateExtractionPlausibility(
  extraction: ValidatedCardExtraction,
): string[] {
  const warnings: string[] = [];

  const mayBeRotated = extraction.photo_quality.suggest_retake.includes(
    'image_may_be_rotated',
  );

  // Flag high-confidence player names when the image may be rotated —
  // the model can't reliably read text on a rotated image, so high
  // confidence likely indicates fabrication.
  if (mayBeRotated) {
    for (const player of extraction.players) {
      if (player.confidence >= 0.8) {
        warnings.push(
          'high confidence player name on potentially rotated image',
        );
      }
    }
  }

  // Flag set_year that disagrees with copyright_year by more than 5 years.
  // A large gap suggests the model hallucinated one of the values.
  if (
    extraction.set_year.value != null &&
    extraction.set_year.confidence >= 0.8 &&
    extraction.copyright_year.value != null
  ) {
    const gap = Math.abs(
      extraction.set_year.value - extraction.copyright_year.value,
    );
    if (gap > 5) {
      warnings.push(
        `set_year disagrees with copyright_year by ${gap} years`,
      );
    }
  }

  return warnings;
}
