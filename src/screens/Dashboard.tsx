import { useMemo } from 'react';
import { useStore } from '../lib/store';
import { byCategory, categoryOf, totals, txOfMonth } from '../lib/selectors';
import { addMonths, currentMonth, daysInMonth, formatDate, monthLabel, todayISO } from '../lib/dates';
import { money, percent } from '../lib/format';
import { Bars, BarLabels, Donut } from '../components/Charts';
import { MonthPicker } from '../components/MonthPicker';
import type { Transaction } from '../lib/types';

interface Props {
  month: string;
  setMonth: (m: string) => void;
  onEdit: (tx: Transaction) => void;
  goTo: (tab: 'payslips' | 'planning' | 'transactions') => void;
}

export function Dashboard({ month, setMonth, onEdit, goTo }: Props) {
  const { data, dispatch } = useStore();
  const hide = data.settings.hideValues;
  const txs = useMemo(() => txOfMonth(data, month), [data, month]);
  const t = totals(txs);
  const prev = totals(txOfMonth(data, addMonths(month, -1)));
  const cats = byCategory(txs, data.categories);

  const history = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const m = addMonths(month, i - 5);
        const x = totals(txOfMonth(data, m));
        return { label: monthLabel(m, true), a: x.income, b: x.expense };
      }),
    [data, month],
  );

  const pending = txs.filter((x) => x.type === 'expense' && !x.paid).sort((a, b) => a.date.localeCompare(b.date));
  const today = todayISO();

  // Insights
  const insights: string[] = [];
  if (prev.expense > 0 && t.expense > 0) {
    const diff = (t.expense - prev.expense) / prev.expense;
    if (Math.abs(diff) >= 0.05)
      insights.push(`Gastos ${diff > 0 ? 'subiram' : 'caíram'} ${percent(Math.abs(diff), 0)} em relação a ${monthLabel(addMonths(month, -1)).split(' ')[0].toLowerCase()}.`);
  }
  if (month === currentMonth() && t.expense > 0) {
    const day = Number(today.slice(8, 10));
    const variable = txs.filter((x) => x.type === 'expense' && !x.recurringId && !x.installment && x.date <= today).reduce((s, x) => s + x.amount, 0);
    const fixed = t.expense - variable;
    const projection = fixed + (variable / day) * daysInMonth(month);
    if (day >= 5) insights.push(`No ritmo atual, o mês deve fechar com ${money(projection, hide)} em gastos.`);
  }
  if (t.income > 0 && t.expense > 0) {
    const rate = 1 - t.expense / t.income;
    insights.push(rate >= 0 ? `Você está guardando ${percent(rate, 0)} da sua renda neste mês. ${rate >= 0.2 ? 'Excelente! 🎉' : ''}` : `Atenção: os gastos passaram a renda em ${money(-t.balance, hide)}.`);
  }
  for (const b of data.budgets) {
    const spent = cats.find((c) => c.id === b.categoryId)?.value ?? 0;
    if (spent > b.limit) insights.push(`Orçamento de ${categoryOf(data, b.categoryId).name} estourado em ${money(spent - b.limit, hide)}.`);
  }

  const lastPayslip = [...data.payslips].sort((a, b) => b.month.localeCompare(a.month))[0];

  return (
    <div className="screen">
      <MonthPicker month={month} onChange={setMonth} />

      <div className="card">
        <h3>Saldo do mês</h3>
        <div className={`balance ${t.balance >= 0 ? 'income' : 'expense'}`}>{money(t.balance, hide)}</div>
        <div className="stats">
          <div className="stat"><div className="label">Receitas</div><div className="value income">{money(t.income, hide)}</div></div>
          <div className="stat"><div className="label">Gastos</div><div className="value expense">{money(t.expense, hide)}</div></div>
          <div className="stat"><div className="label">A pagar</div><div className="value">{money(t.toPay, hide)}</div></div>
          <div className="stat"><div className="label">A receber</div><div className="value">{money(t.toReceive, hide)}</div></div>
        </div>
      </div>

      {insights.length > 0 && (
        <div className="card">
          <h2>💡 Resumo inteligente</h2>
          <div className="col small">{insights.map((i) => <div key={i}>• {i}</div>)}</div>
        </div>
      )}

      <div className="card">
        <div className="row between"><h2>Gastos por categoria</h2><button className="btn ghost" onClick={() => goTo('planning')}>Orçamentos</button></div>
        {cats.length ? <Donut slices={cats} hide={hide} /> : <div className="empty small">Nenhum gasto neste mês ainda. Toque em <b>+</b> para anotar.</div>}
      </div>

      {pending.length > 0 && (
        <div className="card">
          <h2>Contas a pagar</h2>
          <div className="list">
            {pending.slice(0, 6).map((x) => {
              const c = categoryOf(data, x.categoryId);
              const late = x.date < today;
              return (
                <div key={x.id} className="list-item">
                  <div className="cat-icon" style={{ background: c.color + '22' }}>{c.icon}</div>
                  <button className="grow" style={{ border: 0, background: 'none', textAlign: 'left', padding: 0 }} onClick={() => onEdit(x)}>
                    <div className="ellipsis bold">{x.description}</div>
                    <div className={`tiny ${late ? 'expense' : 'muted'}`}>{late ? 'Venceu em ' : 'Vence em '}{formatDate(x.date)}</div>
                  </button>
                  <div className="right">
                    <div className="bold">{money(x.amount, hide)}</div>
                    <button className="btn ghost tiny" onClick={() => dispatch({ type: 'tx/togglePaid', id: x.id })}>Marcar pago</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="card">
        <h2>Últimos 6 meses</h2>
        <Bars data={history} colorA="var(--income)" colorB="var(--expense)" />
        <BarLabels labels={history.map((h) => h.label)} />
        <div className="row small muted" style={{ marginTop: 8, gap: 16 }}>
          <span><span className="income">■</span> Receitas</span>
          <span><span className="expense">■</span> Gastos</span>
        </div>
      </div>

      <div className="card">
        <div className="row between"><h2>Contracheque</h2><button className="btn ghost" onClick={() => goTo('payslips')}>{lastPayslip ? 'Ver todos' : 'Importar'}</button></div>
        {lastPayslip ? (
          <div className="small">
            Último: <b>{monthLabel(lastPayslip.month)}</b> ({lastPayslip.kind}) — líquido{' '}
            <b className="income">{money(lastPayslip.summary.liquido ?? 0, hide)}</b>
          </div>
        ) : (
          <div className="small muted">Importe o PDF do seu contracheque e o Gastei identifica proventos, descontos e confere INSS, IRRF e FGTS automaticamente.</div>
        )}
      </div>
    </div>
  );
}
