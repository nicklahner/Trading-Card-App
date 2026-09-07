/**
 * Claude Vision text extractor — uses the Anthropic messages API with
 * structured output via tool use to extract card data from photos.
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFile } from 'node:fs/promises';

import type { TextExtractor } from '../interfaces';
import type { ImageRef, CardExtraction } from '../types';
import { CardExtractionSchema } from '../../domain/extraction/schema';
import { EXTRACTION_SYSTEM_PROMPT, extractionJsonSchema } from '../extraction-prompt';

const TOOL_NAME = 'card_extraction';

export class ClaudeVisionExtractor implements TextExtractor {
  private client: Anthropic;
  private model: string;

  constructor(opts: { apiKey: string; model?: string }) {
    this.client = new Anthropic({ apiKey: opts.apiKey });
    this.model =
      opts.model ?? process.env.ANTHROPIC_VISION_MODEL ?? 'claude-sonnet-4-6';
  }

  async extract(
    images: ImageRef[],
    kind: 'raw' | 'slab',
  ): Promise<CardExtraction> {
    const imageBlocks = await Promise.all(images.map(toImageBlock));

    const userText =
      kind === 'slab'
        ? 'Extract all visible text and facts from this trading card. This appears to be a graded slab. Pay special attention to the grading label.'
        : 'Extract all visible text and facts from this trading card.';

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 4096,
      temperature: 0,
      system: EXTRACTION_SYSTEM_PROMPT,
      tools: [
        {
          name: TOOL_NAME,
          description:
            'Record the structured extraction of text and facts from a trading card photo.',
          input_schema: extractionJsonSchema() as Anthropic.Tool.InputSchema,
        },
      ],
      tool_choice: { type: 'tool' as const, name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks,
            { type: 'text' as const, text: userText },
          ],
        },
      ],
    });

    const toolBlock = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
    );

    if (!toolBlock) {
      throw new Error('Anthropic response did not contain a tool_use block');
    }

    const parsed = CardExtractionSchema.safeParse(toolBlock.input);
    if (!parsed.success) {
      throw new Error(
        `Malformed extraction response: ${parsed.error.message}`,
      );
    }

    return parsed.data as CardExtraction;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type ImageContentBlock = Anthropic.ImageBlockParam;

async function toImageBlock(ref: ImageRef): Promise<ImageContentBlock> {
  const url = ref.url;

  // data: URLs — extract base64 directly
  if (url.startsWith('data:')) {
    const match = url.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      throw new Error(`Unsupported data URL format: ${url.slice(0, 60)}…`);
    }
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: match[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: match[2],
      },
    };
  }

  // Local file paths (absolute or file://)
  if (url.startsWith('/') || url.startsWith('file://')) {
    const filePath = url.startsWith('file://') ? url.slice(7) : url;
    const buf = await readFile(filePath);
    const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpeg';
    const mediaType = MEDIA_TYPES[ext] ?? 'image/jpeg';
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: mediaType,
        data: buf.toString('base64'),
      },
    };
  }

  // HTTP(S) URLs — use Anthropic's native URL source
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return {
      type: 'image',
      source: { type: 'url', url },
    };
  }

  // Relative URLs (e.g. /api/photos/...) — fetch via node fetch won't work
  // without a base URL, so read as base64 via fetch for server-side usage.
  // The caller should provide an absolute URL; throw if we can't handle it.
  throw new Error(
    `Cannot resolve image URL "${url}". Provide an absolute HTTP(S) URL, file path, or data: URL.`,
  );
}

const MEDIA_TYPES: Record<string, 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};
