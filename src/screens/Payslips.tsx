import { useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import type { Payslip, PayslipItem, PayslipItemKind } from '../lib/types';
import { parsePayslipLines } from '../lib/payslip/parse';
import { PdfPasswordError, readPdfLines } from '../lib/payslip/readPdf';
import { analyzePayslip, sumKind, type CheckStatus } from '../lib/payslip/analyze';
import { decimal, money, parseMoney, percent, round2, uid } from '../lib/format';
import { addMonths, currentMonth, dateInMonth, monthLabel, todayISO } from '../lib/dates';
import { Sheet } from '../components/Sheet';
import { useToast } from '../components/Toast';

type View = { kind: 'list' } | { kind: 'edit'; draft: Payslip; warnings: string[]; confidence?: number; isNew: boolean } | { kind: 'detail'; id: string };

export function Payslips() {
  const { data } = useStore();
  const [view, setView] = useState<View>({ kind: 'list' });

  if (view.kind === 'edit')
    return <PayslipEditor draft={view.draft} warnings={view.warnings} confidence={view.confidence} isNew={view.isNew} onDone={(id) => setView(id ? { kind: 'detail', id } : { kind: 'list' })} />;
  if (view.kind === 'detail') {
    const p = data.payslips.find((x) => x.id === view.id);
    if (p) return <PayslipDetail payslip={p} onBack={() => setView({ kind: 'list' })} onEdit={() => setView({ kind: 'edit', draft: structuredClone(p), warnings: [], isNew: false })} />;
  }
  return <PayslipList onOpen={(id) => setView({ kind: 'detail', id })} onImported={(draft, warnings, confidence) => setView({ kind: 'edit', draft, warnings, confidence, isNew: true })} />;
}

// ---------------- Lista + importação ----------------

function PayslipList({ onOpen, onImported }: { onOpen: (id: string) => void; onImported: (p: Payslip, w: string[], c?: number) => void }) {
  const { data } = useStore();
  const hide = data.settings.hideValues;
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const [pendingFile, setPendingFile] = useState<{ name: string; buf: ArrayBuffer; wrong: boolean } | null>(null);
  const [password, setPassword] = useState('');

  const sorted = useMemo(() => [...data.payslips].sort((a, b) => b.month.localeCompare(a.month) || b.createdAt.localeCompare(a.createdAt)), [data.payslips]);

  const process = async (name: string, buf: ArrayBuffer, pwd?: string) => {
    setBusy(true);
    setError('');
    try {
      // pdf.js transfere o buffer para o worker; usa uma cópia para poder tentar de novo com senha.
      const lines = await readPdfLines(buf.slice(0), pwd);
      const parsed = parsePayslipLines(lines);
      const draft: Payslip = {
        id: uid(),
        month: parsed.month ?? currentMonth(),
        kind: parsed.kind,
        employer: parsed.employer,
        cnpj: parsed.cnpj,
        employee: parsed.employee,
        role: parsed.role,
        registration: parsed.registration,
        items: parsed.items,
        summary: parsed.summary,
        fileName: name,
        createdAt: new Date().toISOString(),
      };
      setPendingFile(null);
      setPassword('');
      onImported(draft, parsed.warnings, parsed.confidence);
    } catch (e) {
      if (e instanceof PdfPasswordError) {
        setPendingFile({ name, buf, wrong: e.wrongPassword });
      } else {
        console.error(e);
        setError('Não consegui ler este arquivo. Verifique se é um PDF válido.');
      }
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file?: File | null) => {
    if (!file) return;
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) return setError('Selecione um arquivo PDF.');
    process(file.name, await file.arrayBuffer());
  };

  const manual = () =>
    onImported({ id: uid(), month: currentMonth(), kind: 'Mensal', items: [], summary: {}, createdAt: new Date().toISOString() }, [], undefined);

  return (
    <div className="screen">
      <div
        className={`dropzone ${drag ? 'drag' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        {busy ? (
          <div className="col"><div className="spinner" /><div className="muted">Lendo o contracheque…</div></div>
        ) : (
          <div className="col" style={{ alignItems: 'center' }}>
            <div style={{ fontSize: 40 }}>📄</div>
            <div className="bold">Importar contracheque (PDF)</div>
            <div className="small muted">Identifico proventos, descontos, bases e confiro INSS, IRRF e FGTS. Tudo é processado no seu aparelho.</div>
            <button className="btn" onClick={() => inputRef.current?.click()}>Escolher PDF</button>
            <button className="btn ghost" onClick={manual}>Lançar manualmente</button>
          </div>
        )}
        <input ref={inputRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      {error && <div className="notice">{error}</div>}

      {sorted.length > 0 && <PayslipEvolution />}

      {sorted.length > 0 && (
        <div className="card">
          <h2>Histórico</h2>
          <div className="list">
            {sorted.map((p) => {
              const bruto = sumKind(p.items, 'provento');
              const liq = p.summary.liquido ?? round2(bruto - sumKind(p.items, 'desconto'));
              return (
                <button key={p.id} className="list-item" onClick={() => onOpen(p.id)}>
                  <div className="cat-icon" style={{ background: 'var(--brand-soft)' }}>💼</div>
                  <div className="grow">
                    <div className="bold">{monthLabel(p.month)}</div>
                    <div className="tiny muted ellipsis">{p.kind}{p.employer ? ` · ${p.employer}` : ''}</div>
                  </div>
                  <div className="right">
                    <div className="bold income">{money(liq, hide)}</div>
                    <div className="tiny muted">bruto {money(bruto, hide)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {pendingFile && (
        <Sheet title="PDF protegido" onClose={() => setPendingFile(null)}>
          <div className="col">
            <div className="small muted">Este contracheque tem senha (geralmente parte do CPF ou a data de nascimento).</div>
            <input className="input" type="password" autoFocus placeholder="Senha do PDF" value={password} onChange={(e) => setPassword(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && process(pendingFile.name, pendingFile.buf, password)} />
            {pendingFile.wrong && <div className="notice">Senha incorreta.</div>}
            <button className="btn" disabled={busy} onClick={() => process(pendingFile.name, pendingFile.buf, password)}>Abrir</button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function PayslipEvolution() {
  const { data } = useStore();
  const hide = data.settings.hideValues;
  const monthly = useMemo(() => {
    const map = new Map<string, { bruto: number; liq: number }>();
    for (const p of data.payslips) {
      const bruto = sumKind(p.items, 'provento');
      const liq = round2(bruto - sumKind(p.items, 'desconto'));
      const cur = map.get(p.month) ?? { bruto: 0, liq: 0 };
      map.set(p.month, { bruto: cur.bruto + bruto, liq: cur.liq + liq });
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(-12);
  }, [data.payslips]);
  const year = currentMonth().slice(0, 4);
  const ytd = monthly.filter(([m]) => m.startsWith(year)).reduce((s, [, v]) => ({ bruto: s.bruto + v.bruto, liq: s.liq + v.liq }), { bruto: 0, liq: 0 });
  const max = Math.max(1, ...monthly.map(([, v]) => v.bruto));
  return (
    <div className="card">
      <h2>Evolução salarial</h2>
      <div className="col" style={{ gap: 6 }}>
        {monthly.map(([m, v]) => (
          <div key={m} className="row small">
            <span style={{ width: 52 }} className="muted">{monthLabel(m, true)}</span>
            <div className="grow" style={{ position: 'relative', height: 18 }}>
              <div style={{ position: 'absolute', inset: 0, width: `${(v.bruto / max) * 100}%`, background: 'var(--brand-soft)', borderRadius: 6 }} />
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${(v.liq / max) * 100}%`, background: 'var(--brand)', borderRadius: 6 }} />
            </div>
            <span className="bold right" style={{ width: 92 }}>{money(v.liq, hide)}</span>
          </div>
        ))}
      </div>
      <div className="row small muted" style={{ marginTop: 10, gap: 16 }}>
        <span><span style={{ color: 'var(--brand)' }}>■</span> Líquido</span>
        <span><span style={{ color: 'var(--brand-soft)' }}>■</span> Bruto</span>
      </div>
      <div className="stats">
        <div className="stat"><div className="label">Bruto em {year}</div><div className="value">{money(ytd.bruto, hide)}</div></div>
        <div className="stat"><div className="label">Líquido em {year}</div><div className="value income">{money(ytd.liq, hide)}</div></div>
      </div>
    </div>
  );
}

// ---------------- Edição / revisão ----------------

function PayslipEditor({ draft, warnings, confidence, isNew, onDone }: { draft: Payslip; warnings: string[]; confidence?: number; isNew: boolean; onDone: (id?: string) => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [p, setP] = useState<Payslip>(draft);
  const [launch, setLaunch] = useState(isNew || !!draft.transactionId);
  const [payDate, setPayDate] = useState(() => {
    const existing = data.transactions.find((t) => t.id === draft.transactionId);
    // salário costuma ser pago até o 5º dia útil do mês seguinte
    return existing?.date ?? (draft.month >= currentMonth() ? todayISO() : dateInMonth(addMonths(draft.month, 1), 5));
  });

  const bruto = sumKind(p.items, 'provento');
  const desc = sumKind(p.items, 'desconto');
  const liquido = round2(bruto - desc);

  const setItem = (id: string, patch: Partial<PayslipItem>) => setP({ ...p, items: p.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
  const addItem = (kind: PayslipItemKind) => setP({ ...p, items: [...p.items, { id: uid(), description: '', amount: 0, kind }] });
  const removeItem = (id: string) => setP({ ...p, items: p.items.filter((i) => i.id !== id) });

  const save = () => {
    const items = p.items.filter((i) => i.description.trim() && i.amount > 0);
    const payslip: Payslip = { ...p, items, summary: { ...p.summary, liquido: p.summary.liquido ?? liquido } };
    let tx;
    if (launch && payslip.summary.liquido! > 0) {
      const existing = data.transactions.find((t) => t.id === p.transactionId);
      tx = {
        id: existing?.id ?? uid(),
        type: 'income' as const,
        description: `${p.kind === 'Mensal' ? 'Salário' : p.kind} ${monthLabel(p.month, true)}${p.employer ? ` – ${p.employer}` : ''}`,
        amount: payslip.summary.liquido!,
        date: payDate,
        categoryId: 'salario',
        method: 'transferencia' as const,
        paid: payDate <= todayISO(),
        payslipId: p.id,
        createdAt: existing?.createdAt ?? new Date().toISOString(),
      };
      payslip.transactionId = tx.id;
    }
    dispatch({ type: 'payslip/save', payslip, tx });
    toast(tx ? 'Contracheque salvo e salário lançado nas receitas' : 'Contracheque salvo');
    onDone(payslip.id);
  };

  const numberInput = (value: number | undefined, onChange: (v: number | undefined) => void) => (
    <MoneyInput value={value} onChange={onChange} />
  );

  return (
    <div className="screen">
      <div className="row between">
        <button className="btn ghost" onClick={() => onDone(isNew ? undefined : p.id)}>‹ Voltar</button>
        <span className="small muted ellipsis">{p.fileName}</span>
      </div>

      {confidence !== undefined && (
        <div className={`notice ${confidence >= 0.8 && warnings.length === 0 ? 'info' : ''}`}>
          {confidence >= 0.8 && warnings.length === 0
            ? '✅ Leitura conferida: os totais batem com o documento. Revise e salve.'
            : 'Revise os dados abaixo antes de salvar.'}
          {warnings.map((w) => <div key={w}>• {w}</div>)}
        </div>
      )}

      <div className="card col">
        <h2>Dados</h2>
        <div className="row">
          <label className="field grow"><span>Competência</span><input className="input" type="month" value={p.month} onChange={(e) => setP({ ...p, month: e.target.value })} /></label>
          <label className="field grow">
            <span>Tipo</span>
            <select className="input" value={p.kind} onChange={(e) => setP({ ...p, kind: e.target.value })}>
              {['Mensal', 'Adiantamento', 'Férias', '13º salário', '13º salário (1ª parcela)', '13º salário (2ª parcela)', 'PLR', 'Rescisão'].map((k) => <option key={k}>{k}</option>)}
            </select>
          </label>
        </div>
        <label className="field"><span>Empresa / órgão</span><input className="input" value={p.employer ?? ''} onChange={(e) => setP({ ...p, employer: e.target.value })} /></label>
        <div className="row">
          <label className="field grow"><span>Funcionário</span><input className="input" value={p.employee ?? ''} onChange={(e) => setP({ ...p, employee: e.target.value })} /></label>
          <label className="field grow"><span>Cargo</span><input className="input" value={p.role ?? ''} onChange={(e) => setP({ ...p, role: e.target.value })} /></label>
        </div>
      </div>

      {(['provento', 'desconto', 'informativo'] as PayslipItemKind[]).map((kind) => {
        const items = p.items.filter((i) => i.kind === kind);
        if (kind === 'informativo' && !items.length) return null;
        return (
          <div className="card" key={kind}>
            <div className="row between">
              <h2>{kind === 'provento' ? 'Proventos' : kind === 'desconto' ? 'Descontos' : 'Informativos'}</h2>
              <span className={`bold ${kind === 'provento' ? 'income' : kind === 'desconto' ? 'expense' : ''}`}>{money(sumKind(p.items, kind))}</span>
            </div>
            <table className="items">
              <tbody>
                {items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <input className="input" value={i.description} placeholder="Descrição" onChange={(e) => setItem(i.id, { description: e.target.value })} />
                      {i.reference && <div className="tiny muted">ref. {i.reference}</div>}
                    </td>
                    <td className="amount-cell"><MoneyInput value={i.amount} onChange={(v) => setItem(i.id, { amount: v ?? 0 })} /></td>
                    <td style={{ width: 44 }}>
                      <select className="input" style={{ padding: 4, minWidth: 40 }} aria-label="Tipo" value={i.kind} onChange={(e) => setItem(i.id, { kind: e.target.value as PayslipItemKind })}>
                        <option value="provento">+</option>
                        <option value="desconto">−</option>
                        <option value="informativo">i</option>
                      </select>
                    </td>
                    <td style={{ width: 36 }}><button className="icon-btn" style={{ width: 32, height: 32, fontSize: 14 }} onClick={() => removeItem(i.id)} aria-label="Remover">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {kind !== 'informativo' && <button className="btn ghost" onClick={() => addItem(kind)}>+ Adicionar {kind}</button>}
          </div>
        );
      })}

      <div className="card col">
        <h2>Totais e bases (como no documento)</h2>
        <div className="row">
          <label className="field grow"><span>Líquido do documento</span>{numberInput(p.summary.liquido, (v) => setP({ ...p, summary: { ...p.summary, liquido: v } }))}</label>
          <label className="field grow"><span>Salário base</span>{numberInput(p.summary.salarioBase, (v) => setP({ ...p, summary: { ...p.summary, salarioBase: v } }))}</label>
        </div>
        <div className="row">
          <label className="field grow"><span>Base INSS</span>{numberInput(p.summary.baseInss, (v) => setP({ ...p, summary: { ...p.summary, baseInss: v } }))}</label>
          <label className="field grow"><span>Base FGTS</span>{numberInput(p.summary.baseFgts, (v) => setP({ ...p, summary: { ...p.summary, baseFgts: v } }))}</label>
        </div>
        <div className="row">
          <label className="field grow"><span>FGTS do mês</span>{numberInput(p.summary.fgtsMes, (v) => setP({ ...p, summary: { ...p.summary, fgtsMes: v } }))}</label>
          <label className="field grow"><span>Base IRRF</span>{numberInput(p.summary.baseIrrf, (v) => setP({ ...p, summary: { ...p.summary, baseIrrf: v } }))}</label>
        </div>
        <div className="stats">
          <div className="stat"><div className="label">Bruto (soma)</div><div className="value income">{money(bruto)}</div></div>
          <div className="stat"><div className="label">Líquido (calculado)</div><div className="value">{money(liquido)}</div></div>
        </div>
      </div>

      <div className="card col">
        <label className="check"><input type="checkbox" checked={launch} onChange={(e) => setLaunch(e.target.checked)} />Lançar o líquido como receita</label>
        {launch && <label className="field"><span>Data do pagamento</span><input className="input" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} /></label>}
        <button className="btn block" onClick={save}>Salvar contracheque</button>
      </div>
    </div>
  );
}

function MoneyInput({ value, onChange }: { value: number | undefined; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState(value !== undefined ? decimal(value) : '');
  return (
    <input
      className="input right"
      inputMode="decimal"
      placeholder="0,00"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseMoney(e.target.value);
        onChange(e.target.value.trim() === '' ? undefined : n === null ? value : Math.abs(n));
      }}
      onBlur={() => value !== undefined && setText(decimal(value))}
    />
  );
}

// ---------------- Detalhe / auditoria ----------------

const STATUS_BADGE: Record<CheckStatus, [string, string]> = { ok: ['ok', 'Confere'], warn: ['warn', 'Verificar'], info: ['', 'Info'] };

function PayslipDetail({ payslip: p, onBack, onEdit }: { payslip: Payslip; onBack: () => void; onEdit: () => void }) {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const hide = data.settings.hideValues;
  const a = analyzePayslip(p, data.settings.dependents);
  const previous = [...data.payslips].filter((x) => x.kind === p.kind && x.month < p.month).sort((x, y) => y.month.localeCompare(x.month))[0];
  const prevA = previous ? analyzePayslip(previous, data.settings.dependents) : null;

  const remove = () => {
    const withTx = !!p.transactionId && confirm('Excluir também a receita lançada a partir deste contracheque?');
    if (!confirm('Excluir este contracheque?')) return;
    dispatch({ type: 'payslip/delete', id: p.id, withTx });
    toast('Contracheque excluído');
    onBack();
  };

  const changes = useMemo(() => {
    if (!previous) return [];
    const key = (i: PayslipItem) => `${i.kind}:${i.description.toLowerCase()}`;
    const prevMap = new Map(previous.items.map((i) => [key(i), i.amount]));
    const curMap = new Map(p.items.map((i) => [key(i), i.amount]));
    const out: { label: string; kind: PayslipItemKind; before: number; after: number }[] = [];
    for (const i of p.items) {
      const before = prevMap.get(key(i)) ?? 0;
      if (Math.abs(before - i.amount) >= 0.01) out.push({ label: i.description, kind: i.kind, before, after: i.amount });
    }
    for (const i of previous.items) if (!curMap.has(key(i))) out.push({ label: i.description, kind: i.kind, before: i.amount, after: 0 });
    return out.sort((x, y) => Math.abs(y.after - y.before) - Math.abs(x.after - x.before)).slice(0, 8);
  }, [p, previous]);

  return (
    <div className="screen">
      <div className="row between">
        <button className="btn ghost" onClick={onBack}>‹ Contracheques</button>
        <button className="btn ghost" onClick={onEdit}>Editar</button>
      </div>

      <div className="card">
        <h3>{p.kind} · {monthLabel(p.month)}</h3>
        <div className="balance income">{money(a.liquido, hide)}</div>
        <div className="small muted">{[p.employer, p.employee, p.role].filter(Boolean).join(' · ')}</div>
        <div className="stats">
          <div className="stat"><div className="label">Bruto</div><div className="value">{money(a.bruto, hide)}</div></div>
          <div className="stat"><div className="label">Descontos ({percent(a.descontoPct, 0)})</div><div className="value expense">{money(a.descontos, hide)}</div></div>
          <div className="stat"><div className="label">FGTS depositado (8%)</div><div className="value">{money(a.fgts.found ?? a.fgts.expected, hide)}</div></div>
          {a.hourlyRate !== undefined && <div className="stat"><div className="label">Valor da hora (220h)</div><div className="value">{money(a.hourlyRate, hide)}</div></div>}
        </div>
        {prevA && (
          <div className="small" style={{ marginTop: 10 }}>
            Em relação a {monthLabel(previous!.month).toLowerCase()}: líquido{' '}
            <b className={a.liquido >= prevA.liquido ? 'income' : 'expense'}>
              {a.liquido >= prevA.liquido ? '+' : '−'}{money(Math.abs(a.liquido - prevA.liquido), hide)}
            </b>
          </div>
        )}
      </div>

      <div className="card">
        <h2>🔍 Conferência automática</h2>
        <div className="list">
          {a.checks.map((c) => (
            <div key={c.label} className="list-item" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row between">
                  <span className="bold">{c.label}</span>
                  <span className={`badge ${STATUS_BADGE[c.status][0]}`}>{STATUS_BADGE[c.status][1]}</span>
                </div>
                {(c.found !== undefined || c.expected !== undefined) && (
                  <div className="small">
                    {c.found !== undefined && <>No documento: <b>{money(c.found, hide)}</b></>}
                    {c.expected !== undefined && c.status !== 'ok' && <> · Calculado: <b>{money(c.expected, hide)}</b></>}
                  </div>
                )}
                <div className="tiny muted">{c.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="tiny muted" style={{ marginTop: 8 }}>Dependentes para IR: {data.settings.dependents} (altere em Ajustes). Os cálculos são estimativas baseadas nas tabelas oficiais vigentes.</div>
      </div>

      <div className="card">
        <h2>Para onde vai o seu salário bruto</h2>
        <div className="col" style={{ gap: 6 }}>
          {[...a.biggestDiscounts.map((i) => ({ label: i.description, v: i.amount, color: 'var(--expense)' })), { label: 'Líquido (você recebe)', v: a.liquidoCalc, color: 'var(--income)' }].map((x) => (
            <div key={x.label} className="col" style={{ gap: 2 }}>
              <div className="row between small"><span className="ellipsis">{x.label}</span><span className="bold">{money(x.v, hide)} <span className="muted">({a.bruto ? percent(x.v / a.bruto, 0) : '0%'})</span></span></div>
              <div className="progress"><div style={{ width: `${a.bruto ? Math.min(100, (x.v / a.bruto) * 100) : 0}%`, background: x.color }} /></div>
            </div>
          ))}
        </div>
      </div>

      {changes.length > 0 && (
        <div className="card">
          <h2>O que mudou desde {monthLabel(previous!.month, true)}</h2>
          <table className="items small">
            <tbody>
              {changes.map((c) => {
                const delta = c.after - c.before;
                const good = c.kind === 'provento' ? delta > 0 : delta < 0;
                return (
                  <tr key={c.label + c.kind}>
                    <td>{c.label}<div className="tiny muted">{c.kind}</div></td>
                    <td className="right muted">{money(c.before, hide)} → {money(c.after, hide)}</td>
                    <td className={`right bold ${good ? 'income' : 'expense'}`}>{delta > 0 ? '+' : '−'}{money(Math.abs(delta), hide)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <h2>Rubricas</h2>
        <table className="items">
          <tbody>
            {p.items.map((i) => (
              <tr key={i.id}>
                <td>{i.code && <span className="tiny muted">{i.code} </span>}{i.description}{i.reference && <div className="tiny muted">ref. {i.reference}</div>}</td>
                <td className={`right bold ${i.kind === 'provento' ? 'income' : i.kind === 'desconto' ? 'expense' : 'muted'}`}>
                  {i.kind === 'desconto' ? '−' : i.kind === 'provento' ? '+' : ''}{money(i.amount, hide)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button className="btn danger block" onClick={remove}>Excluir contracheque</button>
    </div>
  );
}
