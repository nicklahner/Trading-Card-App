import { z } from 'zod';

// --- Helper: Field<T> pattern ---

function field<T extends z.ZodTypeAny>(inner: T) {
  return z
    .object({
      value: inner.nullable(),
      confidence: z.number().min(0).max(1),
      evidence: z.string().optional(),
    })
    .strict();
}

// --- Sub-schemas ---

const PlayerSchema = z
  .object({
    name: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.string(),
  })
  .strict();

const AutographSchema = z
  .object({
    present: z.boolean().nullable(),
    type: z.enum(['on_card', 'sticker', 'facsimile', 'unknown']).nullable(),
    certification: z.enum([
      'manufacturer_certified',
      'third_party_authenticated',
      'none_visible',
      'unknown',
    ]),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const SerialSchema = z
  .object({
    printed: z.string().nullable(),
    number: z.number().nullable(),
    print_run: z.number().nullable(),
    readable: z.enum(['yes', 'partial', 'no', 'none_visible']),
    confidence: z.number().min(0).max(1),
  })
  .strict();

const FinishSchema = z
  .object({
    base_color: z.string().nullable(),
    border_color: z.string().nullable(),
    pattern: z
      .enum([
        'none',
        'wave',
        'shimmer',
        'mojo',
        'scope',
        'cracked_ice',
        'disco',
        'pulsar',
        'other',
      ])
      .nullable(),
    refractor_sheen_visible: z.enum(['yes', 'no', 'cannot_tell']),
    parallel_name_printed: z.string().nullable(),
    description: z.string(),
  })
  .strict();

const GraderSchema = z.enum(['PSA', 'BGS', 'SGC', 'CGC', 'TAG', 'ACE', 'OTHER']);

const SlabSchema = z
  .object({
    grader: GraderSchema,
    grade: z.number().nullable(),
    grade_label: z.string().nullable(),
    auto_grade: z.number().nullable(),
    cert_number: z.string().nullable(),
    subgrades: z.record(z.string(), z.number()).nullable(),
    label_text: z.string(),
  })
  .strict();

const PhotoQualitySchema = z
  .object({
    glare: z.enum(['none', 'minor', 'major']),
    blur: z.enum(['none', 'minor', 'major']),
    card_fully_in_frame: z.boolean(),
    suggest_retake: z.array(
      z.enum(['front', 'back', 'serial_closeup', 'tilt_shot', 'label_closeup', 'image_may_be_rotated']),
    ),
  })
  .strict();

// --- Main schema ---

export const CardExtractionSchema = z
  .object({
    kind: z.enum(['raw', 'slab', 'redemption', 'not_a_card']),
    players: z.array(PlayerSchema),
    team: field(z.string()),
    position: field(z.string()),
    set_year: field(z.number()),
    copyright_year: field(z.number()),
    manufacturer: field(z.string()),
    set_name: field(z.string()),
    subset_or_insert: field(z.string()),
    card_number: field(z.string()),
    rookie_logo_printed: field(z.boolean()),
    autograph: AutographSchema,
    memorabilia: field(z.boolean()),
    serial: SerialSchema,
    finish: FinishSchema,
    slab: SlabSchema.nullable(),
    photo_quality: PhotoQualitySchema,
    front_text: z.array(z.string()),
    back_text: z.array(z.string()),
  })
  .strict();

export type ValidatedCardExtraction = z.infer<typeof CardExtractionSchema>;
