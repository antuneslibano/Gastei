import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { checkForUpdate, type AvailableUpdate } from '../lib/updates';

const SNOOZE_KEY = 'gastei:update-snooze';

export async function openDownload(url: string) {
  if (Capacitor.isNativePlatform()) {
    const { Browser } = await import('@capacitor/browser');
    await Browser.open({ url });
  } else {
    window.open(url, '_blank', 'noopener');
  }
}

/** Aviso de nova versão: verifica ao abrir o app e sempre que ele volta para a tela. */
export function UpdateBanner() {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  const check = useCallback(() => {
    // Atualização por APK só faz sentido no app Android instalado.
    if (Capacitor.getPlatform() !== 'android') return;
    checkForUpdate(__APP_VERSION__)
      .then((u) => setUpdate(u && localStorage.getItem(SNOOZE_KEY) !== u.version ? u : null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    check();
    let remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      import('@capacitor/app').then(({ App }) =>
        App.addListener('resume', check).then((h) => { remove = () => h.remove(); }),
      );
    }
    return () => remove?.();
  }, [check]);

  if (!update) return null;

  return (
    <div className="card col" style={{ background: 'var(--brand-soft)', borderColor: 'var(--brand)' }}>
      <div className="bold">🚀 Nova versão disponível: {update.version}</div>
      <div className="small">Baixe e instale por cima. Seus dados continuam salvos.</div>
      <div className="row">
        <button className="btn grow" onClick={() => openDownload(update.downloadUrl)}>Baixar atualização</button>
        <button className="btn secondary" onClick={() => { localStorage.setItem(SNOOZE_KEY, update.version); setUpdate(null); }}>Depois</button>
      </div>
    </div>
  );
}
