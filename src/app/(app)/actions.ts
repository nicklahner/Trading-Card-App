'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { auth } from '@/lib/auth';
import { prisma } from '@/db/client';
import { createProviders } from '@/providers';
import { buildIdentityKey, type CardIdentity, type PlayerInfo } from '@/domain/identity/types';
import { processPhoto } from '@/lib/photos';
import { runIdentifyJob } from '@/jobs/identify';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DATA_DIR = join(process.cwd(), 'data');

async function requireAuth() {
  const session = await auth();
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  return session;
}

function toDate(d: string | Date): Date {
  return typeof d === 'string' ? new Date(d) : d;
}

// ---------------------------------------------------------------------------
// Catalog search
// ---------------------------------------------------------------------------

const searchCatalogSchema = z.object({
  query: z.string().min(1).max(500),
});

export async function searchCatalog(query: string) {
  await requireAuth();
  const parsed = searchCatalogSchema.parse({ query });
  const providers = createProviders('fake');
  return providers.cardSightCatalog.search({ query: parsed.query });
}

// ---------------------------------------------------------------------------
// Get parallels for a set
// ---------------------------------------------------------------------------

const getParallelsSchema = z.object({
  provider: z.string().min(1),
  id: z.string().min(1),
});

export async function getParallels(setRef: { provider: string; id: string }) {
  await requireAuth();
  const parsed = getParallelsSchema.parse(setRef);
  const providers = createProviders('fake');
  return providers.cardSightCatalog.getParallels(parsed);
}

// ---------------------------------------------------------------------------
// Create item
// ---------------------------------------------------------------------------

const playerInfoSchema = z.object({
  name: z.string().min(1),
  team: z.string().nullable(),
  position: z.string().nullable(),
});

const autoTypeEnum = z.enum(['on_card', 'sticker', 'cut', 'unknown']);
const licensedEnum = z.enum(['nfl_licensed', 'nflpa_only', 'unlicensed', 'unknown']);

const conditionKindEnum = z.enum(['raw', 'graded']);
const rawConditionTierEnum = z.enum(['market', 'nm_mt', 'ex_mt', 'ex', 'vg', 'poor']);
const graderEnum = z.enum(['PSA', 'BGS', 'SGC', 'CGC', 'TAG', 'ACE', 'OTHER']);
const storageTypeEnum = z.enum([
  'toploader',
  'penny_sleeve',
  'binder',
  'magnetic',
  'slab',
  'none',
  'unknown',
]);
const acquiredViaEnum = z.enum(['purchase', 'pack_pull', 'trade', 'gift', 'unknown']);

const createItemSchema = z.object({
  // Card identity fields
  year: z.number().int().min(1900).max(2100),
  manufacturer: z.string().min(1),
  setName: z.string().min(1),
  subset: z.string().nullable().optional(),
  cardNumber: z.string().min(1),
  players: z.array(playerInfoSchema).min(1),
  parallel: z.string().nullable().optional(),
  printRun: z.number().int().positive().nullable().optional(),
  isAuto: z.boolean().optional().default(false),
  autoType: autoTypeEnum.nullable().optional(),
  isMemorabilia: z.boolean().optional().default(false),
  isRookie: z.boolean().optional().default(false),
  variation: z.string().nullable().optional(),
  licensed: licensedEnum.optional().default('unknown'),

  // External refs (optional, for linking to providers)
  sportscardsproId: z.string().nullable().optional(),
  sportscardsproName: z.string().nullable().optional(),
  cardsightCardId: z.string().nullable().optional(),
  cardsightParallelId: z.string().nullable().optional(),
  referenceImageUrl: z.string().nullable().optional(),

  // Item fields
  conditionKind: conditionKindEnum.optional().default('raw'),
  rawConditionTier: rawConditionTierEnum.nullable().optional(),
  grader: graderEnum.nullable().optional(),
  grade: z.number().nullable().optional(),
  gradeLabel: z.string().nullable().optional(),
  autoGrade: z.number().nullable().optional(),
  certNumber: z.string().nullable().optional(),
  storage: storageTypeEnum.optional().default('unknown'),
  acquiredOn: z.string().nullable().optional(),
  acquiredVia: acquiredViaEnum.optional().default('unknown'),
  costPriceCents: z.number().int().nullable().optional(),
  costTaxCents: z.number().int().optional().default(0),
  costShippingCents: z.number().int().optional().default(0),
  costFeesCents: z.number().int().optional().default(0),
  costGradingCents: z.number().int().optional().default(0),
  serialNumber: z.number().int().nullable().optional(),
  notes: z.string().optional().default(''),
});

/** Fields needed to find-or-create a Card row. */
interface CardFields {
  year: number;
  manufacturer: string;
  setName: string;
  subset?: string | null;
  cardNumber: string;
  players: PlayerInfo[];
  parallel?: string | null;
  printRun?: number | null;
  isAuto: boolean;
  autoType?: 'on_card' | 'sticker' | 'cut' | 'unknown' | null;
  isMemorabilia: boolean;
  isRookie: boolean;
  variation?: string | null;
  licensed: 'nfl_licensed' | 'nflpa_only' | 'unlicensed' | 'unknown';
  sportscardsproId?: string | null;
  sportscardsproName?: string | null;
  cardsightCardId?: string | null;
  cardsightParallelId?: string | null;
  referenceImageUrl?: string | null;
}

/**
 * Build a CardIdentity from the shared fields.
 */
function toCardIdentity(data: CardFields): CardIdentity {
  return {
    year: data.year,
    manufacturer: data.manufacturer,
    setName: data.setName,
    subset: data.subset ?? null,
    cardNumber: data.cardNumber,
    players: data.players,
    parallel: data.parallel ?? null,
    printRun: data.printRun ?? null,
    isAuto: data.isAuto,
    autoType: data.autoType ?? null,
    isMemorabilia: data.isMemorabilia,
    isRookie: data.isRookie,
    variation: data.variation ?? null,
    licensed: data.licensed,
  };
}

/**
 * Find or create a Card row by identity key.
 */
async function findOrCreateCard(data: CardFields) {
  const identity = toCardIdentity(data);
  const identityKey = buildIdentityKey(identity);

  const existing = await prisma.card.findUnique({ where: { identityKey } });
  if (existing) return existing;

  return prisma.card.create({
    data: {
      identityKey,
      year: data.year,
      manufacturer: data.manufacturer,
      setName: data.setName,
      subset: data.subset ?? null,
      cardNumber: data.cardNumber,
      players: data.players as unknown as import('@prisma/client').Prisma.InputJsonValue,
      parallel: data.parallel ?? null,
      printRun: data.printRun ?? null,
      isAuto: data.isAuto,
      autoType: data.autoType ?? undefined,
      isMemorabilia: data.isMemorabilia,
      isRookie: data.isRookie,
      variation: data.variation ?? null,
      licensed: data.licensed,
      sportscardsproId: data.sportscardsproId ?? null,
      sportscardsproName: data.sportscardsproName ?? null,
      cardsightCardId: data.cardsightCardId ?? null,
      cardsightParallelId: data.cardsightParallelId ?? null,
      referenceImageUrl: data.referenceImageUrl ?? null,
    },
  });
}

export async function createItem(data: unknown) {
  await requireAuth();
  const parsed = createItemSchema.parse(data);
  const card = await findOrCreateCard(parsed);

  const item = await prisma.item.create({
    data: {
      cardId: card.id,
      status: 'owned',
      conditionKind: parsed.conditionKind,
      rawConditionTier: parsed.rawConditionTier ?? undefined,
      grader: parsed.grader ?? undefined,
      grade: parsed.grade ?? undefined,
      gradeLabel: parsed.gradeLabel ?? undefined,
      autoGrade: parsed.autoGrade ?? undefined,
      certNumber: parsed.certNumber ?? undefined,
      storage: parsed.storage,
      acquiredOn: parsed.acquiredOn ? toDate(parsed.acquiredOn) : undefined,
      acquiredVia: parsed.acquiredVia,
      costPriceCents: parsed.costPriceCents ?? undefined,
      costTaxCents: parsed.costTaxCents,
      costShippingCents: parsed.costShippingCents,
      costFeesCents: parsed.costFeesCents,
      costGradingCents: parsed.costGradingCents,
      serialNumber: parsed.serialNumber ?? undefined,
      notes: parsed.notes,
    },
  });

  revalidatePath('/', 'layout');
  return { itemId: item.id };
}

// ---------------------------------------------------------------------------
// Update item
// ---------------------------------------------------------------------------

const updateItemSchema = z.object({
  // Item fields (all optional)
  conditionKind: conditionKindEnum.optional(),
  rawConditionTier: rawConditionTierEnum.nullable().optional(),
  grader: graderEnum.nullable().optional(),
  grade: z.number().nullable().optional(),
  gradeLabel: z.string().nullable().optional(),
  autoGrade: z.number().nullable().optional(),
  certNumber: z.string().nullable().optional(),
  storage: storageTypeEnum.optional(),
  acquiredOn: z.string().nullable().optional(),
  acquiredVia: acquiredViaEnum.optional(),
  costPriceCents: z.number().int().nullable().optional(),
  costTaxCents: z.number().int().optional(),
  costShippingCents: z.number().int().optional(),
  costFeesCents: z.number().int().optional(),
  costGradingCents: z.number().int().optional(),
  serialNumber: z.number().int().nullable().optional(),
  notes: z.string().optional(),

  // Identity re-link fields (optional — only needed if changing card identity)
  year: z.number().int().min(1900).max(2100).optional(),
  manufacturer: z.string().min(1).optional(),
  setName: z.string().min(1).optional(),
  subset: z.string().nullable().optional(),
  cardNumber: z.string().min(1).optional(),
  players: z.array(playerInfoSchema).min(1).optional(),
  parallel: z.string().nullable().optional(),
  printRun: z.number().int().positive().nullable().optional(),
  isAuto: z.boolean().optional(),
  autoType: autoTypeEnum.nullable().optional(),
  isMemorabilia: z.boolean().optional(),
  isRookie: z.boolean().optional(),
  variation: z.string().nullable().optional(),
  licensed: licensedEnum.optional(),

  // External refs
  sportscardsproId: z.string().nullable().optional(),
  sportscardsproName: z.string().nullable().optional(),
  cardsightCardId: z.string().nullable().optional(),
  cardsightParallelId: z.string().nullable().optional(),
  referenceImageUrl: z.string().nullable().optional(),
});

/** Fields that affect card identity and require re-linking. */
const IDENTITY_FIELDS = [
  'year',
  'manufacturer',
  'setName',
  'subset',
  'cardNumber',
  'players',
  'parallel',
  'printRun',
  'isAuto',
  'autoType',
  'isMemorabilia',
  'isRookie',
  'variation',
  'licensed',
] as const;

export async function updateItem(itemId: string, changes: unknown) {
  await requireAuth();
  z.string().uuid().parse(itemId);
  const parsed = updateItemSchema.parse(changes);

  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    include: { card: true },
  });

  // Check if identity fields are being changed
  const hasIdentityChange = IDENTITY_FIELDS.some(
    (f) => parsed[f] !== undefined,
  );

  let cardId = item.cardId;

  if (hasIdentityChange && item.card) {
    // Merge current card identity with provided changes
    const mergedIdentity: CardFields = {
      year: parsed.year ?? item.card.year,
      manufacturer: parsed.manufacturer ?? item.card.manufacturer,
      setName: parsed.setName ?? item.card.setName,
      subset: parsed.subset !== undefined ? parsed.subset : item.card.subset,
      cardNumber: parsed.cardNumber ?? item.card.cardNumber,
      players: (parsed.players ?? item.card.players) as PlayerInfo[],
      parallel: parsed.parallel !== undefined ? parsed.parallel : item.card.parallel,
      printRun: parsed.printRun !== undefined ? parsed.printRun : item.card.printRun,
      isAuto: parsed.isAuto ?? item.card.isAuto,
      autoType: parsed.autoType !== undefined ? parsed.autoType : (item.card.autoType as CardFields['autoType']),
      isMemorabilia: parsed.isMemorabilia ?? item.card.isMemorabilia,
      isRookie: parsed.isRookie ?? item.card.isRookie,
      variation: parsed.variation !== undefined ? parsed.variation : item.card.variation,
      licensed: (parsed.licensed ?? item.card.licensed) as CardFields['licensed'],
      sportscardsproId: parsed.sportscardsproId !== undefined ? parsed.sportscardsproId : item.card.sportscardsproId,
      sportscardsproName: parsed.sportscardsproName !== undefined ? parsed.sportscardsproName : item.card.sportscardsproName,
      cardsightCardId: parsed.cardsightCardId !== undefined ? parsed.cardsightCardId : item.card.cardsightCardId,
      cardsightParallelId: parsed.cardsightParallelId !== undefined ? parsed.cardsightParallelId : item.card.cardsightParallelId,
      referenceImageUrl: parsed.referenceImageUrl !== undefined ? parsed.referenceImageUrl : item.card.referenceImageUrl,
    };

    const card = await findOrCreateCard(mergedIdentity);
    cardId = card.id;
  }

  // Build item update data (only include fields that were provided)
  const itemUpdate: Record<string, unknown> = {};
  if (cardId !== item.cardId) itemUpdate.cardId = cardId;
  if (parsed.conditionKind !== undefined) itemUpdate.conditionKind = parsed.conditionKind;
  if (parsed.rawConditionTier !== undefined) itemUpdate.rawConditionTier = parsed.rawConditionTier;
  if (parsed.grader !== undefined) itemUpdate.grader = parsed.grader;
  if (parsed.grade !== undefined) itemUpdate.grade = parsed.grade;
  if (parsed.gradeLabel !== undefined) itemUpdate.gradeLabel = parsed.gradeLabel;
  if (parsed.autoGrade !== undefined) itemUpdate.autoGrade = parsed.autoGrade;
  if (parsed.certNumber !== undefined) itemUpdate.certNumber = parsed.certNumber;
  if (parsed.storage !== undefined) itemUpdate.storage = parsed.storage;
  if (parsed.acquiredOn !== undefined) {
    itemUpdate.acquiredOn = parsed.acquiredOn ? toDate(parsed.acquiredOn) : null;
  }
  if (parsed.acquiredVia !== undefined) itemUpdate.acquiredVia = parsed.acquiredVia;
  if (parsed.costPriceCents !== undefined) itemUpdate.costPriceCents = parsed.costPriceCents;
  if (parsed.costTaxCents !== undefined) itemUpdate.costTaxCents = parsed.costTaxCents;
  if (parsed.costShippingCents !== undefined) itemUpdate.costShippingCents = parsed.costShippingCents;
  if (parsed.costFeesCents !== undefined) itemUpdate.costFeesCents = parsed.costFeesCents;
  if (parsed.costGradingCents !== undefined) itemUpdate.costGradingCents = parsed.costGradingCents;
  if (parsed.serialNumber !== undefined) itemUpdate.serialNumber = parsed.serialNumber;
  if (parsed.notes !== undefined) itemUpdate.notes = parsed.notes;

  if (Object.keys(itemUpdate).length > 0) {
    await prisma.item.update({
      where: { id: itemId },
      data: itemUpdate,
    });
  }

  revalidatePath('/', 'layout');
  return { itemId };
}

// ---------------------------------------------------------------------------
// Mark sold
// ---------------------------------------------------------------------------

const markSoldSchema = z.object({
  soldOn: z.string().min(1),
  soldPriceCents: z.number().int().min(0),
  soldFeesCents: z.number().int().min(0),
  soldShippingCents: z.number().int().min(0),
});

export async function markSold(
  itemId: string,
  data: { soldOn: string; soldPriceCents: number; soldFeesCents: number; soldShippingCents: number },
) {
  await requireAuth();
  z.string().uuid().parse(itemId);
  const parsed = markSoldSchema.parse(data);

  await prisma.item.findUniqueOrThrow({ where: { id: itemId } });

  await prisma.item.update({
    where: { id: itemId },
    data: {
      status: 'sold',
      soldOn: toDate(parsed.soldOn),
      soldPriceCents: parsed.soldPriceCents,
      soldFeesCents: parsed.soldFeesCents,
      soldShippingCents: parsed.soldShippingCents,
      removedOn: toDate(parsed.soldOn),
    },
  });

  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Remove item (soft delete)
// ---------------------------------------------------------------------------

export async function removeItem(itemId: string) {
  await requireAuth();
  z.string().uuid().parse(itemId);

  await prisma.item.findUniqueOrThrow({ where: { id: itemId } });

  await prisma.item.update({
    where: { id: itemId },
    data: {
      status: 'removed',
      removedOn: new Date(),
    },
  });

  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Delete item (hard delete)
// ---------------------------------------------------------------------------

export async function deleteItem(itemId: string) {
  await requireAuth();
  z.string().uuid().parse(itemId);

  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    include: { photos: true },
  });

  if (item.status !== 'draft' && item.status !== 'needs_review') {
    throw new Error(
      `Can only hard-delete items with status 'draft' or 'needs_review', got '${item.status}'`,
    );
  }

  // Delete photo files from disk
  for (const photo of item.photos) {
    const fullPath = join(DATA_DIR, photo.gcsPath);
    // Try thumbnail path too (convention: replace /photos/ with /thumbnails/)
    const thumbPath = fullPath.replace('/photos/', '/thumbnails/');
    await unlink(fullPath).catch(() => {});
    await unlink(thumbPath).catch(() => {});
  }

  // Cascade deletes photos via the onDelete: Cascade relation
  await prisma.item.delete({ where: { id: itemId } });

  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Create scan session
// ---------------------------------------------------------------------------

const createScanSessionSchema = z.object({
  label: z.string().min(1).max(200),
  defaults: z
    .object({
      storage: z.string().optional(),
      set_hint: z.string().optional(),
      year: z.number().int().min(1900).max(2100).optional(),
      manufacturer: z.string().optional(),
    })
    .optional(),
});

export async function createScanSession(
  label: string,
  defaults?: { storage?: string; set_hint?: string; year?: number; manufacturer?: string },
) {
  await requireAuth();
  const parsed = createScanSessionSchema.parse({ label, defaults });

  const session = await prisma.scanSession.create({
    data: {
      label: parsed.label,
      defaults: parsed.defaults ?? undefined,
    },
  });

  revalidatePath('/', 'layout');
  return { sessionId: session.id };
}

// ---------------------------------------------------------------------------
// Create draft item
// ---------------------------------------------------------------------------

export async function createDraftItem(scanSessionId: string) {
  await requireAuth();
  z.string().uuid().parse(scanSessionId);

  const session = await prisma.scanSession.findUniqueOrThrow({
    where: { id: scanSessionId },
  });

  // Determine the next sequence number in this session
  const lastItem = await prisma.item.findFirst({
    where: { scanSessionId },
    orderBy: { sessionSeq: 'desc' },
    select: { sessionSeq: true },
  });
  const nextSeq = (lastItem?.sessionSeq ?? 0) + 1;

  const item = await prisma.item.create({
    data: {
      scanSessionId,
      sessionSeq: nextSeq,
      status: 'draft',
      storage: (session.defaults as Record<string, string> | null)?.storage as
        | 'toploader'
        | 'penny_sleeve'
        | 'binder'
        | 'magnetic'
        | 'slab'
        | 'none'
        | 'unknown'
        | undefined ?? 'unknown',
    },
  });

  // Increment session total count
  await prisma.scanSession.update({
    where: { id: scanSessionId },
    data: { countTotal: { increment: 1 } },
  });

  revalidatePath('/', 'layout');
  return { itemId: item.id };
}

// ---------------------------------------------------------------------------
// Upload photo
// ---------------------------------------------------------------------------

const photoSideEnum = z.enum(['front', 'back', 'front_tilt', 'label', 'serial_closeup']);

export async function uploadPhoto(
  itemId: string,
  side: 'front' | 'back' | 'front_tilt' | 'label' | 'serial_closeup',
  formData: FormData,
) {
  await requireAuth();
  z.string().uuid().parse(itemId);
  photoSideEnum.parse(side);

  await prisma.item.findUniqueOrThrow({ where: { id: itemId } });

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    throw new Error('No file provided in formData');
  }

  const arrayBuffer = await file.arrayBuffer();
  const rawBuffer = Buffer.from(arrayBuffer);
  const { full, thumbnail } = await processPhoto(rawBuffer);

  // Compute SHA-256 of the processed full image
  const sha256 = createHash('sha256').update(full).digest('hex');

  // Get dimensions of the processed full image
  const sharp = (await import('sharp')).default;
  const meta = await sharp(full).metadata();
  const width = meta.width ?? 0;
  const height = meta.height ?? 0;

  // Build storage paths
  const photoPath = `photos/${itemId}/${side}.jpg`;
  const thumbPath = `thumbnails/${itemId}/${side}.jpg`;

  const fullDiskPath = join(DATA_DIR, photoPath);
  const thumbDiskPath = join(DATA_DIR, thumbPath);

  await mkdir(dirname(fullDiskPath), { recursive: true });
  await mkdir(dirname(thumbDiskPath), { recursive: true });
  await writeFile(fullDiskPath, full);
  await writeFile(thumbDiskPath, thumbnail);

  // Upsert the photo record (replace if same item+side exists)
  const existing = await prisma.itemPhoto.findFirst({
    where: { itemId, side },
  });

  let photo;
  if (existing) {
    photo = await prisma.itemPhoto.update({
      where: { id: existing.id },
      data: { gcsPath: photoPath, width, height, sha256 },
    });
  } else {
    photo = await prisma.itemPhoto.create({
      data: {
        itemId,
        side,
        gcsPath: photoPath,
        width,
        height,
        sha256,
      },
    });
  }

  revalidatePath('/', 'layout');
  return photo;
}

// ---------------------------------------------------------------------------
// Trigger identification
// ---------------------------------------------------------------------------

export async function triggerIdentification(itemId: string) {
  await requireAuth();
  z.string().uuid().parse(itemId);

  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
  });

  if (item.status !== 'draft' && item.status !== 'identifying') {
    throw new Error(
      `Cannot trigger identification for item with status '${item.status}'`,
    );
  }

  await prisma.item.update({
    where: { id: itemId },
    data: { status: 'identifying' },
  });

  // Run the identify job inline (LocalQueue fires async via setTimeout)
  runIdentifyJob({ itemIds: [itemId] }).catch((err) => {
    console.error(`[triggerIdentification] Job failed for item ${itemId}:`, err);
  });

  revalidatePath('/', 'layout');
  return { itemId };
}

// ---------------------------------------------------------------------------
// Confirm identification
// ---------------------------------------------------------------------------

const confirmIdentificationSchema = z.object({
  chosenCandidateIndex: z.number().int().min(0),
  corrections: z
    .array(
      z.object({
        field: z.string(),
        predicted: z.unknown(),
        corrected: z.unknown(),
      }),
    )
    .default([]),
  conditionKind: conditionKindEnum.optional(),
  rawConditionTier: rawConditionTierEnum.nullable().optional(),
  grader: graderEnum.nullable().optional(),
  grade: z.number().nullable().optional(),
  certNumber: z.string().nullable().optional(),
  storage: storageTypeEnum.optional(),
  acquiredVia: acquiredViaEnum.optional(),
  costPriceCents: z.number().int().nullable().optional(),
  notSure: z.boolean().default(false),
});

export async function confirmIdentification(
  itemId: string,
  data: unknown,
) {
  await requireAuth();
  z.string().uuid().parse(itemId);
  const parsed = confirmIdentificationSchema.parse(data);

  // Find the latest identification for this item
  const identification = await prisma.identification.findFirst({
    where: { itemId, status: { in: ['needs_review', 'ready'] } },
    orderBy: { createdAt: 'desc' },
  });

  if (!identification) {
    throw new Error('No pending identification found for this item');
  }

  const candidates = (identification.candidates ?? []) as Array<{
    provider: string;
    cardId: string;
    parallelId: string | null;
    playerName: string;
    year: number;
    setName: string;
    subsetOrInsert: string | null;
    cardNumber: string;
    parallelName: string | null;
    isRookie: boolean;
    imageUrl?: string;
    score: number;
  }>;

  const chosen = candidates[parsed.chosenCandidateIndex];

  // Update identification status
  await prisma.identification.update({
    where: { id: identification.id },
    data: {
      status: 'confirmed',
      chosenCandidateIndex: parsed.chosenCandidateIndex,
      confirmedVia: 'single',
      confirmedAt: new Date(),
    },
  });

  // Save corrections
  if (parsed.corrections.length > 0) {
    await prisma.identificationCorrection.createMany({
      data: parsed.corrections.map((c) => ({
        identificationId: identification.id,
        field: c.field,
        predicted: c.predicted as import('@prisma/client').Prisma.InputJsonValue,
        corrected: c.corrected as import('@prisma/client').Prisma.InputJsonValue,
      })),
    });
  }

  // Find or create the Card from the candidate (or extraction if unmatched)
  let cardData: CardFields;

  if (chosen) {
    cardData = {
      year: chosen.year,
      manufacturer: 'Unknown', // Candidate doesn't carry manufacturer
      setName: chosen.setName,
      subset: chosen.subsetOrInsert ?? null,
      cardNumber: chosen.cardNumber,
      players: [
        {
          name: chosen.playerName,
          team: null,
          position: null,
        },
      ],
      parallel: chosen.parallelName ?? null,
      printRun: null,
      isAuto: false,
      isMemorabilia: false,
      isRookie: chosen.isRookie,
      variation: null,
      licensed: 'unknown' as const,
      cardsightCardId: chosen.cardId,
      cardsightParallelId: chosen.parallelId,
      referenceImageUrl: chosen.imageUrl ?? null,
    };
  } else {
    // Use extraction fields for unmatched
    const extraction = identification.extraction as unknown as import('@/providers/types').CardExtraction | null;
    if (!extraction) {
      throw new Error('No extraction data available for unmatched identification');
    }
    cardData = {
      year: extraction.set_year.value ?? extraction.copyright_year.value ?? 0,
      manufacturer: extraction.manufacturer.value ?? 'Unknown',
      setName: extraction.set_name.value ?? 'Unknown',
      subset: extraction.subset_or_insert.value ?? null,
      cardNumber: extraction.card_number.value ?? '0',
      players: extraction.players.map((p) => ({
        name: p.name,
        team: extraction.team.value,
        position: extraction.position.value,
      })),
      parallel: extraction.finish.parallel_name_printed ?? null,
      printRun: extraction.serial.print_run ?? null,
      isAuto: extraction.autograph.present ?? false,
      isMemorabilia: extraction.memorabilia.value ?? false,
      isRookie: extraction.rookie_logo_printed.value ?? false,
      variation: null,
      licensed: 'unknown' as const,
    };
  }

  const card = await findOrCreateCard(cardData);

  // Build item update
  const itemUpdate: Record<string, unknown> = {
    cardId: card.id,
    status: 'owned',
  };

  // Apply condition fields if provided
  if (parsed.conditionKind !== undefined) itemUpdate.conditionKind = parsed.conditionKind;
  if (parsed.rawConditionTier !== undefined) itemUpdate.rawConditionTier = parsed.rawConditionTier;
  if (parsed.grader !== undefined) itemUpdate.grader = parsed.grader;
  if (parsed.grade !== undefined) itemUpdate.grade = parsed.grade;
  if (parsed.certNumber !== undefined) itemUpdate.certNumber = parsed.certNumber;
  if (parsed.storage !== undefined) itemUpdate.storage = parsed.storage;
  if (parsed.acquiredVia !== undefined) itemUpdate.acquiredVia = parsed.acquiredVia;
  if (parsed.costPriceCents !== undefined) itemUpdate.costPriceCents = parsed.costPriceCents;

  // Handle "not sure" flow (§6.7b)
  if (parsed.notSure) {
    const alternateCandidates = candidates
      .filter((_, i) => i !== parsed.chosenCandidateIndex)
      .slice(0, 5)
      .map((c) => ({
        provider: c.provider,
        cardId: c.cardId,
        parallelId: c.parallelId,
        playerName: c.playerName,
        year: c.year,
        setName: c.setName,
        cardNumber: c.cardNumber,
      }));

    itemUpdate.identityUnverified = alternateCandidates;
  }

  await prisma.item.update({
    where: { id: itemId },
    data: itemUpdate,
  });

  // Update scan session count_confirmed
  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
    select: { scanSessionId: true },
  });

  if (item.scanSessionId) {
    await prisma.scanSession.update({
      where: { id: item.scanSessionId },
      data: { countConfirmed: { increment: 1 } },
    });
  }

  revalidatePath('/', 'layout');
  return { itemId, cardId: card.id };
}

// ---------------------------------------------------------------------------
// Bulk confirm identifications
// ---------------------------------------------------------------------------

const bulkConfirmSchema = z.object({
  itemIds: z.array(z.string().uuid()).min(1),
});

export async function bulkConfirmIdentifications(
  itemIds: string[],
) {
  await requireAuth();
  const parsed = bulkConfirmSchema.parse({ itemIds });

  const confirmedItems: string[] = [];

  for (const itemId of parsed.itemIds) {
    try {
      // Find the latest identification for this item
      const identification = await prisma.identification.findFirst({
        where: { itemId, status: { in: ['needs_review', 'ready'] } },
        orderBy: { createdAt: 'desc' },
      });

      if (!identification) continue;

      // Confirm using the top candidate (index 0)
      await confirmIdentification(itemId, {
        chosenCandidateIndex: 0,
        corrections: [],
        notSure: false,
      });

      // Update confirmedVia to 'bulk'
      await prisma.identification.update({
        where: { id: identification.id },
        data: { confirmedVia: 'bulk' },
      });

      confirmedItems.push(itemId);
    } catch (err) {
      console.error(`[bulkConfirm] Failed for item ${itemId}:`, err);
    }
  }

  // Pick audit items: 10% of confirmed, minimum 2
  if (confirmedItems.length > 0) {
    const auditCount = Math.max(2, Math.ceil(confirmedItems.length * 0.1));
    const shuffled = [...confirmedItems].sort(() => Math.random() - 0.5);
    const auditItems = shuffled.slice(0, Math.min(auditCount, confirmedItems.length));

    // Mark audit items with identity_unverified flag
    for (const auditItemId of auditItems) {
      await prisma.item.update({
        where: { id: auditItemId },
        data: {
          identityUnverified: { audit: true, reason: 'bulk_confirm_audit' },
        },
      });
    }
  }

  revalidatePath('/', 'layout');
  return {
    confirmed: confirmedItems.length,
    total: parsed.itemIds.length,
  };
}

// ---------------------------------------------------------------------------
// Retry identification
// ---------------------------------------------------------------------------

export async function retryIdentification(itemId: string) {
  await requireAuth();
  z.string().uuid().parse(itemId);

  const item = await prisma.item.findUniqueOrThrow({
    where: { id: itemId },
  });

  // Find the latest failed identification
  const failedIdent = await prisma.identification.findFirst({
    where: { itemId, status: 'failed' },
    orderBy: { createdAt: 'desc' },
  });

  if (!failedIdent && item.status !== 'identifying') {
    throw new Error('No failed identification found and item is not in identifying state');
  }

  // Reset item to identifying
  await prisma.item.update({
    where: { id: itemId },
    data: { status: 'identifying' },
  });

  // Re-enqueue the identify job
  runIdentifyJob({ itemIds: [itemId] }).catch((err) => {
    console.error(`[retryIdentification] Job failed for item ${itemId}:`, err);
  });

  revalidatePath('/', 'layout');
  return { itemId };
}

// ---------------------------------------------------------------------------
// Delete item from review (alias for deleteItem)
// ---------------------------------------------------------------------------

export async function deleteItemFromReview(itemId: string) {
  return deleteItem(itemId);
}
