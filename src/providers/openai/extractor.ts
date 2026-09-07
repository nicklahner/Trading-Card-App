/**
 * OpenAI Vision text extractor adapter.
 * Implements TextExtractor (DESIGN.md §3.4) using the OpenAI chat completions
 * API with structured outputs.
 */

import OpenAI from 'openai';
import { readFile } from 'node:fs/promises';
import type { TextExtractor } from '../interfaces';
import type { ImageRef, CardExtraction } from '../types';
import { CardExtractionSchema } from '../../domain/extraction/schema';
import { EXTRACTION_SYSTEM_PROMPT, extractionJsonSchema } from '../extraction-prompt';

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** Convert an ImageRef URL to a data: URL if it's a local file. */
async function resolveImageUrl(url: string): Promise<string> {
  // Already a data: or http(s): URL — pass through
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Local file path (file:// or absolute path)
  const filePath = url.startsWith('file://') ? url.slice(7) : url;
  const buf = await readFile(filePath);
  const ext = filePath.split('.').pop()?.toLowerCase() ?? 'jpeg';
  const mime = EXT_TO_MIME[ext] ?? 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export class OpenAIVisionExtractor implements TextExtractor {
  private client: OpenAI;
  private model: string;

  constructor({ apiKey, model }: { apiKey: string; model?: string }) {
    this.client = new OpenAI({ apiKey });
    this.model = model ?? process.env.OPENAI_VISION_MODEL ?? 'gpt-5.6-terra';
  }

  async extract(images: ImageRef[], kind: 'raw' | 'slab'): Promise<CardExtraction> {
    const imageContentParts: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [];

    for (const img of images) {
      const url = await resolveImageUrl(img.url);
      imageContentParts.push({
        type: 'text' as const,
        text: `[${img.side}]`,
      });
      imageContentParts.push({
        type: 'image_url' as const,
        image_url: { url },
      });
    }

    let userText = 'Extract all visible card information from these images.';
    if (kind === 'slab') {
      userText +=
        ' This appears to be a graded slab. Pay special attention to the grading label.';
    }

    const response = await this.client.chat.completions.create({
      model: this.model,
      // Some models (e.g. gpt-5.6-terra) only support temperature=1.
      // Omit temperature and rely on structured outputs for determinism.
      ...(this.model.includes('5.6') ? {} : { temperature: 0 }),
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [{ type: 'text', text: userText }, ...imageContentParts],
        },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'card_extraction',
          strict: true,
          schema: extractionJsonSchema(),
        },
      },
    });

    const rawJson = response.choices[0]?.message?.content;
    if (!rawJson) {
      throw new Error('OpenAI returned an empty response');
    }

    const parsed: unknown = JSON.parse(rawJson);
    const result = CardExtractionSchema.safeParse(parsed);

    if (!result.success) {
      throw new Error(
        `Malformed extraction response: ${result.error.message}`,
      );
    }

    return result.data as CardExtraction;
  }
}
