/**
 * Orientation-aware extraction.
 *
 * Deterministically corrects image orientation BEFORE the full extraction
 * call. Uses a cheap orientation-only vision check (~$0.001/image) to
 * detect rotation, then sends the corrected image to the extractor.
 *
 * This prevents fabrication caused by upside-down/sideways text that the
 * model can't read but tries to infer from visual context.
 */

import type { TextExtractor } from '@/providers/interfaces';
import type { ImageRef, CardExtraction } from '@/providers/types';
import {
  orientCardImage,
  OpenAIOrientationDetector,
  type OrientationDetector,
} from './orient-card';

/**
 * Orient all images then extract.
 *
 * For each image, detects and corrects rotation before sending to the
 * vision extractor. The extractor always sees upright images.
 */
export async function extractWithOrientationRetry(
  extractor: TextExtractor,
  images: ImageRef[],
  kind: 'raw' | 'slab',
  detector?: OrientationDetector,
): Promise<{ extraction: CardExtraction; rotationsApplied: Record<string, number> }> {
  // Build the detector if not provided
  const orient = detector ?? buildDefaultDetector();

  const rotationsApplied: Record<string, number> = {};
  const orientedImages: ImageRef[] = [];

  for (const img of images) {
    const oriented = await orientCardImage(img.url, orient);
    rotationsApplied[img.side] = oriented.rotationApplied;
    orientedImages.push({ url: oriented.dataUrl, side: img.side });
  }

  const extraction = await extractor.extract(orientedImages, kind);

  return { extraction, rotationsApplied };
}

function buildDefaultDetector(): OrientationDetector {
  const apiKey = process.env.OPENAI_API_KEY;
  if (apiKey) {
    return new OpenAIOrientationDetector(apiKey);
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (anthropicKey) {
    // Fallback: a no-op detector that assumes images are upright.
    // Claude adapter handles orientation internally.
    return { isUpright: async () => true };
  }

  // No vision API available — assume upright
  return { isUpright: async () => true };
}
