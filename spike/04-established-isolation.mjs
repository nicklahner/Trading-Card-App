/**
 * M0.5 Spike — Established set isolation test
 * Tests whether parallel_id is populated on pricing records for older,
 * well-cataloged sets (Prizm, Optic).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardSightAI } from 'cardsightai';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
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

const testCards = [
  { label: '2020 Prizm Justin Herbert #325', q: 'Justin Herbert 2020 Prizm', expectedNumber: '325' },
  { label: '2023 Prizm C.J. Stroud', q: 'C.J. Stroud 2023 Prizm', expectedNumber: null },
  { label: '2024 Donruss Optic Caleb Williams', q: 'Caleb Williams 2024 Donruss Optic', expectedNumber: null },
];

for (const tc of testCards) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CARD: ${tc.label}`);
  console.log(`${'='.repeat(70)}`);

  // Step 1: Catalog search
  await throttle();
  const searchResp = await client.catalog.search({ q: tc.q });
  const searchResults = searchResp.data?.results ?? [];
  console.log(`\nSearch "${tc.q}": ${searchResults.length} results`);

  // Find the best match (prefer matching card number if provided)
  let bestMatch = searchResults[0];
  if (tc.expectedNumber) {
    const numMatch = searchResults.find(r => r.cardNumber === tc.expectedNumber || r.number === tc.expectedNumber);
    if (numMatch) bestMatch = numMatch;
  }

  if (!bestMatch) {
    console.log('  NO RESULTS — skipping');
    continue;
  }

  // Log all search result fields
  console.log(`  Best match keys: ${Object.keys(bestMatch).join(', ')}`);
  console.log(`  id=${bestMatch.id}, name=${bestMatch.name}, number=${bestMatch.cardNumber ?? bestMatch.number}`);
  console.log(`  set=${bestMatch.setName}, release=${bestMatch.releaseName}, year=${bestMatch.year}`);

  const cardId = bestMatch.id;
  if (!cardId) {
    console.log('  No card ID — skipping');
    continue;
  }

  // Step 2: Get parallels for this release
  const releaseId = bestMatch.releaseId;
  const setId = bestMatch.setId;
  console.log(`\n  releaseId=${releaseId}, setId=${setId}`);

  if (releaseId) {
    await throttle();
    const parResp = await client.catalog.parallels.list({ releaseId, take: 50 });
    const pars = parResp.data?.parallels ?? [];
    console.log(`  Parallels for release: ${pars.length} (showing first 15)`);

    const uniqueNames = [...new Map(pars.map(p => [p.name, p])).values()];
    for (const p of uniqueNames.slice(0, 15)) {
      console.log(`    ${p.name} (id=${p.id}, numberedTo=${p.numberedTo ?? 'null'})`);
    }

    // Find Silver/Holo and a numbered parallel
    const silver = uniqueNames.find(p => /^silver$/i.test(p.name));
    const holo = uniqueNames.find(p => /^(holo|holographic)$/i.test(p.name));
    const silverOrHolo = silver ?? holo ?? uniqueNames.find(p => /silver|holo/i.test(p.name));
    const numbered = uniqueNames.find(p => p.numberedTo && p.numberedTo <= 199 && p.numberedTo > 1);

    console.log(`\n  Selected parallels:`);
    console.log(`    Silver/Holo: ${silverOrHolo ? `${silverOrHolo.name} (${silverOrHolo.id}, /${silverOrHolo.numberedTo ?? 'unnumbered'})` : 'NOT FOUND'}`);
    console.log(`    Numbered: ${numbered ? `${numbered.name} (${numbered.id}, /${numbered.numberedTo})` : 'NOT FOUND'}`);

    // Step 3: Pricing — base vs parallel
    console.log(`\n--- PRICING: base (parallel_id='null') ---`);
    await throttle();
    const baseResp = await client.pricing.get(cardId, {
      parallel_id: 'null',
      listing_type: 'auction',
      period: '1y',
    });
    const baseData = baseResp.data;
    const baseRecs = baseData?.raw?.records ?? [];
    const baseGraded = baseData?.graded ?? [];
    let totalBaseGraded = 0;
    for (const co of baseGraded) {
      for (const g of co.grades ?? []) totalBaseGraded += g.count ?? 0;
    }

    console.log(`  Raw records: ${baseRecs.length}, Graded companies: ${baseGraded.length}, Total graded records: ${totalBaseGraded}`);
    console.log(`  meta.total_records: ${baseData?.meta?.total_records}`);
    if (baseData?.messages?.length) console.log(`  messages: ${JSON.stringify(baseData.messages)}`);

    // Inspect parallel_id on base records
    const basePidValues = baseRecs.map(r => ({ parallel_id: r.parallel_id, parallel_name: r.parallel_name }));
    const uniqueBasePids = [...new Set(basePidValues.map(v => String(v.parallel_id)))];
    const uniqueBasePnames = [...new Set(basePidValues.map(v => String(v.parallel_name)))];
    console.log(`  parallel_id values on records: ${JSON.stringify(uniqueBasePids)}`);
    console.log(`  parallel_name values on records: ${JSON.stringify(uniqueBasePnames)}`);

    // Show a few records with their parallel info
    for (const r of baseRecs.slice(0, 5)) {
      console.log(`    $${r.price} | ${r.listing_type} | pid=${r.parallel_id ?? 'MISSING'} | pname=${r.parallel_name ?? 'MISSING'} | ${(r.title ?? '').substring(0, 65)}`);
    }

    // Also check graded records for parallel_id
    if (baseGraded.length > 0) {
      const firstGradeGroup = baseGraded[0]?.grades?.[0];
      if (firstGradeGroup?.records?.length) {
        const gr = firstGradeGroup.records[0];
        console.log(`  Graded sample: $${gr.price} | pid=${gr.parallel_id ?? 'MISSING'} | pname=${gr.parallel_name ?? 'MISSING'} | ${(gr.title ?? '').substring(0, 60)}`);
      }
    }

    // Step 4: Silver/Holo parallel pricing
    if (silverOrHolo) {
      console.log(`\n--- PRICING: ${silverOrHolo.name} (parallel_id='${silverOrHolo.id}') ---`);
      await throttle();
      const parResp2 = await client.pricing.get(cardId, {
        parallel_id: silverOrHolo.id,
        listing_type: 'auction',
        period: '1y',
      });
      const parData = parResp2.data;
      const parRecs = parData?.raw?.records ?? [];
      let totalParGraded = 0;
      for (const co of (parData?.graded ?? [])) {
        for (const g of co.grades ?? []) totalParGraded += g.count ?? 0;
      }

      console.log(`  Raw records: ${parRecs.length}, Graded records: ${totalParGraded}`);
      console.log(`  meta.total_records: ${parData?.meta?.total_records}`);

      const parPids = [...new Set(parRecs.map(r => String(r.parallel_id)))];
      const parPnames = [...new Set(parRecs.map(r => String(r.parallel_name)))];
      console.log(`  parallel_id values: ${JSON.stringify(parPids)}`);
      console.log(`  parallel_name values: ${JSON.stringify(parPnames)}`);

      for (const r of parRecs.slice(0, 5)) {
        console.log(`    $${r.price} | pid=${r.parallel_id ?? 'MISSING'} | pname=${r.parallel_name ?? 'MISSING'} | ${(r.title ?? '').substring(0, 65)}`);
      }

      // Compare with base
      const baseUrls = new Set(baseRecs.map(r => r.url).filter(Boolean));
      const parUrls = new Set(parRecs.map(r => r.url).filter(Boolean));
      const shared = [...parUrls].filter(u => baseUrls.has(u));
      console.log(`\n  ISOLATION CHECK:`);
      console.log(`    Base records: ${baseRecs.length}`);
      console.log(`    ${silverOrHolo.name} records: ${parRecs.length}`);
      console.log(`    Shared URLs: ${shared.length}`);
      console.log(`    Records are identical sets: ${baseRecs.length === parRecs.length && shared.length === parRecs.length ? 'YES (BROKEN)' : 'NO'}`);

      if (parRecs.length > 0 && baseRecs.length > 0) {
        const basePrices = baseRecs.map(r => r.price).sort((a, b) => a - b);
        const parPrices = parRecs.map(r => r.price).sort((a, b) => a - b);
        console.log(`    Base price range: $${basePrices[0]}–$${basePrices[basePrices.length - 1]}`);
        console.log(`    ${silverOrHolo.name} price range: $${parPrices[0]}–$${parPrices[parPrices.length - 1]}`);
      }
    }

    // Step 5: Numbered parallel pricing
    if (numbered) {
      console.log(`\n--- PRICING: ${numbered.name} /${numbered.numberedTo} (parallel_id='${numbered.id}') ---`);
      await throttle();
      const numResp = await client.pricing.get(cardId, {
        parallel_id: numbered.id,
        listing_type: 'auction',
        period: '1y',
      });
      const numData = numResp.data;
      const numRecs = numData?.raw?.records ?? [];

      console.log(`  Raw records: ${numRecs.length}`);
      console.log(`  meta.total_records: ${numData?.meta?.total_records}`);

      const numPids = [...new Set(numRecs.map(r => String(r.parallel_id)))];
      const numPnames = [...new Set(numRecs.map(r => String(r.parallel_name)))];
      console.log(`  parallel_id values: ${JSON.stringify(numPids)}`);
      console.log(`  parallel_name values: ${JSON.stringify(numPnames)}`);

      for (const r of numRecs.slice(0, 5)) {
        console.log(`    $${r.price} | pid=${r.parallel_id ?? 'MISSING'} | pname=${r.parallel_name ?? 'MISSING'} | ${(r.title ?? '').substring(0, 65)}`);
      }

      // Compare with base
      const baseUrls2 = new Set(baseRecs.map(r => r.url).filter(Boolean));
      const numUrls = new Set(numRecs.map(r => r.url).filter(Boolean));
      const shared2 = [...numUrls].filter(u => baseUrls2.has(u));
      console.log(`\n  ISOLATION CHECK:`);
      console.log(`    Base records: ${baseRecs.length}`);
      console.log(`    ${numbered.name} records: ${numRecs.length}`);
      console.log(`    Shared URLs: ${shared2.length}`);
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('DONE');
