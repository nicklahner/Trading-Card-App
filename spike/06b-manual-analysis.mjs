/**
 * Manual false-negative analysis on Caleb Williams records.
 * Simulates what a COMPLETE parallel vocabulary would catch,
 * using common Donruss Optic parallel names we know exist.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');

const estPricing = JSON.parse(readFileSync(resolve(RESULTS, '05-established-pricing.json'), 'utf-8'));

// The TRUNCATED vocabulary from catalog.parallels.list (A-G only, 19 names)
const truncatedOpticVocab = [
  'Aqua', 'Autograph', 'Autograph Gold Vinyl', 'Autograph Purple Stars',
  'Black', 'Black Pandora', 'Blue', 'Blue Glitter', 'Blue Hyper', 'Blue Mojo',
  'Blue Scope', 'Dragon', 'Electricity', 'Fire', 'Flex', 'Footballs',
  'Freedom', 'Gold', 'Gold Vinyl',
];

// A COMPLETE vocabulary: the truncated list + all known Optic parallels we can
// infer from seller titles and standard Optic checklists.
const completeOpticVocab = [
  ...truncatedOpticVocab,
  // Standard Optic parallels (G-Z) that the truncated list missed:
  'Green', 'Green Hyper', 'Green Scope', 'Green Velocity',
  'Holo', 'Holographic',
  'Lime Green', 'Magenta',
  'Neon', 'Neon Green',
  'Orange', 'Orange Scope',
  'Pink', 'Pink Velocity', 'Purple', 'Purple Scope', 'Purple Shock', 'Purple Stars',
  'Rated Rookie', // This is NOT a parallel, but sellers use it — must NOT be in the vocab
  'Red', 'Red Hyper', 'Red Mojo', 'Red Scope',
  'Scope', // generic "scope" — careful, may over-match
  'Silver', 'Stars',
  'Teal', 'White Sparkle',
];

// Remove "Rated Rookie" and "Scope" alone (too generic)
const safeCompleteVocab = completeOpticVocab.filter(n =>
  n !== 'Rated Rookie' && n !== 'Scope'
);

function findMatches(title, vocab) {
  const matches = [];
  for (const name of vocab) {
    const regex = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (regex.test(title)) matches.push(name);
  }
  return matches.filter(m =>
    !matches.some(other => other !== m && other.toLowerCase().includes(m.toLowerCase()) && other.length > m.length)
  );
}

// Get all RAW records for Caleb Williams
const williams = estPricing[2]; // index 2
const rawRecs = williams.data?.raw?.records ?? [];
console.log(`Caleb Williams RAW records: ${rawRecs.length}\n`);

// Classify each record with both vocabularies
let truncBase = 0, truncPar = 0;
let complBase = 0, complPar = 0;

const buckets = { trueBase: [], falseNegWithTrunc: [], caughtByComplete: [], ambiguous: [] };

for (const r of rawRecs) {
  const truncMatches = findMatches(r.title, truncatedOpticVocab);
  const complMatches = findMatches(r.title, safeCompleteVocab);

  if (truncMatches.length === 0) truncBase++;
  else truncPar++;

  if (complMatches.length === 0) complBase++;
  else complPar++;

  if (truncMatches.length === 0 && complMatches.length > 0) {
    buckets.caughtByComplete.push({ price: r.price, matches: complMatches, title: r.title });
  } else if (truncMatches.length === 0 && complMatches.length === 0) {
    // Survived both filters — is it really base?
    // Heuristic: if price > $10, flag as ambiguous
    if (r.price > 10) {
      buckets.ambiguous.push({ price: r.price, title: r.title });
    } else {
      buckets.trueBase.push({ price: r.price, title: r.title });
    }
  }
}

console.log('=== TRUNCATED vs COMPLETE VOCABULARY ===');
console.log(`Truncated (19 names): ${truncBase} "base" / ${truncPar} parallel`);
console.log(`Complete  (~45 names): ${complBase} "base" / ${complPar} parallel\n`);

console.log(`--- Records caught by complete vocab that truncated missed (${buckets.caughtByComplete.length}) ---`);
for (const r of buckets.caughtByComplete) {
  console.log(`  $${r.price} [${r.matches.join(', ')}] | ${r.title.substring(0, 65)}`);
}

console.log(`\n--- Likely true base (both filters say base, price ≤ $10) (${buckets.trueBase.length}) ---`);
for (const r of buckets.trueBase) {
  console.log(`  $${r.price} | ${r.title.substring(0, 70)}`);
}
if (buckets.trueBase.length > 0) {
  const prices = buckets.trueBase.map(r => r.price).sort((a, b) => a - b);
  console.log(`  Price range: $${prices[0]}–$${prices[prices.length - 1]}, median: $${prices[Math.floor(prices.length / 2)]}`);
}

console.log(`\n--- Ambiguous (both filters say base, but price > $10) (${buckets.ambiguous.length}) ---`);
for (const r of buckets.ambiguous) {
  console.log(`  $${r.price} | ${r.title.substring(0, 70)}`);
}

// Now do the same for Herbert
console.log('\n\n=== HERBERT ANALYSIS ===');
const herbert = estPricing[0];
const herbertRaw = herbert.data?.raw?.records ?? [];

// Known 2020 Prizm parallels not in truncated vocab
const completePrizmVocab = [
  // Truncated had: A-Camo (24 names)
  ...['Autographs', 'Black', 'Black Autographs', 'Black Finite', 'Black Finite Prizm',
  'Black Gold', 'Black Ice Autographs', 'Black Mosaic Autographs', 'Black Mosiac Autographs',
  'Black and White Checker', 'Blue', 'Blue Autographs', 'Blue Donut Circle Prizm',
  'Blue Donut Circles Prizm', 'Blue Ice', 'Blue Mojo Prizm', 'Blue Prizm',
  'Blue Shimmer', 'Blue Shimmer FOTL', 'Blue Wave', 'Blue Wave Prizm',
  'Bronze Donut Circles Prizm', 'Burgundy Cracked Ice Prizm', 'Camo'],
  // Add missing parallels:
  'Disco', 'Orange Disco',
  'Gold', 'Gold Power', 'Gold Vinyl',
  'Green', 'Green Prizm', 'Green Shimmer', 'Green Scope',
  'Hyper', 'Lazer', 'Lazer Prizm',
  'Mojo', 'Neon Green',
  'Orange', 'Orange Ice',
  'Pink', 'Pink Ice', 'Pink Pulsar',
  'Purple', 'Purple Power', 'Purple Prizm', 'Purple Wave',
  'Red', 'Red Ice', 'Red Mojo', 'Red Shimmer', 'Red White and Blue',
  'Silver', 'Silver Prizm',
  'Snakeskin', 'Tie-Dye', 'White Sparkle',
];

for (const r of herbertRaw) {
  const truncMatches = findMatches(r.title, ['Autographs', 'Black', 'Black Autographs', 'Black Finite', 'Black Finite Prizm', 'Black Gold', 'Black Ice Autographs', 'Black Mosaic Autographs', 'Black Mosiac Autographs', 'Black and White Checker', 'Blue', 'Blue Autographs', 'Blue Donut Circle Prizm', 'Blue Donut Circles Prizm', 'Blue Ice', 'Blue Mojo Prizm', 'Blue Prizm', 'Blue Shimmer', 'Blue Shimmer FOTL', 'Blue Wave', 'Blue Wave Prizm', 'Bronze Donut Circles Prizm', 'Burgundy Cracked Ice Prizm', 'Camo']);
  const complMatches = findMatches(r.title, completePrizmVocab);
  const tag = truncMatches.length > 0 ? 'TRUNC-PAR' : complMatches.length > 0 ? 'COMPL-PAR' : 'BASE';
  console.log(`  ${tag} $${r.price} ${complMatches.length > 0 ? `[${complMatches.join(', ')}]` : ''} | ${r.title.substring(0, 65)}`);
}

// Summary
console.log('\n\n=== OVERALL ASSESSMENT ===');
console.log(`Williams: truncated filter leaks ${buckets.caughtByComplete.length + buckets.ambiguous.length} parallel records into "base"`);
console.log(`Williams: complete filter reduces leakage to ${buckets.ambiguous.length} ambiguous records`);
console.log(`Williams: ${buckets.trueBase.length} confident base records survive at $${buckets.trueBase.map(r => r.price).sort((a,b) => a-b).join(', $')}`);
