/**
 * Reset the database by deleting all domain data.
 *
 * Deletes in FK-safe order. Auth tables (user, account, session) are preserved.
 *
 * Usage:
 *   pnpm db:reset
 */

import { config } from 'dotenv';
import { join } from 'node:path';

// Load .env then .env.local (override) before any modules read env vars
config({ path: join(process.cwd(), '.env') });
config({ path: join(process.cwd(), '.env.local'), override: true });

import { prisma } from '@/db/client';

async function main() {
  // Delete in FK-safe order (children before parents)

  // Validation & corrections
  console.log('Deleting identification corrections...');
  await prisma.identificationCorrection.deleteMany();

  console.log('Deleting validation runs...');
  await prisma.validationRun.deleteMany();

  console.log('Deleting golden comps...');
  await prisma.goldenComp.deleteMany();

  // Pricing & valuation
  console.log('Deleting portfolio snapshots...');
  await prisma.portfolioSnapshot.deleteMany();

  console.log('Deleting valuations...');
  await prisma.valuation.deleteMany();

  console.log('Deleting model prices...');
  await prisma.modelPrice.deleteMany();

  console.log('Deleting provider cache...');
  await prisma.providerCache.deleteMany();

  // Flag dismissals
  console.log('Deleting flag dismissals...');
  await prisma.flagDismissal.deleteMany();

  // Identifications (depends on items and scan sessions)
  console.log('Deleting identifications...');
  await prisma.identification.deleteMany();

  // Photos (depends on items)
  console.log('Deleting item photos...');
  await prisma.itemPhoto.deleteMany();

  // Items (depends on cards and scan sessions)
  console.log('Deleting items...');
  await prisma.item.deleteMany();

  // Cards
  console.log('Deleting cards...');
  await prisma.card.deleteMany();

  // Scan sessions
  console.log('Deleting scan sessions...');
  await prisma.scanSession.deleteMany();

  // Operations
  console.log('Deleting job runs...');
  await prisma.jobRun.deleteMany();

  console.log('Deleting API usage...');
  await prisma.apiUsage.deleteMany();

  console.log('Deleting rate limits...');
  await prisma.rateLimit.deleteMany();

  console.log('Deleting settings...');
  await prisma.settings.deleteMany();

  console.log('\nDatabase cleared.');

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error('Reset failed:', err);
  await prisma.$disconnect();
  process.exit(1);
});
