import type { AppData, Category, Transaction } from './types';
import { round2 } from './format';

export function txOfMonth(data: AppData, month: string): Transaction[] {
  return data.transactions.filter((t) => t.date.startsWith(month));
}

export function totals(txs: Transaction[]) {
  let income = 0, expense = 0, toPay = 0, toReceive = 0;
  for (const t of txs) {
    if (t.type === 'income') { income += t.amount; if (!t.paid) toReceive += t.amount; }
    else { expense += t.amount; if (!t.paid) toPay += t.amount; }
  }
  return { income: round2(income), expense: round2(expense), balance: round2(income - expense), toPay: round2(toPay), toReceive: round2(toReceive) };
}

export function byCategory(txs: Transaction[], categories: Category[], type: 'expense' | 'income' = 'expense') {
  const map = new Map<string, number>();
  for (const t of txs) if (t.type === type) map.set(t.categoryId, (map.get(t.categoryId) ?? 0) + t.amount);
  return [...map.entries()]
    .map(([id, value]) => {
      const c = categories.find((x) => x.id === id);
      return { id, label: c?.name ?? 'Sem categoria', icon: c?.icon ?? '❔', color: c?.color ?? '#999', value: round2(value) };
    })
    .sort((a, b) => b.value - a.value);
}

export function categoryOf(data: AppData, id: string): Category {
  return data.categories.find((c) => c.id === id) ?? { id, name: 'Sem categoria', icon: '❔', color: '#999', type: 'expense' };
}
