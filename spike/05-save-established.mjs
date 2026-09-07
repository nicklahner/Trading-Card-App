/**
 * Re-fetch and SAVE the 3 established-set pricing responses (base only).
 * Also fetch parallels for each release. 6 total API calls.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardSightAI } from 'cardsightai';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const apiKey = envContent.match(/CARDSIGHTAI_API_KEY=(.+)/)?.[1]?.trim();
const client = new CardSightAI({ apiKey });

let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 350) await new Promise(r => setTimeout(r, 350 - elapsed));
  lastCall = Date.now();
}

const cards = [
  { label: '2020 Prizm Justin Herbert #325', cardId: '7f0be670-ed0a-4fbd-ad90-74e6cb043832' },
  { label: '2023 Prizm C.J. Stroud #6 Prizmatic', cardId: 'd581a05c-55f2-4bfd-bd37-c768fdc4592b' },
  { label: '2024 Donruss Optic Caleb Williams #201', cardId: '342db670-113d-4306-8919-a57a55163303' },
];

const allResults = [];

for (const card of cards) {
  console.log(`Fetching: ${card.label}`);
  await throttle();
  const resp = await client.pricing.get(card.cardId, {
    parallel_id: 'null',
    listing_type: 'auction',
    period: '1y',
  });
  allResults.push({ label: card.label, cardId: card.cardId, data: resp.data });

  const raw = resp.data?.raw?.records?.length ?? 0;
  let graded = 0;
  for (const co of (resp.data?.graded ?? [])) {
    for (const g of co.grades ?? []) graded += g.records?.length ?? 0;
  }
  console.log(`  raw=${raw}, graded=${graded}, total=${raw + graded}`);
}

// Also fetch parallels for each release via identify release IDs
// Herbert: Panini Prizm 2020, Stroud: Panini Prizm 2023, Williams: Donruss Optic 2024
// We need releaseIds — get them from the search results we already ran
// Actually, use catalog.search to get card details with releaseId
const searchQueries = [
  'Justin Herbert 2020 Prizm 325',
  'C.J. Stroud 2023 Prizm Prizmatic',
  'Caleb Williams 2024 Donruss Optic 201',
];

const releaseIds = new Set();
for (const q of searchQueries) {
  await throttle();
  const resp = await client.catalog.search({ q });
  const first = resp.data?.results?.[0];
  if (first) {
    console.log(`Search "${q}": ${first.name} #${first.cardNumber} release=${first.releaseName}`);
    // Search results don't have releaseId, but identify results do
    // We'll get parallels by release name instead
  }
}

// Get parallels for these releases by searching parallels by release name
const releaseSearches = [
  { name: 'Panini Prizm', year: '2020' },
  { name: 'Panini Prizm', year: '2023' },
  { name: 'Donruss Optic', year: '2024' },
];

const parallelsByRelease = {};
for (const rs of releaseSearches) {
  await throttle();
  const resp = await client.catalog.parallels.list({
    releaseName: rs.name,
    year: rs.year,
    take: 100,
  });
  const pars = resp.data?.parallels ?? [];
  const uniqueNames = [...new Set(pars.map(p => p.name))].sort();
  parallelsByRelease[`${rs.year} ${rs.name}`] = { count: pars.length, uniqueNames, raw: pars };
  console.log(`Parallels ${rs.year} ${rs.name}: ${pars.length} entries, ${uniqueNames.length} unique names`);
}

writeFileSync(resolve(RESULTS, '05-established-pricing.json'), JSON.stringify(allResults, null, 2));
writeFileSync(resolve(RESULTS, '05-established-parallels.json'), JSON.stringify(parallelsByRelease, null, 2));
console.log('\nSaved to results/05-established-pricing.json and 05-established-parallels.json');
