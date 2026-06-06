export function calculateDiscountMargin(discountAmount: number, grossSales: number) {
  if (!Number.isFinite(discountAmount) || !Number.isFinite(grossSales) || grossSales <= 0) {
    return null;
  }

  return Math.round((discountAmount / grossSales) * 10_000) / 100;
}
