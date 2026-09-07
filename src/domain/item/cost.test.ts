import { describe, it, expect } from 'vitest';
import { computeCostBasis, type CostFields } from './cost';

describe('computeCostBasis', () => {
  it('returns null when costPriceCents is null', () => {
    const fields: CostFields = {
      costPriceCents: null,
      costTaxCents: 100,
      costShippingCents: 200,
      costFeesCents: 50,
      costGradingCents: 300,
    };
    expect(computeCostBasis(fields)).toBeNull();
  });

  it('sums other fields when costPriceCents is 0', () => {
    const fields: CostFields = {
      costPriceCents: 0,
      costTaxCents: 100,
      costShippingCents: 200,
      costFeesCents: 50,
      costGradingCents: 300,
    };
    expect(computeCostBasis(fields)).toBe(650);
  });

  it('sums all fields for a normal case', () => {
    const fields: CostFields = {
      costPriceCents: 5000,
      costTaxCents: 425,
      costShippingCents: 399,
      costFeesCents: 150,
      costGradingCents: 2000,
    };
    expect(computeCostBasis(fields)).toBe(7974);
  });

  it('returns 0 when all fields are 0', () => {
    const fields: CostFields = {
      costPriceCents: 0,
      costTaxCents: 0,
      costShippingCents: 0,
      costFeesCents: 0,
      costGradingCents: 0,
    };
    expect(computeCostBasis(fields)).toBe(0);
  });
});
