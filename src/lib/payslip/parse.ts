import type { PayslipItem, PayslipItemKind, PayslipSummary } from '../types';
import { parseMoney, round2, uid } from '../format';
import { MONTHS, pad } from '../dates';
import type { Line, Token } from './pdfLines';

/**
 * Leitor heurístico de contracheques/holerites brasileiros.
 *
 * Estratégia:
 * 1. Localiza o cabeçalho da tabela (Vencimentos/Proventos x Descontos) e a posição das colunas.
 * 2. Lê as rubricas entre o cabeçalho e os totais, classificando cada valor pela coluna.
 *    Sem cabeçalho, agrupa os valores por posição horizontal e usa palavras-chave.
 * 3. Procura os campos do rodapé (Total, Líquido, Bases de INSS/FGTS/IRRF...) ao lado ou abaixo do rótulo.
 * 4. Identifica competência, empresa, funcionário, cargo e matrícula.
 */

export interface ParsedPayslip {
  month: string | null;
  kind: string;
  employer?: string;
  cnpj?: string;
  employee?: string;
  role?: string;
  registration?: string;
  items: PayslipItem[];
  summary: PayslipSummary;
  warnings: string[];
  /** 0 a 1 — quão confiável parece a leitura */
  confidence: number;
}

const MONEY_RE = /^\(?-?(R\$)?\d{1,3}(\.\d{3})*,\d{2}\)?-?$|^\(?-?(R\$)?\d+,\d{2}\)?-?$/;
const REF_RE = /^\d+([.,]\d+)?%$|^\d{1,3}:\d{2}$|^\d+\/\d+$|^\d+[dhDH]$/;
const CODE_RE = /^[A-Z]?\d{1,6}[A-Z]?$/;

const PROV_HEADER = /^(vencimentos?|proventos?|vantagens?|cr[eé]ditos?|rendimentos?|ganhos|receitas?|entradas?)$/i;
const DESC_HEADER = /^(descontos?|d[eé]bitos?|dedu[cç][oõ]es|reten[cç][oõ]es|despesas?|sa[ií]das?)$/i;
/** Marcador de tipo na linha (layouts com uma única coluna de valor). */
const KIND_MARK = /^(C|D|P|V|R|CR|DB|\+|-)$/;
const REF_HEADER = /^(refer[eê]ncia|ref\.?|qtd\.?|quant\.?|quantidade|prazo|dias|horas|parc\.?)$/i;

/**
 * Linhas de resumo (totais, líquido, bases...). Nunca são rubricas, estejam onde estiverem no documento.
 */
const SUMMARY_LINE = /\b(totais|total|sub-?total|l[ií]quido|l[ií]q\.|bruto|saldo|valor\s+a\s+(receber|creditar|pagar)|a\s+receber|sal\.?\s*contr|base\s+(de\s+)?c[aá]lc|bases?\s+(do\s+)?(inss|irrf|ir|fgts|prev)|fgts\s+(do\s+)?m[eê]s|faixa\s+(do\s+)?irrf|margem\s+consign)/i;
/** "Salário base" também é nome comum de rubrica: só é resumo se a linha não começar com código. */
const SOFT_SUMMARY = /^sal[aá]rio[\s-]+base|^sal\.?\s*base/i;

function isSummaryLine(line: Line): boolean {
  const startsWithCode = CODE_RE.test(line.tokens[0]?.text ?? '') && !isMoney(line.tokens[0]?.text ?? '');
  if (SUMMARY_LINE.test(line.text)) {
    // "001 Gratificação de Função Bruta"? só aceita como rubrica se começa com código e não fala em total/líquido
    return !(startsWithCode && !/total|l[ií]quido|saldo|a\s+receber/i.test(line.text));
  }
  return SOFT_SUMMARY.test(line.text) && !startsWithCode;
}

/** Palavras que indicam desconto. */
const DESC_WORDS = /\binss\b|irrf|i\.r\.r\.f|imposto\s+de\s+renda|\bir\b|previd[eê]ncia|contrib|sindical|vale[\s-]?transporte|\bv\.?\s?t\b|plano\s+de\s+sa[uú]de|assist[eê]ncia\s+m[eé]d|odonto|unimed|pens[aã]o\s+aliment|consignado|empr[eé]stimo|financiamento|adiantamento|faltas?\b|atrasos?\b|desconto|seguro\s+de\s+vida|coparticipa|refei[cç][aã]o\s*\(desc|cart[aã]o|mensalidade|farm[aá]cia|rpps|funpresp|ipsemg|iprev|cooperativa|associa[cç][aã]o/i;
/** Palavras que indicam provento. */
const PROV_WORDS = /sal[aá]rio|vencimento\s+b[aá]sico|horas?\s+extras?|\bh\.?\s?e\b|adicional|gratifica|comiss|\bdsr\b|repouso|f[eé]rias|1\/3|13[ºo°]?|insalubridade|periculosidade|noturno|pr[eê]mio|b[oô]nus|abono|aux[ií]lio|ajuda\s+de\s+custo|di[aá]rias|anu[eê]nio|tri[eê]nio|qu[ií]nq[uü]?[eê]nio|plant[aã]o|sobreaviso|retroativo|reembolso|participa[cç][aã]o\s+nos\s+lucros|\bplr\b|vale[\s-]?alimenta|subs[ií]dio|representa[cç][aã]o/i;

function isMoney(t: string): boolean {
  return MONEY_RE.test(t);
}

function money(t: string): number {
  return Math.abs(parseMoney(t.replace(/[()]/g, '')) ?? 0);
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function center(t: { x0: number; x1: number }): number {
  return (t.x0 + t.x1) / 2;
}

interface Columns {
  prov: Token;
  desc: Token;
  ref?: Token;
}

function findHeader(lines: Line[]): { index: number; cols: Columns } | null {
  // devolve o primeiro cabeçalho; use headerAt para cada linha
  for (let i = 0; i < lines.length; i++) {
    const toks = lines[i].tokens;
    if (toks.some((t) => isMoney(t.text)) || /total|l[ií]quido/i.test(lines[i].text)) continue;
    const prov = toks.find((t) => PROV_HEADER.test(t.text.replace(/[:.]$/, '')));
    const desc = toks.find((t) => DESC_HEADER.test(t.text.replace(/[:.]$/, '')));
    if (prov && desc) {
      const ref = toks.find((t) => REF_HEADER.test(t.text.replace(/[:]$/, '')));
      return { index: i, cols: { prov, desc, ref } };
    }
  }
  return null;
}

type Col = 'prov' | 'desc' | 'ref';

function nearestColumn(t: Token, cols: Columns): Col {
  const dist = (h: Token) => Math.min(Math.abs(center(t) - center(h)), Math.abs(t.x1 - h.x1));
  const options: [Col, number][] = [
    ['prov', dist(cols.prov)],
    ['desc', dist(cols.desc)],
  ];
  if (cols.ref) options.push(['ref', dist(cols.ref)]);
  options.sort((a, b) => a[1] - b[1]);
  return options[0][0];
}

export function classifyByWords(description: string): PayslipItemKind | null {
  const d = description;
  // Ordem importa: "Desconto de adiantamento", "INSS sobre férias" são descontos.
  if (/^(desc\.?|desconto)\b/i.test(d)) return 'desconto';
  if (/\binss\b|irrf|imposto\s+de\s+renda|previd[eê]ncia|pens[aã]o\s+aliment/i.test(d)) return 'desconto';
  if (DESC_WORDS.test(d) && !PROV_WORDS.test(d)) return 'desconto';
  if (PROV_WORDS.test(d) && !DESC_WORDS.test(d)) return 'provento';
  if (PROV_WORDS.test(d) && DESC_WORDS.test(d)) {
    // ex.: "Adiantamento salarial" (desconto) x "Adicional noturno" (provento)
    if (/adiantamento|vale[\s-]?transporte|faltas?|atrasos?/i.test(d)) return 'desconto';
    return 'provento';
  }
  return null;
}

interface RawItem {
  code?: string;
  description: string;
  reference?: string;
  amount: number;
  amountToken: Token;
  col?: Col;
  /** tipo indicado na própria linha (C/D, +/-, valor negativo) */
  mark?: PayslipItemKind;
}

/** Quebra uma linha em rubricas. Suporta layout com 2 rubricas lado a lado. */
function itemsFromLine(line: Line, cols: Columns | null): RawItem[] {
  const out: RawItem[] = [];
  let descParts: string[] = [];
  let code: string | undefined;
  let refParts: string[] = [];
  let mark: PayslipItemKind | undefined;
  const pending: Token[] = []; // valores ainda não atribuídos (sem cabeçalho)

  const markOf = (t: string): PayslipItemKind | undefined => {
    if (/^(C|P|V|R|CR|\+)$/.test(t)) return 'provento';
    if (/^(D|DB|-)$/.test(t)) return 'desconto';
    return undefined;
  };

  const flush = (amountToken: Token, col?: Col) => {
    const negative = /^\(|^-|-$|\)$/.test(amountToken.text);
    let description = descParts.join(' ').replace(/\s+/g, ' ').trim();
    // Linha com valor nas duas colunas e uma só descrição (ex.: linha de totais): repete a descrição.
    const prev = out[out.length - 1];
    if (!description && prev && col && prev.col && prev.col !== col) description = prev.description;
    if (!description || !/[a-zà-ú]/i.test(description)) return;
    if (/:$/.test(description) && IS_SUMMARY_LABEL.test(description)) return;
    out.push({
      code,
      description,
      reference: refParts.join(' ') || undefined,
      amount: money(amountToken.text),
      amountToken,
      col,
      mark: negative ? 'desconto' : mark,
    });
    descParts = [];
    refParts = [];
    code = undefined;
    mark = undefined;
  };

  for (const t of line.tokens) {
    if (isMoney(t.text)) {
      if (cols) {
        const col = nearestColumn(t, cols);
        if (col === 'ref') refParts.push(t.text);
        else flush(t, col);
      } else {
        pending.push(t);
      }
      continue;
    }
    if (!cols && pending.length) {
      // Sem cabeçalho: novo texto após valores → os valores pertencem à rubrica anterior.
      const last = pending.pop()!;
      refParts.push(...pending.map((p) => p.text));
      pending.length = 0;
      flush(last);
    }
    if (REF_RE.test(t.text)) {
      refParts.push(t.text);
      continue;
    }
    // Número solto alinhado à coluna de referência (ex.: "30" dias, "220" horas)
    if (descParts.length && cols?.ref && /^\d+([.,]\d+)?$/.test(t.text) && nearestColumn(t, cols) === 'ref') {
      refParts.push(t.text);
      continue;
    }
    if (descParts.length && KIND_MARK.test(t.text)) {
      mark = markOf(t.text);
      continue;
    }
    if (!descParts.length && !code && CODE_RE.test(t.text)) {
      code = t.text;
      continue;
    }
    descParts.push(t.text);
  }
  if (!cols && pending.length) {
    const last = pending.pop()!;
    refParts.push(...pending.map((p) => p.text));
    flush(last);
  }
  return out;
}

/** Sem cabeçalho: separa valores em 2 grupos por posição (esquerda = proventos, direita = descontos). */
function classifyWithoutHeader(raw: RawItem[]): PayslipItemKind[] {
  const xs = raw.map((r) => r.amountToken.x1).sort((a, b) => a - b);
  let split: number | null = null;
  let bestGap = 0;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1];
    if (gap > bestGap) { bestGap = gap; split = (xs[i] + xs[i - 1]) / 2; }
  }
  const twoGroups = split !== null && bestGap > 30;
  if (!twoGroups) {
    return raw.map((r) => classifyByWords(r.description) ?? 'provento');
  }
  // Verifica a orientação com as palavras-chave.
  let leftProv = 0;
  let leftDesc = 0;
  for (const r of raw) {
    const k = classifyByWords(r.description);
    const left = r.amountToken.x1 < split!;
    if (k === 'provento') left ? leftProv++ : leftDesc++;
    if (k === 'desconto') left ? leftDesc++ : leftProv++;
  }
  const leftIsProv = leftProv >= leftDesc;
  return raw.map((r) => {
    const left = r.amountToken.x1 < split!;
    return left === leftIsProv ? 'provento' : 'desconto';
  });
}

// ---------- Rodapé / campos rotulados ----------

const SUMMARY_LABELS: [keyof PayslipSummary, RegExp][] = [
  ['totalProventos', /total\s+(de\s+|das\s+|dos\s+)?(vencimentos|proventos|cr[eé]ditos|vantagens|rendimentos|receitas|entradas)|total\s+bruto|sal[aá]rio\s+bruto|valor\s+bruto|\bbruto\b/i],
  ['totalDescontos', /total\s+(de\s+|das\s+|dos\s+)?(descontos|d[eé]bitos|dedu[cç][oõ]es|despesas|sa[ií]das)/i],
  ['liquido', /(valor\s+|total\s+)?l[ií]quido(\s+a\s+(receber|creditar))?|l[ií]q\.|valor\s+a\s+(receber|creditar)|l[ií]quido\s+(do\s+)?m[eê]s/i],
  ['salarioBase', /sal[aá]rio[\s-]+base|sal\.?\s*base|vencimento\s+b[aá]sico/i],
  ['baseInss', /sal\.?\s*(de\s+)?contr(ibui[cç][aã]o)?\.?\s*(do\s+)?inss|base\s+(de\s+)?c[aá]lc(ulo)?\.?\s*(do\s+)?inss|base\s+(do\s+)?inss/i],
  ['baseFgts', /base\s+(de\s+)?c[aá]lc(ulo)?\.?\s*(do\s+)?fgts|base\s+(do\s+)?fgts/i],
  ['fgtsMes', /fgts\s+(do\s+)?m[eê]s|dep[oó]sito\s+(do\s+)?fgts|valor\s+(do\s+)?fgts/i],
  ['baseIrrf', /base\s+(de\s+)?c[aá]lc(ulo)?\.?\s*(do\s+)?irr?f|base\s+(do\s+)?irr?f/i],
];

const LABELS_SOURCE = SUMMARY_LABELS.map(([, r]) => r.source).join('|') + '|faixa\\s+irrf';
const ANY_SUMMARY_LABEL = new RegExp(LABELS_SOURCE, 'gi');
const IS_SUMMARY_LABEL = new RegExp(LABELS_SOURCE, 'i');

/** Posição (x) de um trecho do texto da linha. */
function spanX(line: Line, start: number, end: number): { x0: number; x1: number } {
  let pos = 0;
  let x0 = Infinity;
  let x1 = -Infinity;
  for (const t of line.tokens) {
    const tStart = pos;
    const tEnd = pos + t.text.length;
    if (tEnd > start && tStart < end) {
      x0 = Math.min(x0, t.x0);
      x1 = Math.max(x1, t.x1);
    }
    pos = tEnd + 1;
  }
  return { x0, x1 };
}

function findSummary(lines: Line[], from: number, cols: Columns | null): PayslipSummary {
  const summary: PayslipSummary = {};

  // Linha "Totais  3.500,00  700,00" alinhada às colunas.
  if (cols) {
    for (let i = from; i < lines.length; i++) {
      const l = lines[i];
      if (!/^(totais|total)\b/i.test(l.text) || /total\s+(de\s+)?(venc|prov|desc|bruto|l[ií]q)/i.test(l.text)) continue;
      for (const t of l.tokens) {
        if (!isMoney(t.text)) continue;
        const col = nearestColumn(t, cols);
        if (col === 'prov' && summary.totalProventos === undefined) summary.totalProventos = money(t.text);
        if (col === 'desc' && summary.totalDescontos === undefined) summary.totalDescontos = money(t.text);
      }
    }
  }

  for (let i = from; i < lines.length; i++) {
    const line = lines[i];
    if (!isSummaryLine(line)) continue; // rubricas da tabela (ex.: "001 Salário Base") não são rodapé
    const matches = [...line.text.matchAll(ANY_SUMMARY_LABEL)];
    if (!matches.length) continue;
    matches.forEach((m, mi) => {
      const label = m[0];
      const key = SUMMARY_LABELS.find(([, r]) => new RegExp(`^(${r.source})$`, 'i').test(label))?.[0];
      if (!key || summary[key] !== undefined) return;
      const start = m.index!;
      const end = start + label.length;
      const nextStart = matches[mi + 1]?.index ?? Infinity;
      const span = spanX(line, start, end);

      // 1) mesmo lado direito do rótulo, antes do próximo rótulo
      let pos = 0;
      for (const t of line.tokens) {
        const tStart = pos;
        pos += t.text.length + 1;
        if (tStart < end || tStart >= nextStart) continue;
        if (isMoney(t.text)) {
          summary[key] = money(t.text);
          return;
        }
      }
      // 2) linhas abaixo, alinhadas com o rótulo
      for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) {
        const below = lines[j];
        if (below.page !== line.page) break;
        const candidates = below.tokens.filter(
          (t) => isMoney(t.text) && t.x1 >= span.x0 - 25 && t.x0 <= span.x1 + 25,
        );
        if (candidates.length) {
          const mid = (span.x0 + span.x1) / 2;
          candidates.sort((a, b) => Math.abs(center(a) - mid) - Math.abs(center(b) - mid));
          summary[key] = money(candidates[0].text);
          return;
        }
        // Se a linha de baixo é outra linha de rótulos, para.
        if (IS_SUMMARY_LABEL.test(below.text)) break;
      }
    });
  }
  return summary;
}

// ---------- Cabeçalho do documento ----------

const MONTH_NAMES_RE = MONTHS.map((m) => norm(m)).join('|');
const MONTH_ABBR = MONTHS.map((m) => norm(m).slice(0, 3));

function findMonth(lines: Line[]): string | null {
  const texts = lines.map((l) => norm(l.text));
  const prefer = /compet|refer|mes|periodo|folha|pagamento/;
  const tryLine = (t: string): string | null => {
    let m = t.match(new RegExp(`\\b(${MONTH_NAMES_RE})\\b\\s*(?:de|\\/|-|\\s)\\s*(\\d{4}|\\d{2})\\b`));
    if (m) return `${fullYear(m[2])}-${pad(MONTHS.map(norm).indexOf(m[1]) + 1)}`;
    m = t.match(new RegExp(`\\b(${MONTH_ABBR.join('|')})\\.?\\s*[\\/\\-]\\s*(\\d{4}|\\d{2})\\b`));
    if (m) return `${fullYear(m[2])}-${pad(MONTH_ABBR.indexOf(m[1]) + 1)}`;
    m = t.match(/(?<![\d/])(0?[1-9]|1[0-2])\s*[/\-.]\s*(20\d{2})(?![\d/])/);
    if (m) return `${m[2]}-${pad(Number(m[1]))}`;
    return null;
  };
  for (const t of texts) if (prefer.test(t)) { const r = tryLine(t); if (r) return r; }
  for (const t of texts) { const r = tryLine(t); if (r) return r; }
  return null;
}

function fullYear(y: string): number {
  return y.length === 2 ? 2000 + Number(y) : Number(y);
}

function findKind(headerText: string): string {
  const t = norm(headerText);
  if (/13[o°º]?\s*sal|decimo\s+terceiro|gratificacao\s+natalina/.test(t)) {
    if (/1[aª]\s*parcela|primeira|adiantamento/.test(t)) return '13º salário (1ª parcela)';
    if (/2[aª]\s*parcela|segunda/.test(t)) return '13º salário (2ª parcela)';
    return '13º salário';
  }
  if (/recibo\s+de\s+ferias|aviso\s+de\s+ferias|folha\s+de\s+ferias/.test(t)) return 'Férias';
  if (/rescis/.test(t)) return 'Rescisão';
  if (/adiantamento|quinzena|vale\s+salarial/.test(t)) return 'Adiantamento';
  if (/\bplr\b|participacao\s+nos\s+lucros/.test(t)) return 'PLR';
  return 'Mensal';
}

const FIELD_STOP = /\b(cpf|cbo|cargo|fun[cç][aã]o|matr[ií]cula|admiss[aã]o|depto|departamento|setor|lota[cç][aã]o|filial|banco|ag[eê]ncia|conta|pis|cnpj|nome|c[oó]digo)\b/i;

/** Valor de um campo rotulado: à direita na mesma linha ou na linha de baixo. */
function labeledValue(lines: Line[], limit: number, label: RegExp, accept: (v: string) => boolean): string | undefined {
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    const m = line.text.match(label);
    if (!m) continue;
    const start = m.index!;
    const end = start + m[0].length;
    // mesma linha
    const rest = line.text.slice(end).replace(/^[\s:.-]+/, '');
    const stop = rest.search(FIELD_STOP);
    const sameLine = (stop >= 0 ? rest.slice(0, stop) : rest).replace(/[\s:.-]+$/, '').trim();
    if (sameLine && accept(sameLine)) return sameLine;
    // linha de baixo, célula alinhada
    const span = spanX(line, start, end);
    for (let j = i + 1; j < Math.min(limit, i + 3); j++) {
      const cell = lines[j].cells.find((c) => c.x1 >= span.x0 - 5 && c.x0 <= span.x1 + 5);
      if (cell && accept(cell.text)) return cell.text.trim();
    }
  }
  return undefined;
}

const looksLikeName = (v: string) => /[a-zà-ú]{2,}/i.test(v) && !/\d{3,}/.test(v) && v.length <= 80;

function findParties(lines: Line[], headerLimit: number) {
  const head = lines.slice(0, headerLimit);
  let cnpj: string | undefined;
  let employer: string | undefined;
  for (let i = 0; i < head.length; i++) {
    const m = head[i].text.match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/);
    if (m) {
      cnpj = m[0];
      const before = head[i].text.slice(0, m.index).replace(/cnpj[\s:.]*$/i, '').trim();
      if (looksLikeName(before) && !FIELD_STOP.test(before)) employer = before;
      else if (i > 0 && looksLikeName(head[i - 1].text)) employer = head[i - 1].cells[0]?.text;
      break;
    }
  }
  const empLabel = /\b(nome\s+do\s+(funcion[aá]rio|empregado|servidor|colaborador)|funcion[aá]rio|empregado|servidor|colaborador|nome)\b/i;
  const empregadorLabel = /\b(empregador|empresa|raz[aã]o\s+social|[oó]rg[aã]o)\b/i;
  if (!employer) employer = labeledValue(head, head.length, empregadorLabel, looksLikeName);
  if (!employer && head[0]) {
    const first = head[0].cells[0]?.text;
    if (first && looksLikeName(first) && !/recibo|holerite|contracheque|demonstrativo/i.test(first)) employer = first;
  }
  const employee = labeledValue(head, head.length, empLabel, (v) => looksLikeName(v) && !/ltda|s\.?a\.?$|eireli|me$/i.test(v));
  const role = labeledValue(head, head.length, /\b(cargo|fun[cç][aã]o)\b/i, looksLikeName);
  const registration = labeledValue(head, head.length, /\b(matr[ií]cula|c[oó]d(igo)?\.?\s*(do\s+)?func(ion[aá]rio)?|registro)\b/i, (v) => /^[\w./-]{1,20}$/.test(v.split(' ')[0]))?.split(' ')[0];
  return { cnpj, employer, employee, role, registration };
}

// ---------- Principal ----------

/** Cabeçalho de tabela nesta linha? */
function headerAt(line: Line): Columns | null {
  const h = findHeader([line]);
  return h ? h.cols : null;
}

export function parsePayslipLines(lines: Line[]): ParsedPayslip {
  const warnings: string[] = [];
  const header = findHeader(lines);

  // Lê o documento inteiro (todas as páginas). Cada página pode repetir o cabeçalho da tabela.
  const raw: RawItem[] = [];
  let cols: Columns | null = null;
  let page = 0;
  let seenHeaderOnPage = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.page !== page) { page = line.page; seenHeaderOnPage = false; }
    const h = headerAt(line);
    if (h) { cols = h; seenHeaderOnPage = true; continue; }
    if (!line.tokens.some((t) => isMoney(t.text))) continue;
    if (isSummaryLine(line)) continue;
    // Antes do cabeçalho da tabela fica a identificação (empresa, funcionário, competência).
    if (header && !seenHeaderOnPage && (page === lines[0]?.page || i < header.index)) continue;
    if (!header && /cnpj|cpf|admiss|compet|refer[eê]ncia|banco|ag[eê]ncia|conta/i.test(line.text)) continue;
    raw.push(...itemsFromLine(line, cols));
  }

  let kinds: PayslipItemKind[];
  if (header) kinds = raw.map((r) => (r.col === 'desc' ? 'desconto' : r.col === 'prov' ? 'provento' : r.mark ?? 'provento'));
  else if (raw.length && raw.every((r) => r.mark)) kinds = raw.map((r) => r.mark!);
  else {
    kinds = classifyWithoutHeader(raw).map((k, i) => raw[i].mark ?? k);
    if (raw.length) warnings.push('Não encontrei o cabeçalho da tabela; classifiquei as rubricas pela posição e pelo nome. Confira os tipos.');
  }

  let items: PayslipItem[] = raw
    .map((r, i) => ({
      id: uid(),
      code: r.code,
      description: titleCase(r.description),
      reference: r.reference,
      amount: round2(r.amount),
      kind: kinds[i],
    }))
    .filter((it) => it.amount > 0);

  const summary = findSummary(lines, header ? header.index + 1 : 0, header?.cols ?? null);
  const fixed = reconcile(items, summary);
  items = fixed.items;
  warnings.push(...fixed.notes);
  const headerText = lines.slice(0, header ? header.index : Math.min(lines.length, 10)).map((l) => l.text).join('\n');
  const parties = findParties(lines, header ? header.index : Math.min(lines.length, 12));
  const month = findMonth(lines.slice(0, header ? header.index + 1 : lines.length));

  // ----- conferência -----
  const sumProv = round2(items.filter((i) => i.kind === 'provento').reduce((s, i) => s + i.amount, 0));
  const sumDesc = round2(items.filter((i) => i.kind === 'desconto').reduce((s, i) => s + i.amount, 0));
  let confidence = 0.4;
  if (!items.length) {
    warnings.push('Nenhuma rubrica encontrada. O PDF pode ser uma imagem escaneada — adicione as rubricas manualmente.');
    confidence = 0;
  }
  if (header) confidence += 0.2;
  else confidence -= 0.1;
  if (summary.totalProventos !== undefined) {
    if (Math.abs(summary.totalProventos - sumProv) < 0.02) confidence += 0.15;
    else warnings.push(`A soma dos proventos lidos (${sumProv.toFixed(2)}) difere do total do documento (${summary.totalProventos.toFixed(2)}).`);
  }
  if (summary.totalDescontos !== undefined) {
    if (Math.abs(summary.totalDescontos - sumDesc) < 0.02) confidence += 0.15;
    else warnings.push(`A soma dos descontos lidos (${sumDesc.toFixed(2)}) difere do total do documento (${summary.totalDescontos.toFixed(2)}).`);
  }
  if (summary.liquido !== undefined) {
    if (Math.abs(summary.liquido - (sumProv - sumDesc)) < 0.02) confidence += 0.1;
    else warnings.push('O líquido do documento não bate com proventos − descontos lidos.');
  }
  if (!month) warnings.push('Não identifiquei a competência (mês/ano). Selecione manualmente.');

  return {
    month,
    kind: findKind(headerText),
    ...parties,
    items,
    summary,
    warnings,
    confidence: Math.max(0, Math.min(1, confidence)),
  };
}

// ---------- Conferência aritmética ----------

const EPS = 0.015;
const near = (a: number, b: number) => Math.abs(a - b) < EPS;
const total = (items: PayslipItem[], kind: PayslipItemKind) => round2(items.filter((i) => i.kind === kind).reduce((s, i) => s + i.amount, 0));

/**
 * Usa a lógica do contracheque para corrigir a leitura:
 * - um valor igual à soma das demais rubricas do mesmo tipo é um TOTAL, não rubrica;
 * - um valor igual a proventos − descontos é o LÍQUIDO;
 * - se os totais do documento não batem, testa inverter/remover uma rubrica até bater.
 */
export function reconcile(input: PayslipItem[], summary: PayslipSummary): { items: PayslipItem[]; notes: string[] } {
  let items = [...input];
  const notes: string[] = [];

  // 1) totais e líquido que vazaram como rubrica.
  //    Um total é a soma das rubricas MENORES do mesmo tipo; rubricas de total não costumam ter código.
  const docTotal = (kind: PayslipItemKind) => (kind === 'provento' ? summary.totalProventos : kind === 'desconto' ? summary.totalDescontos : undefined);
  for (let guard = 0; guard < 8; guard++) {
    let changed = false;
    const byAmountDesc = [...items].sort((x, y) => y.amount - x.amount);
    for (const it of byAmountDesc) {
      if (it.kind === 'informativo') continue;
      const others = items.filter((x) => x !== it);
      const smaller = others.filter((x) => x.kind === it.kind && x.amount < it.amount);
      const known = docTotal(it.kind);
      const plausible = !it.code || (known !== undefined && near(known, it.amount));
      if (plausible && smaller.length >= 2 && near(it.amount, total(smaller, it.kind))) {
        if (it.kind === 'provento') summary.totalProventos ??= it.amount;
        else summary.totalDescontos ??= it.amount;
        notes.push(`"${it.description}" (${it.amount.toFixed(2)}) é a soma das demais rubricas — tratado como total, não somado.`);
        items = others;
        changed = true;
        break;
      }
    }
    if (!changed) {
      for (const it of byAmountDesc) {
        const others = items.filter((x) => x !== it);
        const prov = total(others, 'provento');
        const desc = total(others, 'desconto');
        const plausible = !it.code || (summary.liquido !== undefined && near(summary.liquido, it.amount));
        if (plausible && prov > 0 && desc > 0 && near(it.amount, prov - desc)) {
          summary.liquido ??= it.amount;
          notes.push(`"${it.description}" (${it.amount.toFixed(2)}) é o líquido (proventos − descontos) — não somado.`);
          items = others;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }

  // 2) corrige com os totais do documento
  const matches = (list: PayslipItem[]) => {
    const p = total(list, 'provento');
    const d = total(list, 'desconto');
    let score = 0;
    let known = 0;
    if (summary.totalProventos !== undefined) { known++; if (near(p, summary.totalProventos)) score++; }
    if (summary.totalDescontos !== undefined) { known++; if (near(d, summary.totalDescontos)) score++; }
    if (summary.liquido !== undefined) { known++; if (near(p - d, summary.liquido)) score++; }
    return { score, known };
  };
  const base = matches(items);
  if (base.known >= 2 && base.score < base.known) {
    let best: { list: PayslipItem[]; score: number; note: string } | null = null;
    for (const it of items) {
      if (it.kind === 'informativo') continue;
      const flipped = items.map((x) => (x === it ? { ...x, kind: (x.kind === 'provento' ? 'desconto' : 'provento') as PayslipItemKind } : x));
      const removed = items.filter((x) => x !== it);
      for (const [list, note] of [
        [flipped, `"${it.description}" estava na coluna errada — corrigido para ${it.kind === 'provento' ? 'desconto' : 'provento'} (fecha com os totais).`],
        [removed, `"${it.description}" (${it.amount.toFixed(2)}) não faz parte da soma do documento — removido.`],
      ] as [PayslipItem[], string][]) {
        const m = matches(list);
        if (m.score === m.known && (!best || m.score > best.score)) best = { list, score: m.score, note };
      }
    }
    if (best) {
      items = best.list;
      notes.push(best.note);
    }
  }
  return { items, notes };
}

const LOWER_WORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 's/', 'p/', 'c/', 'a', 'o', 'em', 'no', 'na']);
const UPPER_WORDS = new Set(['inss', 'irrf', 'fgts', 'dsr', 'plr', 'vt', 'va', 'vr', 'he', 'ir', 'rpps', 'cct']);

function titleCase(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .split(' ')
    .map((w, i) => {
      const bare = w.replace(/[^a-zà-ú/]/gi, '');
      if (UPPER_WORDS.has(bare)) return w.toUpperCase();
      if (i > 0 && LOWER_WORDS.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(' ');
}
