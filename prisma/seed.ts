import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

function uuid() {
  return crypto.randomUUID();
}

const CARDS = [
  // Base cards
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '301',
    players: [{ name: 'CJ Stroud', team: 'HOU', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-prizm-stroud-base',
    sportscardsproName: 'CJ Stroud #301',
  },
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '301',
    players: [{ name: 'CJ Stroud', team: 'HOU', position: 'QB' }],
    parallel: 'Silver',
    printRun: null,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-prizm-stroud-silver',
    sportscardsproName: 'CJ Stroud [Silver] #301',
  },
  // Numbered parallel
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '301',
    players: [{ name: 'CJ Stroud', team: 'HOU', position: 'QB' }],
    parallel: 'Gold',
    printRun: 10,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-prizm-stroud-gold',
    sportscardsproName: 'CJ Stroud [Gold] #301',
  },
  // Auto
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: 'RA-CS',
    players: [{ name: 'CJ Stroud', team: 'HOU', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: true,
    autoType: 'sticker' as const,
    isRookie: true,
    sportscardsproId: 'scp-prizm-stroud-auto',
    sportscardsproName: 'CJ Stroud Rookie Auto #RA-CS',
  },
  // Base veteran
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '200',
    players: [{ name: 'Patrick Mahomes II', team: 'KC', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-prizm-mahomes-base',
    sportscardsproName: 'Patrick Mahomes II #200',
  },
  // Silver veteran
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '200',
    players: [{ name: 'Patrick Mahomes II', team: 'KC', position: 'QB' }],
    parallel: 'Silver',
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-prizm-mahomes-silver',
    sportscardsproName: 'Patrick Mahomes II [Silver] #200',
  },
  // Optic base
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Donruss Optic',
    cardNumber: '151',
    players: [{ name: 'Anthony Richardson', team: 'IND', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-optic-richardson-base',
    sportscardsproName: 'Anthony Richardson #151',
  },
  // Optic holo
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Donruss Optic',
    cardNumber: '151',
    players: [{ name: 'Anthony Richardson', team: 'IND', position: 'QB' }],
    parallel: 'Holo',
    printRun: null,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-optic-richardson-holo',
    sportscardsproName: 'Anthony Richardson [Holo] #151',
  },
  // Insert
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Prizm',
    subset: 'Color Blast',
    cardNumber: 'CB-1',
    players: [{ name: 'Travis Kelce', team: 'KC', position: 'TE' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-prizm-kelce-colorblast',
    sportscardsproName: 'Travis Kelce Color Blast #CB-1',
  },
  // Numbered red wave
  {
    id: uuid(),
    year: 2024,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '280',
    players: [{ name: 'Caleb Williams', team: 'CHI', position: 'QB' }],
    parallel: 'Red Wave',
    printRun: 299,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-prizm-williams-redwave',
    sportscardsproName: 'Caleb Williams [Red Wave] #280',
  },
  // Memorabilia
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'National Treasures',
    cardNumber: 'RPA-CS',
    players: [{ name: 'CJ Stroud', team: 'HOU', position: 'QB' }],
    parallel: null,
    printRun: 99,
    isAuto: true,
    autoType: 'on_card' as const,
    isMemorabilia: true,
    isRookie: true,
    sportscardsproId: 'scp-nt-stroud-rpa',
    sportscardsproName: 'CJ Stroud RPA #RPA-CS',
  },
  // Select base
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Select',
    cardNumber: '50',
    players: [{ name: 'Josh Allen', team: 'BUF', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-select-allen-base',
    sportscardsproName: 'Josh Allen #50',
  },
  // Mosaic base
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Mosaic',
    cardNumber: '1',
    players: [{ name: 'Jalen Hurts', team: 'PHI', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-mosaic-hurts-base',
    sportscardsproName: 'Jalen Hurts #1',
  },
  // A graded card (PSA 10)
  {
    id: uuid(),
    year: 2020,
    manufacturer: 'Panini',
    setName: 'Prizm',
    cardNumber: '325',
    players: [{ name: 'Justin Herbert', team: 'LAC', position: 'QB' }],
    parallel: 'Silver',
    printRun: null,
    isAuto: false,
    isRookie: true,
    sportscardsproId: 'scp-prizm-herbert-silver',
    sportscardsproName: 'Justin Herbert [Silver] #325',
  },
  // Low-end base
  {
    id: uuid(),
    year: 2023,
    manufacturer: 'Panini',
    setName: 'Donruss',
    cardNumber: '100',
    players: [{ name: 'Lamar Jackson', team: 'BAL', position: 'QB' }],
    parallel: null,
    printRun: null,
    isAuto: false,
    isRookie: false,
    sportscardsproId: 'scp-donruss-jackson-base',
    sportscardsproName: 'Lamar Jackson #100',
  },
];

async function seed() {
  console.log('Seeding database...');

  // Create valuation settings
  await prisma.settings.upsert({
    where: { id: '00000000-0000-4000-a000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000001',
      kind: 'valuation',
      version: 1,
      data: {
        halfLifeDays: 30,
        compWindows: [90, 180, 365],
        minCompsForStrong: 5,
        minNEffForStrong: 4,
        maxDispersionForStrong: 0.35,
        blendWeightOk: 0.6,
        blendWeightWeak: 0.25,
        rangeFoorHigh: 0.15,
        rangeFloorMedium: 0.25,
        rangeFloorLow: 0.4,
        rangeFloorGradeInferred: 0.55,
        reviewThresholdCents: 500,
        rawCapFactor: 0.8,
        divergenceThresholdCents: 1000,
        algorithmVersion: '1.0.0',
      },
      hash: 'seed-val-v1',
      active: true,
    },
  });

  await prisma.settings.upsert({
    where: { id: '00000000-0000-4000-a000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-4000-a000-000000000002',
      kind: 'fees',
      version: 1,
      data: {
        salesTaxEstimate: 0.08,
        shippingChargedToBuyer: 0,
        feeRateLow: 0.1325,
        feeRateHigh: 0.0235,
        feeBracket: 750000,
        perOrderFee: 40,
        perOrderFeeLow: 30,
        perOrderFeeThreshold: 1000,
        shippingRawCheap: 100,
        shippingRawCheapThreshold: 2000,
        shippingRaw: 500,
        shippingGraded: 800,
      },
      hash: 'seed-fees-v1',
      active: true,
    },
  });

  // Create cards and items
  for (const cardData of CARDS) {
    const {
      id: cardId,
      autoType,
      isMemorabilia,
      sportscardsproId,
      sportscardsproName,
      ...rest
    } = cardData;

    const identityKey = [
      rest.year,
      rest.manufacturer.toLowerCase(),
      rest.setName.toLowerCase().replace(/\s+/g, '-'),
      (rest.subset ?? '').toLowerCase().replace(/\s+/g, '-'),
      rest.cardNumber.toLowerCase(),
      rest.players
        .map((p) => p.name.toLowerCase().replace(/\s+/g, '-'))
        .sort()
        .join('+'),
      (rest.parallel ?? '').toLowerCase().replace(/\s+/g, '-'),
      rest.printRun ?? '',
      rest.isAuto ? '1' : '0',
      isMemorabilia ? '1' : '0',
      '',
    ].join('|');

    const card = await prisma.card.upsert({
      where: { identityKey },
      update: {},
      create: {
        id: cardId,
        identityKey,
        ...rest,
        isMemorabilia: isMemorabilia ?? false,
        autoType: autoType ?? null,
        variation: null,
        licensed: 'nflpa_only',
        sportscardsproId,
        sportscardsproName,
        cardsightCardId: `cs-${cardId.slice(0, 8)}`,
        cardsightParallelId: rest.parallel ? `csp-${cardId.slice(0, 8)}` : null,
      },
    });

    // Create an owned item for each card
    const isGraded = rest.year === 2020 && rest.parallel === 'Silver'; // Herbert PSA 10
    const item = await prisma.item.create({
      data: {
        cardId: card.id,
        status: 'owned',
        serialNumber:
          rest.printRun && rest.printRun <= 99
            ? Math.floor(Math.random() * rest.printRun) + 1
            : null,
        conditionKind: isGraded ? 'graded' : 'raw',
        rawConditionTier: isGraded ? null : 'market',
        grader: isGraded ? 'PSA' : null,
        grade: isGraded ? 10 : null,
        gradeLabel: isGraded ? 'Gem Mint' : null,
        certNumber: isGraded ? '12345678' : null,
        storage: isGraded ? 'slab' : rest.printRun ? 'magnetic' : 'toploader',
        acquiredVia: 'purchase',
        costPriceCents: Math.floor(Math.random() * 10000) + 100,
        notes: '',
      },
    });

    console.log(`  Created: ${card.sportscardsproName ?? card.setName + ' #' + card.cardNumber} (item ${item.id.slice(0, 8)})`);
  }

  // Initialize rate limits
  await prisma.rateLimit.upsert({
    where: { provider: 'sportscardspro' },
    update: {},
    create: { provider: 'sportscardspro', nextAllowedAt: new Date() },
  });

  await prisma.rateLimit.upsert({
    where: { provider: 'cardsight' },
    update: {},
    create: { provider: 'cardsight', nextAllowedAt: new Date() },
  });

  console.log(`\nSeeded ${CARDS.length} cards with items, settings, and rate limits.`);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
