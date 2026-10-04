const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const num = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function money(v: number | undefined | null, hide = false): string {
  if (hide) return 'R$ •••••';
  return brl.format(v ?? 0);
}

export function decimal(v: number): string {
  return num.format(v);
}

export function percent(v: number, digits = 1): string {
  return `${(v * 100).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%`;
}

/** Converte "1.234,56", "1234,56", "1234.56", "R$ 1.234,56-" em número. */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/R\$\s*/i, '').replace(/\s/g, '');
  if (!s) return null;
  let negative = false;
  if (s.endsWith('-')) { negative = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { negative = true; s = s.slice(1); }
  if (s.startsWith('(') && s.endsWith(')')) { negative = true; s = s.slice(1, -1); }
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s) || /^\d+(,\d+)?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(,\d{3})*(\.\d+)?$/.test(s) || /^\d+(\.\d+)?$/.test(s)) {
    s = s.replace(/,/g, '');
  } else {
    return null;
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

export function round2(v: number): number {
  // toFixed elimina o ruído de ponto flutuante (ex.: 121.575 → 121.58)
  return Math.round(Number((v * 100).toFixed(6))) / 100;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
