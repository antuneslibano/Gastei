import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { makePdf, pdfToLines, type TextOp } from './helpers/pdf';
import { parsePayslipLines } from '../src/lib/payslip/parse';

const R = 'right' as const;

/** Holerite CLT padrão (modelo "Recibo de Pagamento de Salário"). */
function cltOps(): TextOp[] {
  const rows: [string, string, string, string, string][] = [
    ['001', 'SALARIO BASE', '30,00', '4.500,00', ''],
    ['020', 'HORAS EXTRAS 50%', '10,00', '306,82', ''],
    ['025', 'DSR S/ HORAS EXTRAS', '', '61,36', ''],
    ['401', 'INSS', '11,19', '', '537,76'],
    ['405', 'IRRF', '15,00', '', '214,74'],
    ['410', 'VALE TRANSPORTE', '6,00%', '', '270,00'],
    ['420', 'PLANO DE SAUDE', '', '', '189,90'],
  ];
  const ops: TextOp[] = [
    { x: 40, y: 40, text: 'ACME COMERCIO DE ALIMENTOS LTDA', bold: true },
    { x: 360, y: 40, text: 'Recibo de Pagamento de Salário' },
    { x: 40, y: 54, text: 'CNPJ: 12.345.678/0001-90' },
    { x: 360, y: 54, text: 'Referente ao Mês: Março/2026' },
    { x: 40, y: 76, text: 'Código' }, { x: 90, y: 76, text: 'Nome do Funcionário' }, { x: 300, y: 76, text: 'CBO' }, { x: 360, y: 76, text: 'Departamento' },
    { x: 40, y: 90, text: '1234' }, { x: 90, y: 90, text: 'MARIA APARECIDA SOUZA' }, { x: 300, y: 90, text: '252210' }, { x: 360, y: 90, text: 'FINANCEIRO' },
    { x: 90, y: 102, text: 'Cargo: ANALISTA FINANCEIRO' },
    { x: 40, y: 124, text: 'Cód.' }, { x: 80, y: 124, text: 'Descrição' }, { x: 330, y: 124, text: 'Referência', align: R },
    { x: 440, y: 124, text: 'Vencimentos', align: R }, { x: 540, y: 124, text: 'Descontos', align: R },
  ];
  rows.forEach((r, i) => {
    const y = 140 + i * 14;
    ops.push({ x: 40, y, text: r[0] }, { x: 80, y, text: r[1] });
    if (r[2]) ops.push({ x: 330, y, text: r[2], align: R });
    if (r[3]) ops.push({ x: 440, y, text: r[3], align: R });
    if (r[4]) ops.push({ x: 540, y, text: r[4], align: R });
  });
  ops.push(
    { x: 300, y: 300, text: 'Total de Vencimentos' }, { x: 440, y: 314, text: '4.868,18', align: R },
    { x: 450, y: 300, text: 'Total de Descontos' }, { x: 540, y: 314, text: '1.212,40', align: R },
    { x: 360, y: 334, text: 'Valor Líquido ==>' }, { x: 540, y: 334, text: '3.655,78', align: R },
    { x: 40, y: 360, text: 'Salário Base' }, { x: 130, y: 360, text: 'Sal. Contr. INSS' }, { x: 230, y: 360, text: 'Base Cálc. FGTS' },
    { x: 330, y: 360, text: 'FGTS do Mês' }, { x: 420, y: 360, text: 'Base Cálc. IRRF' }, { x: 510, y: 360, text: 'Faixa IRRF' },
    { x: 40, y: 374, text: '4.500,00' }, { x: 130, y: 374, text: '4.868,18' }, { x: 230, y: 374, text: '4.868,18' },
    { x: 330, y: 374, text: '389,45' }, { x: 420, y: 374, text: '4.330,42' }, { x: 510, y: 374, text: '15,00' },
  );
  return ops;
}

describe('leitura de contracheque', () => {
  it('lê um holerite CLT padrão com colunas', async () => {
    const pdf = await makePdf(cltOps());
    if (process.env.WRITE_SAMPLES) {
      // WRITE_SAMPLES=1 npm test → gera samples/contracheque-exemplo.pdf para testar no app
      mkdirSync('samples', { recursive: true });
      writeFileSync('samples/contracheque-exemplo.pdf', pdf);
    }
    const lines = await pdfToLines(pdf);
    const p = parsePayslipLines(lines);

    expect(p.month).toBe('2026-03');
    expect(p.kind).toBe('Mensal');
    expect(p.cnpj).toBe('12.345.678/0001-90');
    expect(p.employer).toBe('ACME COMERCIO DE ALIMENTOS LTDA');
    expect(p.employee).toBe('MARIA APARECIDA SOUZA');
    expect(p.role).toBe('ANALISTA FINANCEIRO');

    expect(p.items).toHaveLength(7);
    const byName = Object.fromEntries(p.items.map((i) => [i.description, i]));
    expect(byName['Salario Base']).toMatchObject({ amount: 4500, kind: 'provento', code: '001', reference: '30,00' });
    expect(byName['Horas Extras']).toMatchObject({ amount: 306.82, kind: 'provento', reference: '50% 10,00' });
    expect(byName['INSS']).toMatchObject({ amount: 537.76, kind: 'desconto' });
    expect(byName['Vale Transporte']).toMatchObject({ amount: 270, kind: 'desconto', reference: '6,00%' });
    expect(byName['Plano de Saude']).toMatchObject({ amount: 189.9, kind: 'desconto' });

    expect(p.summary).toMatchObject({
      totalProventos: 4868.18,
      totalDescontos: 1212.4,
      liquido: 3655.78,
      salarioBase: 4500,
      baseInss: 4868.18,
      baseFgts: 4868.18,
      fgtsMes: 389.45,
      baseIrrf: 4330.42,
    });
    expect(p.warnings).toEqual([]);
    expect(p.confidence).toBeGreaterThan(0.9);
  });

  it('lê contracheque de servidor com proventos e descontos lado a lado', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'PREFEITURA MUNICIPAL DE EXEMPLO', bold: true },
      { x: 40, y: 54, text: 'CONTRACHEQUE - FOLHA MENSAL  -  Competência: 08/2026' },
      { x: 40, y: 70, text: 'Servidor: JOSÉ CARLOS PEREIRA' }, { x: 330, y: 70, text: 'Matrícula: 55021-3' },
      { x: 40, y: 82, text: 'Cargo: PROFESSOR II' },
      { x: 40, y: 104, text: 'Cód' }, { x: 70, y: 104, text: 'Descrição' }, { x: 290, y: 104, text: 'Proventos', align: R },
      { x: 310, y: 104, text: 'Cód' }, { x: 340, y: 104, text: 'Descrição' }, { x: 560, y: 104, text: 'Descontos', align: R },
      { x: 40, y: 120, text: '100' }, { x: 70, y: 120, text: 'VENCIMENTO BASICO' }, { x: 290, y: 120, text: '3.800,00', align: R },
      { x: 310, y: 120, text: '500' }, { x: 340, y: 120, text: 'PREVIDENCIA RPPS 14%' }, { x: 560, y: 120, text: '602,00', align: R },
      { x: 40, y: 134, text: '110' }, { x: 70, y: 134, text: 'GRATIFICACAO REGENCIA' }, { x: 290, y: 134, text: '500,00', align: R },
      { x: 310, y: 134, text: '510' }, { x: 340, y: 134, text: 'IMPOSTO DE RENDA' }, { x: 560, y: 134, text: '35,12', align: R },
      { x: 40, y: 148, text: '120' }, { x: 70, y: 148, text: 'AUXILIO ALIMENTACAO' }, { x: 290, y: 148, text: '600,00', align: R },
      { x: 310, y: 148, text: '520' }, { x: 340, y: 148, text: 'EMPRESTIMO CONSIGNADO 12/48' }, { x: 560, y: 148, text: '450,00', align: R },
      { x: 40, y: 180, text: 'Total Proventos: 4.900,00' }, { x: 310, y: 180, text: 'Total Descontos: 1.087,12' },
      { x: 310, y: 196, text: 'Líquido a Receber: 3.812,88' },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.month).toBe('2026-08');
    expect(p.employee).toBe('JOSÉ CARLOS PEREIRA');
    expect(p.registration).toBe('55021-3');
    expect(p.role).toBe('PROFESSOR II');
    expect(p.items).toHaveLength(6);
    expect(p.items.filter((i) => i.kind === 'provento').map((i) => i.amount)).toEqual([3800, 500, 600]);
    expect(p.items.filter((i) => i.kind === 'desconto').map((i) => i.amount)).toEqual([602, 35.12, 450]);
    const emp = p.items.find((i) => i.description.startsWith('Emprestimo'))!;
    expect(emp.reference).toBe('12/48');
    expect(p.summary).toMatchObject({ totalProventos: 4900, totalDescontos: 1087.12, liquido: 3812.88 });
    expect(p.warnings).toEqual([]);
  });

  it('classifica sem cabeçalho usando posição e palavras-chave', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'DEMONSTRATIVO DE PAGAMENTO' },
      { x: 40, y: 54, text: 'EMPRESA BETA SERVICOS S.A.' },
      { x: 40, y: 68, text: 'Período: Janeiro de 2026' },
      { x: 40, y: 100, text: 'SALARIO' }, { x: 420, y: 100, text: '2.000,00', align: R },
      { x: 40, y: 114, text: 'ADICIONAL NOTURNO' }, { x: 420, y: 114, text: '150,00', align: R },
      { x: 40, y: 128, text: 'INSS' }, { x: 540, y: 128, text: '165,00', align: R },
      { x: 40, y: 142, text: 'ADIANTAMENTO SALARIAL' }, { x: 540, y: 142, text: '800,00', align: R },
      { x: 40, y: 170, text: 'Líquido: 1.185,00' },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.month).toBe('2026-01');
    expect(p.items.map((i) => [i.description, i.kind])).toEqual([
      ['Salario', 'provento'],
      ['Adicional Noturno', 'provento'],
      ['INSS', 'desconto'],
      ['Adiantamento Salarial', 'desconto'],
    ]);
    expect(p.summary.liquido).toBe(1185);
  });

  it('identifica 13º salário', async () => {
    const ops = cltOps();
    ops[1] = { x: 360, y: 40, text: 'Recibo 13º Salário - 2ª Parcela' };
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.kind).toBe('13º salário (2ª parcela)');
  });
});
