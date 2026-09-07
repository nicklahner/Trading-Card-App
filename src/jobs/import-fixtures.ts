/**
 * Import fixture card photos into the database.
 *
 * Usage:
 *   pnpm import:fixtures              # import photos only (draft status)
 *   pnpm import:fixtures --identify   # import + trigger identification
 */

import { config } from 'dotenv';
import { join } from 'node:path';

// Load .env then .env.local (override) before any modules read env vars
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '.env.local'), override: true });

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import sharp from 'sharp';

import { prisma } from '@/db/client';
import { processPhoto } from '@/lib/photos';

const FIXTURES_DIR = join(process.cwd(), 'fixtures', 'cards', 'real');
const DATA_DIR = join(process.cwd(), 'data');

interface ManifestCard {
  id: string;
  front: string;
  back: string;
  tilt: string | null;
}

interface Manifest {
  cards: ManifestCard[];
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function importPhoto(
  itemId: string,
  side: 'front' | 'back' | 'front_tilt',
  rawBuffer: Buffer,
): Promise<void> {
  const { full, thumbnail } = await processPhoto(rawBuffer);

  const sha256 = createHash('sha256').update(full).digest('hex');
  const meta = await sharp(full).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  const photoPath = `photos/${itemId}/${side}.jpg`;
  const thumbPath = `thumbnails/${itemId}/${side}.jpg`;

  const fullDiskPath = join(DATA_DIR, photoPath);
  const thumbDiskPath = join(DATA_DIR, thumbPath);

  await mkdir(dirname(fullDiskPath), { recursive: true });
  await mkdir(dirname(thumbDiskPath), { recursive: true });
  await writeFile(fullDiskPath, full);
  await writeFile(thumbDiskPath, thumbnail);

  // Upsert photo record
  const existing = await prisma.itemPhoto.findFirst({
    where: { itemId, side },
  });

  if (existing) {
    await prisma.itemPhoto.update({
      where: { id: existing.id },
      data: { gcsPath: photoPath, width, height, sha256 },
    });
  } else {
    await prisma.itemPhoto.create({
      data: { itemId, side, gcsPath: photoPath, width, height, sha256 },
    });
  }
}

async function main() {
  const doIdentify = process.argv.includes('--identify');

  // Load manifest
  const manifestPath = join(FIXTURES_DIR, 'manifest.json');
  const manifest: Manifest = JSON.parse(
    await readFile(manifestPath, 'utf-8'),
  );

  // Create scan session
  const session = await prisma.scanSession.create({
    data: { label: 'Fixture import' },
  });
  console.log(`Created scan session: ${session.id}`);

  let created = 0;
  const itemIds: string[] = [];

  for (const card of manifest.cards) {
    // Check that at least the front image exists on disk
    const frontPath = join(FIXTURES_DIR, card.front);
    if (!(await fileExists(frontPath))) {
      console.log(`  Skipping card ${card.id}: ${card.front} not found`);
      continue;
    }

    // Determine next sequence number
    const lastItem = await prisma.item.findFirst({
      where: { scanSessionId: session.id },
      orderBy: { sessionSeq: 'desc' },
      select: { sessionSeq: true },
    });
    const nextSeq = (lastItem?.sessionSeq ?? 0) + 1;

    // Create draft item
    const item = await prisma.item.create({
      data: {
        scanSessionId: session.id,
        sessionSeq: nextSeq,
        status: 'draft',
        storage: 'unknown',
      },
    });

    // Process front photo
    const frontBuffer = await readFile(frontPath);
    await importPhoto(item.id, 'front', frontBuffer);

    // Process back photo if it exists
    if (card.back) {
      const backPath = join(FIXTURES_DIR, card.back);
      if (await fileExists(backPath)) {
        const backBuffer = await readFile(backPath);
        await importPhoto(item.id, 'back', backBuffer);
      }
    }

    // Process tilt photo if it exists
    if (card.tilt) {
      const tiltPath = join(FIXTURES_DIR, card.tilt);
      if (await fileExists(tiltPath)) {
        const tiltBuffer = await readFile(tiltPath);
        await importPhoto(item.id, 'front_tilt', tiltBuffer);
      }
    }

    // Update session total count
    await prisma.scanSession.update({
      where: { id: session.id },
      data: { countTotal: { increment: 1 } },
    });

    created++;
    itemIds.push(item.id);
    console.log(`  Card ${card.id} -> item ${item.id}`);
  }

  console.log(`\nSummary: ${created} items created, session ${session.id}`);

  // Optionally trigger identification
  if (doIdentify && itemIds.length > 0) {
    console.log('\nTriggering identification...');

    // Set items to 'identifying' status
    await prisma.item.updateMany({
      where: { id: { in: itemIds } },
      data: { status: 'identifying' },
    });

    const { runIdentifyJob } = await import('@/jobs/identify');
    const result = await runIdentifyJob({ itemIds });
    console.log(
      `Identification complete: ${result.succeeded}/${result.processed} succeeded, ${result.failed} failed`,
    );
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Import failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
