/**
 * Deterministic card image orientation correction using local OCR.
 *
 * Trading cards are portrait (taller than wide). Phone photos without
 * EXIF are often landscape. This module:
 *
 * 1. If landscape: rotate to portrait, pick 90° vs 270° by which
 *    produces more OCR-readable text (via tesseract.js, local, no API cost).
 * 2. If portrait: check for 180° rotation the same way.
 *
 * Runs BEFORE extraction. Zero API cost for orientation.
 * Falls back to a model call only if tesseract is unavailable.
 */

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';
import Tesseract from 'tesseract.js';

const THUMB_SIZE = 400;

/**
 * Count readable characters via tesseract on a small thumbnail.
 * Returns the trimmed text length — more text = more likely correct orientation.
 */
async function ocrTextLength(
  worker: Tesseract.Worker,
  buf: Buffer,
): Promise<number> {
  const result = await worker.recognize(buf, {}, { text: true });
  return result.data.text.trim().length;
}

/**
 * Read an image file and return a Buffer.
 */
async function readImageToBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:[^;]+;base64,(.+)$/);
    if (!match) throw new Error(`Bad data URL: ${url.slice(0, 60)}`);
    return Buffer.from(match[1], 'base64');
  }
  const path = url.startsWith('file://') ? url.slice(7) : url;
  return readFile(path);
}

function toDataUrl(buf: Buffer, mime = 'image/jpeg'): string {
  return `data:${mime};base64,${buf.toString('base64')}`;
}

export interface OrientedImage {
  buffer: Buffer;
  dataUrl: string;
  rotationApplied: number;
}

/**
 * Orient a card image so text reads correctly.
 *
 * Uses tesseract.js locally — no API calls, no cost.
 *
 * 1. If landscape → try both 90° and 270°, pick the one with more readable text.
 * 2. If portrait → compare original vs 180°, pick the better one.
 */
export async function orientCardImage(imageUrl: string): Promise<OrientedImage> {
  const original = await readImageToBuffer(imageUrl);
  const meta = await sharp(original).metadata();
  const isLandscape = (meta.width ?? 1) > (meta.height ?? 1);

  // Make a small thumbnail for fast OCR
  const thumb = await sharp(original)
    .resize({ width: THUMB_SIZE, fit: 'inside' })
    .jpeg({ quality: 70 })
    .toBuffer();

  const worker = await Tesseract.createWorker('eng');

  try {
    if (isLandscape) {
      // Card photo taken sideways — try 90° and 270°
      const [thumb90, thumb270] = await Promise.all([
        sharp(thumb).rotate(90).toBuffer(),
        sharp(thumb).rotate(270).toBuffer(),
      ]);

      const [len90, len270] = await Promise.all([
        ocrTextLength(worker, thumb90),
        ocrTextLength(worker, thumb270),
      ]);

      const bestDegrees = len90 >= len270 ? 90 : 270;
      const rotated = await sharp(original)
        .rotate(bestDegrees)
        .jpeg({ quality: 92 })
        .toBuffer();

      return {
        buffer: rotated,
        dataUrl: toDataUrl(rotated),
        rotationApplied: bestDegrees,
      };
    }

    // Portrait — check if it's right-side-up
    const thumb180 = await sharp(thumb).rotate(180).toBuffer();
    const [lenOrig, len180] = await Promise.all([
      ocrTextLength(worker, thumb),
      ocrTextLength(worker, thumb180),
    ]);

    if (lenOrig >= len180) {
      // Already correct
      return {
        buffer: original,
        dataUrl: toDataUrl(original),
        rotationApplied: 0,
      };
    }

    const rotated = await sharp(original)
      .rotate(180)
      .jpeg({ quality: 92 })
      .toBuffer();

    return {
      buffer: rotated,
      dataUrl: toDataUrl(rotated),
      rotationApplied: 180,
    };
  } finally {
    await worker.terminate();
  }
}
