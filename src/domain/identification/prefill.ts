/**
 * Pre-fill decision logic for the review form.
 *
 * Determines which source populates the identity fields:
 * - Candidate above the confidence floor → pre-fill from candidate
 * - Candidate below the floor → pre-fill from extraction, show candidate as suggestion
 * - No candidates → pre-fill from extraction
 *
 * The confidence floor is a TUNABLE threshold. A candidate below it may still be
 * correct, but we don't trust it enough to put its values in the form by default.
 */

/** Minimum candidate score to use it for pre-fill (TUNABLE). */
export const PREFILL_CONFIDENCE_FLOOR = 0.80;

export interface PrefillCandidate {
  playerName: string;
  year: number;
  setName: string;
  subsetOrInsert: string | null;
  cardNumber: string;
  parallelName: string | null;
  isRookie: boolean;
  score: number;
}

export interface PrefillExtraction {
  playerName: string | null;
  year: number | null;
  setName: string | null;
  subset: string | null;
  cardNumber: string | null;
  parallelName: string | null;
  isRookie: boolean;
  printRun: number | null;
  isAuto: boolean;
  isMemorabilia: boolean;
  serialNumber: number | null;
}

export interface PrefillResult {
  /** Which source was used for the pre-filled values. */
  source: 'candidate' | 'extraction' | 'empty';
  /** The candidate to show as a tappable suggestion (when below floor). */
  suggestion: PrefillCandidate | null;
  /** Pre-filled field values. */
  fields: {
    playerName: string;
    year: string;
    setName: string;
    subset: string;
    cardNumber: string;
    parallelName: string;
    isRookie: boolean;
    isAuto: boolean;
    isMemorabilia: boolean;
    serialNumber: string;
    printRun: string;
  };
}

/**
 * Decide how to pre-fill the review form.
 *
 * @param candidates - Scored candidates sorted by score descending
 * @param extraction - What the vision model read off the photo
 * @param sessionSetName - Set name carried from the previous card in the session
 * @param floor - Minimum score to trust a candidate for pre-fill (default 0.80)
 */
export function computePrefill(
  candidates: PrefillCandidate[],
  extraction: PrefillExtraction | null,
  sessionSetName: string | null,
  floor: number = PREFILL_CONFIDENCE_FLOOR,
): PrefillResult {
  const top = candidates.length > 0 ? candidates[0] : null;
  const ext = extraction;

  // Case 1: candidate above floor → pre-fill from candidate
  if (top && top.score >= floor) {
    return {
      source: 'candidate',
      suggestion: null,
      fields: {
        playerName: top.playerName,
        year: String(top.year || ''),
        setName: top.setName,
        subset: top.subsetOrInsert ?? '',
        cardNumber: top.cardNumber,
        parallelName: top.parallelName ?? '',
        isRookie: top.isRookie,
        isAuto: ext?.isAuto ?? false,
        isMemorabilia: ext?.isMemorabilia ?? false,
        serialNumber: ext?.serialNumber != null ? String(ext.serialNumber) : '',
        printRun: ext?.printRun != null ? String(ext.printRun) : '',
      },
    };
  }

  // Case 2 & 3: candidate below floor or no candidates → pre-fill from extraction
  const fields = {
    playerName: ext?.playerName ?? '',
    year: ext?.year != null ? String(ext.year) : '',
    setName: ext?.setName ?? sessionSetName ?? '',
    subset: ext?.subset ?? '',
    cardNumber: ext?.cardNumber ?? '',
    parallelName: ext?.parallelName ?? '',
    isRookie: ext?.isRookie ?? false,
    isAuto: ext?.isAuto ?? false,
    isMemorabilia: ext?.isMemorabilia ?? false,
    serialNumber: ext?.serialNumber != null ? String(ext.serialNumber) : '',
    printRun: ext?.printRun != null ? String(ext.printRun) : '',
  };

  // Case 2: candidate exists but below floor → show as suggestion
  if (top) {
    return {
      source: 'extraction',
      suggestion: top,
      fields,
    };
  }

  // Case 3: no candidates at all
  return {
    source: ext ? 'extraction' : 'empty',
    suggestion: null,
    fields,
  };
}
