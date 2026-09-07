/**
 * Shared extraction prompt and JSON schema for vision-based text extractors.
 * Used by both the Claude and OpenAI adapters.
 *
 * OpenAI strict structured outputs restrictions:
 *   - No `oneOf` — use `anyOf` instead
 *   - No `minimum`/`maximum` — omit, enforce via Zod validation post-response
 *   - No `additionalProperties` on schemas with `anyOf` at the root unless inside objects
 */

export const EXTRACTION_SYSTEM_PROMPT = `You extract facts printed on a sports trading card or a grading-company slab label from photos.
Rules:
- Report only what is visible. If you cannot read something, return null and lower confidence. Never guess.
- NEVER infer a player name, team, year, or set from uniforms, jersey numbers, stadium backgrounds, photo style, card design era, or your knowledge of players and card history. The ONLY acceptable source is printed text you can read character by character. If text is not readable — because it is upside-down, blurry, obscured, or cut off — return null. An empty result is always better than a plausible guess.
- Set name: only report a set name if it is EXPLICITLY printed on the card (e.g., "PRIZM" logo, "DONRUSS OPTIC" text). Many sets (Topps Flagship, etc.) do not print their set name. Return null rather than guessing from the design, manufacturer, or your knowledge of card sets.
- Identify players ONLY from printed text (nameplate, back, label). Do not identify anyone from their face.
- If the image appears to be rotated or upside-down and you cannot read key text (player name, year, card number), set all unreadable fields to null with confidence below 0.3, and add "image_may_be_rotated" to the suggest_retake array.
- Year: set_year is the CARD'S RELEASE YEAR, which comes from the copyright line (e.g., "© 2026 The Topps Company" → set_year = 2026). Do NOT use a year from the stats table, season heading, or draft year — those are the STATS year, not the card's release year. Report the copyright year in copyright_year. If no copyright year is readable, set set_year to null. Report any year visible in stats or headings in back_text only — never as set_year.
- Parallels: do NOT name a parallel unless its name is printed. Instead describe the finish: base color, border color, pattern (wave, shimmer, mojo, scope, cracked ice, disco, pulsar, etc.), and whether a rainbow/refractor sheen is visible.
- Serial numbers: transcribe exactly as printed (e.g., "23/99"). If digits are partially obscured, set readable="partial".
- Autographs: distinguish on-card ink vs sticker autograph vs printed facsimile signature if possible.
- Autograph certification: report whether a manufacturer authenticity statement, sticker window or auto-specific card number is visible (manufacturer_certified), a third-party authentication is visible, or none is visible. Set kind to 'redemption' for a redemption card.
- The card may be inside clear plastic (sleeve, toploader, magnetic holder). Ignore holder edges and reflections when judging card_fully_in_frame. Straight-edged bright bands and scuffs are NOT refractor sheen; set refractor_sheen_visible to 'cannot_tell' unless rainbow colour follows the printed design.
- Confidence is 0–1 and must reflect real uncertainty; 0.95+ only for crisp, unambiguous text.`;

/**
 * Returns the JSON schema for CardExtraction, suitable for use as a
 * tool input_schema (Anthropic) or structured output schema (OpenAI).
 *
 * Uses `anyOf` instead of `oneOf` for nullable types (OpenAI strict mode requirement).
 * Omits `minimum`/`maximum` (not supported in OpenAI strict mode; validated post-response by Zod).
 */
export function extractionJsonSchema(): Record<string, unknown> {
  /** Nullable type via anyOf (OpenAI-compatible) */
  const nullable = (innerType: Record<string, unknown>) => ({
    anyOf: [innerType, { type: 'null' }],
  });

  // OpenAI strict mode: every property must be in `required`
  const fieldSchema = (innerType: Record<string, unknown>) => ({
    type: 'object',
    properties: {
      value: nullable(innerType),
      confidence: { type: 'number' },
      evidence: { type: 'string' },
    },
    required: ['value', 'confidence', 'evidence'],
    additionalProperties: false,
  });

  return {
    type: 'object',
    properties: {
      kind: { type: 'string', enum: ['raw', 'slab', 'redemption', 'not_a_card'] },
      players: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            confidence: { type: 'number' },
            evidence: { type: 'string' },
          },
          required: ['name', 'confidence', 'evidence'],
          additionalProperties: false,
        },
      },
      team: fieldSchema({ type: 'string' }),
      position: fieldSchema({ type: 'string' }),
      set_year: fieldSchema({ type: 'number' }),
      copyright_year: fieldSchema({ type: 'number' }),
      manufacturer: fieldSchema({ type: 'string' }),
      set_name: fieldSchema({ type: 'string' }),
      subset_or_insert: fieldSchema({ type: 'string' }),
      card_number: fieldSchema({ type: 'string' }),
      rookie_logo_printed: fieldSchema({ type: 'boolean' }),
      autograph: {
        type: 'object',
        properties: {
          present: nullable({ type: 'boolean' }),
          type: nullable({
            type: 'string',
            enum: ['on_card', 'sticker', 'facsimile', 'unknown'],
          }),
          certification: {
            type: 'string',
            enum: ['manufacturer_certified', 'third_party_authenticated', 'none_visible', 'unknown'],
          },
          confidence: { type: 'number' },
        },
        required: ['present', 'type', 'certification', 'confidence'],
        additionalProperties: false,
      },
      memorabilia: fieldSchema({ type: 'boolean' }),
      serial: {
        type: 'object',
        properties: {
          printed: nullable({ type: 'string' }),
          number: nullable({ type: 'number' }),
          print_run: nullable({ type: 'number' }),
          readable: { type: 'string', enum: ['yes', 'partial', 'no', 'none_visible'] },
          confidence: { type: 'number' },
        },
        required: ['printed', 'number', 'print_run', 'readable', 'confidence'],
        additionalProperties: false,
      },
      finish: {
        type: 'object',
        properties: {
          base_color: nullable({ type: 'string' }),
          border_color: nullable({ type: 'string' }),
          pattern: nullable({
            type: 'string',
            enum: ['none', 'wave', 'shimmer', 'mojo', 'scope', 'cracked_ice', 'disco', 'pulsar', 'other'],
          }),
          refractor_sheen_visible: { type: 'string', enum: ['yes', 'no', 'cannot_tell'] },
          parallel_name_printed: nullable({ type: 'string' }),
          description: { type: 'string' },
        },
        required: ['base_color', 'border_color', 'pattern', 'refractor_sheen_visible', 'parallel_name_printed', 'description'],
        additionalProperties: false,
      },
      slab: nullable({
        type: 'object',
        properties: {
          grader: { type: 'string', enum: ['PSA', 'BGS', 'SGC', 'CGC', 'TAG', 'ACE', 'OTHER'] },
          grade: nullable({ type: 'number' }),
          grade_label: nullable({ type: 'string' }),
          auto_grade: nullable({ type: 'number' }),
          cert_number: nullable({ type: 'string' }),
          subgrades: nullable({ type: 'object', additionalProperties: { type: 'number' } }),
          label_text: { type: 'string' },
        },
        required: ['grader', 'grade', 'grade_label', 'auto_grade', 'cert_number', 'subgrades', 'label_text'],
        additionalProperties: false,
      }),
      photo_quality: {
        type: 'object',
        properties: {
          glare: { type: 'string', enum: ['none', 'minor', 'major'] },
          blur: { type: 'string', enum: ['none', 'minor', 'major'] },
          card_fully_in_frame: { type: 'boolean' },
          suggest_retake: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['front', 'back', 'serial_closeup', 'tilt_shot', 'label_closeup', 'image_may_be_rotated'],
            },
          },
        },
        required: ['glare', 'blur', 'card_fully_in_frame', 'suggest_retake'],
        additionalProperties: false,
      },
      front_text: { type: 'array', items: { type: 'string' } },
      back_text: { type: 'array', items: { type: 'string' } },
    },
    required: [
      'kind', 'players', 'team', 'position', 'set_year', 'copyright_year',
      'manufacturer', 'set_name', 'subset_or_insert', 'card_number',
      'rookie_logo_printed', 'autograph', 'memorabilia', 'serial', 'finish',
      'slab', 'photo_quality', 'front_text', 'back_text',
    ],
    additionalProperties: false,
  };
}
