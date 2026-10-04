import { money } from '../lib/format';

export interface Slice { label: string; value: number; color: string; icon?: string }

export function Donut({ slices, size = 140, hide = false }: { slices: Slice[]; size?: number; hide?: boolean }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="donut-wrap">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Gastos por categoria">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={18} />
        {total > 0 &&
          slices.map((s) => {
            const len = (s.value / total) * c;
            const el = (
              <circle
                key={s.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={18}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${size / 2} ${size / 2})`}
              />
            );
            offset += len;
            return el;
          })}
        <text x="50%" y="47%" textAnchor="middle" fontSize="11" fill="var(--muted)">Total</text>
        <text x="50%" y="60%" textAnchor="middle" fontSize="13" fontWeight="700" fill="var(--text)">
          {hide ? '•••' : money(total).replace(',00', '')}
        </text>
      </svg>
      <div className="legend grow">
        {slices.slice(0, 6).map((s) => (
          <div key={s.label} className="row small">
            <span className="dot" style={{ background: s.color }} />
            <span className="grow ellipsis">{s.icon} {s.label}</span>
            <span className="muted">{total ? Math.round((s.value / total) * 100) : 0}%</span>
            <span className="bold right" style={{ minWidth: 86 }}>{money(s.value, hide)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface BarGroup { label: string; a: number; b: number }

/** Barras agrupadas (ex.: receitas x despesas por mês). */
export function Bars({ data, colorA, colorB, height = 140 }: { data: BarGroup[]; colorA: string; colorB: string; height?: number }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.a, d.b]));
  const w = 100 / Math.max(1, data.length);
  return (
    <svg width="100%" height={height + 18} viewBox={`0 0 100 ${height + 18}`} preserveAspectRatio="none" role="img" aria-label="Evolução mensal">
      {data.map((d, i) => {
        const ha = (d.a / max) * height;
        const hb = (d.b / max) * height;
        const x = i * w;
        return (
          <g key={d.label}>
            <rect x={x + w * 0.18} y={height - ha} width={w * 0.3} height={ha} rx={1} fill={colorA} />
            <rect x={x + w * 0.52} y={height - hb} width={w * 0.3} height={hb} rx={1} fill={colorB} />
          </g>
        );
      })}
    </svg>
  );
}

export function BarLabels({ labels }: { labels: string[] }) {
  return (
    <div className="row tiny muted" style={{ marginTop: -14 }}>
      {labels.map((l) => (
        <span key={l} style={{ flex: 1, textAlign: 'center' }}>{l}</span>
      ))}
    </div>
  );
}
