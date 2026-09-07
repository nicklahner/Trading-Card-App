/**
 * Parallel resolution for card identification. Pure — no I/O.
 * Per DESIGN.md §6.5.
 */

import type { CardExtraction, Parallel } from '../../providers/types';
import { canonicalParallelName, normalize } from '../identity/aliases';

export interface ResolveParallelOpts {
  extraction: CardExtraction;
  catalogParallels: Parallel[];
  cardsightTopParallelId: string | null;
  /** 'none' | 'penny_sleeve' | 'top_loader' | 'one_touch' | etc. */
  sessionStorage: string | null;
}

export interface ResolveParallelResult {
  resolvedParallelId: string | null;
  flags: string[];
}

/**
 * Resolve which parallel a card is from the catalog's parallel list,
 * using serial numbers, finish info, and CardSight agreement.
 */
export function resolveParallel(opts: ResolveParallelOpts): ResolveParallelResult {
  const { extraction, catalogParallels, cardsightTopParallelId, sessionStorage } = opts;
  const flags: string[] = [];

  if (catalogParallels.length === 0) {
    return { resolvedParallelId: null, flags: ['no_catalog_parallels'] };
  }

  // Step 1: Serial-based filtering
  const serialPrintRun = extraction.serial.print_run;
  if (serialPrintRun != null) {
    const matching = catalogParallels.filter(
      (p) =>
        (p.printRunKind === 'fixed' && p.printRun === serialPrintRun) ||
        p.printRunKind === 'variable',
    );

    if (matching.length === 1) {
      return { resolvedParallelId: matching[0].id, flags };
    }
    if (matching.length > 1) {
      flags.push('parallel_uncertain');
      // Continue to finish-based filtering on the narrowed set
      return finishFilter(extraction, matching, cardsightTopParallelId, sessionStorage, flags);
    }
    // None matched
    flags.push('serial_mismatch');
    // Fall through to finish-based with all parallels
  }

  // Step 2: Finish-based filtering
  return finishFilter(extraction, catalogParallels, cardsightTopParallelId, sessionStorage, flags);
}

function finishFilter(
  extraction: CardExtraction,
  parallels: Parallel[],
  cardsightTopParallelId: string | null,
  sessionStorage: string | null,
  flags: string[],
): ResolveParallelResult {
  const finish = extraction.finish;
  let filtered = [...parallels];

  // Filter by printed parallel name first (most reliable)
  if (finish.parallel_name_printed) {
    const printedCanon = canonicalParallelName(finish.parallel_name_printed);
    const byName = filtered.filter(
      (p) => canonicalParallelName(p.name) === printedCanon,
    );
    if (byName.length > 0) {
      filtered = byName;
    }
    // Never filter to zero — keep original if no match
  }

  // Filter by color
  if (finish.base_color && !finish.parallel_name_printed) {
    const colorNorm = normalize(finish.base_color);
    const byColor = filtered.filter((p) => {
      const pNorm = normalize(p.name);
      return pNorm.includes(colorNorm) || colorNorm.includes(pNorm);
    });
    if (byColor.length > 0) {
      filtered = byColor;
    }
  }

  // Filter by pattern
  if (finish.pattern && finish.pattern !== 'none') {
    const patternNorm = normalize(finish.pattern);
    const byPattern = filtered.filter((p) => {
      const pNorm = normalize(p.name);
      return pNorm.includes(patternNorm);
    });
    if (byPattern.length > 0) {
      filtered = byPattern;
    }
  }

  // Step 4: Base vs Silver/Holo special rule
  const baseVsSilverResult = checkBaseVsSilver(
    extraction,
    filtered,
    cardsightTopParallelId,
    sessionStorage,
    flags,
  );
  if (baseVsSilverResult) return baseVsSilverResult;

  // Step 3: Check CardSight agreement
  if (filtered.length === 1) {
    if (
      cardsightTopParallelId == null ||
      filtered[0].id === cardsightTopParallelId
    ) {
      return { resolvedParallelId: filtered[0].id, flags };
    }
    flags.push('parallel_uncertain');
    return { resolvedParallelId: filtered[0].id, flags };
  }

  if (filtered.length > 1) {
    // Check if CardSight agrees with one of the filtered parallels
    if (cardsightTopParallelId != null) {
      const csMatch = filtered.find((p) => p.id === cardsightTopParallelId);
      if (csMatch) {
        flags.push('parallel_uncertain');
        return { resolvedParallelId: csMatch.id, flags };
      }
    }
    flags.push('parallel_uncertain');
    return { resolvedParallelId: filtered[0].id, flags };
  }

  // Should not reach here due to "never filter to zero" rule, but safety net
  flags.push('parallel_uncertain');
  return { resolvedParallelId: null, flags };
}

/**
 * Base vs Silver/Holo: NEVER auto-resolve from flat photo unless
 * (CardSight + vision agree AND tilt exists) OR parallel name is printed.
 * If storage != 'none', tilt doesn't count.
 */
function checkBaseVsSilver(
  extraction: CardExtraction,
  filtered: Parallel[],
  cardsightTopParallelId: string | null,
  sessionStorage: string | null,
  flags: string[],
): ResolveParallelResult | null {
  // Only applies when base and silver/holo are both in the filtered set
  const hasBase = filtered.some(
    (p) => canonicalParallelName(p.name) === 'base',
  );
  const hasSilver = filtered.some((p) => {
    const canon = canonicalParallelName(p.name);
    return canon === 'silver';
  });

  if (!hasBase || !hasSilver) return null;
  if (filtered.length < 2) return null;

  // If parallel name is printed, we already filtered on it — trust it
  if (extraction.finish.parallel_name_printed) return null;

  // Need CardSight + vision agreement AND tilt
  const visionSaysRefractor =
    extraction.finish.refractor_sheen_visible === 'yes';
  const tiltExists = sessionStorage === 'none' || sessionStorage == null;
  // Even if tilt photo exists, storage invalidates it
  const tiltCounts = tiltExists;

  const silverParallel = filtered.find(
    (p) => canonicalParallelName(p.name) === 'silver',
  );
  const baseParallel = filtered.find(
    (p) => canonicalParallelName(p.name) === 'base',
  );

  if (!silverParallel || !baseParallel) return null;

  const cardsightSaysSilver = cardsightTopParallelId === silverParallel.id;
  const cardsightSaysBase = cardsightTopParallelId === baseParallel.id;

  if (visionSaysRefractor && cardsightSaysSilver && tiltCounts) {
    return { resolvedParallelId: silverParallel.id, flags };
  }

  if (!visionSaysRefractor && cardsightSaysBase && tiltCounts) {
    return { resolvedParallelId: baseParallel.id, flags };
  }

  // Cannot confidently resolve base vs silver
  flags.push('parallel_uncertain');
  return { resolvedParallelId: null, flags };
}

/**
 * Variation check: if multiple cards share set+card_number+player,
 * flag variation_possible.
 */
export function checkVariation(
  candidates: Array<{ setName: string; cardNumber: string; playerName: string }>,
): boolean {
  if (candidates.length < 2) return false;
  const first = candidates[0];
  const normalFirst = {
    set: normalize(first.setName),
    num: first.cardNumber,
    player: normalize(first.playerName),
  };

  return candidates.slice(1).some((c) => {
    return (
      normalize(c.setName) === normalFirst.set &&
      c.cardNumber === normalFirst.num &&
      normalize(c.playerName) === normalFirst.player
    );
  });
}
