import { createContext, useContext, useEffect, useReducer, type ReactNode } from 'react';
import type { AppData, Budget, Category, Payslip, Recurring, Settings, Transaction } from './types';
import { loadData, migrate, saveData } from './storage';
import { addMonths, compareMonth, currentMonth, dateInMonth } from './dates';
import { round2, uid } from './format';

export type Action =
  | { type: 'tx/add'; tx: Transaction | Transaction[] }
  | { type: 'tx/update'; tx: Transaction }
  | { type: 'tx/delete'; id: string; scope?: 'one' | 'installments' }
  | { type: 'tx/togglePaid'; id: string }
  | { type: 'rec/save'; rec: Recurring }
  | { type: 'rec/delete'; id: string }
  | { type: 'budget/set'; budget: Budget }
  | { type: 'budget/delete'; categoryId: string }
  | { type: 'cat/save'; cat: Category }
  | { type: 'payslip/save'; payslip: Payslip; tx?: Transaction }
  | { type: 'payslip/delete'; id: string; withTx: boolean }
  | { type: 'settings'; settings: Partial<Settings> }
  | { type: 'generate'; month: string }
  | { type: 'replace'; data: AppData };

/** Cria os lançamentos das contas fixas para o mês (uma única vez por conta/mês). */
function generateRecurring(state: AppData, month: string): AppData {
  const created: Transaction[] = [];
  const generated = new Set(state.generated);
  for (const r of state.recurring) {
    const key = `${r.id}:${month}`;
    if (!r.active || generated.has(key) || compareMonth(month, r.startMonth) < 0) continue;
    generated.add(key);
    created.push({
      id: uid(),
      type: r.type,
      description: r.description,
      amount: r.amount,
      date: dateInMonth(month, r.day),
      categoryId: r.categoryId,
      method: r.method,
      paid: false,
      recurringId: r.id,
      createdAt: new Date().toISOString(),
    });
  }
  if (!created.length) return state;
  return { ...state, transactions: [...state.transactions, ...created], generated: [...generated] };
}

function reducer(state: AppData, a: Action): AppData {
  switch (a.type) {
    case 'tx/add':
      return { ...state, transactions: [...state.transactions, ...(Array.isArray(a.tx) ? a.tx : [a.tx])] };
    case 'tx/update':
      return { ...state, transactions: state.transactions.map((t) => (t.id === a.tx.id ? a.tx : t)) };
    case 'tx/delete': {
      const target = state.transactions.find((t) => t.id === a.id);
      if (!target) return state;
      const group = a.scope === 'installments' ? target.installment?.groupId : undefined;
      return {
        ...state,
        transactions: state.transactions.filter((t) =>
          group ? !(t.installment?.groupId === group && t.date >= target.date) : t.id !== a.id,
        ),
      };
    }
    case 'tx/togglePaid':
      return { ...state, transactions: state.transactions.map((t) => (t.id === a.id ? { ...t, paid: !t.paid } : t)) };
    case 'rec/save': {
      const exists = state.recurring.some((r) => r.id === a.rec.id);
      const next = { ...state, recurring: exists ? state.recurring.map((r) => (r.id === a.rec.id ? a.rec : r)) : [...state.recurring, a.rec] };
      return generateRecurring(next, currentMonth());
    }
    case 'rec/delete':
      return { ...state, recurring: state.recurring.filter((r) => r.id !== a.id) };
    case 'budget/set':
      return { ...state, budgets: [...state.budgets.filter((b) => b.categoryId !== a.budget.categoryId), a.budget] };
    case 'budget/delete':
      return { ...state, budgets: state.budgets.filter((b) => b.categoryId !== a.categoryId) };
    case 'cat/save': {
      const exists = state.categories.some((c) => c.id === a.cat.id);
      return { ...state, categories: exists ? state.categories.map((c) => (c.id === a.cat.id ? a.cat : c)) : [...state.categories, a.cat] };
    }
    case 'payslip/save': {
      const exists = state.payslips.some((p) => p.id === a.payslip.id);
      let transactions = state.transactions;
      if (a.tx) {
        transactions = transactions.some((t) => t.id === a.tx!.id)
          ? transactions.map((t) => (t.id === a.tx!.id ? a.tx! : t))
          : [...transactions, a.tx];
      }
      return {
        ...state,
        transactions,
        payslips: exists ? state.payslips.map((p) => (p.id === a.payslip.id ? a.payslip : p)) : [...state.payslips, a.payslip],
      };
    }
    case 'payslip/delete': {
      const p = state.payslips.find((x) => x.id === a.id);
      return {
        ...state,
        payslips: state.payslips.filter((x) => x.id !== a.id),
        transactions: a.withTx && p?.transactionId ? state.transactions.filter((t) => t.id !== p.transactionId) : state.transactions,
      };
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...a.settings } };
    case 'generate':
      return generateRecurring(state, a.month);
    case 'replace':
      return generateRecurring(migrate(a.data), currentMonth());
  }
}

const Ctx = createContext<{ data: AppData; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => generateRecurring(loadData(), currentMonth()));
  useEffect(() => saveData(data), [data]);
  return <Ctx.Provider value={{ data, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStore fora do StoreProvider');
  return ctx;
}

/** Cria N parcelas mensais a partir de uma compra. */
export function buildInstallments(base: Omit<Transaction, 'id' | 'installment'>, count: number, totalIsSum: boolean): Transaction[] {
  const groupId = uid();
  const each = totalIsSum ? round2(base.amount / count) : base.amount;
  const first = base.date.slice(0, 7);
  const day = Number(base.date.slice(8, 10));
  return Array.from({ length: count }, (_, i) => {
    // ajusta centavos na última parcela
    const amount = totalIsSum && i === count - 1 ? round2(base.amount - each * (count - 1)) : each;
    return {
      ...base,
      id: uid(),
      amount,
      date: dateInMonth(addMonths(first, i), day),
      paid: i === 0 ? base.paid : false,
      installment: { groupId, index: i + 1, total: count },
    };
  });
}
