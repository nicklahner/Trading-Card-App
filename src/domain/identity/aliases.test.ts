import { describe, it, expect } from 'vitest';
import { normalize, canonicalSetName, canonicalParallelName } from './aliases';

describe('normalize', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normalize('Panini  Prizm')).toBe('panini prizm');
  });

  it('converts & to and', () => {
    expect(normalize('Rookies & Stars')).toBe('rookies and stars');
  });

  it('strips punctuation', () => {
    expect(normalize("Donruss' Optic")).toBe('donruss optic');
  });

  it('handles empty string', () => {
    expect(normalize('')).toBe('');
  });
});

describe('canonicalSetName', () => {
  it('maps Prizm variants to canonical ID', () => {
    expect(canonicalSetName('Prizm')).toBe('prizm');
    expect(canonicalSetName('Panini Prizm')).toBe('prizm');
    expect(canonicalSetName('PRIZM')).toBe('prizm');
  });

  it('distinguishes Prizm from Prizm Draft Picks', () => {
    expect(canonicalSetName('Prizm')).toBe('prizm');
    expect(canonicalSetName('Prizm Draft Picks')).toBe('prizm-draft-picks');
    expect(canonicalSetName('Panini Prizm Draft Picks')).toBe('prizm-draft-picks');
    expect(canonicalSetName('Prizm')).not.toBe(
      canonicalSetName('Prizm Draft Picks'),
    );
  });

  it('distinguishes Donruss from Donruss Optic', () => {
    expect(canonicalSetName('Donruss')).toBe('donruss');
    expect(canonicalSetName('Donruss Optic')).toBe('donruss-optic');
    expect(canonicalSetName('Optic')).toBe('donruss-optic');
    expect(canonicalSetName('Donruss')).not.toBe(
      canonicalSetName('Donruss Optic'),
    );
  });

  it('maps Topps Chrome variants', () => {
    expect(canonicalSetName('Topps Chrome')).toBe('topps-chrome');
    expect(canonicalSetName('Chrome')).toBe('topps-chrome');
  });

  it('returns normalized name for unknown sets', () => {
    expect(canonicalSetName('Some Random Set')).toBe('some random set');
  });
});

describe('canonicalParallelName', () => {
  it('maps Silver variants to silver', () => {
    expect(canonicalParallelName('Silver')).toBe('silver');
    expect(canonicalParallelName('Silver Prizm')).toBe('silver');
    expect(canonicalParallelName('Holo')).toBe('silver');
    expect(canonicalParallelName('Silver Holo')).toBe('silver');
  });

  it('maps Red variants to red', () => {
    expect(canonicalParallelName('Red')).toBe('red');
    expect(canonicalParallelName('Red Prizm')).toBe('red');
  });

  it('distinguishes Red from Red Wave', () => {
    expect(canonicalParallelName('Red')).toBe('red');
    expect(canonicalParallelName('Red Wave')).toBe('red-wave');
    expect(canonicalParallelName('Red')).not.toBe(
      canonicalParallelName('Red Wave'),
    );
  });

  it('maps Blue variants to blue', () => {
    expect(canonicalParallelName('Blue')).toBe('blue');
    expect(canonicalParallelName('Blue Prizm')).toBe('blue');
  });

  it('strips trailing prizm/refractor', () => {
    expect(canonicalParallelName('Gold Prizm')).toBe('gold');
    expect(canonicalParallelName('Mojo Refractor')).toBe('mojo');
  });

  it('returns normalized name for unknown parallels', () => {
    expect(canonicalParallelName('Neon Green Pulsar')).toBe(
      'neon green pulsar',
    );
  });
});
