import sharp from 'sharp';

const FULL_LONG_EDGE = 2400;
const THUMB_LONG_EDGE = 400;
const JPEG_QUALITY = 90;

/**
 * Resize buffer to fit within `longEdge` on its longest side,
 * strip all EXIF/metadata, output as JPEG.
 */
async function resizeAndStrip(buffer: Buffer, longEdge: number): Promise<Buffer> {
  const meta = await sharp(buffer).metadata();
  const width = meta.width ?? 1;
  const height = meta.height ?? 1;

  const isLandscape = width >= height;
  const resizeOpts = isLandscape
    ? { width: longEdge, height: undefined as number | undefined }
    : { width: undefined as number | undefined, height: longEdge };

  return sharp(buffer)
    .rotate() // auto-rotate based on EXIF orientation before stripping
    .resize({
      ...resizeOpts,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .jpeg({ quality: JPEG_QUALITY })
    .toBuffer();
}

/**
 * Process an uploaded photo: produce a full-size image (2400px long edge)
 * and a thumbnail (400px long edge). All EXIF data is stripped.
 */
export async function processPhoto(
  buffer: Buffer,
): Promise<{ full: Buffer; thumbnail: Buffer }> {
  const [full, thumbnail] = await Promise.all([
    resizeAndStrip(buffer, FULL_LONG_EDGE),
    resizeAndStrip(buffer, THUMB_LONG_EDGE),
  ]);

  return { full, thumbnail };
}

/**
 * Check if a buffer contains EXIF data. Useful for verifying stripping works.
 */
export async function hasExifData(buffer: Buffer): Promise<boolean> {
  const meta = await sharp(buffer).metadata();
  return meta.exif != null && meta.exif.length > 0;
}
