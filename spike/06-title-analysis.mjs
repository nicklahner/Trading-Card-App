/**
 * M0.5 — Title-based filtering analysis.
 * Uses saved records from established sets + 2026 Topps parallels list.
 * No new API calls.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');

// Load established-set pricing records
const estPricing = JSON.parse(readFileSync(resolve(RESULTS, '05-established-pricing.json'), 'utf-8'));
const estParallels = JSON.parse(readFileSync(resolve(RESULTS, '05-established-parallels.json'), 'utf-8'));

// Flatten all records from each card
function getAllRecords(cardData) {
  const records = [];
  const rawRecs = cardData.data?.raw?.records ?? [];
  for (const r of rawRecs) records.push({ ...r, gradeKey: 'RAW' });

  for (const co of (cardData.data?.graded ?? [])) {
    for (const g of co.grades ?? []) {
      for (const r of g.records ?? []) {
        records.push({ ...r, gradeKey: `${co.company_name}:${g.grade_value}`, company: co.company_name, grade: g.grade_value });
      }
    }
  }
  return records;
}

// Build parallel vocabulary for each release
function getVocab(releaseKey) {
  const data = estParallels[releaseKey];
  if (!data) return [];
  return data.uniqueNames.filter(n => n.toLowerCase() !== 'base');
}

const releaseMap = {
  '2020 Prizm Justin Herbert #325': '2020 Panini Prizm',
  '2023 Prizm C.J. Stroud #6 Prizmatic': '2023 Panini Prizm',
  '2024 Donruss Optic Caleb Williams #201': '2024 Donruss Optic',
};

// Also load 2026 Topps Flagship parallels
const toppsParallels = JSON.parse(readFileSync(resolve(RESULTS, '02-parallels.json'), 'utf-8'));
const toppsUniqueNames = [...new Set(toppsParallels.pages.flatMap(p => p.parallels.map(pp => pp.name)))].sort();

// SCP base values for comparison (from spike 03 results, in pennies)
const scpBaseValues = {
  '2020 Prizm Justin Herbert #325': null, // not looked up in SCP spike
  '2023 Prizm C.J. Stroud #6 Prizmatic': null,
  '2024 Donruss Optic Caleb Williams #201': null,
};

console.log('='.repeat(70));
console.log('TITLE-BASED FILTERING ANALYSIS');
console.log('='.repeat(70));

// Print parallel vocabularies
for (const [label, releaseKey] of Object.entries(releaseMap)) {
  const vocab = getVocab(releaseKey);
  console.log(`\n${releaseKey} parallels (${vocab.length}): ${vocab.join(', ')}`);
}
console.log(`\n2026 Topps Flagship parallels (${toppsUniqueNames.length}): ${toppsUniqueNames.slice(0, 20).join(', ')}...`);

// --- Analysis per card ---
const report = [];

for (const cardData of estPricing) {
  const label = cardData.label;
  const releaseKey = releaseMap[label];
  const vocab = getVocab(releaseKey);
  const records = getAllRecords(cardData);

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label} — ${records.length} total records, ${vocab.length} parallel names in vocabulary`);
  console.log(`${'='.repeat(70)}`);

  // Q1: Title coverage
  const withTitle = records.filter(r => r.title && r.title.trim().length > 0);
  const withoutTitle = records.filter(r => !r.title || r.title.trim().length === 0);
  console.log(`\n1. TITLE COVERAGE: ${withTitle.length}/${records.length} have non-empty title (${(withTitle.length / records.length * 100).toFixed(1)}%)`);
  console.log(`   Missing titles: ${withoutTitle.length}`);

  // Q2: Parallel name matching
  // For each titled record, find which parallel names appear in the title
  function findParallelMatches(title, vocabulary) {
    const t = title.toLowerCase();
    const matches = [];
    for (const name of vocabulary) {
      const n = name.toLowerCase();
      // Word-boundary-ish matching: check the parallel name appears as a distinct term
      // Handle multi-word parallels (e.g., "Red White and Blue", "Cracked Ice")
      if (t.includes(n)) {
        // Verify it's not a substring of a longer word for single-word names
        // E.g., "red" shouldn't match "scored" — check word boundaries
        const regex = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
        if (regex.test(title)) {
          matches.push(name);
        }
      }
    }
    // Remove substrings: if "Red" and "Red Wave" both match, keep only "Red Wave"
    const deduped = matches.filter(m =>
      !matches.some(other => other !== m && other.toLowerCase().includes(m.toLowerCase()) && other.length > m.length)
    );
    return deduped;
  }

  let exactlyOne = 0;
  let none = 0;
  let moreThanOne = 0;
  const matchDetails = [];

  for (const r of withTitle) {
    const matches = findParallelMatches(r.title, vocab);
    if (matches.length === 0) none++;
    else if (matches.length === 1) exactlyOne++;
    else moreThanOne++;
    matchDetails.push({ title: r.title, price: r.price, gradeKey: r.gradeKey, matches, matchCount: matches.length });
  }

  console.log(`\n2. PARALLEL NAME MATCHES (titled records only):`);
  console.log(`   None (implies base): ${none}/${withTitle.length} (${(none / withTitle.length * 100).toFixed(1)}%)`);
  console.log(`   Exactly one:         ${exactlyOne}/${withTitle.length} (${(exactlyOne / withTitle.length * 100).toFixed(1)}%)`);
  console.log(`   More than one:       ${moreThanOne}/${withTitle.length} (${(moreThanOne / withTitle.length * 100).toFixed(1)}%)`);

  // Show examples of each
  console.log(`\n   Examples — no parallel match (base?):`);
  for (const d of matchDetails.filter(d => d.matchCount === 0).slice(0, 5)) {
    console.log(`     ${d.gradeKey} $${d.price} | ${d.title.substring(0, 70)}`);
  }
  console.log(`\n   Examples — exactly one match:`);
  for (const d of matchDetails.filter(d => d.matchCount === 1).slice(0, 5)) {
    console.log(`     ${d.gradeKey} $${d.price} [${d.matches[0]}] | ${d.title.substring(0, 65)}`);
  }
  if (moreThanOne > 0) {
    console.log(`\n   Examples — multiple matches (ambiguous):`);
    for (const d of matchDetails.filter(d => d.matchCount > 1).slice(0, 5)) {
      console.log(`     ${d.gradeKey} $${d.price} [${d.matches.join(', ')}] | ${d.title.substring(0, 60)}`);
    }
  }

  // Q3: Base card filtering — exclude all titles containing any parallel name
  console.log(`\n3. BASE CARD FILTERING (exclude titles with any parallel name):`);
  const rawRecords = records.filter(r => r.gradeKey === 'RAW');
  const rawWithTitle = rawRecords.filter(r => r.title && r.title.trim().length > 0);
  const rawBaseFiltered = rawWithTitle.filter(r => findParallelMatches(r.title, vocab).length === 0);
  const rawParallelFiltered = rawWithTitle.filter(r => findParallelMatches(r.title, vocab).length > 0);

  console.log(`   RAW records total: ${rawRecords.length}`);
  console.log(`   RAW with title: ${rawWithTitle.length}`);
  console.log(`   RAW surviving as "base" (no parallel match): ${rawBaseFiltered.length}`);
  console.log(`   RAW excluded as parallel: ${rawParallelFiltered.length}`);

  if (rawBaseFiltered.length > 0) {
    const prices = rawBaseFiltered.map(r => r.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];
    const min = prices[0];
    const max = prices[prices.length - 1];
    console.log(`   Surviving base prices: min=$${min}, median=$${median}, max=$${max}`);
    console.log(`   Records:`);
    for (const r of rawBaseFiltered) {
      console.log(`     $${r.price} | ${r.title.substring(0, 70)}`);
    }
  }
  if (rawParallelFiltered.length > 0) {
    console.log(`   Excluded parallel records:`);
    for (const r of rawParallelFiltered.slice(0, 8)) {
      const matches = findParallelMatches(r.title, vocab);
      console.log(`     $${r.price} [${matches.join(', ')}] | ${r.title.substring(0, 60)}`);
    }
  }

  // Q4: Grade information reliability
  console.log(`\n4. GRADE INFORMATION:`);
  const gradeDistribution = {};
  for (const r of records) {
    gradeDistribution[r.gradeKey] = (gradeDistribution[r.gradeKey] ?? 0) + 1;
  }
  console.log(`   Grade keys: ${JSON.stringify(gradeDistribution)}`);

  // Check if raw records with grading keywords in titles should actually be graded
  const rawWithGradeKeywords = rawWithTitle.filter(r => {
    const t = r.title.toLowerCase();
    return /\b(psa|bgs|sgc|cgc|beckett)\s*\d/.test(t);
  });
  console.log(`   RAW records with grading company keywords in title: ${rawWithGradeKeywords.length}`);
  for (const r of rawWithGradeKeywords.slice(0, 3)) {
    console.log(`     $${r.price} | ${r.title.substring(0, 70)}`);
  }

  report.push({
    label,
    totalRecords: records.length,
    titleCoverage: { withTitle: withTitle.length, without: withoutTitle.length, pct: withTitle.length / records.length },
    parallelMatches: { none, exactlyOne, moreThanOne, total: withTitle.length },
    baseFiltering: {
      rawTotal: rawRecords.length,
      rawWithTitle: rawWithTitle.length,
      rawSurviving: rawBaseFiltered.length,
      rawExcluded: rawParallelFiltered.length,
      survivingPrices: rawBaseFiltered.map(r => r.price).sort((a, b) => a - b),
    },
    gradeDistribution,
    rawWithGradeKeywords: rawWithGradeKeywords.length,
  });
}

// Summary
console.log(`\n${'='.repeat(70)}`);
console.log('SUMMARY ACROSS ALL 3 CARDS');
console.log(`${'='.repeat(70)}`);

const totalRecs = report.reduce((s, r) => s + r.totalRecords, 0);
const totalTitled = report.reduce((s, r) => s + r.titleCoverage.withTitle, 0);
const totalNone = report.reduce((s, r) => s + r.parallelMatches.none, 0);
const totalOne = report.reduce((s, r) => s + r.parallelMatches.exactlyOne, 0);
const totalMulti = report.reduce((s, r) => s + r.parallelMatches.moreThanOne, 0);
const totalRawSurviving = report.reduce((s, r) => s + r.baseFiltering.rawSurviving, 0);
const totalRawExcluded = report.reduce((s, r) => s + r.baseFiltering.rawExcluded, 0);
const totalRawWithGrade = report.reduce((s, r) => s + r.rawWithGradeKeywords, 0);

console.log(`\n1. Title coverage: ${totalTitled}/${totalRecs} (${(totalTitled / totalRecs * 100).toFixed(1)}%)`);
console.log(`2. Parallel matching (titled records):`);
console.log(`   None (base): ${totalNone}/${totalTitled} (${(totalNone / totalTitled * 100).toFixed(1)}%)`);
console.log(`   Exactly one: ${totalOne}/${totalTitled} (${(totalOne / totalTitled * 100).toFixed(1)}%)`);
console.log(`   Ambiguous:   ${totalMulti}/${totalTitled} (${(totalMulti / totalTitled * 100).toFixed(1)}%)`);
console.log(`3. Base RAW filtering: ${totalRawSurviving} survive, ${totalRawExcluded} excluded`);
console.log(`4. RAW records with grade keywords: ${totalRawWithGrade}`);

writeFileSync(resolve(RESULTS, '06-title-analysis.json'), JSON.stringify(report, null, 2));
console.log('\nSaved to results/06-title-analysis.json');
