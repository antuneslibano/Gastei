export const MONTHS = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function currentMonth(): string {
  return todayISO().slice(0, 7);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

/** Data no mês indicado, ajustando o dia para o último dia válido (ex.: 31 → 28/fev). */
export function dateInMonth(month: string, day: number): string {
  return `${month}-${pad(Math.min(Math.max(1, day), daysInMonth(month)))}`;
}

export function monthLabel(month: string, short = false): string {
  const [y, m] = month.split('-').map(Number);
  const name = MONTHS[m - 1] ?? '';
  if (short) return `${name.slice(0, 3)}/${String(y).slice(2)}`;
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} de ${y}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function compareMonth(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
