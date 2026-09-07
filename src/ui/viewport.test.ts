/**
 * Viewport meta test — §9 requires that the viewport meta
 * never sets user-scalable=no or maximum-scale.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('viewport meta', () => {
  it('layout.tsx does not set user-scalable=no', () => {
    const content = readFileSync(
      join(process.cwd(), 'src/app/layout.tsx'),
      'utf-8',
    );
    expect(content).not.toMatch(/user-scalable\s*=\s*no/i);
  });

  it('layout.tsx does not set maximum-scale', () => {
    const content = readFileSync(
      join(process.cwd(), 'src/app/layout.tsx'),
      'utf-8',
    );
    expect(content).not.toMatch(/maximum-scale/i);
  });
});
