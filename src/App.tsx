import { useEffect, useState } from 'react';
import { useStore } from './lib/store';
import { currentMonth } from './lib/dates';
import type { Transaction } from './lib/types';
import { Dashboard } from './screens/Dashboard';
import { Transactions } from './screens/Transactions';
import { Payslips } from './screens/Payslips';
import { Planning } from './screens/Planning';
import { Settings } from './screens/Settings';
import { TxForm } from './components/TxForm';
import { useToast } from './components/Toast';
import { ErrorBoundary } from './components/ErrorBoundary';

type Tab = 'home' | 'transactions' | 'payslips' | 'planning' | 'settings';

const TABS: { id: Tab; label: string; icon: string; title: string }[] = [
  { id: 'home', label: 'Início', icon: '🏠', title: 'Gastei' },
  { id: 'transactions', label: 'Lançamentos', icon: '🧾', title: 'Lançamentos' },
  { id: 'payslips', label: 'Contracheque', icon: '💼', title: 'Contracheques' },
  { id: 'planning', label: 'Planejar', icon: '🎯', title: 'Planejamento' },
  { id: 'settings', label: 'Ajustes', icon: '⚙️', title: 'Ajustes' },
];

export function App() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('home');
  const [month, setMonth] = useState(currentMonth());
  const [form, setForm] = useState<{ tx?: Transaction } | null>(null);

  // Tema
  useEffect(() => {
    const root = document.documentElement;
    if (data.settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', data.settings.theme);
  }, [data.settings.theme]);

  // Gera contas fixas ao navegar para meses futuros
  useEffect(() => {
    if (month >= currentMonth()) dispatch({ type: 'generate', month });
  }, [month, dispatch]);

  useEffect(() => window.scrollTo(0, 0), [tab]);

  const current = TABS.find((t) => t.id === tab)!;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return (
    <div className="app">
      <header className="topbar">
        {tab === 'home' ? (
          <div>
            <div className="small muted">{greeting}{data.settings.userName ? `, ${data.settings.userName}` : ''} 👋</div>
            <h1 className="logo">Gastei</h1>
          </div>
        ) : (
          <h1>{current.title}</h1>
        )}
        <button
          className="icon-btn"
          onClick={() => dispatch({ type: 'settings', settings: { hideValues: !data.settings.hideValues } })}
          aria-label={data.settings.hideValues ? 'Mostrar valores' : 'Ocultar valores'}
          title={data.settings.hideValues ? 'Mostrar valores' : 'Ocultar valores'}
        >
          {data.settings.hideValues ? '🙈' : '👁️'}
        </button>
      </header>

      <ErrorBoundary resetKey={tab} onReset={() => setTab('home')}>
      {tab === 'home' && <Dashboard month={month} setMonth={setMonth} onEdit={(tx) => setForm({ tx })} goTo={setTab} />}
      {tab === 'transactions' && <Transactions month={month} setMonth={setMonth} onEdit={(tx) => setForm({ tx })} />}
      {tab === 'payslips' && <Payslips />}
      {tab === 'planning' && <Planning month={month} setMonth={setMonth} />}
      {tab === 'settings' && <Settings />}
      </ErrorBoundary>

      {(tab === 'home' || tab === 'transactions') && (
        <button className="fab" onClick={() => setForm({})} aria-label="Novo lançamento">+</button>
      )}

      {form && <TxForm tx={form.tx} onClose={() => setForm(null)} onSaved={toast} />}

      <nav className="bottom-nav">
        <div className="inner">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              <span className="ico">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
