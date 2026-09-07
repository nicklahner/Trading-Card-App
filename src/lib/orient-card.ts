/**
 * Deterministic card image orientation correction.
 *
 * Trading cards are portrait (taller than wide). Photos taken on phones
 * without EXIF orientation are often landscape. This module:
 *
 * 1. If the image is landscape, it's definitely rotated — try both 90°
 *    and 270° with a cheap orientation-only vision call to pick the
 *    right one.
 * 2. If the image is portrait, check for 180° rotation the same way.
 * 3. Runs BEFORE the full extraction, so the model always sees an
 *    upright card.
 *
 * The orientation call uses a tiny (400px) thumbnail and asks only
 * "is this card upright?" — costs ~$0.001 per image.
 */

import sharp from 'sharp';
import { readFile } from 'node:fs/promises';

const THUMB_SIZE = 400;

const ORIENTATION_PROMPT = `Look at this trading card photo. Is the card oriented correctly (text reads normally left-to-right, top-to-bottom)? Answer with exactly one word: "upright" if the text reads normally, or "rotated" if the text is sideways, upside-down, or otherwise not in normal reading orientation. Do not explain.`;

export interface OrientationDetector {
  isUpright(imageDataUrl: string): Promise<boolean>;
}

/**
 * OpenAI-based orientation detector. Uses a minimal call with a tiny
 * thumbnail to determine if text is right-side-up.
 */
export class OpenAIOrientationDetector implements OrientationDetector {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.model = model ?? process.env.OPENAI_VISION_MODEL ?? 'gpt-5.6-terra';
  }

  async isUpright(imageDataUrl: string): Promise<boolean> {
    const OpenAI = (await import('openai')).default;
    const client = new OpenAI({ apiKey: this.apiKey });

    const response = await client.chat.completions.create({
      model: this.model,
      max_completion_tokens: 10,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: ORIENTATION_PROMPT },
            { type: 'image_url', image_url: { url: imageDataUrl, detail: 'low' } },
          ],
        },
      ],
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase() ?? '';
    return answer.includes('upright');
  }
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

/**
 * Make a tiny thumbnail for the cheap orientation check.
 */
async function makeThumbnail(buf: Buffer): Promise<Buffer> {
  return sharp(buf)
    .resize({ width: THUMB_SIZE, height: THUMB_SIZE, fit: 'inside' })
    .jpeg({ quality: 70 })
    .toBuffer();
}

export interface OrientedImage {
  buffer: Buffer;
  dataUrl: string;
  rotationApplied: number;
}

/**
 * Orient a card image so text reads correctly.
 *
 * 1. If landscape → card is rotated. Try 90° CW, check if upright.
 *    If not, use 270° CW.
 * 2. If portrait → might be 180°. Check if upright. If not, rotate 180°.
 *
 * Returns the corrected buffer + data URL + degrees applied.
 */
export async function orientCardImage(
  imageUrl: string,
  detector: OrientationDetector,
): Promise<OrientedImage> {
  const original = await readImageToBuffer(imageUrl);
  const meta = await sharp(original).metadata();
  const isLandscape = (meta.width ?? 1) > (meta.height ?? 1);

  if (isLandscape) {
    // Card photo taken sideways — try 90° first
    const rot90 = await sharp(original).rotate(90).jpeg({ quality: 92 }).toBuffer();
    const thumb90 = await makeThumbnail(rot90);
    const upright90 = await detector.isUpright(toDataUrl(thumb90));

    if (upright90) {
      return { buffer: rot90, dataUrl: toDataUrl(rot90), rotationApplied: 90 };
    }

    // Not upright at 90° → must be 270°
    const rot270 = await sharp(original).rotate(270).jpeg({ quality: 92 }).toBuffer();
    return { buffer: rot270, dataUrl: toDataUrl(rot270), rotationApplied: 270 };
  }

  // Portrait — check if it's right-side-up
  const thumbOrig = await makeThumbnail(original);
  const uprightOrig = await detector.isUpright(toDataUrl(thumbOrig));

  if (uprightOrig) {
    return { buffer: original, dataUrl: toDataUrl(original), rotationApplied: 0 };
  }

  // Upside-down — rotate 180°
  const rot180 = await sharp(original).rotate(180).jpeg({ quality: 92 }).toBuffer();
  return { buffer: rot180, dataUrl: toDataUrl(rot180), rotationApplied: 180 };
}
