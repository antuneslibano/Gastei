import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { categoryOf, totals, txOfMonth } from '../lib/selectors';
import { MonthPicker } from '../components/MonthPicker';
import { money } from '../lib/format';
import { PAYMENT_METHODS } from '../lib/categories';
import type { Transaction } from '../lib/types';

type Filter = 'all' | 'expense' | 'income' | 'pending';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function Transactions({ month, setMonth, onEdit }: { month: string; setMonth: (m: string) => void; onEdit: (tx: Transaction) => void }) {
  const { data } = useStore();
  const hide = data.settings.hideValues;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return txOfMonth(data, month)
      .filter((t) => (filter === 'all' ? true : filter === 'pending' ? !t.paid : t.type === filter))
      .filter((t) => !cat || t.categoryId === cat)
      .filter((t) => !q || t.description.toLowerCase().includes(q) || t.notes?.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [data, month, filter, query, cat]);

  const groups = useMemo(() => {
    const g = new Map<string, Transaction[]>();
    for (const t of list) g.set(t.date, [...(g.get(t.date) ?? []), t]);
    return [...g.entries()];
  }, [list]);

  const sum = totals(list);
  const usedCats = [...new Set(txOfMonth(data, month).map((t) => t.categoryId))].map((id) => categoryOf(data, id));

  return (
    <div className="screen">
      <MonthPicker month={month} onChange={setMonth} />
      <input className="input" placeholder="🔎 Buscar lançamento" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="chips">
        {([['all', 'Todos'], ['expense', 'Gastos'], ['income', 'Receitas'], ['pending', 'Pendentes']] as [Filter, string][]).map(([f, l]) => (
          <button key={f} className={`chip ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>{l}</button>
        ))}
        {usedCats.map((c) => (
          <button key={c.id} className={`chip ${cat === c.id ? 'active' : ''}`} onClick={() => setCat(cat === c.id ? '' : c.id)}>{c.icon} {c.name}</button>
        ))}
      </div>

      <div className="row small muted between">
        <span>{list.length} lançamento(s)</span>
        <span>
          <span className="income">+{money(sum.income, hide)}</span> · <span className="expense">−{money(sum.expense, hide)}</span>
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="card empty"><div className="big">🧾</div>Nada por aqui. Toque em <b>+</b> para anotar um gasto ou receita.</div>
      ) : (
        <div className="card" style={{ paddingTop: 8 }}>
          {groups.map(([date, items]) => {
            const d = new Date(date + 'T12:00:00');
            return (
              <div key={date}>
                <div className="day-header">{d.getDate()} · {WEEKDAYS[d.getDay()]}</div>
                <div className="list">
                  {items.map((t) => {
                    const c = categoryOf(data, t.categoryId);
                    return (
                      <button key={t.id} className="list-item" onClick={() => onEdit(t)}>
                        <div className="cat-icon" style={{ background: c.color + '22' }}>{c.icon}</div>
                        <div className="grow">
                          <div className="ellipsis bold">{t.description}{t.installment ? ` (${t.installment.index}/${t.installment.total})` : ''}</div>
                          <div className="tiny muted ellipsis">
                            {c.name} · {PAYMENT_METHODS.find((m) => m.id === t.method)?.label}
                            {t.recurringId ? ' · fixa' : ''}
                            {t.payslipId ? ' · contracheque' : ''}
                          </div>
                        </div>
                        <div className="right">
                          <div className={`bold ${t.type}`}>{t.type === 'expense' ? '−' : '+'}{money(t.amount, hide)}</div>
                          {!t.paid && <span className="badge warn">{t.type === 'expense' ? 'a pagar' : 'a receber'}</span>}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
