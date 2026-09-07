/**
 * M0.5 Spike — Established set isolation: pricing test
 * Uses card IDs from catalog search, goes straight to pricing.
 * Also finds parallels via search (e.g. "Justin Herbert 2020 Prizm Silver").
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

// Card IDs from previous search results
const cards = [
  {
    label: '2020 Prizm Justin Herbert #325',
    cardId: '7f0be670-ed0a-4fbd-ad90-74e6cb043832',
    parallelSearch: 'Justin Herbert 2020 Prizm Silver',
    numberedSearch: 'Justin Herbert 2020 Prizm Green',
  },
  {
    label: '2023 Prizm C.J. Stroud #6 (Prizmatic insert — trying base instead)',
    cardId: 'd581a05c-55f2-4bfd-bd37-c768fdc4592b',
    // The first result was Prizmatic insert, let's also search for base
    altSearch: 'C.J. Stroud 2023 Prizm 301',
    parallelSearch: 'C.J. Stroud 2023 Prizm Silver',
    numberedSearch: null,
  },
  {
    label: '2024 Donruss Optic Caleb Williams #201',
    cardId: '342db670-113d-4306-8919-a57a55163303',
    parallelSearch: 'Caleb Williams 2024 Donruss Optic Holo',
    numberedSearch: 'Caleb Williams 2024 Donruss Optic Blue',
  },
];

async function doPricingTest(label, cardId, parallelId, parallelLabel) {
  await throttle();
  const resp = await client.pricing.get(cardId, {
    parallel_id: parallelId,
    listing_type: 'auction',
    period: '1y',
  });
  const data = resp.data;
  const rawRecs = data?.raw?.records ?? [];
  let totalGraded = 0;
  for (const co of (data?.graded ?? [])) {
    for (const g of co.grades ?? []) totalGraded += g.count ?? 0;
  }

  console.log(`  ${parallelLabel}: raw=${rawRecs.length}, graded=${totalGraded}, total=${data?.meta?.total_records}`);
  if (data?.messages?.length) console.log(`    messages: ${JSON.stringify(data.messages)}`);

  // Check parallel_id/parallel_name on records
  const pids = [...new Set(rawRecs.map(r => r.parallel_id === undefined ? 'UNDEFINED' : r.parallel_id === null ? 'NULL' : r.parallel_id))];
  const pnames = [...new Set(rawRecs.map(r => r.parallel_name === undefined ? 'UNDEFINED' : r.parallel_name === null ? 'NULL' : r.parallel_name))];
  console.log(`    parallel_id values: ${JSON.stringify(pids)}`);
  console.log(`    parallel_name values: ${JSON.stringify(pnames)}`);

  // Show sample records
  for (const r of rawRecs.slice(0, 4)) {
    console.log(`    $${r.price} | ${r.date?.substring(0, 10)} | pid=${r.parallel_id === undefined ? 'UNDEF' : r.parallel_id} | pname=${r.parallel_name === undefined ? 'UNDEF' : r.parallel_name} | ${(r.title ?? '').substring(0, 60)}`);
  }

  // Also sample graded records
  const gradedRecs = [];
  for (const co of (data?.graded ?? [])) {
    for (const g of co.grades ?? []) {
      for (const r of (g.records ?? []).slice(0, 2)) {
        gradedRecs.push({ ...r, company: co.company_name, grade: g.grade_value });
      }
    }
  }
  if (gradedRecs.length > 0) {
    console.log(`    Graded samples:`);
    for (const r of gradedRecs.slice(0, 3)) {
      console.log(`      ${r.company} ${r.grade}: $${r.price} | pid=${r.parallel_id === undefined ? 'UNDEF' : r.parallel_id} | pname=${r.parallel_name === undefined ? 'UNDEF' : r.parallel_name} | ${(r.title ?? '').substring(0, 55)}`);
    }
  }

  return { rawRecs, totalGraded, total: data?.meta?.total_records, pids, pnames, urls: new Set(rawRecs.map(r => r.url).filter(Boolean)) };
}

for (const card of cards) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`CARD: ${card.label}`);
  console.log(`${'='.repeat(70)}`);

  // If there's an alt search (to find the base card), do that first
  let cardId = card.cardId;
  if (card.altSearch) {
    await throttle();
    const altResp = await client.catalog.search({ q: card.altSearch });
    const altResults = altResp.data?.results ?? [];
    console.log(`Alt search "${card.altSearch}": ${altResults.length} results`);
    if (altResults[0]) {
      console.log(`  Found: ${altResults[0].name} #${altResults[0].cardNumber} (${altResults[0].setName})`);
      if (altResults[0].setName === 'Base Set' || altResults[0].setName?.includes('Base')) {
        cardId = altResults[0].id;
        console.log(`  Using base set card ID: ${cardId}`);
      }
    }
  }

  // Base pricing
  console.log(`\n--- BASE (parallel_id='null') ---`);
  const baseResult = await doPricingTest(card.label, cardId, 'null', 'Base');

  // Find Silver/Holo parallel via search
  if (card.parallelSearch) {
    console.log(`\nSearching for parallel: "${card.parallelSearch}"`);
    await throttle();
    const parSearchResp = await client.catalog.search({ q: card.parallelSearch });
    const parSearchResults = parSearchResp.data?.results ?? [];
    console.log(`  ${parSearchResults.length} results`);

    // Find the one with a parallelName
    const withParallel = parSearchResults.find(r => r.parallelName);
    const bestPar = withParallel ?? parSearchResults[0];
    if (bestPar) {
      console.log(`  Best: ${bestPar.name} #${bestPar.cardNumber} | parallel=${bestPar.parallelName ?? 'none'} | set=${bestPar.setName}`);
      console.log(`  Keys: ${Object.keys(bestPar).join(', ')}`);

      // The search result might have a different card ID if it's a parallel variant
      // We need the parallel_id, not a different card_id
      // Check if search result has a parallel UUID we can use
      const parallelId = bestPar.parallelId ?? bestPar.parallel_id;
      if (parallelId) {
        console.log(`\n--- PARALLEL: ${bestPar.parallelName} (parallel_id='${parallelId}') ---`);
        const parResult = await doPricingTest(card.label, cardId, parallelId, bestPar.parallelName);

        // Isolation comparison
        console.log(`\n  ISOLATION COMPARISON:`);
        console.log(`    Base: ${baseResult.rawRecs.length} raw records`);
        console.log(`    ${bestPar.parallelName}: ${parResult.rawRecs.length} raw records`);
        const sharedUrls = [...parResult.urls].filter(u => baseResult.urls.has(u));
        console.log(`    Shared URLs: ${sharedUrls.length}`);
        if (baseResult.rawRecs.length > 0 && parResult.rawRecs.length > 0) {
          const bPrices = baseResult.rawRecs.map(r => r.price).sort((a, b) => a - b);
          const pPrices = parResult.rawRecs.map(r => r.price).sort((a, b) => a - b);
          console.log(`    Base price range: $${bPrices[0]}–$${bPrices[bPrices.length - 1]}`);
          console.log(`    Parallel price range: $${pPrices[0]}–$${pPrices[pPrices.length - 1]}`);
        }
      } else {
        console.log(`  No parallelId on search result — trying by name`);
        // Try getting parallels list for the card's release
        // Since we don't have releaseId from search, try searching parallels by name
        console.log(`  Search result fields: ${Object.keys(bestPar).join(', ')}`);
      }
    }
  }

  // Try numbered parallel
  if (card.numberedSearch) {
    console.log(`\nSearching for numbered parallel: "${card.numberedSearch}"`);
    await throttle();
    const numSearchResp = await client.catalog.search({ q: card.numberedSearch });
    const numSearchResults = numSearchResp.data?.results ?? [];
    console.log(`  ${numSearchResults.length} results`);
    const bestNum = numSearchResults.find(r => r.parallelName) ?? numSearchResults[0];
    if (bestNum) {
      console.log(`  Best: ${bestNum.name} #${bestNum.cardNumber} | parallel=${bestNum.parallelName ?? 'none'} | set=${bestNum.setName}`);
      const numParId = bestNum.parallelId ?? bestNum.parallel_id;
      if (numParId) {
        console.log(`\n--- NUMBERED PARALLEL: ${bestNum.parallelName} (parallel_id='${numParId}') ---`);
        const numResult = await doPricingTest(card.label, cardId, numParId, bestNum.parallelName);

        console.log(`\n  ISOLATION COMPARISON:`);
        console.log(`    Base: ${baseResult.rawRecs.length} raw records`);
        console.log(`    ${bestNum.parallelName}: ${numResult.rawRecs.length} raw records`);
        const sharedUrls2 = [...numResult.urls].filter(u => baseResult.urls.has(u));
        console.log(`    Shared URLs: ${sharedUrls2.length}`);
      }
    }
  }
}

console.log(`\n${'='.repeat(70)}`);
console.log('DONE');
