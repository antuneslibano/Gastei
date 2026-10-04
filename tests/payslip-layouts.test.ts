import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { makePdf, pdfToLines, type TextOp } from './helpers/pdf';
import { parsePayslipLines } from '../src/lib/payslip/parse';

const R = 'right' as const;
const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

function table(rows: [string, string, string, string, string][], y0: number, cols = { ref: 330, prov: 440, desc: 540 }): TextOp[] {
  const ops: TextOp[] = [];
  rows.forEach((r, i) => {
    const y = y0 + i * 14;
    if (r[0]) ops.push({ x: 40, y, text: r[0] });
    if (r[1]) ops.push({ x: 80, y, text: r[1] });
    if (r[2]) ops.push({ x: cols.ref, y, text: r[2], align: R });
    if (r[3]) ops.push({ x: cols.prov, y, text: r[3], align: R });
    if (r[4]) ops.push({ x: cols.desc, y, text: r[4], align: R });
  });
  return ops;
}

describe('layouts de contracheque', () => {
  it('Receitas x Despesas com totais e líquido dentro da tabela (não soma os totais)', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'GOVERNO DO ESTADO EXEMPLO - SECRETARIA DE EDUCAÇÃO', bold: true },
      { x: 40, y: 54, text: 'DEMONSTRATIVO DE PAGAMENTO  -  MÊS/ANO: 09/2026' },
      { x: 40, y: 68, text: 'NOME: ANA PAULA RIBEIRO' }, { x: 330, y: 68, text: 'MATRÍCULA: 889123' },
      { x: 40, y: 96, text: 'CÓD' }, { x: 80, y: 96, text: 'DESCRIÇÃO' }, { x: 330, y: 96, text: 'REF', align: R },
      { x: 440, y: 96, text: 'RECEITAS', align: R }, { x: 540, y: 96, text: 'DESPESAS', align: R },
      ...table([
        ['0001', 'VENCIMENTO', '30', '4.200,00', ''],
        ['0050', 'GRATIFICAÇÃO DE ATIVIDADE', '', '800,00', ''],
        ['0090', 'AUXÍLIO ALIMENTAÇÃO', '', '200,00', ''],
        ['5001', 'CONTRIBUIÇÃO PREVIDENCIÁRIA', '14%', '', '588,00'],
        ['5002', 'IMPOSTO DE RENDA', '', '', '312,00'],
        ['7010', 'EMPRÉSTIMO BANCO X', '10/60', '', '400,00'],
        ['', 'TOTAL RECEITAS', '', '5.200,00', ''],
        ['', 'TOTAL DESPESAS', '', '', '1.300,00'],
        ['', 'LÍQUIDO', '', '', '3.900,00'],
      ], 112),
    ];
    const pdf = await makePdf(ops);
    if (process.env.WRITE_SAMPLES) {
      mkdirSync('samples', { recursive: true });
      writeFileSync('samples/contracheque-receitas-despesas.pdf', pdf);
    }
    const p = parsePayslipLines(await pdfToLines(pdf));
    expect(p.month).toBe('2026-09');
    expect(p.items).toHaveLength(6);
    expect(p.items.map((i) => i.description)).not.toContain('Total Receitas');
    expect(p.items[0]).toMatchObject({ description: 'Vencimento', reference: '30', code: '0001' });
    expect(sum(p.items.filter((i) => i.kind === 'provento').map((i) => i.amount))).toBe(5200);
    expect(sum(p.items.filter((i) => i.kind === 'desconto').map((i) => i.amount))).toBe(1300);
    expect(p.summary).toMatchObject({ totalProventos: 5200, totalDescontos: 1300, liquido: 3900 });
    expect(p.warnings).toEqual([]);
    expect(p.employee).toBe('ANA PAULA RIBEIRO');
  });

  it('linha "TOTAIS" com receitas, despesas e líquido na mesma linha', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'EMPRESA GAMA LTDA  CNPJ 11.222.333/0001-44' },
      { x: 40, y: 54, text: 'Competência: Julho/2026' },
      { x: 40, y: 80, text: 'Cód' }, { x: 80, y: 80, text: 'Descrição' }, { x: 330, y: 80, text: 'Ref', align: R },
      { x: 440, y: 80, text: 'Créditos', align: R }, { x: 540, y: 80, text: 'Débitos', align: R },
      ...table([
        ['10', 'SALÁRIO', '220:00', '3.000,00', ''],
        ['20', 'HORA EXTRA 50%', '05:00', '102,27', ''],
        ['90', 'INSS', '', '', '255,00'],
        ['95', 'VALE TRANSPORTE', '6%', '', '180,00'],
      ], 96),
      { x: 40, y: 170, text: 'TOTAIS' }, { x: 440, y: 170, text: '3.102,27', align: R }, { x: 540, y: 170, text: '435,00', align: R },
      { x: 40, y: 184, text: 'LÍQUIDO A RECEBER' }, { x: 540, y: 184, text: '2.667,27', align: R },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.month).toBe('2026-07');
    expect(p.items).toHaveLength(4);
    expect(p.summary).toMatchObject({ totalProventos: 3102.27, totalDescontos: 435, liquido: 2667.27 });
    expect(p.warnings).toEqual([]);
  });

  it('remove totais sem rótulo usando a aritmética do documento', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'Folha de Pagamento - 05/2026' },
      { x: 40, y: 70, text: 'Cód' }, { x: 80, y: 70, text: 'Descrição' },
      { x: 440, y: 70, text: 'Proventos', align: R }, { x: 540, y: 70, text: 'Descontos', align: R },
      ...table([
        ['1', 'SALARIO', '', '2.500,00', ''],
        ['2', 'ADICIONAL NOTURNO', '', '300,00', ''],
        ['50', 'INSS', '', '', '220,00'],
        ['51', 'PLANO ODONTO', '', '', '30,00'],
        ['', 'CONSOLIDADO DO MES', '', '2.800,00', '250,00'],
        ['', 'VALOR CREDITADO EM CONTA', '', '', '2.550,00'],
      ], 86),
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.items.map((i) => i.amount)).toEqual([2500, 300, 220, 30]);
    expect(p.summary).toMatchObject({ totalProventos: 2800, totalDescontos: 250, liquido: 2550 });
  });

  it('coluna única de valor com marcador C/D', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'RECIBO DE PAGAMENTO  Referência: 03/2026' },
      { x: 40, y: 70, text: 'Código' }, { x: 100, y: 70, text: 'Descrição' }, { x: 400, y: 70, text: 'Tipo' }, { x: 520, y: 70, text: 'Valor', align: R },
      { x: 40, y: 90, text: '001' }, { x: 100, y: 90, text: 'SALARIO MENSAL' }, { x: 400, y: 90, text: 'C' }, { x: 520, y: 90, text: '3.500,00', align: R },
      { x: 40, y: 104, text: '010' }, { x: 100, y: 104, text: 'BONUS' }, { x: 400, y: 104, text: 'C' }, { x: 520, y: 104, text: '500,00', align: R },
      { x: 40, y: 118, text: '200' }, { x: 100, y: 118, text: 'INSS' }, { x: 400, y: 118, text: 'D' }, { x: 520, y: 118, text: '400,00', align: R },
      { x: 40, y: 132, text: '210' }, { x: 100, y: 132, text: 'CONVENIO FARMACIA' }, { x: 400, y: 132, text: 'D' }, { x: 520, y: 132, text: '120,00', align: R },
      { x: 40, y: 160, text: 'Valor Líquido' }, { x: 520, y: 160, text: '3.480,00', align: R },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.items.map((i) => [i.description, i.kind])).toEqual([
      ['Salario Mensal', 'provento'],
      ['Bonus', 'provento'],
      ['INSS', 'desconto'],
      ['Convenio Farmacia', 'desconto'],
    ]);
    expect(p.summary.liquido).toBe(3480);
  });

  it('corrige rubrica desalinhada usando os totais do documento', async () => {
    const ops: TextOp[] = [
      { x: 40, y: 40, text: 'Competência 02/2026' },
      { x: 40, y: 70, text: 'Cód' }, { x: 80, y: 70, text: 'Descrição' },
      { x: 400, y: 70, text: 'Vencimentos', align: R }, { x: 540, y: 70, text: 'Descontos', align: R },
      ...table([
        ['1', 'SALARIO', '', '2.000,00', ''],
        ['60', 'CONTRIBUICAO ASSOCIATIVA', '', '', ''],
      ], 86, { ref: 300, prov: 400, desc: 540 }),
      // valor do desconto impresso deslocado para a esquerda (mais perto da coluna de vencimentos)
      { x: 420, y: 100, text: '50,00', align: R },
      { x: 40, y: 130, text: 'Total Vencimentos: 2.000,00' }, { x: 300, y: 130, text: 'Total Descontos: 50,00' },
      { x: 40, y: 144, text: 'Líquido: 1.950,00' },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf(ops)));
    expect(p.items.find((i) => i.amount === 50)?.kind).toBe('desconto');
    expect(p.warnings.join(' ')).toMatch(/coluna errada/);
  });

  it('lê contracheque em duas páginas', async () => {
    const page1: TextOp[] = [
      { x: 40, y: 40, text: 'Competência: 04/2026' },
      { x: 40, y: 70, text: 'Cód' }, { x: 80, y: 70, text: 'Descrição' },
      { x: 440, y: 70, text: 'Proventos', align: R }, { x: 540, y: 70, text: 'Descontos', align: R },
      ...table([['1', 'SALARIO', '', '5.000,00', ''], ['2', 'ANUENIO', '', '250,00', '']], 86),
    ];
    const page2: TextOp[] = [
      { x: 40, y: 70, text: 'Cód' }, { x: 80, y: 70, text: 'Descrição' },
      { x: 440, y: 70, text: 'Proventos', align: R }, { x: 540, y: 70, text: 'Descontos', align: R },
      ...table([['50', 'INSS', '', '', '600,00'], ['51', 'IRRF', '', '', '150,00']], 86),
      { x: 40, y: 140, text: 'Total Proventos 5.250,00' }, { x: 300, y: 140, text: 'Total Descontos 750,00' },
      { x: 40, y: 154, text: 'Líquido 4.500,00' },
    ];
    const p = parsePayslipLines(await pdfToLines(await makePdf([page1, page2])));
    expect(p.items).toHaveLength(4);
    expect(p.summary).toMatchObject({ totalProventos: 5250, totalDescontos: 750, liquido: 4500 });
    expect(p.warnings).toEqual([]);
  });
});
