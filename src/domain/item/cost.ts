export interface CostFields {
  costPriceCents: number | null;
  costTaxCents: number;
  costShippingCents: number;
  costFeesCents: number;
  costGradingCents: number;
}

/** Returns null if costPriceCents is null (unknown cost), otherwise the sum of all cost fields. */
export function computeCostBasis(fields: CostFields): number | null {
  if (fields.costPriceCents === null) return null;
  return fields.costPriceCents + fields.costTaxCents + fields.costShippingCents + fields.costFeesCents + fields.costGradingCents;
}
