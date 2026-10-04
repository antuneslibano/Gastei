import { useMemo, useState } from 'react';
import type { PaymentMethod, Transaction, TxType } from '../lib/types';
import { buildInstallments, useStore } from '../lib/store';
import { PAYMENT_METHODS, suggestCategory } from '../lib/categories';
import { decimal, parseMoney, uid } from '../lib/format';
import { todayISO } from '../lib/dates';
import { Sheet } from './Sheet';

interface Props {
  tx?: Transaction;
  defaultType?: TxType;
  onClose: () => void;
  onSaved?: (msg: string) => void;
}

export function TxForm({ tx, defaultType = 'expense', onClose, onSaved }: Props) {
  const { data, dispatch } = useStore();
  const [type, setType] = useState<TxType>(tx?.type ?? defaultType);
  const [amount, setAmount] = useState(tx ? decimal(tx.amount) : '');
  const [description, setDescription] = useState(tx?.description ?? '');
  const [categoryId, setCategoryId] = useState(tx?.categoryId ?? '');
  const [touchedCat, setTouchedCat] = useState(!!tx);
  const [date, setDate] = useState(tx?.date ?? todayISO());
  const [method, setMethod] = useState<PaymentMethod>(tx?.method ?? 'pix');
  const [paid, setPaid] = useState(tx?.paid ?? true);
  const [notes, setNotes] = useState(tx?.notes ?? '');
  const [installments, setInstallments] = useState(1);
  const [totalIsSum, setTotalIsSum] = useState(true);
  const [repeat, setRepeat] = useState(false);
  const [error, setError] = useState('');

  const cats = useMemo(() => data.categories.filter((c) => c.type === type), [data.categories, type]);
  const effectiveCat = categoryId && cats.some((c) => c.id === categoryId) ? categoryId : '';

  const onDescription = (v: string) => {
    setDescription(v);
    if (!touchedCat) {
      const s = suggestCategory(v, type);
      if (s) setCategoryId(s);
    }
  };

  const save = () => {
    const value = parseMoney(amount);
    if (!value || value <= 0) return setError('Informe um valor válido.');
    if (!description.trim()) return setError('Informe uma descrição.');
    const cat = effectiveCat || cats[cats.length - 1]?.id;
    const base = {
      type,
      description: description.trim(),
      amount: Math.abs(value),
      date,
      categoryId: cat,
      method,
      paid,
      notes: notes.trim() || undefined,
      createdAt: tx?.createdAt ?? new Date().toISOString(),
    };
    if (tx) {
      dispatch({ type: 'tx/update', tx: { ...tx, ...base } });
      onSaved?.('Lançamento atualizado');
    } else if (repeat) {
      const recId = uid();
      dispatch({
        type: 'rec/save',
        rec: { id: recId, type, description: base.description, amount: base.amount, day: Number(date.slice(8, 10)), categoryId: cat, method, active: true, startMonth: date.slice(0, 7) },
      });
      onSaved?.('Conta fixa criada — será lançada todo mês');
    } else if (installments > 1) {
      dispatch({ type: 'tx/add', tx: buildInstallments(base, installments, totalIsSum) });
      onSaved?.(`${installments} parcelas lançadas`);
    } else {
      dispatch({ type: 'tx/add', tx: { ...base, id: uid() } });
      onSaved?.(type === 'expense' ? 'Gasto anotado' : 'Receita anotada');
    }
    onClose();
  };

  const remove = (scope: 'one' | 'installments') => {
    if (!tx) return;
    const msg = scope === 'installments' ? 'Excluir esta e as próximas parcelas?' : 'Excluir este lançamento?';
    if (!confirm(msg)) return;
    dispatch({ type: 'tx/delete', id: tx.id, scope });
    onSaved?.('Excluído');
    onClose();
  };

  return (
    <Sheet title={tx ? 'Editar lançamento' : 'Novo lançamento'} onClose={onClose}>
      <div className="col" style={{ gap: 14 }}>
        <div className="segmented">
          <button className={type === 'expense' ? 'active expense' : ''} onClick={() => setType('expense')}>Gasto</button>
          <button className={type === 'income' ? 'active income' : ''} onClick={() => setType('income')}>Receita</button>
        </div>

        <label className="field">
          <span>Valor (R$)</span>
          <input className={`input amount ${type}`} inputMode="decimal" placeholder="0,00" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus={!tx} />
        </label>

        <label className="field">
          <span>Descrição</span>
          <input className="input" placeholder={type === 'expense' ? 'Ex.: Mercado, Uber, Netflix' : 'Ex.: Salário, Freela'} value={description} onChange={(e) => onDescription(e.target.value)} />
        </label>

        <div className="field">
          <span>Categoria</span>
          <div className="cat-grid">
            {cats.map((c) => (
              <button key={c.id} className={effectiveCat === c.id ? 'active' : ''} onClick={() => { setCategoryId(c.id); setTouchedCat(true); }}>
                <span className="e">{c.icon}</span>
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="row">
          <label className="field grow">
            <span>Data</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field grow">
            <span>Forma</span>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </label>
        </div>

        <label className="check">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} />
          {type === 'expense' ? 'Já está pago' : 'Já recebi'}
        </label>

        {!tx && (
          <>
            <label className="check">
              <input type="checkbox" checked={repeat} onChange={(e) => { setRepeat(e.target.checked); if (e.target.checked) setInstallments(1); }} />
              Repetir todo mês (conta fixa)
            </label>
            {type === 'expense' && !repeat && (
              <div className="row">
                <label className="field" style={{ width: 120 }}>
                  <span>Parcelas</span>
                  <select className="input" value={installments} onChange={(e) => setInstallments(Number(e.target.value))}>
                    {Array.from({ length: 48 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n === 1 ? 'À vista' : `${n}x`}</option>)}
                  </select>
                </label>
                {installments > 1 && (
                  <label className="field grow">
                    <span>O valor informado é</span>
                    <select className="input" value={totalIsSum ? 'total' : 'parcela'} onChange={(e) => setTotalIsSum(e.target.value === 'total')}>
                      <option value="total">o total da compra</option>
                      <option value="parcela">o valor de cada parcela</option>
                    </select>
                  </label>
                )}
              </div>
            )}
          </>
        )}

        {tx?.installment && <div className="notice info">Parcela {tx.installment.index} de {tx.installment.total}</div>}

        <label className="field">
          <span>Observações</span>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>

        {error && <div className="notice">{error}</div>}

        <button className="btn block" onClick={save}>Salvar</button>
        {tx && (
          <div className="row">
            <button className="btn danger grow" onClick={() => remove('one')}>Excluir</button>
            {tx.installment && <button className="btn danger grow" onClick={() => remove('installments')}>Excluir parcelas seguintes</button>}
          </div>
        )}
      </div>
    </Sheet>
  );
}
