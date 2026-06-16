// Dependency-free SVG charts. Server-renderable (no hooks).

export interface Point {
  label: string;
  value: number;
}

function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

// ---------------------------------------------------------------------------
// Area + line trend chart (responsive width)
// ---------------------------------------------------------------------------
export function AreaChart({
  data,
  color = "#428fdf",
  height = 200,
  valueFormat = (n) => String(n),
}: {
  data: Point[];
  color?: string;
  height?: number;
  valueFormat?: (n: number) => string;
}) {
  const W = 760;
  const H = height;
  const padX = 8;
  const padTop = 16;
  const padBottom = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerH = H - padTop - padBottom;
  const stepX = data.length > 1 ? (W - padX * 2) / (data.length - 1) : 0;

  const pts = data.map((d, i) => ({
    x: padX + i * stepX,
    y: padTop + innerH - (d.value / max) * innerH,
  }));
  const line = smoothPath(pts);
  const area =
    pts.length > 0
      ? `${line} L ${pts[pts.length - 1].x} ${padTop + innerH} L ${pts[0].x} ${padTop + innerH} Z`
      : "";
  const gid = `area-${color.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={padX}
          x2={W - padX}
          y1={padTop + innerH * g}
          y2={padTop + innerH * g}
          stroke="var(--border)"
          strokeWidth="1"
          strokeDasharray="3 5"
        />
      ))}
      {area && <path d={area} fill={`url(#${gid})`} />}
      {line && <path d={line} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />}
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="3.5" fill="var(--surface)" stroke={color} strokeWidth="2" />
          <title>{`${data[i].label}: ${valueFormat(data[i].value)}`}</title>
        </g>
      ))}
      {data.map((d, i) => (
        <text
          key={i}
          x={pts[i].x}
          y={H - 8}
          textAnchor="middle"
          fontSize="11"
          fill="var(--muted)"
        >
          {d.label}
        </text>
      ))}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Vertical bar chart
// ---------------------------------------------------------------------------
export function BarChart({
  data,
  color = "#8b5cf6",
  height = 200,
  valueFormat = (n) => String(n),
}: {
  data: Point[];
  color?: string;
  height?: number;
  valueFormat?: (n: number) => string;
}) {
  const W = 760;
  const H = height;
  const padX = 8;
  const padTop = 14;
  const padBottom = 28;
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerH = H - padTop - padBottom;
  const slot = (W - padX * 2) / data.length;
  const bw = Math.min(slot * 0.5, 34);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1={padX} x2={W - padX} y1={padTop + innerH * (1 - g)} y2={padTop + innerH * (1 - g)} stroke="var(--border)" strokeWidth="1" strokeDasharray="3 5" />
      ))}
      {data.map((d, i) => {
        const h = (d.value / max) * innerH;
        const x = padX + slot * i + (slot - bw) / 2;
        const y = padTop + innerH - h;
        return (
          <g key={i}>
            <rect x={x} y={y} width={bw} height={Math.max(h, d.value > 0 ? 3 : 0)} rx="4" fill={color} opacity={0.85}>
              <title>{`${d.label}: ${valueFormat(d.value)}`}</title>
            </rect>
            <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="11" fill="var(--muted)">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Inline sparkline (for KPI cards)
// ---------------------------------------------------------------------------
export function Sparkline({
  data,
  color = "#428fdf",
  width = 96,
  height = 30,
}: {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}) {
  if (data.length === 0) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;
  const pts = data.map((v, i) => ({
    x: i * stepX,
    y: height - ((v - min) / range) * height,
  }));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={smoothPath(pts)} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
