import { useRef } from 'react';
import { useStore } from '../lib/store';
import { backupJson, parseBackup, shareFile, transactionsCsv } from '../lib/backup';
import { emptyData } from '../lib/storage';
import { todayISO } from '../lib/dates';
import { useToast } from '../components/Toast';
import type { Settings as S } from '../lib/types';

export function Settings() {
  const { data, dispatch } = useStore();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const s = data.settings;
  const set = (patch: Partial<S>) => dispatch({ type: 'settings', settings: patch });

  const importBackup = async (file?: File) => {
    if (!file) return;
    try {
      const restored = parseBackup(await file.text());
      if (!confirm('Substituir todos os dados atuais pelo backup?')) return;
      dispatch({ type: 'replace', data: restored });
      toast('Backup restaurado');
    } catch (e) {
      toast((e as Error).message || 'Arquivo inválido');
    }
  };

  return (
    <div className="screen">
      <div className="card col">
        <h2>Perfil</h2>
        <label className="field"><span>Seu nome</span><input className="input" value={s.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="Como quer ser chamado(a)?" /></label>
        <label className="field">
          <span>Dependentes para imposto de renda</span>
          <select className="input" value={s.dependents} onChange={(e) => set({ dependents: Number(e.target.value) })}>
            {Array.from({ length: 11 }, (_, i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </label>
        <div className="tiny muted">Usado na conferência do IRRF do contracheque.</div>
      </div>

      <div className="card col">
        <h2>Aparência e privacidade</h2>
        <div className="segmented">
          {([['system', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']] as [S['theme'], string][]).map(([t, l]) => (
            <button key={t} className={s.theme === t ? 'active' : ''} onClick={() => set({ theme: t })}>{l}</button>
          ))}
        </div>
        <label className="check"><input type="checkbox" checked={s.hideValues} onChange={(e) => set({ hideValues: e.target.checked })} />Ocultar valores na tela</label>
      </div>

      <div className="card col">
        <h2>Seus dados</h2>
        <div className="small muted">Nesta versão de testes, tudo fica salvo apenas neste aparelho. Faça backups regularmente.</div>
        <button className="btn secondary" onClick={() => shareFile(`gastei-backup-${todayISO()}.json`, backupJson(data), 'application/json')}>💾 Exportar backup</button>
        <button className="btn secondary" onClick={() => fileRef.current?.click()}>📂 Restaurar backup</button>
        <button className="btn secondary" onClick={() => shareFile(`gastei-lancamentos-${todayISO()}.csv`, transactionsCsv(data), 'text/csv')}>📊 Exportar planilha (CSV)</button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => { importBackup(e.target.files?.[0]); e.target.value = ''; }} />
        <button
          className="btn danger"
          onClick={() => {
            if (confirm('Apagar TODOS os dados do Gastei neste aparelho? Esta ação não pode ser desfeita.')) {
              dispatch({ type: 'replace', data: emptyData() });
              toast('Dados apagados');
            }
          }}
        >Apagar todos os dados</button>
      </div>

      <div className="card small muted">
        <div className="bold" style={{ color: 'var(--text)' }}>Gastei v{__APP_VERSION__} · versão de testes</div>
        <div>{data.transactions.length} lançamentos · {data.payslips.length} contracheques · {data.recurring.length} contas fixas</div>
        <div style={{ marginTop: 6 }}>Em breve: conta com login e verificação em duas etapas, sincronização na nuvem e assinatura.</div>
      </div>
    </div>
  );
}
