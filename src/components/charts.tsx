"use client";

// Hand-rolled SVG charts, ported 1:1 (same padding/scaling math) from the
// prototype's barChartV/barChartH/pieChart/lineChartMulti so the rebuild's
// charts look and behave exactly like hours-ledger.html's. No charting
// library — the prototype didn't use one either.

export type ChartDatum = { label: string; value: number; color: string };

function niceMax(max: number) {
  return Math.ceil(max / 5) * 5 || 1;
}

// ---------------------------------------------------------------- Bar (vertical)
export function BarChartV({
  data,
  fmt,
  width = 560,
  height = 260,
  xLabel,
  yLabel,
}: {
  data: ChartDatum[];
  fmt?: (v: number) => string;
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  const showXLabel = !!xLabel,
    showYLabel = !!yLabel;
  const w = width,
    h = height;
  const padL = 40 + (showYLabel ? 16 : 0),
    padR = 14,
    padT = 14,
    padB = 60 + (showXLabel ? 14 : 0);
  const plotW = w - padL - padR,
    plotH = h - padT - padB;
  const n = data.length;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const nMax = niceMax(max);
  const slot = n ? plotW / n : plotW;
  const barW = Math.max(10, Math.min(48, slot * 0.55));
  const baseline = padT + plotH;
  const Y = (v: number) => padT + plotH - (v / nMax) * plotH;
  const fmtFn = fmt ?? ((v: number) => String(v));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} height={h}>
      <line className="axisline" x1={padL} x2={padL} y1={padT} y2={baseline} stroke="var(--border-strong,#c3c2b7)" />
      <line className="axisline" x1={padL} x2={w - padR} y1={baseline} y2={baseline} stroke="var(--border-strong,#c3c2b7)" />
      {[0, 1, 2, 3, 4].map((g) => {
        const gv = (nMax * g) / 4;
        const gy = Y(gv);
        return (
          <g key={g}>
            <line x1={padL} x2={w - padR} y1={gy} y2={gy} stroke="#e1e0d9" strokeWidth={1} />
            <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#898781">
              {Math.round(gv)}
            </text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const cx = padL + slot * i + slot / 2;
        const by = Y(d.value);
        const bh = Math.max(1, baseline - by);
        const lY = baseline + 14;
        return (
          <g key={i}>
            <rect x={cx - barW / 2} y={by} width={barW} height={bh} rx={4} fill={d.color} />
            <text x={cx} y={by - 6} textAnchor="middle" fontSize={10.5} fontWeight={600} fill="#0b0b0b">
              {fmtFn(d.value)}
            </text>
            <text
              x={cx}
              y={lY}
              textAnchor="end"
              fontSize={10}
              fill="#52514e"
              transform={`rotate(-35 ${cx} ${lY})`}
            >
              {d.label}
            </text>
          </g>
        );
      })}
      {showYLabel && (
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize={10.5}
          fill="#898781"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}
      {showXLabel && (
        <text x={padL + plotW / 2} y={h - 6} textAnchor="middle" fontSize={10.5} fill="#898781">
          {xLabel}
        </text>
      )}
    </svg>
  );
}

// --------------------------------------------------------------- Bar (horizontal)
export function BarChartH({
  data,
  fmt,
  width = 560,
  leftLabelW = 120,
}: {
  data: ChartDatum[];
  fmt?: (v: number) => string;
  width?: number;
  leftLabelW?: number;
}) {
  const w = width,
    barH = 20,
    gap = 12,
    rightPad = 64;
  const max = Math.max(...data.map((d) => d.value), 0.0001);
  const h = data.length * (barH + gap) + 10;
  const plotW = w - leftLabelW - rightPad;
  const fmtFn = fmt ?? ((v: number) => String(v));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} height={h}>
      {data.map((d, i) => {
        const y = i * (barH + gap) + 6;
        const bw = Math.max(2, (d.value / max) * plotW);
        return (
          <g key={i}>
            <text x={leftLabelW - 8} y={y + barH * 0.7} textAnchor="end" fontSize={11} fill="#52514e">
              {d.label}
            </text>
            <rect x={leftLabelW} y={y} width={bw} height={barH} rx={4} fill={d.color} />
            <text x={leftLabelW + bw + 8} y={y + barH * 0.7} fontSize={11} fontWeight={600} fill="#0b0b0b">
              {fmtFn(d.value)}
            </text>
          </g>
        );
      })}
      {data.length === 0 && (
        <text x={leftLabelW} y={16} fontSize={12} fill="#898781">
          No data.
        </text>
      )}
    </svg>
  );
}

// -------------------------------------------------------------------------- Pie
export function PieChartWithLegend({
  data,
  width = 220,
  height = 220,
}: {
  data: ChartDatum[];
  width?: number;
  height?: number;
}) {
  const w = width,
    h = height;
  const cx = w / 2,
    cy = h / 2,
    r = Math.min(cx, cy) - 6;
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  let angle = -Math.PI / 2;
  const slices: React.ReactNode[] = [];
  data.forEach((d, i) => {
    const frac = d.value / total;
    if (frac <= 0) return;
    if (frac >= 0.99995) {
      slices.push(<circle key={i} cx={cx} cy={cy} r={r} fill={d.color} />);
      return;
    }
    const a0 = angle,
      a1 = angle + frac * Math.PI * 2;
    angle = a1;
    const x0 = cx + r * Math.cos(a0),
      y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1),
      y1 = cy + r * Math.sin(a1);
    const large = a1 - a0 > Math.PI ? 1 : 0;
    slices.push(
      <path
        key={i}
        d={`M${cx},${cy} L${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)} Z`}
        fill={d.color}
        stroke="#fcfcfb"
        strokeWidth={1.5}
      />
    );
  });

  return (
    <div className="flex gap-5 flex-wrap items-start">
      <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ flex: "0 0 auto" }}>
        {slices}
      </svg>
      <div className="flex flex-col items-start gap-1.5 overflow-y-auto pr-1" style={{ maxHeight: h }}>
        {data.map((d, i) => {
          const pct = total ? (d.value / total) * 100 : 0;
          return (
            <span key={i} className="flex items-center gap-1.5 text-[12px]">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: d.color }} />
              {d.label} · <span className="tabular-nums">{d.value.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1")}h</span>{" "}
              <span className="text-[#898781]">({pct.toFixed(0)}%)</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------- Line (multi)
export function LineChartMulti({
  series,
  labels,
  width = 640,
  height = 220,
  xLabel,
  yLabel,
}: {
  series: { name: string; color: string; values: number[] }[];
  labels: string[];
  width?: number;
  height?: number;
  xLabel?: string;
  yLabel?: string;
}) {
  const showXLabel = !!xLabel,
    showYLabel = !!yLabel;
  const w = width,
    h = height;
  const padL = 40 + (showYLabel ? 16 : 0),
    padR = 14,
    padT = 14,
    padB = 26 + (showXLabel ? 14 : 0);
  const plotW = w - padL - padR,
    plotH = h - padT - padB;
  let max = 0;
  series.forEach((s) => s.values.forEach((v) => { if (v > max) max = v; }));
  max = max <= 0 ? 1 : max;
  const nMax = niceMax(max);
  const n = labels.length;
  const X = (i: number) => padL + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const Y = (v: number) => padT + plotH - (v / nMax) * plotH;
  const step = Math.max(1, Math.ceil(n / 7));
  const xTickY = h - 6 - (showXLabel ? 14 : 0);

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} height={h}>
      <line x1={padL} x2={padL} y1={padT} y2={h - padB} stroke="var(--border-strong,#c3c2b7)" />
      <line x1={padL} x2={w - padR} y1={h - padB} y2={h - padB} stroke="var(--border-strong,#c3c2b7)" />
      {[0, 1, 2, 3, 4].map((g) => {
        const gv = (nMax * g) / 4;
        const gy = Y(gv);
        return (
          <g key={g}>
            <line x1={padL} x2={w - padR} y1={gy} y2={gy} stroke="#e1e0d9" strokeWidth={1} />
            <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={10} fill="#898781">
              {Math.round(gv)}
            </text>
          </g>
        );
      })}
      {labels.map((lbl, i) =>
        i % step === 0 ? (
          <text key={i} x={X(i)} y={xTickY} textAnchor="middle" fontSize={10} fill="#898781">
            {lbl}
          </text>
        ) : null
      )}
      {showXLabel && (
        <text x={padL + plotW / 2} y={h - 6} textAnchor="middle" fontSize={10.5} fill="#898781">
          {xLabel}
        </text>
      )}
      {showYLabel && (
        <text
          x={12}
          y={padT + plotH / 2}
          textAnchor="middle"
          fontSize={10.5}
          fill="#898781"
          transform={`rotate(-90 12 ${padT + plotH / 2})`}
        >
          {yLabel}
        </text>
      )}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
        const last = s.values.length - 1;
        return (
          <g key={si}>
            <polyline points={pts} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {last >= 0 && <circle cx={X(last)} cy={Y(s.values[last])} r={4} fill={s.color} stroke="#fcfcfb" strokeWidth={2} />}
          </g>
        );
      })}
    </svg>
  );
}

export function ChartLegend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5 text-[11.5px] text-[#52514e]">
          <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: it.color }} />
          {it.name}
        </span>
      ))}
    </div>
  );
}
