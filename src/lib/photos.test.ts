import { describe, it, expect } from 'vitest';
import { readFile } from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { processPhoto, hasExifData } from './photos';

const FIXTURE_PATH = path.resolve(__dirname, '../../fixtures/exif-gps.jpg');

describe('processPhoto', () => {
  it('strips EXIF from full output', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { full } = await processPhoto(raw);
    expect(await hasExifData(full)).toBe(false);
  });

  it('strips EXIF from thumbnail output', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { thumbnail } = await processPhoto(raw);
    expect(await hasExifData(thumbnail)).toBe(false);
  });

  it('outputs JPEG for full', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { full } = await processPhoto(raw);
    const meta = await sharp(full).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('thumbnail has smaller or equal dimensions than full', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { full, thumbnail } = await processPhoto(raw);

    const fullMeta = await sharp(full).metadata();
    const thumbMeta = await sharp(thumbnail).metadata();

    // Thumbnail long edge (400) <= full long edge (2400)
    const fullLong = Math.max(fullMeta.width!, fullMeta.height!);
    const thumbLong = Math.max(thumbMeta.width!, thumbMeta.height!);
    expect(thumbLong).toBeLessThanOrEqual(fullLong);
  });

  it('both outputs have valid dimensions', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { full, thumbnail } = await processPhoto(raw);

    const fullMeta = await sharp(full).metadata();
    const thumbMeta = await sharp(thumbnail).metadata();

    expect(fullMeta.width).toBeGreaterThan(0);
    expect(fullMeta.height).toBeGreaterThan(0);
    expect(thumbMeta.width).toBeGreaterThan(0);
    expect(thumbMeta.height).toBeGreaterThan(0);
  });
});

describe('hasExifData', () => {
  it('returns true for raw fixture with EXIF', async () => {
    const raw = await readFile(FIXTURE_PATH);
    expect(await hasExifData(raw)).toBe(true);
  });

  it('returns false for processed output', async () => {
    const raw = await readFile(FIXTURE_PATH);
    const { full } = await processPhoto(raw);
    expect(await hasExifData(full)).toBe(false);
  });
});
