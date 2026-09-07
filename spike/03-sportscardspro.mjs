/**
 * M0.5 Spike — Step 4: SportsCardsPro API
 * Tests /api/products and /api/product endpoints.
 * Respects 1 req/s rate limit.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS = resolve(__dirname, 'results');

const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const token = envContent.match(/SPORTSCARDSPRO_TOKEN=(.+)/)?.[1]?.trim();
if (!token) throw new Error('SPORTSCARDSPRO_TOKEN not found in .env.local');

const BASE_URL = 'https://www.sportscardspro.com';

let lastCall = 0;
async function throttle() {
  const now = Date.now();
  const elapsed = now - lastCall;
  if (elapsed < 1100) await new Promise(r => setTimeout(r, 1100 - elapsed));
  lastCall = Date.now();
}

async function scpGet(path) {
  await throttle();
  const url = `${BASE_URL}${path}&t=${token}`;
  const resp = await fetch(url);
  if (resp.status === 429) {
    console.log('  429 — backing off 5s');
    await new Promise(r => setTimeout(r, 5000));
    lastCall = Date.now();
    return scpGet(path);
  }
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`SCP ${resp.status}: ${text.substring(0, 200)}`);
  }
  return resp.json();
}

const results = [];

// Cards to search (using what we know from the card photos)
const searchCards = [
  { label: '#01 Eli Heidenreich', q: '2026 Topps Flagship Eli Heidenreich 398', qNoParallel: '2026 Topps Flagship Eli Heidenreich' },
  { label: '#05 Makai Lemon', q: '2026 Topps Flagship Makai Lemon 319', qNoParallel: '2026 Topps Flagship Makai Lemon' },
  { label: '#03 Isiah Pacheco Pink', q: '2026 Topps Flagship Isiah Pacheco Pink', qNoParallel: '2026 Topps Flagship Isiah Pacheco' },
  { label: '#09 Omarion Hampton', q: '2026 Topps Flagship Omarion Hampton 107', qNoParallel: '2026 Topps Flagship Omarion Hampton' },
  { label: '#10 Abdul Carter', q: '2026 Topps Flagship Abdul Carter', qNoParallel: '2026 Topps Flagship Abdul Carter' },
  { label: '#13 Mike Evans', q: '2026 Topps Flagship Mike Evans', qNoParallel: '2026 Topps Flagship Mike Evans' },
  { label: '#14 Milton Williams', q: '2026 Topps Flagship Milton Williams', qNoParallel: '2026 Topps Flagship Milton Williams' },
  { label: '#15 Americas Duo', q: '2026 Topps Flagship Americas Duo', qNoParallel: '2026 Topps Flagship Americas Duo' },
  { label: '#06 Jalen Hurts', q: '2026 Topps Flagship Jalen Hurts', qNoParallel: '2026 Topps Flagship Jalen Hurts' },
];

// Test 1: /api/products (multi-result search) — without parallel term (Q8)
console.log('=== /api/products (no parallel term, Q8) ===');
for (const card of searchCards) {
  console.log(`\n${card.label}: q="${card.qNoParallel}"`);
  try {
    const data = await scpGet(`/api/products?q=${encodeURIComponent(card.qNoParallel)}`);

    const products = data?.products ?? (Array.isArray(data) ? data : []);
    console.log(`  ${products.length} products returned`);
    if (products[0]) {
      console.log(`  Fields: ${Object.keys(products[0]).join(', ')}`);
    }
    for (const p of products.slice(0, 6)) {
      const loose = p['loose-price'] ?? p['ungraded-price'];
      console.log(`    id=${p.id} | ${p['product-name']} | loose=${loose} pennies ($${(loose/100).toFixed(2)}) | vol=${p['sales-volume'] ?? '?'}`);
    }
    if (products.length > 6) console.log(`    ... and ${products.length - 6} more`);

    results.push({
      test: 'products_no_parallel',
      card: card.label,
      query: card.qNoParallel,
      resultCount: products.length,
      products: products.slice(0, 10).map(p => ({
        id: p.id,
        consoleName: p['console-name'],
        productName: p['product-name'],
        loosePrice: p['loose-price'],
        salesVolume: p['sales-volume'],
        _fields: Object.keys(p),
      })),
      cappedAt20: products.length === 20,
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
    results.push({ test: 'products_no_parallel', card: card.label, error: err.message });
  }
}

// Test 2: /api/products WITH parallel term for Pacheco (Pink)
console.log('\n\n=== /api/products (with parallel term) ===');
const parallelSearches = [
  { label: '#03 Isiah Pacheco Pink', q: '2026 Topps Flagship Isiah Pacheco Pink' },
  { label: '#09 Omarion Hampton Holo Foil', q: '2026 Topps Flagship Omarion Hampton Holo Foil' },
];

for (const ps of parallelSearches) {
  console.log(`\n${ps.label}: q="${ps.q}"`);
  try {
    const data = await scpGet(`/api/products?q=${encodeURIComponent(ps.q)}`);
    const products = data?.products ?? (Array.isArray(data) ? data : []);
    console.log(`  ${products.length} products`);
    for (const p of products.slice(0, 5)) {
      const loose = p['loose-price'] ?? 0;
      console.log(`    id=${p.id} | ${p['product-name']} | loose=${loose} ($${(loose/100).toFixed(2)}) | vol=${p['sales-volume'] ?? '?'}`);
    }
    results.push({
      test: 'products_with_parallel',
      card: ps.label,
      query: ps.q,
      resultCount: products.length,
      products: products.slice(0, 5).map(p => ({ id: p.id, productName: p['product-name'], loosePrice: p['loose-price'], salesVolume: p['sales-volume'] })),
      cappedAt20: products.length === 20,
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}

// Test 3: /api/product (single product detail) for a found product
console.log('\n\n=== /api/product (single product detail) ===');
const firstProduct = results.find(r => r.test === 'products_no_parallel' && r.products?.[0])?.products?.[0];
if (firstProduct) {
  console.log(`\nFetching detail for: ${firstProduct.productName ?? firstProduct['product-name']} (id=${firstProduct.id})`);
  try {
    const data = await scpGet(`/api/product?id=${firstProduct.id}`);
    console.log(`  Fields: ${Object.keys(data).join(', ')}`);
    console.log(`  ungraded-price: ${data['ungraded-price']}`);
    console.log(`  sales-volume: ${data['sales-volume']}`);
    console.log(`  console-name: ${data['console-name']}`);
    console.log(`  product-name: ${data['product-name']}`);

    // Log all grade prices
    const gradeFields = Object.entries(data).filter(([k]) =>
      k.match(/price|graded|psa|bgs|sgc|cgc/i) || k.includes('10') || k.includes('9')
    );
    console.log(`  Grade-related fields:`);
    for (const [k, v] of gradeFields) {
      console.log(`    ${k}: ${v}`);
    }

    results.push({
      test: 'product_detail',
      id: firstProduct.id,
      data,
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }
}

writeFileSync(resolve(RESULTS, '03-sportscardspro.json'), JSON.stringify(results, null, 2));
console.log('\n\nDone. Results saved to 03-sportscardspro.json');
