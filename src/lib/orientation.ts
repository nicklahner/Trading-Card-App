/**
 * Image orientation detection and correction.
 *
 * Photos may arrive rotated 90/180/270 with no EXIF orientation tag
 * (common after HEIC-to-JPEG conversion). This module detects and
 * corrects orientation before extraction.
 *
 * Strategy:
 * - sharp().rotate() handles EXIF-tagged rotation automatically
 * - For images without EXIF, we provide tryRotations() which the
 *   extraction pipeline calls when the first attempt yields no
 *   readable text on the front
 */

import sharp from 'sharp';

const ROTATIONS = [0, 180, 90, 270] as const;
type Rotation = (typeof ROTATIONS)[number];

/**
 * Auto-orient an image buffer. Applies EXIF rotation if present,
 * otherwise returns the buffer as-is (no EXIF = no rotation info).
 */
export async function autoOrient(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer).rotate().toBuffer();
}

/**
 * Rotate an image by the given degrees (0, 90, 180, 270).
 * Returns a new JPEG buffer.
 */
export async function rotateImage(
  buffer: Buffer,
  degrees: Rotation,
): Promise<Buffer> {
  if (degrees === 0) return buffer;
  return sharp(buffer).rotate(degrees).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Generate all rotation candidates for an image.
 * Returns buffers for 0° (original), 180°, 90°, 270° — in that order,
 * since 180° is the most common failure mode for phone photos.
 */
export async function allRotations(
  buffer: Buffer,
): Promise<Array<{ degrees: Rotation; buffer: Buffer }>> {
  const results: Array<{ degrees: Rotation; buffer: Buffer }> = [];
  for (const deg of ROTATIONS) {
    results.push({ degrees: deg, buffer: await rotateImage(buffer, deg) });
  }
  return results;
}

export { ROTATIONS, type Rotation };
