/**
 * Orientation-aware extraction.
 *
 * Deterministically corrects image orientation BEFORE the full extraction
 * call using local tesseract.js OCR — zero API cost for orientation.
 *
 * This prevents fabrication caused by upside-down/sideways text that the
 * model can't read but tries to infer from visual context.
 */

import type { TextExtractor } from '@/providers/interfaces';
import type { ImageRef, CardExtraction } from '@/providers/types';
import { orientCardImage } from './orient-card';

/**
 * Orient all images locally (tesseract, no API cost) then extract.
 */
export async function extractWithOrientationRetry(
  extractor: TextExtractor,
  images: ImageRef[],
  kind: 'raw' | 'slab',
): Promise<{ extraction: CardExtraction; rotationsApplied: Record<string, number> }> {
  const rotationsApplied: Record<string, number> = {};
  const orientedImages: ImageRef[] = [];

  for (const img of images) {
    const oriented = await orientCardImage(img.url);
    rotationsApplied[img.side] = oriented.rotationApplied;
    orientedImages.push({ url: oriented.dataUrl, side: img.side });
  }

  const extraction = await extractor.extract(orientedImages, kind);

  return { extraction, rotationsApplied };
}
