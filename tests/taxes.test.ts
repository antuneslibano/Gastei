import { describe, expect, it } from 'vitest';
import { calcInss, calcIrrf, tableFor } from '../src/lib/taxes';

describe('INSS', () => {
  it('2025: progressivo', () => {
    const t = tableFor(2025);
    expect(calcInss(1518, t)).toBe(113.85);
    expect(calcInss(3000, t)).toBe(253.41);
    expect(calcInss(20000, t)).toBe(951.63); // teto
  });
  it('2026: progressivo', () => {
    const t = tableFor(2026);
    expect(calcInss(1621, t)).toBe(121.58);
    expect(calcInss(4868.18, t)).toBe(483.06);
  });
});

describe('IRRF', () => {
  it('2025 sem redutor', () => {
    const t = tableFor(2025);
    const inss = calcInss(5000, t);
    expect(inss).toBe(509.6);
    // base legal 4.490,40 > base simplificada 4.392,80 → usa o simplificado
    const r = calcIrrf(5000, inss, 0, t);
    expect(r.method).toBe('simplificado');
    expect(r.base).toBe(4392.8);
    expect(r.tax).toBe(312.89);
    expect(calcIrrf(5000, inss, 2, t).method).toBe('legal');
  });
  it('2026: isento até R$ 5.000', () => {
    const t = tableFor(2026);
    expect(calcIrrf(5000, calcInss(5000, t), 0, t).tax).toBe(0);
    expect(calcIrrf(4000, calcInss(4000, t), 0, t).tax).toBe(0);
  });
  it('2026: redução parcial entre 5.000 e 7.350', () => {
    const t = tableFor(2026);
    const inss = calcInss(6000, t);
    const r = calcIrrf(6000, inss, 0, t);
    expect(r.reduction).toBeCloseTo(978.62 - 0.133145 * 6000, 2);
    expect(r.tax).toBeCloseTo(r.grossTax - r.reduction, 2);
  });
  it('2026: sem redução acima de 7.350', () => {
    const t = tableFor(2026);
    expect(calcIrrf(10000, calcInss(10000, t), 0, t).reduction).toBe(0);
  });
});
