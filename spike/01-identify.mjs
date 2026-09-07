/**
 * M0.5 Spike — Step 1: CardSight Identify
 * Sends each card front to identify.cardBySegment('football', ...)
 * Records response shapes, confidence tiers, parallelSuggestions.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CardSightAI } from 'cardsightai';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES = resolve(__dirname, '../fixtures/cards/real');
const RESULTS = resolve(__dirname, 'results');

// Load API key from project .env.local
const envPath = resolve(__dirname, '../.env.local');
const envContent = readFileSync(envPath, 'utf-8');
const apiKey = envContent.match(/CARDSIGHTAI_API_KEY=(.+)/)?.[1]?.trim();
if (!apiKey) throw new Error('CARDSIGHTAI_API_KEY not found in .env.local');

const client = new CardSightAI({ apiKey });

const CARD_COUNT = 15;
const results = [];

for (let i = 1; i <= CARD_COUNT; i++) {
  const num = String(i).padStart(2, '0');
  const imagePath = resolve(FIXTURES, `${num}-front.jpg`);
  const imageBuffer = readFileSync(imagePath);
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' });

  console.log(`[${num}] Identifying...`);
  try {
    const resp = await client.identify.cardBySegment('football', blob);
    const data = resp.data;
    const error = resp.error;

    if (error) {
      console.log(`[${num}] ERROR: ${JSON.stringify(error)}`);
      results.push({ card: num, error, data: null });
      continue;
    }

    // Summarize (field names + shapes, not full sale records)
    const detections = data?.detections ?? [];
    console.log(`[${num}] ${detections.length} detection(s)`);
    for (const det of detections) {
      const c = det.card;
      console.log(`  confidence=${det.confidence} | ${c?.year ?? '?'} ${c?.releaseName ?? c?.setName ?? '?'} ${c?.name ?? '?'} #${c?.number ?? '?'}`);
      if (c?.parallelSuggestions?.length) {
        console.log(`  parallelSuggestions: ${c.parallelSuggestions.map(p => `${p.name}(${p.confidence ?? 'n/a'})`).join(', ')}`);
      }
      if (det.grading) {
        console.log(`  grading: ${JSON.stringify(det.grading)}`);
      }
    }

    results.push({
      card: num,
      success: data?.success,
      requestId: data?.requestId,
      processingTime: data?.processingTime,
      messages: data?.messages,
      detectionCount: detections.length,
      detections: detections.map(det => ({
        confidence: det.confidence,
        card: {
          id: det.card?.id,
          segmentId: det.card?.segmentId,
          releaseId: det.card?.releaseId,
          setId: det.card?.setId,
          year: det.card?.year,
          manufacturer: det.card?.manufacturer,
          releaseName: det.card?.releaseName,
          setName: det.card?.setName,
          name: det.card?.name,
          number: det.card?.number,
          description: det.card?.description,
          numberedTo: det.card?.numberedTo,
          attributes: det.card?.attributes,
          variationOf: det.card?.variationOf,
          fields: det.card?.fields,
          parallelSuggestions: det.card?.parallelSuggestions,
          suggestionCount: det.card?.suggestions?.length ?? 0,
          // Store full suggestion cards for analysis (field names only)
          suggestions: det.card?.suggestions?.map(s => ({
            id: s.id,
            year: s.year,
            releaseName: s.releaseName,
            setName: s.setName,
            name: s.name,
            number: s.number,
            parallelSuggestions: s.parallelSuggestions,
          })),
        },
        grading: det.grading,
      })),
    });
  } catch (err) {
    console.log(`[${num}] EXCEPTION: ${err.message}`);
    results.push({ card: num, error: err.message, data: null });
  }
}

writeFileSync(resolve(RESULTS, '01-identify.json'), JSON.stringify(results, null, 2));
console.log(`\nDone. ${results.length} cards processed. Saved to results/01-identify.json`);
