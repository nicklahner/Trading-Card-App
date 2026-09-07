import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextRequest, NextResponse } from 'next/server';

const DATA_DIR = join(process.cwd(), 'data');

/**
 * Serve photos from the local data/ directory.
 * file:// URLs don't work in <img> tags, so this route handler
 * proxies them as proper HTTP responses.
 *
 * Example: /api/photos/photos/abc-123/front.jpg
 *          /api/photos/thumbnails/abc-123/front.jpg
 */
export async function GET(
  _request: NextRequest,
  props: { params: Promise<{ path: string[] }> },
) {
  const { path } = await props.params;

  // Sanitize: reject any path segments that try to escape
  if (path.some((seg) => seg === '..' || seg.includes('\0'))) {
    return new NextResponse('Bad request', { status: 400 });
  }

  const filePath = join(DATA_DIR, ...path);

  // Ensure resolved path is still within DATA_DIR
  const { resolve } = await import('node:path');
  const resolved = resolve(filePath);
  if (!resolved.startsWith(resolve(DATA_DIR))) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  try {
    const buffer = await readFile(resolved);

    // Determine content type from extension
    const ext = resolved.split('.').pop()?.toLowerCase();
    const contentTypeMap: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      webp: 'image/webp',
      gif: 'image/gif',
    };
    const contentType = contentTypeMap[ext ?? ''] ?? 'application/octet-stream';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new NextResponse('Not found', { status: 404 });
  }
}
