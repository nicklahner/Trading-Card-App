/**
 * M0.5 Spike — Steps 2+3: CardSight Catalog Parallels + Pricing
 * With rate limiting (4 req/s max for CardSight).
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

const identifyResults = JSON.parse(readFileSync(resolve(RESULTS, '01-identify.json'), 'utf-8'));

// Rate limiter: max 3 req/s to stay safely under the 4/s limit
let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 350) await new Promise(r => setTimeout(r, 350 - elapsed));
  lastCall = Date.now();
}

const RELEASE_ID = '7d7b6650-5ea9-4340-b3e7-83a29ec52480';

// ---- Part A: Catalog parallels ----
console.log('=== CATALOG PARALLELS ===');

const parallelsResult = { pages: [] };
let skip = 0;
const take = 100;
let totalParallels = 0;

while (true) {
  await throttle();
  const resp = await client.catalog.parallels.list({ releaseId: RELEASE_ID, take, skip });
  const data = resp.data;

  // Log raw response shape for first page
  if (skip === 0) {
    console.log('Raw parallels response keys:', data ? Object.keys(data) : 'null');
    console.log('Sample entry:', JSON.stringify(data?.data?.[0] ?? data?.parallels?.[0] ?? 'none', null, 2));
  }

  // The response might be { data: [...] } or { parallels: [...] } or an array directly
  const items = data?.data ?? data?.parallels ?? (Array.isArray(data) ? data : []);
  if (!items.length) break;

  const parallels = items.map(p => ({
    id: p.id,
    name: p.name,
    numberedTo: p.numberedTo ?? p.numbered_to ?? null,
    _allKeys: Object.keys(p),
  }));

  parallelsResult.pages.push({ skip, count: parallels.length, parallels });
  totalParallels += parallels.length;
  console.log(`Page skip=${skip}: ${parallels.length} parallels`);
  for (const p of parallels.slice(0, 8)) {
    console.log(`  ${p.name} (numberedTo: ${p.numberedTo ?? 'null'}) [keys: ${p._allKeys.join(',')}]`);
  }
  if (parallels.length > 8) console.log(`  ... and ${parallels.length - 8} more`);

  if (items.length < take) break;
  skip += take;
}

console.log(`Total parallels found: ${totalParallels}\n`);
writeFileSync(resolve(RESULTS, '02-parallels.json'), JSON.stringify(parallelsResult, null, 2));

// ---- Part B: Catalog search ----
console.log('=== CATALOG SEARCH ===');

const searchQueries = [
  { label: '#03 Isiah Pacheco', q: 'Isiah Pacheco 2026 Topps' },
  { label: '#04 Malachi Fields', q: 'Malachi Fields 2025 Topps' },
  { label: '#07 Ty Simpson', q: 'Ty Simpson 2025 Topps Football' },
  { label: '#08 Alvin Kamara Big Ticket', q: 'Alvin Kamara 2026 Topps Big Ticket' },
  { label: '#09 Omarion Hampton', q: 'Omarion Hampton 2026 Topps' },
  { label: '#10 Abdul Carter', q: 'Abdul Carter 2026 Topps' },
  { label: '#11 Brian Thomas Jr', q: 'Brian Thomas Jr 2026 Topps Profiles' },
  { label: '#12 Malaki Starks', q: 'Malaki Starks 2026 Topps' },
  { label: '#13 Mike Evans', q: 'Mike Evans 2026 Topps' },
  { label: '#14 Milton Williams', q: 'Milton Williams 2026 Topps' },
];

const searchResults = [];
for (const sq of searchQueries) {
  await throttle();
  console.log(`Searching: ${sq.label} (q="${sq.q}")`);
  const resp = await client.catalog.search({ q: sq.q });
  const data = resp.data;

  // Log raw shape once
  if (searchResults.length === 0) {
    console.log('  Raw search response keys:', data ? Object.keys(data) : 'null');
    const firstResult = data?.results?.[0] ?? data?.data?.[0];
    if (firstResult) {
      console.log('  First result keys:', Object.keys(firstResult));
      console.log('  First result sample:', JSON.stringify(firstResult, null, 2).substring(0, 500));
    }
  }

  const results = data?.results ?? data?.data ?? [];
  console.log(`  ${results.length} result(s)`);

  // Adapt to actual shape
  const mapped = results.slice(0, 5).map(r => {
    // Search results may be { card: {...} } or flat
    const c = r.card ?? r;
    return {
      cardId: c.id ?? c.cardId,
      name: c.name ?? c.playerName,
      number: c.number ?? c.cardNumber,
      setName: c.setName,
      releaseName: c.releaseName ?? c.release,
      year: c.year,
      attributes: c.attributes,
      _keys: Object.keys(c),
    };
  });

  for (const m of mapped) {
    console.log(`    ${m.year ?? '?'} ${m.releaseName ?? '?'} | ${m.name ?? '?'} #${m.number ?? '?'} | id=${m.cardId ?? '?'}`);
  }

  searchResults.push({ query: sq, resultCount: results.length, top5: mapped });
}
writeFileSync(resolve(RESULTS, '02-search.json'), JSON.stringify(searchResults, null, 2));

// ---- Part C: Pricing ----
console.log('\n=== PRICING ===');

// Collect card IDs: from identify (with id) + from search
const pricingCards = [];

for (const r of identifyResults) {
  if (r.detections?.[0]?.card?.id) {
    pricingCards.push({
      label: `identify #${r.card}: ${r.detections[0].card.name}`,
      cardId: r.detections[0].card.id,
    });
  }
}

for (const sr of searchResults) {
  if (sr.top5?.[0]?.cardId) {
    pricingCards.push({
      label: `search ${sr.query.label}: ${sr.top5[0].name}`,
      cardId: sr.top5[0].cardId,
    });
  }
}

// Deduplicate
const seen = new Set();
const uniquePricingCards = pricingCards.filter(c => {
  if (seen.has(c.cardId)) return false;
  seen.add(c.cardId);
  return true;
});

console.log(`Testing pricing on ${uniquePricingCards.length} unique cards\n`);

const pricingResults = [];

// Test 1: Auction pricing with parallel_id='null' (base) for each card
console.log('--- Auction pricing (base, parallel_id=null, 1y) ---');
for (const card of uniquePricingCards) {
  await throttle();
  console.log(`  ${card.label} (${card.cardId})`);
  try {
    const resp = await client.pricing.get(card.cardId, {
      parallel_id: 'null',
      listing_type: 'auction',
      period: '1y',
    });
    const data = resp.data;
    const rawCount = data?.raw?.count ?? 0;
    const gradedCompanies = data?.graded?.length ?? 0;
    const totalRecords = data?.meta?.total_records ?? 0;
    const messages = data?.messages;

    const rawRecords = data?.raw?.records ?? [];
    const parallelIds = [...new Set(rawRecords.map(r => r.parallel_id))];

    console.log(`    raw=${rawCount}, graded=${gradedCompanies} cos, total=${totalRecords}, parallel_ids=${JSON.stringify(parallelIds)}`);
    if (messages?.length) console.log(`    messages: ${JSON.stringify(messages)}`);

    if (rawRecords.length > 0) {
      const s = rawRecords[0];
      console.log(`    sample: $${s.price} | ${s.listing_type} | ${s.date} | title=${s.title ? 'yes' : 'null'} | url=${s.url ? 'yes' : 'null'} | parallel_id=${s.parallel_id ?? 'missing'} | parallel_name=${s.parallel_name ?? 'missing'}`);
    }

    pricingResults.push({
      test: 'auction_base',
      card: card.label,
      cardId: card.cardId,
      rawCount, gradedCompanies, totalRecords, messages,
      query: data?.query,
      cardContext: data?.card,
      meta: data?.meta,
      sampleRecord: rawRecords[0] ?? null,
      rawParallelIds: parallelIds,
      allRecordFields: rawRecords[0] ? Object.keys(rawRecords[0]) : [],
    });
  } catch (err) {
    console.log(`    ERROR: ${err.message}`);
    pricingResults.push({ test: 'auction_base', card: card.label, error: err.message });
  }
}

// Test 2: Paging with as_of_date on the busiest card
const busiestCard = pricingResults
  .filter(r => r.test === 'auction_base' && r.totalRecords > 0)
  .sort((a, b) => b.totalRecords - a.totalRecords)[0];

if (busiestCard) {
  console.log(`\n--- Paging test: ${busiestCard.card} (${busiestCard.totalRecords} records) ---`);
  await throttle();
  const resp1 = await client.pricing.get(busiestCard.cardId, {
    parallel_id: 'null', listing_type: 'auction', period: '1y', limit: 5,
  });
  const d1 = resp1.data;
  const records1 = d1?.raw?.records ?? [];
  console.log(`  limit=5: raw=${d1?.raw?.count}, total=${d1?.meta?.total_records}, msgs=${JSON.stringify(d1?.messages)}`);
  console.log(`  query.as_of_date=${d1?.query?.as_of_date}`);

  if (records1.length > 0) {
    const oldestDate = records1[records1.length - 1]?.date;
    console.log(`  oldest record date: ${oldestDate}`);
    if (oldestDate) {
      await throttle();
      const resp2 = await client.pricing.get(busiestCard.cardId, {
        parallel_id: 'null', listing_type: 'auction', period: '1y', as_of_date: oldestDate, limit: 5,
      });
      const d2 = resp2.data;
      console.log(`  page2 (as_of_date=${oldestDate}): raw=${d2?.raw?.count}, total=${d2?.meta?.total_records}`);
      console.log(`  query.as_of_date=${d2?.query?.as_of_date}`);

      pricingResults.push({
        test: 'paging',
        card: busiestCard.card,
        page1: { rawCount: d1?.raw?.count, total: d1?.meta?.total_records, messages: d1?.messages, queryAsOfDate: d1?.query?.as_of_date },
        page2: { rawCount: d2?.raw?.count, total: d2?.meta?.total_records, asOfDate: oldestDate, queryAsOfDate: d2?.query?.as_of_date },
      });
    }
  }
}

// Test 3: Fixed records for Q4
console.log('\n--- Fixed pricing (listing_type=both) for Q4 ---');
const fixedResults = [];
for (const card of uniquePricingCards.slice(0, 6)) {
  await throttle();
  try {
    const resp = await client.pricing.get(card.cardId, {
      listing_type: 'both', period: '1y',
    });
    const data = resp.data;
    const rawRecords = data?.raw?.records ?? [];
    const fixedRecs = rawRecords.filter(r => r.listing_type === 'fixed');
    const auctionRecs = rawRecords.filter(r => r.listing_type === 'auction');

    console.log(`  ${card.label}: raw=${rawRecords.length}, auction=${auctionRecs.length}, fixed=${fixedRecs.length}`);
    for (const f of fixedRecs.slice(0, 3)) {
      console.log(`    FIXED: $${f.price} | ${f.date} | ${f.title?.substring(0, 60) ?? 'no title'} | url=${f.url ? 'yes' : 'null'}`);
    }

    fixedResults.push({
      card: card.label,
      totalRaw: rawRecords.length,
      auctionCount: auctionRecs.length,
      fixedCount: fixedRecs.length,
      fixedSamples: fixedRecs.slice(0, 5).map(r => ({
        title: r.title, price: r.price, date: r.date, url: r.url, listing_type: r.listing_type,
      })),
    });
  } catch (err) {
    console.log(`  ${card.label}: ERROR ${err.message}`);
  }
}
pricingResults.push({ test: 'fixed_records', results: fixedResults });

// Test 4: Parallel isolation (Q2)
console.log('\n--- Parallel isolation test (Q2) ---');
const allParallels = parallelsResult.pages.flatMap(p => p.parallels);
if (allParallels.length > 0 && uniquePricingCards.length > 0) {
  const par = allParallels.find(p => p.name?.toLowerCase().includes('silver')) ?? allParallels[1] ?? allParallels[0];
  const testCard = uniquePricingCards[0];
  console.log(`  Card: ${testCard.label}, Parallel: ${par.name} (${par.id})`);

  await throttle();
  const respBase = await client.pricing.get(testCard.cardId, {
    parallel_id: 'null', listing_type: 'auction', period: '1y',
  });
  const baseRecs = respBase.data?.raw?.records ?? [];

  await throttle();
  const respPar = await client.pricing.get(testCard.cardId, {
    parallel_id: par.id, listing_type: 'auction', period: '1y',
  });
  const parRecs = respPar.data?.raw?.records ?? [];

  const basePids = [...new Set(baseRecs.map(r => r.parallel_id))];
  const parPids = [...new Set(parRecs.map(r => r.parallel_id))];

  console.log(`  Base: ${baseRecs.length} records, parallel_ids: ${JSON.stringify(basePids)}`);
  console.log(`  Parallel: ${parRecs.length} records, parallel_ids: ${JSON.stringify(parPids)}`);

  const baseBleeds = baseRecs.filter(r => r.parallel_id != null);
  const parBleeds = parRecs.filter(r => r.parallel_id !== par.id && r.parallel_id != null);

  console.log(`  Base bleed: ${baseBleeds.length}, Parallel bleed: ${parBleeds.length}`);

  pricingResults.push({
    test: 'parallel_isolation',
    card: testCard.label,
    parallel: par,
    baseRecordCount: baseRecs.length, baseParallelIds: basePids,
    parallelRecordCount: parRecs.length, parallelParallelIds: parPids,
    baseBleedCount: baseBleeds.length, parallelBleedCount: parBleeds.length,
  });
} else {
  console.log('  Skipped — no parallels found in catalog');
  pricingResults.push({ test: 'parallel_isolation', skipped: true, reason: 'no parallels in catalog' });
}

writeFileSync(resolve(RESULTS, '02-pricing.json'), JSON.stringify(pricingResults, null, 2));
console.log('\nDone. Results saved.');
