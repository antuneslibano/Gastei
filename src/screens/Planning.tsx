import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { byCategory, categoryOf, txOfMonth } from '../lib/selectors';
import { decimal, money, parseMoney, uid } from '../lib/format';
import { MonthPicker } from '../components/MonthPicker';
import { Sheet } from '../components/Sheet';
import { PAYMENT_METHODS } from '../lib/categories';
import { currentMonth } from '../lib/dates';
import type { PaymentMethod, Recurring, TxType } from '../lib/types';
import { useToast } from '../components/Toast';

export function Planning({ month, setMonth }: { month: string; setMonth: (m: string) => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const hide = data.settings.hideValues;
  const [budgetCat, setBudgetCat] = useState<string | null>(null);
  const [recEdit, setRecEdit] = useState<Recurring | 'new' | null>(null);

  const spent = useMemo(() => byCategory(txOfMonth(data, month), data.categories), [data, month]);
  const expenseCats = data.categories.filter((c) => c.type === 'expense');
  const totalBudget = data.budgets.reduce((s, b) => s + b.limit, 0);
  const totalSpentBudgeted = data.budgets.reduce((s, b) => s + (spent.find((x) => x.id === b.categoryId)?.value ?? 0), 0);
  const fixedExpense = data.recurring.filter((r) => r.active && r.type === 'expense').reduce((s, r) => s + r.amount, 0);
  const fixedIncome = data.recurring.filter((r) => r.active && r.type === 'income').reduce((s, r) => s + r.amount, 0);

  return (
    <div className="screen">
      <MonthPicker month={month} onChange={setMonth} />

      <div className="card">
        <div className="row between">
          <h2>Orçamentos do mês</h2>
          <button className="btn ghost" onClick={() => setBudgetCat('')}>+ Definir</button>
        </div>
        {data.budgets.length === 0 ? (
          <div className="small muted">Defina um limite mensal por categoria (ex.: Alimentação até R$ 800) e acompanhe aqui.</div>
        ) : (
          <div className="col" style={{ gap: 12 }}>
            <div className="small">Total: <b>{money(totalSpentBudgeted, hide)}</b> de {money(totalBudget, hide)}</div>
            {data.budgets.map((b) => {
              const c = categoryOf(data, b.categoryId);
              const v = spent.find((x) => x.id === b.categoryId)?.value ?? 0;
              const pct = b.limit ? v / b.limit : 0;
              return (
                <button key={b.categoryId} className="col" style={{ gap: 4, border: 0, background: 'none', padding: 0, textAlign: 'left' }} onClick={() => setBudgetCat(b.categoryId)}>
                  <div className="row between small">
                    <span>{c.icon} {c.name}</span>
                    <span><b className={pct > 1 ? 'expense' : ''}>{money(v, hide)}</b> <span className="muted">/ {money(b.limit, hide)}</span></span>
                  </div>
                  <div className="progress"><div className={pct > 1 ? 'over' : pct > 0.8 ? 'warn' : ''} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div>
                  <div className="tiny muted">{pct > 1 ? `Passou ${money(v - b.limit, hide)}` : `Restam ${money(b.limit - v, hide)}`}</div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <div className="row between">
          <h2>Contas fixas</h2>
          <button className="btn ghost" onClick={() => setRecEdit('new')}>+ Nova</button>
        </div>
        <div className="small muted" style={{ marginBottom: 8 }}>Lançadas automaticamente todo mês como pendentes (aluguel, internet, assinaturas, salário…).</div>
        {data.recurring.length > 0 && (
          <>
            <div className="list">
              {data.recurring.map((r) => {
                const c = categoryOf(data, r.categoryId);
                return (
                  <button key={r.id} className="list-item" onClick={() => setRecEdit(r)} style={{ opacity: r.active ? 1 : 0.5 }}>
                    <div className="cat-icon" style={{ background: c.color + '22' }}>{c.icon}</div>
                    <div className="grow">
                      <div className="bold ellipsis">{r.description}</div>
                      <div className="tiny muted">Todo dia {r.day}{r.active ? '' : ' · pausada'}</div>
                    </div>
                    <div className={`bold ${r.type}`}>{money(r.amount, hide)}</div>
                  </button>
                );
              })}
            </div>
            <div className="stats">
              <div className="stat"><div className="label">Fixos de saída</div><div className="value expense">{money(fixedExpense, hide)}</div></div>
              <div className="stat"><div className="label">Fixos de entrada</div><div className="value income">{money(fixedIncome, hide)}</div></div>
            </div>
          </>
        )}
      </div>

      {budgetCat !== null && (
        <BudgetSheet
          categoryId={budgetCat}
          options={expenseCats}
          onClose={() => setBudgetCat(null)}
          onSave={(categoryId, limit) => { dispatch({ type: 'budget/set', budget: { categoryId, limit } }); toast('Orçamento salvo'); }}
          onDelete={(categoryId) => { dispatch({ type: 'budget/delete', categoryId }); toast('Orçamento removido'); }}
          current={data.budgets.find((b) => b.categoryId === budgetCat)?.limit}
        />
      )}
      {recEdit && <RecurringSheet rec={recEdit === 'new' ? undefined : recEdit} onClose={() => setRecEdit(null)} />}
    </div>
  );
}

function BudgetSheet({ categoryId, options, current, onClose, onSave, onDelete }: {
  categoryId: string; options: { id: string; name: string; icon: string }[]; current?: number;
  onClose: () => void; onSave: (c: string, l: number) => void; onDelete: (c: string) => void;
}) {
  const [cat, setCat] = useState(categoryId || options[0]?.id);
  const [limit, setLimit] = useState(current ? decimal(current) : '');
  return (
    <Sheet title="Orçamento mensal" onClose={onClose}>
      <div className="col">
        <label className="field"><span>Categoria</span>
          <select className="input" value={cat} disabled={!!categoryId} onChange={(e) => setCat(e.target.value)}>
            {options.map((o) => <option key={o.id} value={o.id}>{o.icon} {o.name}</option>)}
          </select>
        </label>
        <label className="field"><span>Limite por mês (R$)</span><input className="input amount" inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} autoFocus /></label>
        <button className="btn" onClick={() => { const v = parseMoney(limit); if (v && v > 0) { onSave(cat, Math.abs(v)); onClose(); } }}>Salvar</button>
        {categoryId && <button className="btn danger" onClick={() => { onDelete(categoryId); onClose(); }}>Remover orçamento</button>}
      </div>
    </Sheet>
  );
}

function RecurringSheet({ rec, onClose }: { rec?: Recurring; onClose: () => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [type, setType] = useState<TxType>(rec?.type ?? 'expense');
  const [description, setDescription] = useState(rec?.description ?? '');
  const [amount, setAmount] = useState(rec ? decimal(rec.amount) : '');
  const [day, setDay] = useState(rec?.day ?? 10);
  const [categoryId, setCategoryId] = useState(rec?.categoryId ?? '');
  const [method, setMethod] = useState<PaymentMethod>(rec?.method ?? 'boleto');
  const [active, setActive] = useState(rec?.active ?? true);
  const cats = data.categories.filter((c) => c.type === type);
  const cat = cats.some((c) => c.id === categoryId) ? categoryId : cats[0]?.id;

  const save = () => {
    const v = parseMoney(amount);
    if (!v || !description.trim()) return;
    dispatch({
      type: 'rec/save',
      rec: { id: rec?.id ?? uid(), type, description: description.trim(), amount: Math.abs(v), day, categoryId: cat, method, active, startMonth: rec?.startMonth ?? currentMonth() },
    });
    toast(rec ? 'Conta fixa atualizada (vale para os próximos meses)' : 'Conta fixa criada');
    onClose();
  };

  return (
    <Sheet title={rec ? 'Editar conta fixa' : 'Nova conta fixa'} onClose={onClose}>
      <div className="col">
        <div className="segmented">
          <button className={type === 'expense' ? 'active expense' : ''} onClick={() => setType('expense')}>Saída</button>
          <button className={type === 'income' ? 'active income' : ''} onClick={() => setType('income')}>Entrada</button>
        </div>
        <label className="field"><span>Descrição</span><input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: Aluguel" /></label>
        <div className="row">
          <label className="field grow"><span>Valor (R$)</span><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></label>
          <label className="field" style={{ width: 100 }}><span>Dia</span>
            <select className="input" value={day} onChange={(e) => setDay(Number(e.target.value))}>{Array.from({ length: 31 }, (_, i) => <option key={i + 1}>{i + 1}</option>)}</select>
          </label>
        </div>
        <div className="row">
          <label className="field grow"><span>Categoria</span>
            <select className="input" value={cat} onChange={(e) => setCategoryId(e.target.value)}>{cats.map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}</select>
          </label>
          <label className="field grow"><span>Forma</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>{PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
          </label>
        </div>
        <label className="check"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />Ativa</label>
        <button className="btn" onClick={save}>Salvar</button>
        {rec && <button className="btn danger" onClick={() => { if (confirm('Excluir esta conta fixa? Lançamentos já criados serão mantidos.')) { dispatch({ type: 'rec/delete', id: rec.id }); onClose(); } }}>Excluir</button>}
      </div>
    </Sheet>
  );
}
