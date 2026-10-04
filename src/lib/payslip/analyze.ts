import type { Payslip, PayslipItem } from '../types';
import { round2 } from '../format';
import { calcInss, calcIrrf, FGTS_RATE, inssCeiling, tableFor, type IrrfResult } from '../taxes';

const INSS_RE = /\binss\b|previd[eê]ncia\s+social|contrib.*\binss\b/i;
const OWN_REGIME_RE = /rpps|previd[eê]ncia|funpresp|iprev|ipsemg|ipe\b|contrib.*prev/i;
const IRRF_RE = /irrf|i\.r\.r\.f|imposto\s+de\s+renda|\bi\.?r\.?\b|\bir\b/i;
const ALIMONY_RE = /pens[aã]o\s+aliment/i;
/** Verbas normalmente isentas/indenizatórias (não entram na base do IR/INSS). */
const NON_TAXABLE_RE = /sal[aá]rio[\s-]+fam[ií]lia|ajuda\s+de\s+custo|di[aá]rias|reembolso|abono\s+pecuni|aux[ií]lio[\s-]+(alimenta|refei|transporte|creche|sa[uú]de|pr[eé]-?escolar)|vale[\s-]+(alimenta|refei)|indeniza/i;

export type CheckStatus = 'ok' | 'warn' | 'info';

export interface Check {
  label: string;
  status: CheckStatus;
  detail: string;
  expected?: number;
  found?: number;
}

export interface PayslipAnalysis {
  bruto: number;
  descontos: number;
  liquidoCalc: number;
  liquido: number;
  descontoPct: number;
  taxable: number;
  inss: { found: number; expected?: number; base: number; regime: 'inss' | 'proprio' | 'nenhum' };
  irrf: { found: number; expected?: IrrfResult };
  fgts: { base: number; expected: number; found?: number };
  biggestDiscounts: PayslipItem[];
  hourlyRate?: number;
  checks: Check[];
}

const TOL = 1.0; // tolerância de R$ 1 para arredondamentos

export function sumKind(items: PayslipItem[], kind: PayslipItem['kind']): number {
  return round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0));
}

export function analyzePayslip(p: Payslip, dependents: number): PayslipAnalysis {
  const year = Number(p.month.slice(0, 4)) || new Date().getFullYear();
  const table = tableFor(year);
  const bruto = sumKind(p.items, 'provento');
  const descontos = sumKind(p.items, 'desconto');
  const liquidoCalc = round2(bruto - descontos);
  const liquido = p.summary.liquido ?? liquidoCalc;
  const checks: Check[] = [];

  // Conferência dos totais do documento
  const cmp = (label: string, doc: number | undefined, calc: number) => {
    if (doc === undefined) return;
    const diff = round2(doc - calc);
    checks.push(
      Math.abs(diff) <= 0.01
        ? { label, status: 'ok', detail: 'Confere com a soma das rubricas.', expected: calc, found: doc }
        : { label, status: 'warn', detail: `Diferença de ${diff.toFixed(2).replace('.', ',')} em relação à soma das rubricas.`, expected: calc, found: doc },
    );
  };
  cmp('Total de proventos', p.summary.totalProventos, bruto);
  cmp('Total de descontos', p.summary.totalDescontos, descontos);
  cmp('Valor líquido', p.summary.liquido, liquidoCalc);

  const descItems = p.items.filter((i) => i.kind === 'desconto');
  const provItems = p.items.filter((i) => i.kind === 'provento');
  const taxable = round2(provItems.filter((i) => !NON_TAXABLE_RE.test(i.description)).reduce((s, i) => s + i.amount, 0));

  // INSS
  const inssItems = descItems.filter((i) => INSS_RE.test(i.description) && !IRRF_RE.test(i.description));
  const ownRegime = descItems.filter((i) => !INSS_RE.test(i.description) && OWN_REGIME_RE.test(i.description));
  const inssFound = round2(inssItems.reduce((s, i) => s + i.amount, 0));
  const inssBase = p.summary.baseInss ?? taxable;
  let inssExpected: number | undefined;
  const special = p.kind !== 'Mensal';
  if (inssItems.length) {
    inssExpected = calcInss(inssBase, table);
    const ceiling = inssCeiling(table);
    const ok = Math.abs(inssExpected - inssFound) <= TOL;
    checks.push({
      label: 'INSS',
      status: ok ? 'ok' : special ? 'info' : 'warn',
      expected: inssExpected,
      found: inssFound,
      detail: ok
        ? `Cálculo progressivo sobre base de ${inssBase.toFixed(2).replace('.', ',')} (tabela ${table.year}) confere.`
        : `Pela tabela ${table.year}, o INSS sobre ${inssBase.toFixed(2).replace('.', ',')} seria ${inssExpected.toFixed(2).replace('.', ',')}.` +
          (inssBase > ceiling ? ' A base passa do teto; o desconto é limitado.' : '') +
          (special ? ' Em férias/13º o cálculo pode ser feito em separado.' : ' Pode haver verbas com incidência diferente — confira com o RH.'),
    });
  }

  const regime: PayslipAnalysis['inss']['regime'] = inssItems.length ? 'inss' : ownRegime.length ? 'proprio' : 'nenhum';
  if (regime === 'proprio') {
    const v = ownRegime.reduce((s, i) => s + i.amount, 0);
    checks.push({ label: 'Previdência (regime próprio)', status: 'info', found: round2(v), detail: 'Regime próprio de previdência (servidor público): alíquotas variam por ente, não auditado automaticamente.' });
  }
  const previdencia = inssFound || round2(ownRegime.reduce((s, i) => s + i.amount, 0));

  // IRRF
  const irrfFound = round2(descItems.filter((i) => IRRF_RE.test(i.description) && !INSS_RE.test(i.description)).reduce((s, i) => s + i.amount, 0));
  const alimony = round2(descItems.filter((i) => ALIMONY_RE.test(i.description)).reduce((s, i) => s + i.amount, 0));
  const irrfExpected = calcIrrf(taxable, previdencia, dependents, table, alimony);
  const irrfOk = Math.abs(irrfExpected.tax - irrfFound) <= TOL;
  checks.push({
    label: 'Imposto de renda (IRRF)',
    status: irrfOk ? 'ok' : special ? 'info' : 'warn',
    expected: irrfExpected.tax,
    found: irrfFound,
    detail:
      (irrfOk ? 'Confere. ' : 'Valor diferente do estimado. ') +
      `Base ${irrfExpected.base.toFixed(2).replace('.', ',')} (${irrfExpected.method === 'simplificado' ? 'desconto simplificado' : `deduções legais, ${dependents} dependente(s)`}), alíquota ${(irrfExpected.rate * 100).toFixed(1).replace('.', ',')}%` +
      (irrfExpected.reduction > 0 ? `, redutor de ${irrfExpected.reduction.toFixed(2).replace('.', ',')} (isenção até R$ 5 mil)` : '') +
      '.' +
      (irrfOk ? '' : ' Verifique o nº de dependentes em Ajustes, ou se há outras deduções (previdência privada, outras fontes).'),
  });

  // FGTS (depositado pelo empregador; não sai do salário)
  const fgtsBase = p.summary.baseFgts ?? taxable;
  const fgtsExpected = round2(fgtsBase * FGTS_RATE);
  if (p.summary.fgtsMes !== undefined) {
    const ok = Math.abs(p.summary.fgtsMes - fgtsExpected) <= TOL;
    checks.push({ label: 'FGTS do mês', status: ok ? 'ok' : 'warn', expected: fgtsExpected, found: p.summary.fgtsMes, detail: ok ? '8% da base confere.' : `8% de ${fgtsBase.toFixed(2).replace('.', ',')} seria ${fgtsExpected.toFixed(2).replace('.', ',')}.` });
  }

  const base = p.summary.salarioBase ?? provItems.find((i) => /sal[aá]rio|vencimento\s+b[aá]sico/i.test(i.description))?.amount;

  return {
    bruto,
    descontos,
    liquidoCalc,
    liquido,
    descontoPct: bruto ? descontos / bruto : 0,
    taxable,
    inss: { found: inssFound, expected: inssExpected, base: inssBase, regime },
    irrf: { found: irrfFound, expected: irrfExpected },
    fgts: { base: fgtsBase, expected: fgtsExpected, found: p.summary.fgtsMes },
    biggestDiscounts: [...descItems].sort((a, b) => b.amount - a.amount).slice(0, 5),
    hourlyRate: base ? round2(base / 220) : undefined,
    checks,
  };
}
