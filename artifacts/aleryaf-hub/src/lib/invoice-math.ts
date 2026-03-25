export const TON_IN_KG = 1000;
export type InvoiceKind = "sale" | "purchase";

function toSafeNumber(value: number | string | null | undefined) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}

export function getSalePricePerKg(unitPricePerTon: number | string | null | undefined) {
  return toSafeNumber(unitPricePerTon) / TON_IN_KG;
}

export function getInvoiceLineTotals(line: {
  quantity: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
  unitCost: number | string | null | undefined;
}, invoiceType: InvoiceKind = "sale") {
  const quantityKg = toSafeNumber(line.quantity);
  const rawUnitPrice = toSafeNumber(line.unitPrice);
  const rawUnitCost = toSafeNumber(line.unitCost);

  if (invoiceType === "purchase") {
    const purchasePricePerTon = rawUnitPrice;
    const purchasePricePerKg = getSalePricePerKg(purchasePricePerTon);
    const revenue = quantityKg * purchasePricePerKg;
    const totalCost = revenue;

    return {
      quantityKg,
      salePricePerTon: purchasePricePerTon,
      salePricePerKg: purchasePricePerKg,
      costPerKg: purchasePricePerKg,
      revenue,
      totalCost,
      profit: 0,
    };
  }

  const salePricePerTon = rawUnitPrice;
  const costPerKg = rawUnitCost;
  const salePricePerKg = getSalePricePerKg(salePricePerTon);
  const revenue = quantityKg * salePricePerKg;
  const totalCost = quantityKg * costPerKg;

  return {
    quantityKg,
    salePricePerTon,
    salePricePerKg,
    costPerKg,
    revenue,
    totalCost,
    profit: revenue - totalCost,
  };
}

export function summarizeInvoiceLines<T extends {
  quantity: number | string | null | undefined;
  unitPrice: number | string | null | undefined;
  unitCost: number | string | null | undefined;
}>(lines: T[], invoiceType: InvoiceKind = "sale") {
  let revenue = 0;
  let totalCost = 0;

  const normalizedLines = lines.map((line) => {
    const totals = getInvoiceLineTotals(line, invoiceType);
    revenue += totals.revenue;
    totalCost += totals.totalCost;
    return {
      ...line,
      ...totals,
    };
  });

  return {
    lines: normalizedLines,
    revenue,
    totalCost,
    profit: revenue - totalCost,
  };
}
