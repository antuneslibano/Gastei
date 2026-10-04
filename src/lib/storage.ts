import type { AppData } from './types';
import { DEFAULT_CATEGORIES } from './categories';

/**
 * Persistência local (versão de testes). A interface é isolada aqui para que,
 * no futuro, seja trocada pela sincronização com o Supabase sem mexer nas telas.
 */
const KEY = 'gastei:data:v1';

export function emptyData(): AppData {
  return {
    version: 1,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    recurring: [],
    budgets: [],
    payslips: [],
    settings: { userName: '', theme: 'system', dependents: 0, hideValues: false },
    generated: [],
  };
}

export function migrate(raw: unknown): AppData {
  const base = emptyData();
  if (!raw || typeof raw !== 'object') return base;
  const d = raw as Partial<AppData>;
  return {
    ...base,
    ...d,
    version: 1,
    settings: { ...base.settings, ...(d.settings ?? {}) },
    categories: d.categories?.length ? d.categories : base.categories,
    transactions: d.transactions ?? [],
    recurring: d.recurring ?? [],
    budgets: d.budgets ?? [],
    payslips: d.payslips ?? [],
    generated: d.generated ?? [],
  };
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : emptyData();
  } catch {
    return emptyData();
  }
}

export function saveData(data: AppData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch (e) {
    console.error('Falha ao salvar dados', e);
  }
}
