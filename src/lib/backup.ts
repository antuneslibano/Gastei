import { Capacitor } from '@capacitor/core';
import type { AppData } from './types';
import { categoryOf } from './selectors';
import { migrate } from './storage';

/** Salva/compartilha um arquivo. No Android usa a folha de compartilhamento; no navegador faz download. */
export async function shareFile(name: string, content: string, mime: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    const { Share } = await import('@capacitor/share');
    const res = await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    await Share.share({ title: name, files: [res.uri] });
    return;
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function backupJson(data: AppData): string {
  return JSON.stringify({ app: 'gastei', exportedAt: new Date().toISOString(), data }, null, 2);
}

export function parseBackup(text: string): AppData {
  const parsed = JSON.parse(text);
  if (parsed?.app !== 'gastei' || !parsed.data) throw new Error('Arquivo não é um backup do Gastei');
  return migrate(parsed.data);
}

export function transactionsCsv(data: AppData): string {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const rows = [['Data', 'Tipo', 'Descrição', 'Categoria', 'Forma', 'Valor', 'Pago', 'Parcela', 'Observações'].join(';')];
  for (const t of [...data.transactions].sort((a, b) => a.date.localeCompare(b.date))) {
    rows.push([
      t.date,
      t.type === 'income' ? 'Receita' : 'Gasto',
      esc(t.description),
      esc(categoryOf(data, t.categoryId).name),
      t.method,
      (t.type === 'income' ? t.amount : -t.amount).toFixed(2).replace('.', ','),
      t.paid ? 'Sim' : 'Não',
      t.installment ? `${t.installment.index}/${t.installment.total}` : '',
      esc(t.notes ?? ''),
    ].join(';'));
  }
  return '﻿' + rows.join('\n');
}
