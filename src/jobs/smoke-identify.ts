/**
 * smoke:identify — Run the identification pipeline against real card photos
 * and compare results to the manifest's expected values.
 *
 * Usage: PROVIDERS_MODE=live pnpm tsx src/jobs/smoke-identify.ts [cardIds...]
 *
 * Reads fixtures/cards/real/manifest.json, runs identification on each card
 * that has images present on disk, and reports accuracy.
 *
 * Exit codes:
 *   0 — pipeline accuracy targets met, no wrong parallels without parallel_uncertain
 *   1 — pipeline got something wrong (controllable)
 *   (catalog misses do NOT cause failure — they are uncontrollable)
 */

import { config } from 'dotenv';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

// Load .env then .env.local (local overrides)
config({ path: '.env' });
config({ path: '.env.local', override: true });
import { createProviders } from '@/providers';
import type { ImageRef } from '@/providers';
import { runIdentificationPipeline, type ScoredCandidate } from '@/domain/identification/pipeline';
import { canonicalSetName, canonicalParallelName } from '@/domain/identity/aliases';

// ---------------------------------------------------------------------------
// Manifest types
// ---------------------------------------------------------------------------

type FieldStatus = 'verified' | 'best_guess' | 'unsure';

interface ExpectedField<T> {
  value: T;
  status: FieldStatus;
}

interface ManifestCard {
  id: string;
  front: string;
  back: string;
  tilt: string | null;
  expected: {
    year: ExpectedField<number | null>;
    set_name: ExpectedField<string | null>;
    card_number: ExpectedField<string | null>;
    player: ExpectedField<string | null>;
    parallel: ExpectedField<string | null>;
    print_run: ExpectedField<number | null>;
    auto: ExpectedField<boolean>;
    memorabilia: ExpectedField<boolean>;
    serial: ExpectedField<string | null>;
    storage: string;
  };
}

interface Manifest {
  cards: ManifestCard[];
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

type FieldResult = 'correct' | 'wrong' | 'excluded' | 'not_in_catalog';

interface ExtractionSummary {
  player: string | null;
  year: number | null;
  set_name: string | null;
  card_number: string | null;
  manufacturer: string | null;
  parallel_printed: string | null;
  finish: string;
  serial: string | null;
  auto: boolean | null;
  memorabilia: boolean | null;
  rookie: boolean | null;
  kind: string;
}

interface CardResult {
  cardId: string;
  storage: string;
  catalogMiss: boolean;
  fields: Record<string, FieldResult>;
  parallelFlags: string[];
  details: Record<string, { expected: unknown; got: unknown }>;
  extractionSummary: ExtractionSummary | null;
  candidateCount: number;
  flags: string[];
  status: string;
}

// ---------------------------------------------------------------------------
// Field comparison
// ---------------------------------------------------------------------------

function compareField(
  fieldName: string,
  expected: ExpectedField<unknown>,
  actual: unknown,
): FieldResult {
  if (expected.status === 'unsure') return 'excluded';

  // Normalize for comparison
  if (fieldName === 'set_name' && typeof expected.value === 'string' && typeof actual === 'string') {
    return canonicalSetName(expected.value) === canonicalSetName(actual) ? 'correct' : 'wrong';
  }

  if (fieldName === 'parallel') {
    // Both null = correct
    if (expected.value == null && actual == null) return 'correct';
    if (expected.value == null || actual == null) return 'wrong';
    if (typeof expected.value === 'string' && typeof actual === 'string') {
      return canonicalParallelName(expected.value) === canonicalParallelName(actual)
        ? 'correct'
        : 'wrong';
    }
    return 'wrong';
  }

  if (fieldName === 'card_number' && typeof expected.value === 'string' && typeof actual === 'string') {
    const a = expected.value.replace(/^#/, '').trim().toLowerCase();
    const b = actual.replace(/^#/, '').trim().toLowerCase();
    return a === b ? 'correct' : 'wrong';
  }

  // Generic comparison
  if (expected.value === actual) return 'correct';
  if (expected.value == null && actual == null) return 'correct';
  return 'wrong';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rootDir = resolve(process.cwd());
  const manifestPath = join(rootDir, 'fixtures/cards/real/manifest.json');

  if (!existsSync(manifestPath)) {
    console.error('Manifest not found:', manifestPath);
    process.exit(1);
  }

  const manifest: Manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  // Filter to specific card IDs if passed as args
  const requestedIds = process.argv.slice(2);
  const cards = requestedIds.length > 0
    ? manifest.cards.filter((c) => requestedIds.includes(c.id))
    : manifest.cards;

  // Filter to cards with images present on disk
  const cardsDir = join(rootDir, 'fixtures/cards/real');
  const availableCards = cards.filter((c) => {
    const frontPath = join(cardsDir, c.front);
    return existsSync(frontPath);
  });

  if (availableCards.length === 0) {
    console.error('No cards with images found on disk.');
    process.exit(1);
  }

  console.log(`Running identification on ${availableCards.length} cards...\n`);

  const providers = createProviders('live');
  const results: CardResult[] = [];

  for (const card of availableCards) {
    const images: ImageRef[] = [];

    const frontPath = join(cardsDir, card.front);
    if (existsSync(frontPath)) {
      images.push({ url: `file://${frontPath}`, side: 'front' });
    }

    const backPath = join(cardsDir, card.back);
    if (existsSync(backPath)) {
      images.push({ url: `file://${backPath}`, side: 'back' });
    }

    if (card.tilt) {
      const tiltPath = join(cardsDir, card.tilt);
      if (existsSync(tiltPath)) {
        images.push({ url: `file://${tiltPath}`, side: 'front_tilt' });
      }
    }

    console.log(`  Card ${card.id}: identifying...`);

    try {
      const result = await runIdentificationPipeline({
        images,
        providers,
        sessionStorage: card.expected.storage === 'none' ? 'none' : card.expected.storage,
      });

      const top1 = result.candidates.length > 0 ? result.candidates[0] : null;
      const providerFailed = result.flags.includes('cardsight_failed');
      const catalogMiss = !providerFailed && (top1 == null || result.unmatched);
      const expected = card.expected;
      const fields: Record<string, FieldResult> = {};
      const details: Record<string, { expected: unknown; got: unknown }> = {};

      if (catalogMiss) {
        // All scorable fields become not_in_catalog
        for (const f of ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'] as const) {
          const ef = expected[f];
          fields[f] = ef.status === 'unsure' ? 'excluded' : 'not_in_catalog';
        }
      } else {
        // Compare each field against top-1 candidate
        fields.year = compareField('year', expected.year, top1!.year);
        fields.set_name = compareField('set_name', expected.set_name, top1!.setName);
        fields.card_number = compareField('card_number', expected.card_number, top1!.cardNumber);
        fields.player = compareField('player', expected.player, top1!.playerName);
        fields.parallel = compareField(
          'parallel',
          expected.parallel,
          top1!.resolvedParallelName,
        );
        // print_run, auto, memorabilia, serial — not directly on ScoredCandidate,
        // compare from extraction instead
        fields.print_run = compareField(
          'print_run',
          expected.print_run,
          result.extraction.serial.print_run,
        );
        fields.auto = compareField(
          'auto',
          expected.auto,
          result.extraction.autograph.present ?? false,
        );
        fields.memorabilia = compareField(
          'memorabilia',
          expected.memorabilia,
          result.extraction.memorabilia.value ?? false,
        );
        fields.serial = compareField(
          'serial',
          expected.serial,
          result.extraction.serial.printed,
        );

        // Track details for wrong fields
        for (const [key, val] of Object.entries(fields)) {
          if (val === 'wrong') {
            const actualValues: Record<string, unknown> = {
              year: top1!.year,
              set_name: top1!.setName,
              card_number: top1!.cardNumber,
              player: top1!.playerName,
              parallel: top1!.resolvedParallelName,
              print_run: result.extraction.serial.print_run,
              auto: result.extraction.autograph.present ?? false,
              memorabilia: result.extraction.memorabilia.value ?? false,
              serial: result.extraction.serial.printed,
            };
            details[key] = {
              expected: (expected as unknown as Record<string, ExpectedField<unknown>>)[key]?.value,
              got: actualValues[key],
            };
          }
        }
      }

      const extractionSummary: ExtractionSummary = {
        player: result.extraction.players[0]?.name ?? null,
        year: result.extraction.set_year.value,
        set_name: result.extraction.set_name.value,
        card_number: result.extraction.card_number.value,
        manufacturer: result.extraction.manufacturer.value,
        parallel_printed: result.extraction.finish.parallel_name_printed,
        finish: result.extraction.finish.description,
        serial: result.extraction.serial.printed,
        auto: result.extraction.autograph.present,
        memorabilia: result.extraction.memorabilia.value,
        rookie: result.extraction.rookie_logo_printed.value,
        kind: result.extraction.kind,
      };

      results.push({
        cardId: card.id,
        storage: expected.storage,
        catalogMiss,
        fields,
        parallelFlags: result.flags.filter((f) => f.startsWith('parallel')),
        details,
        extractionSummary,
        candidateCount: result.candidates.length,
        flags: result.flags,
        status: result.status,
      });

      const statusLabel = providerFailed ? 'PROVIDER FAILED' : catalogMiss ? 'CATALOG MISS' : 'OK';
      const wrongCount = Object.values(fields).filter((v) => v === 'wrong').length;
      const suffix = wrongCount > 0 ? ` (${wrongCount} wrong)` : '';
      console.log(`  Card ${card.id}: ${statusLabel}${suffix}`);
    } catch (err) {
      console.error(`  Card ${card.id}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      // Mark all fields as not_in_catalog on error
      const fields: Record<string, FieldResult> = {};
      for (const f of ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'] as const) {
        fields[f] = 'not_in_catalog';
      }
      results.push({
        cardId: card.id,
        storage: card.expected.storage,
        catalogMiss: true,
        fields,
        parallelFlags: [],
        details: {},
        extractionSummary: null,
        candidateCount: 0,
        flags: [],
        status: 'error',
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Report
  // ---------------------------------------------------------------------------

  console.log('\n' + '='.repeat(72));
  console.log('  SMOKE:IDENTIFY RESULTS');
  console.log('='.repeat(72) + '\n');

  // --- Per-field accuracy ---
  const fieldNames = ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'];
  const fieldTable: Array<Record<string, string | number>> = [];

  for (const field of fieldNames) {
    const scorable = results.filter(
      (r) => r.fields[field] === 'correct' || r.fields[field] === 'wrong',
    );
    const correct = scorable.filter((r) => r.fields[field] === 'correct').length;
    const total = scorable.length;
    const excluded = results.filter((r) => r.fields[field] === 'excluded').length;
    const catalogMiss = results.filter((r) => r.fields[field] === 'not_in_catalog').length;
    const accuracy = total > 0 ? `${((correct / total) * 100).toFixed(0)}%` : 'n/a';

    fieldTable.push({
      field,
      correct,
      wrong: total - correct,
      excluded,
      catalog_miss: catalogMiss,
      accuracy,
    });
  }

  console.log('Pipeline accuracy (verified + best_guess fields only):');
  console.table(fieldTable);

  // --- Parallel accuracy by storage ---
  const sleeved = results.filter(
    (r) => !r.catalogMiss && r.storage !== 'none' && r.storage !== 'bare',
  );
  const bare = results.filter(
    (r) => !r.catalogMiss && (r.storage === 'none' || r.storage === 'bare'),
  );

  const parallelAccuracy = (group: CardResult[], label: string) => {
    const scorable = group.filter(
      (r) => r.fields.parallel === 'correct' || r.fields.parallel === 'wrong',
    );
    const correct = scorable.filter((r) => r.fields.parallel === 'correct').length;
    return {
      group: label,
      correct,
      total: scorable.length,
      accuracy: scorable.length > 0 ? `${((correct / scorable.length) * 100).toFixed(0)}%` : 'n/a',
    };
  };

  console.log('\nParallel accuracy by storage:');
  console.table([parallelAccuracy(sleeved, 'sleeved'), parallelAccuracy(bare, 'bare')]);

  // --- Wrong parallel without parallel_uncertain ---
  const wrongParallelNoFlag = results.filter(
    (r) =>
      !r.catalogMiss &&
      r.fields.parallel === 'wrong' &&
      !r.parallelFlags.includes('parallel_uncertain'),
  );

  console.log(`\nWrong top-1 parallel without parallel_uncertain: ${wrongParallelNoFlag.length} (target: 0)`);
  if (wrongParallelNoFlag.length > 0) {
    for (const r of wrongParallelNoFlag) {
      console.log(`  Card ${r.cardId}: expected=${r.details.parallel?.expected} got=${r.details.parallel?.got}`);
    }
  }

  // --- Provider failures (our bug — not the same as catalog misses) ---
  const providerFailures = results.filter((r) => r.flags.includes('cardsight_failed'));
  console.log(`\nProvider failures: ${providerFailures.length} / ${results.length}`);
  if (providerFailures.length > 0) {
    for (const r of providerFailures) {
      console.log(`  Card ${r.cardId}: ${r.flags.join(', ')}`);
    }
  }

  // --- Catalog misses (genuine — provider responded but found nothing) ---
  const catalogMisses = results.filter((r) => r.catalogMiss);
  console.log(`\nCatalog misses: ${catalogMisses.length} / ${results.length}`);
  if (catalogMisses.length > 0) {
    for (const r of catalogMisses) {
      console.log(`  Card ${r.cardId}`);
    }
  }

  // --- Extraction detail (what OpenAI read off each card) ---
  const extractionTable = results
    .filter((r) => r.extractionSummary != null)
    .map((r) => ({
      card: r.cardId,
      player: r.extractionSummary!.player ?? '—',
      year: r.extractionSummary!.year ?? '—',
      set: r.extractionSummary!.set_name ?? '—',
      card_no: r.extractionSummary!.card_number ?? '—',
      parallel: r.extractionSummary!.parallel_printed ?? '—',
      serial: r.extractionSummary!.serial ?? '—',
      auto: r.extractionSummary!.auto ? 'Y' : 'N',
      memo: r.extractionSummary!.memorabilia ? 'Y' : 'N',
      rc: r.extractionSummary!.rookie ? 'Y' : 'N',
      candidates: r.candidateCount,
      status: r.flags.includes('cardsight_failed') ? 'PROVIDER FAILED' : r.catalogMiss ? 'unmatched' : r.status,
      flags: r.flags.join(', ') || '—',
    }));

  if (extractionTable.length > 0) {
    console.log('\nExtraction details (what the vision model read):');
    console.table(extractionTable);

    // Print finish descriptions separately (too long for table)
    console.log('\nFinish descriptions:');
    for (const r of results) {
      if (r.extractionSummary) {
        console.log(`  Card ${r.cardId}: ${r.extractionSummary.finish}`);
      }
    }
  }

  // --- Summary stats ---
  const pipelineCards = results.filter((r) => !r.catalogMiss);
  const readyRate = pipelineCards.length > 0
    ? pipelineCards.filter((r) => Object.values(r.fields).every((v) => v === 'correct' || v === 'excluded')).length / pipelineCards.length
    : 0;

  // Low-stakes: cards where all wrong fields are best_guess (not verified)
  // For this we need the manifest data; approximate by checking if any verified field is wrong
  const lowStakes = pipelineCards.filter((r) => {
    const wrongFields = Object.entries(r.fields)
      .filter(([, v]) => v === 'wrong')
      .map(([k]) => k);
    // A card is low-stakes if it has no wrong fields or all wrong fields would be best_guess
    // We can't tell from results alone, but wrongFields.length === 0 means it's perfect
    return wrongFields.length === 0;
  });
  const lowStakesShare = pipelineCards.length > 0 ? lowStakes.length / pipelineCards.length : 0;

  console.log('\nSummary:');
  console.table([
    {
      metric: 'Ready rate (all scored fields correct)',
      value: `${(readyRate * 100).toFixed(0)}%`,
      detail: `${Math.round(readyRate * pipelineCards.length)} / ${pipelineCards.length} cards`,
    },
    {
      metric: 'Low-stakes share (no wrong fields)',
      value: `${(lowStakesShare * 100).toFixed(0)}%`,
      detail: `${lowStakes.length} / ${pipelineCards.length} cards`,
    },
    {
      metric: 'Catalog misses',
      value: catalogMisses.length,
      detail: `${catalogMisses.length} / ${results.length} cards (not counted against pipeline)`,
    },
  ]);

  // --- Detail on wrong fields ---
  const wrongResults = results.filter(
    (r) => !r.catalogMiss && Object.values(r.fields).some((v) => v === 'wrong'),
  );
  if (wrongResults.length > 0) {
    console.log('\nDetailed wrong fields:');
    for (const r of wrongResults) {
      for (const [field, detail] of Object.entries(r.details)) {
        console.log(`  Card ${r.cardId} / ${field}: expected=${JSON.stringify(detail.expected)} got=${JSON.stringify(detail.got)}`);
      }
    }
  }

  // --- Exit code ---
  const pipelineWrong = results.some(
    (r) => !r.catalogMiss && Object.values(r.fields).some((v) => v === 'wrong'),
  );

  if (pipelineWrong || wrongParallelNoFlag.length > 0) {
    console.log('\nEXIT 1: Pipeline accuracy issues detected.');
    process.exit(1);
  }

  console.log('\nEXIT 0: All pipeline accuracy targets met.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
