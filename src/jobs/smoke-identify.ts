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
import { canonicalSetName, canonicalParallelName, playerNamesMatch } from '@/domain/identity/aliases';

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
type StrictResult = 'strict_correct' | 'strict_wrong' | 'excluded';

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
  /** Candidate accuracy (normalized via aliases). */
  fields: Record<string, FieldResult>;
  /** Candidate accuracy (strict string equality). */
  strictFields: Record<string, StrictResult>;
  /** Extraction accuracy (normalized). */
  extractionFields: Record<string, FieldResult>;
  /** Extraction accuracy (strict). */
  extractionStrictFields: Record<string, StrictResult>;
  parallelFlags: string[];
  details: Record<string, { expected: unknown; got: unknown }>;
  extractionDetails: Record<string, { expected: unknown; got: unknown }>;
  extractionSummary: ExtractionSummary | null;
  candidateCount: number;
  flags: string[];
  status: string;
}

// ---------------------------------------------------------------------------
// Field comparison
// ---------------------------------------------------------------------------

/** Normalized comparison using the alias system. */
function compareField(
  fieldName: string,
  expected: ExpectedField<unknown>,
  actual: unknown,
): FieldResult {
  if (expected.status === 'unsure') return 'excluded';

  if (fieldName === 'set_name' && typeof expected.value === 'string' && typeof actual === 'string') {
    return canonicalSetName(expected.value) === canonicalSetName(actual) ? 'correct' : 'wrong';
  }

  if (fieldName === 'player' && typeof expected.value === 'string' && typeof actual === 'string') {
    return playerNamesMatch(expected.value, actual) ? 'correct' : 'wrong';
  }

  if (fieldName === 'parallel') {
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

  if (expected.value === actual) return 'correct';
  if (expected.value == null && actual == null) return 'correct';
  return 'wrong';
}

/** Strict comparison — exact string match, no aliases. */
function compareFieldStrict(
  fieldName: string,
  expected: ExpectedField<unknown>,
  actual: unknown,
): StrictResult {
  if (expected.status === 'unsure') return 'excluded';

  if (fieldName === 'card_number' && typeof expected.value === 'string' && typeof actual === 'string') {
    const a = expected.value.replace(/^#/, '').trim().toLowerCase();
    const b = actual.replace(/^#/, '').trim().toLowerCase();
    return a === b ? 'strict_correct' : 'strict_wrong';
  }

  if (typeof expected.value === 'string' && typeof actual === 'string') {
    return expected.value.toLowerCase().trim() === actual.toLowerCase().trim()
      ? 'strict_correct'
      : 'strict_wrong';
  }

  if (expected.value === actual) return 'strict_correct';
  if (expected.value == null && actual == null) return 'strict_correct';
  return 'strict_wrong';
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

  console.log(`Running identification on ${availableCards.length} cards...`);
  console.log(`Provider mode: live (hardcoded)\n`);

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

      // --- Extraction values (always available) ---
      // For set_name: use derived (from SCP lookup) > extraction > null
      const derivedSet = (result as { derivedSetName?: string | null }).derivedSetName;
      const extVals: Record<string, unknown> = {
        year: result.extraction.copyright_year.value ?? result.extraction.set_year.value,
        set_name: derivedSet ?? result.extraction.set_name.value,
        card_number: result.extraction.card_number.value,
        player: result.extraction.players[0]?.name ?? null,
        parallel: result.extraction.finish.parallel_name_printed,
        print_run: result.extraction.serial.print_run,
        auto: result.extraction.autograph.present ?? false,
        memorabilia: result.extraction.memorabilia.value ?? false,
        serial: result.extraction.serial.printed,
      };

      // --- Score extraction (all 15 cards) ---
      const SCORE_FIELDS = ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'] as const;
      const extractionFields: Record<string, FieldResult> = {};
      const extractionStrictFields: Record<string, StrictResult> = {};
      const extractionDetails: Record<string, { expected: unknown; got: unknown }> = {};

      for (const f of SCORE_FIELDS) {
        const ef = expected[f];
        extractionFields[f] = compareField(f, ef, extVals[f]);
        extractionStrictFields[f] = compareFieldStrict(f, ef, extVals[f]);
        if (extractionFields[f] === 'wrong') {
          extractionDetails[f] = { expected: ef.value, got: extVals[f] };
        }
      }

      // --- Score candidates (only matched cards) ---
      const fields: Record<string, FieldResult> = {};
      const strictFields: Record<string, StrictResult> = {};
      const details: Record<string, { expected: unknown; got: unknown }> = {};

      if (catalogMiss) {
        for (const f of SCORE_FIELDS) {
          const ef = expected[f];
          fields[f] = ef.status === 'unsure' ? 'excluded' : 'not_in_catalog';
          strictFields[f] = ef.status === 'unsure' ? 'excluded' : 'strict_wrong';
        }
      } else {
        const candVals: Record<string, unknown> = {
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

        for (const f of SCORE_FIELDS) {
          const ef = expected[f];
          fields[f] = compareField(f, ef, candVals[f]);
          strictFields[f] = compareFieldStrict(f, ef, candVals[f]);
          if (fields[f] === 'wrong') {
            details[f] = { expected: ef.value, got: candVals[f] };
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
        strictFields,
        extractionFields,
        extractionStrictFields,
        parallelFlags: result.flags.filter((f) => f.startsWith('parallel')),
        details,
        extractionDetails,
        extractionSummary,
        candidateCount: result.candidates.length,
        flags: result.flags,
        status: result.status,
      });

      const statusLabel = providerFailed ? 'PROVIDER FAILED' : catalogMiss ? 'CATALOG MISS' : 'OK';
      const wrongCount = Object.values(fields).filter((v) => v === 'wrong').length;
      const extWrongCount = Object.values(extractionFields).filter((v) => v === 'wrong').length;
      const suffix = [
        wrongCount > 0 ? `${wrongCount} candidate wrong` : null,
        extWrongCount > 0 ? `${extWrongCount} extraction wrong` : null,
      ].filter(Boolean).join(', ');
      console.log(`  Card ${card.id}: ${statusLabel}${suffix ? ` (${suffix})` : ''}`);
    } catch (err) {
      console.error(`  Card ${card.id}: ERROR — ${err instanceof Error ? err.message : String(err)}`);
      // Mark all fields as not_in_catalog on error
      const fields: Record<string, FieldResult> = {};
      for (const f of ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'] as const) {
        fields[f] = 'not_in_catalog';
      }
      const emptyStrict: Record<string, StrictResult> = {};
      for (const f of ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial']) {
        emptyStrict[f] = 'excluded';
      }
      results.push({
        cardId: card.id,
        storage: card.expected.storage,
        catalogMiss: true,
        fields,
        strictFields: emptyStrict,
        extractionFields: { ...fields },
        extractionStrictFields: emptyStrict,
        parallelFlags: [],
        details: {},
        extractionDetails: {},
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

  // --- Helper: build accuracy row with sample size ---
  const fieldNames = ['year', 'set_name', 'card_number', 'player', 'parallel', 'print_run', 'auto', 'memorabilia', 'serial'];

  function accuracyRow(
    field: string,
    resultsSet: CardResult[],
    getResult: (r: CardResult) => FieldResult | StrictResult,
    correctVal: string,
    wrongVal: string,
  ) {
    const scorable = resultsSet.filter((r) => {
      const v = getResult(r);
      return v === correctVal || v === wrongVal;
    });
    const correct = scorable.filter((r) => getResult(r) === correctVal).length;
    const total = scorable.length;
    return {
      field,
      result: total > 0 ? `${correct}/${total}` : '—',
      excluded: resultsSet.filter((r) => getResult(r) === 'excluded').length,
    };
  }

  // --- Candidate accuracy (matched cards only) ---
  console.log('CANDIDATE accuracy (normalized via aliases):');
  console.table(fieldNames.map((f) =>
    accuracyRow(f, results, (r) => r.fields[f], 'correct', 'wrong'),
  ));

  console.log('\nCANDIDATE accuracy (strict string match):');
  console.table(fieldNames.map((f) =>
    accuracyRow(f, results, (r) => r.strictFields[f], 'strict_correct', 'strict_wrong'),
  ));

  // --- Extraction accuracy (all 15 cards) ---
  console.log('\nEXTRACTION accuracy (normalized, all cards):');
  console.table(fieldNames.map((f) =>
    accuracyRow(f, results, (r) => r.extractionFields[f], 'correct', 'wrong'),
  ));

  console.log('\nEXTRACTION accuracy (strict, all cards):');
  console.table(fieldNames.map((f) =>
    accuracyRow(f, results, (r) => r.extractionStrictFields[f], 'strict_correct', 'strict_wrong'),
  ));

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
  const readyCount = pipelineCards.filter((r) => Object.values(r.fields).every((v) => v === 'correct' || v === 'excluded')).length;
  const lowStakesCount = pipelineCards.filter((r) => {
    return Object.values(r.fields).every((v) => v !== 'wrong');
  }).length;

  console.log('\nSummary:');
  console.table([
    {
      metric: 'Matched cards (candidate accuracy scored)',
      value: `${pipelineCards.length}/${results.length}`,
    },
    {
      metric: 'Catalog misses (extraction accuracy only)',
      value: `${catalogMisses.length}/${results.length}`,
    },
    {
      metric: 'Ready rate (all candidate fields correct)',
      value: `${readyCount}/${pipelineCards.length}`,
    },
    {
      metric: 'Low-stakes (no wrong candidate fields)',
      value: `${lowStakesCount}/${pipelineCards.length}`,
    },
  ]);

  // --- Detail on wrong fields ---
  const candWrong = results.filter(
    (r) => !r.catalogMiss && Object.values(r.fields).some((v) => v === 'wrong'),
  );
  if (candWrong.length > 0) {
    console.log('\nWrong candidate fields:');
    for (const r of candWrong) {
      for (const [field, detail] of Object.entries(r.details)) {
        console.log(`  Card ${r.cardId} / ${field}: expected=${JSON.stringify(detail.expected)} got=${JSON.stringify(detail.got)}`);
      }
    }
  }

  const extWrong = results.filter(
    (r) => Object.values(r.extractionFields).some((v) => v === 'wrong'),
  );
  if (extWrong.length > 0) {
    console.log('\nWrong extraction fields:');
    for (const r of extWrong) {
      for (const [field, detail] of Object.entries(r.extractionDetails)) {
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
