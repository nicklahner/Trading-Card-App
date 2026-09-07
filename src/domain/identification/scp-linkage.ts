/**
 * SportsCardsPro product linkage scoring. Pure — no I/O.
 * Per DESIGN.md §6.3 step 7.
 */

import type { CardExtraction, CatalogCard } from '../../providers/types';
import { canonicalParallelName, canonicalSetName, normalize } from '../identity/aliases';
import { jaroWinkler } from './scoring';

export interface ScpLinkageResult {
  productId: string | null;
  productName: string | null;
  estValueCents: number | null;
  flags: string[];
}

/**
 * Extract the bracketed parallel from an SCP product name.
 * E.g. "2020 Prizm Justin Herbert #325 [Silver]" → "Silver"
 */
function extractBracketedParallel(name: string): string | null {
  const match = name.match(/\[([^\]]+)\]/);
  return match ? match[1] : null;
}

/**
 * Extract a print run from an SCP product name.
 * E.g. "2020 Prizm Gold /10" → 10
 */
function extractPrintRunFromName(name: string): number | null {
  const match = name.match(/\/(\d+)/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Check if a color root improperly matches a longer name.
 * 'red' must not match 'red wave'. Only exact canonical match allowed.
 */
function parallelMatchesExact(
  resolvedCanon: string,
  productCanon: string,
): boolean {
  // Color root never matches longer name
  if (resolvedCanon !== productCanon) return false;
  return true;
}

export function scoreSCPCandidate(
  extraction: CardExtraction,
  product: CatalogCard,
  resolvedParallel: string | null,
): { score: number; reasons: string[]; rejects: string[] } {
  const rejects: string[] = [];
  const reasons: string[] = [];

  // --- Hard rejects ---

  // 1. Bracketed parallel must match resolved parallel
  const productParallels = product.parallels;
  if (resolvedParallel != null && productParallels.length > 0) {
    // Check if any parallel in the product matches the resolved one
    const resolvedCanon = canonicalParallelName(resolvedParallel);
    const hasMatch = productParallels.some(
      (p) => canonicalParallelName(p.name) === resolvedCanon,
    );
    if (!hasMatch) {
      rejects.push(
        `parallel_mismatch: resolved=${resolvedCanon} not in product parallels`,
      );
    }
  }

  // For SCP products, check bracketed parallel in name if present
  const bracketedName = extractBracketedParallel(product.setName);
  if (bracketedName != null && resolvedParallel != null) {
    const bracketedCanon = canonicalParallelName(bracketedName);
    const resolvedCanon = canonicalParallelName(resolvedParallel);

    if (!parallelMatchesExact(resolvedCanon, bracketedCanon)) {
      rejects.push(
        `bracketed_parallel_mismatch: resolved=${resolvedCanon} product=[${bracketedName}]=${bracketedCanon}`,
      );
    }
  }

  // 2. Print run in name must match
  const namePrintRun = extractPrintRunFromName(product.setName);
  const extractedPrintRun = extraction.serial.print_run;
  if (namePrintRun != null && extractedPrintRun != null && namePrintRun !== extractedPrintRun) {
    rejects.push(
      `print_run_mismatch: name=/${namePrintRun} extracted=/${extractedPrintRun}`,
    );
  }

  if (rejects.length > 0) {
    return { score: 0, reasons, rejects };
  }

  // --- Soft scoring ---
  let score = 0;
  let totalWeight = 0;

  // Player name match
  const playerWeight = 0.3;
  if (extraction.players.length > 0) {
    let bestSim = 0;
    for (const p of extraction.players) {
      const sim = jaroWinkler(p.name, product.playerName);
      if (sim > bestSim) bestSim = sim;
    }
    score += bestSim * playerWeight;
    totalWeight += playerWeight;
    reasons.push(`player=${bestSim.toFixed(2)}`);
  }

  // Year match
  const yearWeight = 0.15;
  const year = extraction.set_year.value ?? extraction.copyright_year.value;
  if (year != null) {
    const yearMatch = year === product.year ? 1 : 0;
    score += yearMatch * yearWeight;
    totalWeight += yearWeight;
    reasons.push(`year=${yearMatch.toFixed(2)}`);
  }

  // Set name match
  const setWeight = 0.25;
  if (extraction.set_name.value != null) {
    const extractedCanon = canonicalSetName(extraction.set_name.value);
    const productCanon = canonicalSetName(product.setName);
    const setMatch = extractedCanon === productCanon ? 1 : 0;
    score += setMatch * setWeight;
    totalWeight += setWeight;
    reasons.push(`set=${setMatch.toFixed(2)}`);
  }

  // Card number match
  const numWeight = 0.2;
  if (extraction.card_number.value != null) {
    const a = extraction.card_number.value.replace(/^#/, '').trim().toLowerCase();
    const b = product.cardNumber.replace(/^#/, '').trim().toLowerCase();
    const numMatch = a === b ? 1 : 0;
    score += numMatch * numWeight;
    totalWeight += numWeight;
    reasons.push(`card_number=${numMatch.toFixed(2)}`);
  }

  // Subset match
  const subWeight = 0.1;
  if (extraction.subset_or_insert.value != null || product.subsetOrInsert != null) {
    const a = extraction.subset_or_insert.value
      ? normalize(extraction.subset_or_insert.value)
      : '';
    const b = product.subsetOrInsert ? normalize(product.subsetOrInsert) : '';
    const subMatch = a === b ? 1 : a === '' || b === '' ? 0.3 : 0;
    score += subMatch * subWeight;
    totalWeight += subWeight;
    reasons.push(`subset=${subMatch.toFixed(2)}`);
  }

  if (totalWeight === 0) return { score: 0, reasons: ['no_signals'], rejects };

  const finalScore = Math.round((score / totalWeight) * 1000) / 1000;
  return { score: finalScore, reasons, rejects };
}
