import { describe, it, expect } from 'vitest';

// ---------------------------------------------------------------------------
// Design tokens from globals.css (UI-DESIGN.md section 3.1)
// ---------------------------------------------------------------------------

const tokens = {
  bg: '#0B0C0E',
  surface: '#141619',
  'surface-raised': '#1B1E23',
  border: '#282C33',
  'border-strong': '#6B7484',
  text: '#F2F4F7',
  'text-muted': '#A3ABB8',
  'text-subtle': '#868F9D',
  action: '#4C8DFF',
  'action-contrast': '#0B0C0E',
  positive: '#3FB98A',
  negative: '#E5695F',
  caution: '#E0A33E',
  info: '#7FA8D9',
} as const;

// ---------------------------------------------------------------------------
// WCAG 2.1 contrast-ratio helpers
// ---------------------------------------------------------------------------

/** Parse a 6-digit hex string (#RRGGBB) into [r, g, b] 0-255. */
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Convert an sRGB channel (0-255) to linear light. */
function linearize(channel: number): number {
  const s = channel / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Relative luminance per WCAG 2.1 definition. */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two hex colors. Always >= 1. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// ---------------------------------------------------------------------------
// Token groups
// ---------------------------------------------------------------------------

const backgrounds = ['bg', 'surface', 'surface-raised'] as const;
const textTokens = ['text', 'text-muted', 'text-subtle'] as const;
const semanticColors = ['positive', 'negative', 'caution', 'info'] as const;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Design token WCAG AA contrast ratios', () => {
  describe('text tokens against backgrounds (4.5:1 minimum)', () => {
    for (const fg of textTokens) {
      for (const bg of backgrounds) {
        it(`${fg} on ${bg} meets 4.5:1`, () => {
          const ratio = contrastRatio(tokens[fg], tokens[bg]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  describe('action-contrast on action background (4.5:1 minimum)', () => {
    it('action-contrast on action meets 4.5:1', () => {
      const ratio = contrastRatio(tokens['action-contrast'], tokens.action);
      expect(ratio).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('semantic colors as text against backgrounds (4.5:1 minimum)', () => {
    for (const color of semanticColors) {
      for (const bg of backgrounds) {
        it(`${color} on ${bg} meets 4.5:1`, () => {
          const ratio = contrastRatio(tokens[color], tokens[bg]);
          expect(ratio).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  describe('border-strong against backgrounds (3:1 minimum)', () => {
    for (const bg of backgrounds) {
      it(`border-strong on ${bg} meets 3:1`, () => {
        const ratio = contrastRatio(tokens['border-strong'], tokens[bg]);
        expect(ratio).toBeGreaterThanOrEqual(3);
      });
    }
  });
});
