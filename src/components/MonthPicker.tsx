import { addMonths, monthLabel } from '../lib/dates';

export function MonthPicker({ month, onChange }: { month: string; onChange: (m: string) => void }) {
  return (
    <div className="month-picker">
      <button className="icon-btn" onClick={() => onChange(addMonths(month, -1))} aria-label="Mês anterior">‹</button>
      <div className="label">{monthLabel(month)}</div>
      <button className="icon-btn" onClick={() => onChange(addMonths(month, 1))} aria-label="Próximo mês">›</button>
    </div>
  );
}
