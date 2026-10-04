/**
 * Converte o conteúdo de texto do pdf.js em linhas com posição horizontal,
 * o que permite identificar colunas (Referência / Vencimentos / Descontos)
 * mesmo quando o PDF não tem estrutura de tabela.
 */

export interface RawTextItem {
  str: string;
  transform: number[];
  width: number;
  height?: number;
}

export interface Token {
  text: string;
  x0: number;
  x1: number;
  size: number;
  /** índice do item de texto de origem no PDF */
  item: number;
}

export interface Cell {
  text: string;
  x0: number;
  x1: number;
  tokens: Token[];
}

export interface Line {
  page: number;
  y: number;
  tokens: Token[];
  cells: Cell[];
  text: string;
}

function itemTokens(item: RawTextItem, itemIndex: number): { y: number; tokens: Token[] } {
  const [a, b, , , e, f] = item.transform;
  const size = Math.hypot(a, b) || item.height || 10;
  const str = item.str;
  const charW = str.length ? (item.width || size * 0.5 * str.length) / str.length : size * 0.5;
  const tokens: Token[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str))) {
    tokens.push({
      text: m[0],
      x0: e + m.index * charW,
      x1: e + (m.index + m[0].length) * charW,
      size,
      item: itemIndex,
    });
  }
  return { y: f, tokens };
}

export function buildCells(tokens: Token[]): Cell[] {
  const cells: Cell[] = [];
  for (const t of tokens) {
    const last = cells[cells.length - 1];
    const gap = last ? t.x0 - last.x1 : Infinity;
    if (last && (last.tokens[last.tokens.length - 1].item === t.item || gap <= Math.max(t.size, 6) * 0.6)) {
      last.text += ' ' + t.text;
      last.x1 = Math.max(last.x1, t.x1);
      last.tokens.push(t);
    } else {
      cells.push({ text: t.text, x0: t.x0, x1: t.x1, tokens: [t] });
    }
  }
  return cells;
}

export function linesFromItems(items: RawTextItem[], page = 1): Line[] {
  const placed: { y: number; tokens: Token[] }[] = [];
  items.forEach((it, i) => {
    if (it.str && it.str.trim()) placed.push(itemTokens(it, i));
  });
  // PDF: y cresce para cima. Ordena de cima para baixo.
  placed.sort((p, q) => q.y - p.y);

  const lines: { y: number; tokens: Token[] }[] = [];
  for (const p of placed) {
    const size = p.tokens[0]?.size ?? 10;
    const tol = Math.max(2, size * 0.45);
    const line = lines.find((l) => Math.abs(l.y - p.y) <= tol);
    if (line) line.tokens.push(...p.tokens);
    else lines.push({ y: p.y, tokens: [...p.tokens] });
  }
  lines.sort((p, q) => q.y - p.y);

  return lines.map((l) => {
    const tokens = [...l.tokens].sort((p, q) => p.x0 - q.x0);
    return {
      page,
      y: l.y,
      tokens,
      cells: buildCells(tokens),
      text: tokens.map((t) => t.text).join(' '),
    };
  });
}
