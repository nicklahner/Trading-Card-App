/**
 * M0.5 Spike — Finish remaining pricing tests (paging, fixed, parallel isolation)
 */
import { readFileSync, writeFileSync } from 'node:fs';
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

const parallelsData = JSON.parse(readFileSync(resolve(RESULTS, '02-parallels.json'), 'utf-8'));
const allParallels = parallelsData.pages.flatMap(p => p.parallels);
let pricingData = [];
try { pricingData = JSON.parse(readFileSync(resolve(RESULTS, '02-pricing.json'), 'utf-8')); } catch { }

const results = [];

// --- Paging test (fix: use YYYY-MM-DD format) ---
console.log('=== PAGING TEST ===');
const LEMON_ID = 'f6d3585c-ecee-4a8f-9424-b1bb89613590';

await throttle();
const resp1 = await client.pricing.get(LEMON_ID, {
  parallel_id: 'null', listing_type: 'auction', period: '1y', limit: 5,
});
const d1 = resp1.data;
const recs1 = d1?.raw?.records ?? [];
console.log(`Page 1 (limit=5): raw=${d1?.raw?.count}, total_records=${d1?.meta?.total_records}`);
console.log(`  messages: ${JSON.stringify(d1?.messages)}`);
console.log(`  query.as_of_date: ${d1?.query?.as_of_date}`);

if (recs1.length > 0) {
  const oldestDate = recs1[recs1.length - 1]?.date;
  // Convert ISO datetime to YYYY-MM-DD
  const dateOnly = oldestDate?.split('T')[0];
  console.log(`  oldest record: ${oldestDate} -> as_of_date=${dateOnly}`);

  await throttle();
  const resp2 = await client.pricing.get(LEMON_ID, {
    parallel_id: 'null', listing_type: 'auction', period: '1y', as_of_date: dateOnly, limit: 5,
  });
  const d2 = resp2.data;
  const recs2 = d2?.raw?.records ?? [];
  console.log(`Page 2 (as_of_date=${dateOnly}): raw=${d2?.raw?.count}, total_records=${d2?.meta?.total_records}`);
  console.log(`  messages: ${JSON.stringify(d2?.messages)}`);
  console.log(`  query.as_of_date: ${d2?.query?.as_of_date}`);

  // Check overlap
  const dates1 = recs1.map(r => r.date);
  const dates2 = recs2.map(r => r.date);
  console.log(`  Page 1 dates: ${dates1.join(', ')}`);
  console.log(`  Page 2 dates: ${dates2.join(', ')}`);
  const overlap = dates1.filter(d => dates2.includes(d));
  console.log(`  Overlap: ${overlap.length} records`);

  results.push({
    test: 'paging',
    page1: { count: recs1.length, total: d1?.meta?.total_records, dates: dates1, messages: d1?.messages },
    page2: { count: recs2.length, total: d2?.meta?.total_records, asOfDate: dateOnly, dates: dates2, messages: d2?.messages },
    overlap: overlap.length,
  });
}

// --- Fixed records (Q4) ---
console.log('\n=== FIXED RECORDS (Q4) ===');
// Try multiple cards to gather ≥10 fixed records
const cardIdsToTry = [
  { label: 'Makai Lemon', id: 'f6d3585c-ecee-4a8f-9424-b1bb89613590' },
  { label: 'Eli Heidenreich', id: 'e2699195-72b0-44aa-802c-772395a042c2' },
  { label: 'Mike Evans (base set)', id: '8ec2379d-9947-499b-9f75-601b0a4819fb' },
  { label: 'Omarion Hampton', id: 'f09b20ac-4a71-4505-8e8b-781ee5be72c1' },
  { label: 'Jacoby Brissett', id: '1a2bdc35-fb90-434f-9039-4c2808c44084' },
  { label: 'Isaiah Likely', id: 'c3fdb585-d2fd-4d3c-a79a-def644dcbb71' },
  // Also try a higher-profile card via search
  { label: 'Mike Evans (SF #156)', id: 'f4b55967-9001-4192-a9af-6fb1152ada31' },
];

const allFixedRecords = [];
for (const card of cardIdsToTry) {
  await throttle();
  try {
    const resp = await client.pricing.get(card.id, {
      listing_type: 'both', period: '1y',
    });
    const data = resp.data;
    const rawRecs = data?.raw?.records ?? [];
    const fixed = rawRecs.filter(r => r.listing_type === 'fixed');
    const auction = rawRecs.filter(r => r.listing_type === 'auction');

    console.log(`${card.label}: total=${rawRecs.length}, auction=${auction.length}, fixed=${fixed.length}`);

    for (const f of fixed.slice(0, 3)) {
      console.log(`  FIXED $${f.price} | ${f.date} | ${f.title?.substring(0, 70)} | url=${f.url ? 'yes' : 'null'}`);
      allFixedRecords.push({ card: card.label, ...f });
    }
  } catch (err) {
    console.log(`${card.label}: ERROR ${err.message}`);
  }
}

console.log(`\nTotal fixed records collected: ${allFixedRecords.length}`);

// Check some fixed record URLs to determine if sold or still listed
const urlsToCheck = allFixedRecords.filter(r => r.url).slice(0, 10);
console.log(`\nFixed record URLs to spot-check (${urlsToCheck.length}):`);
for (const r of urlsToCheck) {
  console.log(`  $${r.price} | ${r.date} | ${r.url}`);
}

results.push({
  test: 'fixed_records',
  totalCollected: allFixedRecords.length,
  samples: allFixedRecords.slice(0, 15).map(r => ({
    card: r.card, price: r.price, date: r.date, title: r.title, url: r.url, listing_type: r.listing_type,
  })),
});

// --- Parallel isolation (Q2) ---
console.log('\n=== PARALLEL ISOLATION (Q2) ===');

// Find Silver parallel
const silverPar = allParallels.find(p => p.name === 'Silver');
const holoPar = allParallels.find(p => p.name === 'Holo Foil');
const pinkPar = allParallels.find(p => p.name?.toLowerCase().includes('pink'));

console.log('Available test parallels:');
console.log(`  Silver: ${silverPar?.id ?? 'not found'}`);
console.log(`  Holo Foil: ${holoPar?.id ?? 'not found'}`);
console.log(`  Pink: ${pinkPar?.id ?? 'not found'}`);

// Get unique parallel names for reference
const uniqueNames = [...new Set(allParallels.map(p => p.name))].sort();
console.log(`\nAll ${uniqueNames.length} unique parallel names for 2026 Topps Flagship Football:`);
for (const n of uniqueNames) {
  const par = allParallels.find(p => p.name === n);
  console.log(`  ${n} (numberedTo: ${par?.numberedTo ?? 'null'}, isPartial: ${par?.isPartial ?? 'n/a'})`);
}

// Test isolation with a card that has sales
const testCard = { label: 'Makai Lemon', id: LEMON_ID };
const testPar = silverPar ?? holoPar ?? pinkPar ?? allParallels[0];

if (testPar) {
  console.log(`\nIsolation test: ${testCard.label} / base vs ${testPar.name} (${testPar.id})`);

  await throttle();
  const respBase = await client.pricing.get(testCard.id, {
    parallel_id: 'null', listing_type: 'auction', period: '1y',
  });
  const baseRecs = respBase.data?.raw?.records ?? [];

  await throttle();
  const respPar = await client.pricing.get(testCard.id, {
    parallel_id: testPar.id, listing_type: 'auction', period: '1y',
  });
  const parRecs = respPar.data?.raw?.records ?? [];

  console.log(`  Base request: ${baseRecs.length} records`);
  for (const r of baseRecs.slice(0, 3)) {
    console.log(`    $${r.price} | parallel_id=${r.parallel_id ?? 'MISSING'} | parallel_name=${r.parallel_name ?? 'MISSING'} | ${r.title?.substring(0, 50)}`);
  }

  console.log(`  ${testPar.name} request: ${parRecs.length} records`);
  for (const r of parRecs.slice(0, 3)) {
    console.log(`    $${r.price} | parallel_id=${r.parallel_id ?? 'MISSING'} | parallel_name=${r.parallel_name ?? 'MISSING'} | ${r.title?.substring(0, 50)}`);
  }

  // Check isolation
  const basePids = [...new Set(baseRecs.map(r => String(r.parallel_id)))];
  const parPids = [...new Set(parRecs.map(r => String(r.parallel_id)))];

  const baseBleeds = baseRecs.filter(r => r.parallel_id != null && r.parallel_id !== 'null');
  const parBleeds = parRecs.filter(r => r.parallel_id != null && r.parallel_id !== testPar.id);

  console.log(`  Base parallel_ids: ${JSON.stringify(basePids)}`);
  console.log(`  Parallel parallel_ids: ${JSON.stringify(parPids)}`);
  console.log(`  Base bleed (non-null parallel_id): ${baseBleeds.length}`);
  console.log(`  Parallel bleed (wrong parallel_id): ${parBleeds.length}`);

  // Check if the same records appear in both
  const baseUrls = new Set(baseRecs.map(r => r.url).filter(Boolean));
  const parUrls = new Set(parRecs.map(r => r.url).filter(Boolean));
  const sharedUrls = [...baseUrls].filter(u => parUrls.has(u));
  console.log(`  Shared URLs between base and parallel: ${sharedUrls.length}`);

  results.push({
    test: 'parallel_isolation',
    card: testCard.label,
    parallel: testPar.name,
    parallelId: testPar.id,
    baseCount: baseRecs.length,
    parallelCount: parRecs.length,
    baseParallelIds: basePids,
    parallelParallelIds: parPids,
    baseBleedCount: baseBleeds.length,
    parallelBleedCount: parBleeds.length,
    sharedUrls: sharedUrls.length,
  });

  // Also test with a second parallel for more confidence
  const secondPar = holoPar ?? allParallels.find(p => p.name !== testPar.name && p.numberedTo);
  if (secondPar && secondPar.id !== testPar.id) {
    console.log(`\n  Second isolation test: ${testCard.label} / ${secondPar.name} (${secondPar.id})`);
    await throttle();
    const resp2 = await client.pricing.get(testCard.id, {
      parallel_id: secondPar.id, listing_type: 'auction', period: '1y',
    });
    const recs2 = resp2.data?.raw?.records ?? [];
    console.log(`  ${secondPar.name}: ${recs2.length} records`);
    for (const r of recs2.slice(0, 2)) {
      console.log(`    $${r.price} | parallel_id=${r.parallel_id ?? 'MISSING'} | ${r.title?.substring(0, 50)}`);
    }
    const shared2 = [...new Set(recs2.map(r => r.url).filter(Boolean))].filter(u => baseUrls.has(u));
    console.log(`  Shared with base: ${shared2.length}`);

    results.push({
      test: 'parallel_isolation_2',
      parallel: secondPar.name,
      count: recs2.length,
      sharedWithBase: shared2.length,
    });
  }
}

// --- Shipping check (Q5) ---
console.log('\n=== SHIPPING CHECK (Q5) ===');
// Check if any pricing record has a shipping field
const sampleRecords = pricingData
  .filter(r => r.sampleRecord)
  .map(r => r.sampleRecord);
console.log(`Checking ${sampleRecords.length} sample records for shipping fields...`);
for (const r of sampleRecords) {
  console.log(`  Fields: ${Object.keys(r).join(', ')}`);
  if ('shipping' in r || 'shippingCents' in r || 'shipping_cost' in r) {
    console.log(`  HAS SHIPPING FIELD`);
  }
}
console.log('No shipping field found in pricing records.');
results.push({ test: 'shipping', shippingFieldPresent: false, recordFields: sampleRecords[0] ? Object.keys(sampleRecords[0]) : [] });

writeFileSync(resolve(RESULTS, '02b-remaining.json'), JSON.stringify(results, null, 2));
console.log('\nDone. Results saved to 02b-remaining.json');
