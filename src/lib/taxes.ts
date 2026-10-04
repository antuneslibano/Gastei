import { round2 } from './format';

/**
 * Tabelas de INSS (empregado) e IRRF mensal.
 * Valores oficiais podem mudar a cada ano — mantenha este arquivo atualizado.
 */
export interface InssBracket { upTo: number; rate: number }
export interface IrrfBracket { upTo: number; rate: number; deduction: number }

export interface TaxTable {
  year: number;
  inss: InssBracket[];
  irrf: IrrfBracket[];
  dependentDeduction: number;
  simplifiedDiscount: number;
  /** Redutor da Lei 15.270/2025 (isenção até R$ 5.000), vigente a partir de 2026. */
  reducer?: { fullUpTo: number; maxReduction: number; partialUpTo: number; a: number; b: number };
}

const IRRF_2025: IrrfBracket[] = [
  { upTo: 2428.8, rate: 0, deduction: 0 },
  { upTo: 2826.65, rate: 0.075, deduction: 182.16 },
  { upTo: 3751.05, rate: 0.15, deduction: 394.16 },
  { upTo: 4664.68, rate: 0.225, deduction: 675.49 },
  { upTo: Infinity, rate: 0.275, deduction: 908.73 },
];

export const TAX_TABLES: TaxTable[] = [
  {
    year: 2025,
    inss: [
      { upTo: 1518.0, rate: 0.075 },
      { upTo: 2793.88, rate: 0.09 },
      { upTo: 4190.83, rate: 0.12 },
      { upTo: 8157.41, rate: 0.14 },
    ],
    irrf: IRRF_2025,
    dependentDeduction: 189.59,
    simplifiedDiscount: 607.2,
  },
  {
    year: 2026,
    inss: [
      { upTo: 1621.0, rate: 0.075 },
      { upTo: 2902.84, rate: 0.09 },
      { upTo: 4354.27, rate: 0.12 },
      { upTo: 8475.55, rate: 0.14 },
    ],
    irrf: IRRF_2025,
    dependentDeduction: 189.59,
    simplifiedDiscount: 607.2,
    reducer: { fullUpTo: 5000, maxReduction: 312.89, partialUpTo: 7350, a: 978.62, b: 0.133145 },
  },
];

export function tableFor(year: number): TaxTable {
  const sorted = [...TAX_TABLES].sort((a, b) => a.year - b.year);
  let chosen = sorted[0];
  for (const t of sorted) if (t.year <= year) chosen = t;
  return chosen;
}

/** INSS progressivo do empregado (CLT). */
export function calcInss(base: number, table: TaxTable): number {
  let total = 0;
  let lower = 0;
  for (const b of table.inss) {
    if (base <= lower) break;
    const slice = Math.min(base, b.upTo) - lower;
    total += slice * b.rate;
    lower = b.upTo;
  }
  return round2(total);
}

export function inssCeiling(table: TaxTable): number {
  return table.inss[table.inss.length - 1].upTo;
}

export interface IrrfResult {
  base: number;
  method: 'legal' | 'simplificado';
  grossTax: number;
  reduction: number;
  tax: number;
  rate: number;
}

function progressiveIrrf(base: number, table: TaxTable): { tax: number; rate: number } {
  for (const b of table.irrf) {
    if (base <= b.upTo) return { tax: Math.max(0, base * b.rate - b.deduction), rate: b.rate };
  }
  return { tax: 0, rate: 0 };
}

/**
 * IRRF mensal. Usa o que for mais vantajoso entre deduções legais
 * (INSS + dependentes + pensão) e o desconto simplificado.
 */
export function calcIrrf(
  taxableIncome: number,
  inss: number,
  dependents: number,
  table: TaxTable,
  alimony = 0,
): IrrfResult {
  const legalBase = Math.max(0, taxableIncome - inss - dependents * table.dependentDeduction - alimony);
  const simpleBase = Math.max(0, taxableIncome - table.simplifiedDiscount);
  const useSimple = simpleBase < legalBase;
  const base = round2(useSimple ? simpleBase : legalBase);
  const { tax: grossTax, rate } = progressiveIrrf(base, table);

  let reduction = 0;
  const r = table.reducer;
  if (r) {
    if (taxableIncome <= r.fullUpTo) reduction = Math.min(grossTax, r.maxReduction);
    else if (taxableIncome <= r.partialUpTo) reduction = Math.max(0, r.a - r.b * taxableIncome);
    reduction = Math.min(reduction, grossTax);
  }
  return {
    base,
    method: useSimple ? 'simplificado' : 'legal',
    grossTax: round2(grossTax),
    reduction: round2(reduction),
    tax: round2(Math.max(0, grossTax - reduction)),
    rate,
  };
}

export const FGTS_RATE = 0.08;
