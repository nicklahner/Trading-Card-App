/**
 * Candidate scoring for card identification. Pure — no I/O.
 * Per DESIGN.md §6.4.
 */

import type { CardExtraction, IdentifyCandidate } from '../../providers/types';
import { canonicalSetName, normalize } from '../identity/aliases';

// --- TUNABLE weights ---

const WEIGHTS: Record<string, number> = {
  card_number: 0.25,
  year: 0.15,
  set: 0.2,
  player: 0.2,
  subset: 0.1,
  cardsight_rank: 0.1,
};

const DISTINGUISHING_TOKENS = [
  'draft picks',
  'update',
  'optic',
  'elite',
  'no huddle',
  'choice',
  'mega',
  'sapphire',
  'chrome',
  'black',
];

// --- Jaro-Winkler ---

function jaroWinkler(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const a = s1.toLowerCase();
  const b = s2.toLowerCase();
  if (a === b) return 1;
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0 || bLen === 0) return 0;

  const matchWindow = Math.max(Math.floor(Math.max(aLen, bLen) / 2) - 1, 0);
  const aMatches = new Array(aLen).fill(false);
  const bMatches = new Array(bLen).fill(false);

  let matches = 0;
  let transpositions = 0;

  for (let i = 0; i < aLen; i++) {
    const lo = Math.max(0, i - matchWindow);
    const hi = Math.min(bLen - 1, i + matchWindow);
    for (let j = lo; j <= hi; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue;
      aMatches[i] = true;
      bMatches[j] = true;
      matches++;
      break;
    }
  }

  if (matches === 0) return 0;

  let k = 0;
  for (let i = 0; i < aLen; i++) {
    if (!aMatches[i]) continue;
    while (!bMatches[k]) k++;
    if (a[i] !== b[k]) transpositions++;
    k++;
  }

  const jaro =
    (matches / aLen + matches / bLen + (matches - transpositions / 2) / matches) / 3;

  // Winkler prefix bonus
  let prefix = 0;
  for (let i = 0; i < Math.min(4, aLen, bLen); i++) {
    if (a[i] === b[i]) prefix++;
    else break;
  }

  return jaro + prefix * 0.1 * (1 - jaro);
}

// --- Scoring helpers ---

function scoreCardNumber(
  extracted: string | null,
  candidate: string,
): number | null {
  if (extracted == null) return null;
  const a = extracted.replace(/^#/, '').trim().toLowerCase();
  const b = candidate.replace(/^#/, '').trim().toLowerCase();
  return a === b ? 1 : 0;
}

function scoreYear(
  extraction: CardExtraction,
  candidate: number,
): number | null {
  const year = extraction.set_year.value ?? extraction.copyright_year.value;
  if (year == null) return null;
  return year === candidate ? 1 : 0;
}

function scoreSet(
  extracted: string | null,
  candidate: string,
): number | null {
  if (extracted == null) return null;

  const canonA = canonicalSetName(extracted);
  const canonB = canonicalSetName(candidate);

  // Both mapped to known canonical IDs — exact match only
  if (canonA === canonB) return 1;

  // Check for distinguishing token divergence
  const normA = normalize(extracted);
  const normB = normalize(candidate);
  const aDistinguishing = DISTINGUISHING_TOKENS.filter((t) => normA.includes(t));
  const bDistinguishing = DISTINGUISHING_TOKENS.filter((t) => normB.includes(t));

  if (aDistinguishing.length > 0 || bDistinguishing.length > 0) {
    // Both have distinguishing tokens — require exact canonical match
    if (canonA !== canonB) return 0;
  }

  // Token similarity fallback
  const tokensA = normA.split(' ').filter(Boolean);
  const tokensB = normB.split(' ').filter(Boolean);
  const shared = tokensA.filter((t) => tokensB.includes(t));
  const similarity =
    (2 * shared.length) / (tokensA.length + tokensB.length);

  return similarity >= 0.9 ? similarity : similarity * 0.5;
}

function scorePlayer(
  extraction: CardExtraction,
  candidateName: string,
): number | null {
  if (extraction.players.length === 0) return null;

  let best = 0;
  for (const p of extraction.players) {
    const sim = jaroWinkler(p.name, candidateName);
    if (sim > best) best = sim;
  }

  return best >= 0.9 ? best : best * 0.5;
}

function scoreSubset(
  extracted: string | null,
  candidate: string | null,
): number | null {
  if (extracted == null && candidate == null) return null;
  if (extracted == null || candidate == null) return 0.3;
  const a = normalize(extracted);
  const b = normalize(candidate);
  if (a === b) return 1;
  return jaroWinkler(a, b) >= 0.85 ? 0.8 : 0;
}

function scoreRank(rank: number): number {
  // rank 0 = best → 1.0, rank 1 → 0.7, rank 2 → 0.5, etc.
  if (rank === 0) return 1;
  if (rank === 1) return 0.7;
  if (rank === 2) return 0.5;
  return Math.max(0, 0.3 - rank * 0.05);
}

// --- Hard rejects ---

interface RejectCheck {
  reject: boolean;
  reason: string;
}

function checkSerialReject(
  extraction: CardExtraction,
  candidate: IdentifyCandidate,
  catalogPrintRun?: number | null,
  catalogPrintRunKind?: string,
): RejectCheck {
  const extractedRun = extraction.serial.print_run;
  // We can only check if both serial print_run and candidate have data.
  // Since IdentifyCandidate doesn't carry printRun directly, we use what we can.
  // The caller should pass catalogPrintRun when available.
  if (
    extractedRun != null &&
    catalogPrintRun != null &&
    catalogPrintRunKind === 'fixed' &&
    extractedRun !== catalogPrintRun
  ) {
    return {
      reject: true,
      reason: `serial_mismatch: extracted /${extractedRun} != catalog /${catalogPrintRun}`,
    };
  }
  return { reject: false, reason: '' };
}

function checkAutoReject(
  extraction: CardExtraction,
  candidate: IdentifyCandidate,
): RejectCheck {
  const auto = extraction.autograph;
  if (
    auto.present != null &&
    auto.confidence >= 0.8 &&
    auto.certification === 'manufacturer_certified'
  ) {
    // candidate has isRookie but we need isAutograph — IdentifyCandidate
    // doesn't have is_auto. Use the catalog card's isAutograph when available
    // via a wrapper. For now, check against a known truth:
    // auto.present=true but candidate shows no auto indication
    // Since IdentifyCandidate doesn't expose isAutograph, we skip this check
    // at this layer; it's enforced at the orchestration layer.
  }
  return { reject: false, reason: '' };
}

function checkMemoReject(
  extraction: CardExtraction,
  candidateIsMemo?: boolean,
): RejectCheck {
  const memo = extraction.memorabilia;
  if (
    memo.value != null &&
    memo.confidence >= 0.8 &&
    candidateIsMemo != null &&
    memo.value !== candidateIsMemo
  ) {
    return {
      reject: true,
      reason: `memo_disagree: extracted=${memo.value} candidate=${candidateIsMemo}`,
    };
  }
  return { reject: false, reason: '' };
}

// --- Main scoring function ---

export interface ScoringContext {
  /** Print run from the catalog entry, if available */
  catalogPrintRun?: number | null;
  catalogPrintRunKind?: 'fixed' | 'variable';
  /** Whether the catalog entry is an autograph */
  catalogIsAuto?: boolean;
  /** Whether the catalog entry has memorabilia */
  catalogIsMemo?: boolean;
}

export function scoreCandidate(
  extraction: CardExtraction,
  candidate: IdentifyCandidate,
  rank: number,
  mode: 'cardsight' | 'sportscardspro',
  ctx: ScoringContext = {},
): { score: number; reasons: string[]; rejects: string[] } {
  const rejects: string[] = [];
  const reasons: string[] = [];

  // Hard rejects
  const serialCheck = checkSerialReject(
    extraction,
    candidate,
    ctx.catalogPrintRun,
    ctx.catalogPrintRunKind,
  );
  if (serialCheck.reject) {
    rejects.push(serialCheck.reason);
  }

  // Auto reject — when extraction says auto present with high confidence
  // and manufacturer certified, but catalog says not auto
  if (
    extraction.autograph.present != null &&
    extraction.autograph.confidence >= 0.8 &&
    extraction.autograph.certification === 'manufacturer_certified' &&
    ctx.catalogIsAuto != null &&
    extraction.autograph.present !== ctx.catalogIsAuto
  ) {
    rejects.push(
      `auto_disagree: extracted=${extraction.autograph.present} catalog=${ctx.catalogIsAuto}`,
    );
  }

  const memoCheck = checkMemoReject(extraction, ctx.catalogIsMemo);
  if (memoCheck.reject) {
    rejects.push(memoCheck.reason);
  }

  if (rejects.length > 0) {
    return { score: 0, reasons, rejects };
  }

  // Compute signal scores
  const signals: Array<{ name: string; weight: number; score: number }> = [];

  const cardNumScore = scoreCardNumber(
    extraction.card_number.value,
    candidate.cardNumber,
  );
  if (cardNumScore != null) {
    signals.push({ name: 'card_number', weight: WEIGHTS.card_number, score: cardNumScore });
    reasons.push(`card_number=${cardNumScore.toFixed(2)}`);
  }

  const yearScore = scoreYear(extraction, candidate.year);
  if (yearScore != null) {
    signals.push({ name: 'year', weight: WEIGHTS.year, score: yearScore });
    reasons.push(`year=${yearScore.toFixed(2)}`);
  }

  const setScore = scoreSet(extraction.set_name.value, candidate.setName);
  if (setScore != null) {
    signals.push({ name: 'set', weight: WEIGHTS.set, score: setScore });
    reasons.push(`set=${setScore.toFixed(2)}`);
  }

  const playerScore = scorePlayer(extraction, candidate.playerName);
  if (playerScore != null) {
    signals.push({ name: 'player', weight: WEIGHTS.player, score: playerScore });
    reasons.push(`player=${playerScore.toFixed(2)}`);
  }

  const subScore = scoreSubset(
    extraction.subset_or_insert.value,
    candidate.subsetOrInsert,
  );
  if (subScore != null) {
    signals.push({ name: 'subset', weight: WEIGHTS.subset, score: subScore });
    reasons.push(`subset=${subScore.toFixed(2)}`);
  }

  if (mode === 'cardsight') {
    const rankScore = scoreRank(rank);
    signals.push({
      name: 'cardsight_rank',
      weight: WEIGHTS.cardsight_rank,
      score: rankScore,
    });
    reasons.push(`cardsight_rank=${rankScore.toFixed(2)}`);
  }

  // Renormalize weights
  const totalWeight = signals.reduce((sum, s) => sum + s.weight, 0);
  if (totalWeight === 0) return { score: 0, reasons: ['no_signals'], rejects };

  const score = signals.reduce(
    (sum, s) => sum + (s.score * s.weight) / totalWeight,
    0,
  );

  return { score: Math.round(score * 1000) / 1000, reasons, rejects };
}

// Export for testing
export { jaroWinkler };
