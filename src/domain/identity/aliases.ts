/**
 * Name aliasing for sets and parallels. Pure — no I/O.
 * Per DESIGN.md §6.4.
 */

/**
 * Normalize a name: lowercase, '&' → 'and', strip punctuation,
 * collapse whitespace, strip trailing 'prizm' or 'refractor' for parallels.
 */
export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/['']/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeParallel(name: string): string {
  return normalize(name)
    .replace(/\s+prizm$/, '')
    .replace(/\s+refractor$/, '');
}

// --- Set aliases ---

const SET_ALIASES: Map<string, string> = new Map([
  // Panini Prizm family
  ['prizm', 'prizm'],
  ['panini prizm', 'prizm'],
  ['prizm football', 'prizm'],
  ['prizm basketball', 'prizm'],
  ['prizm draft picks', 'prizm-draft-picks'],
  ['panini prizm draft picks', 'prizm-draft-picks'],

  // Optic family
  ['optic', 'donruss-optic'],
  ['donruss optic', 'donruss-optic'],
  ['panini donruss optic', 'donruss-optic'],

  // Select
  ['select', 'select'],
  ['panini select', 'select'],
  ['select football', 'select'],

  // Mosaic
  ['mosaic', 'mosaic'],
  ['panini mosaic', 'mosaic'],

  // Donruss
  ['donruss', 'donruss'],
  ['panini donruss', 'donruss'],

  // Contenders
  ['contenders', 'contenders'],
  ['panini contenders', 'contenders'],
  ['contenders football', 'contenders'],

  // Phoenix
  ['phoenix', 'phoenix'],
  ['panini phoenix', 'phoenix'],

  // Topps Chrome
  ['topps chrome', 'topps-chrome'],
  ['chrome', 'topps-chrome'],
  ['topps chrome football', 'topps-chrome'],

  // Bowman Chrome
  ['bowman chrome', 'bowman-chrome'],
  ['bowman chrome baseball', 'bowman-chrome'],

  // Topps Flagship
  ['topps flagship', 'topps-flagship'],
  ['topps flagship football', 'topps-flagship'],
  ['2026 topps flagship', 'topps-flagship'],
  ['2026 topps flagship football', 'topps-flagship'],
  ['2025 topps flagship', 'topps-flagship'],
  ['2025 topps flagship football', 'topps-flagship'],
  // SCP returns set names with "Football Cards" prefix
  ['football cards 2026 topps flagship', 'topps-flagship'],
  ['football cards 2025 topps flagship', 'topps-flagship'],
  ['football cards 2026 topps flagship 1991 rookie', 'topps-flagship'],
  ['football cards 2026 topps flagship profiles', 'topps-flagship'],
  ['football cards 2026 topps flagship big ticket player', 'topps-flagship'],
]);

// --- Parallel aliases ---

const PARALLEL_ALIASES: Map<string, string> = new Map([
  // Silver
  ['silver', 'silver'],
  ['silver prizm', 'silver'],
  ['holo', 'silver'],
  ['silver holo', 'silver'],

  // Red
  ['red', 'red'],
  ['red prizm', 'red'],

  // Blue
  ['blue', 'blue'],
  ['blue prizm', 'blue'],

  // Green
  ['green', 'green'],
  ['green prizm', 'green'],

  // Gold
  ['gold', 'gold'],
  ['gold prizm', 'gold'],

  // Orange
  ['orange', 'orange'],
  ['orange prizm', 'orange'],

  // Purple
  ['purple', 'purple'],
  ['purple prizm', 'purple'],

  // Black
  ['black', 'black'],
  ['black prizm', 'black'],

  // Pink
  ['pink', 'pink'],
  ['pink prizm', 'pink'],

  // Red wave
  ['red wave', 'red-wave'],
  ['red wave prizm', 'red-wave'],

  // Blue wave
  ['blue wave', 'blue-wave'],
  ['blue wave prizm', 'blue-wave'],

  // Gold wave
  ['gold wave', 'gold-wave'],

  // Mojo
  ['mojo', 'mojo'],
  ['mojo refractor', 'mojo'],

  // Refractor
  ['refractor', 'refractor'],

  // Base
  ['base', 'base'],
]);

/**
 * Return the canonical set ID for a raw set name, or the normalized name
 * if no alias is found.
 */
export function canonicalSetName(name: string): string {
  const norm = normalize(name);
  return SET_ALIASES.get(norm) ?? norm;
}

/**
 * Return the canonical parallel ID for a raw parallel name, or the
 * normalized name if no alias is found.
 */
export function canonicalParallelName(name: string): string {
  const norm = normalizeParallel(name);
  return PARALLEL_ALIASES.get(norm) ?? norm;
}

/**
 * Check whether two player/card names match after normalization.
 * Handles cases like "America's Duo" vs "America's Duo Combo Card"
 * where one is a prefix of the other with trailing qualifiers.
 */
export function playerNamesMatch(a: string, b: string): boolean {
  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return true;
  // Allow one to be a prefix of the other (for "Combo Card" suffixes etc.)
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return false;
}
