'use client';
import React from 'react';

type BarDatum = Record<string, string | number | boolean | undefined>;

export function RevenueLineChart({ data, height = 260 }: { data: { m: string; v: number }[]; height?: number }) {
  const w = 560, h = height;
  const pad = { l: 44, r: 20, t: 24, b: 32 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const vals = data.map(d => d.v);
  const max = Math.ceil(Math.max(...vals) / 50) * 50 + 50;
  const x = (i: number) => pad.l + (i / (data.length - 1)) * innerW;
  const y = (v: number) => pad.t + (1 - v / max) * innerH;
  const points = data.map((d, i) => [x(i), y(d.v)] as [number, number]);
  const line = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  const area = line + ` L ${x(data.length - 1)},${pad.t + innerH} L ${x(0)},${pad.t + innerH} Z`;
  const ticks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
      <defs>
        <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {ticks.map(t => (
        <g key={t}>
          <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeDasharray="3 3" />
          <text x={pad.l - 10} y={y(t) + 4} fontSize="10" textAnchor="end" fill="var(--text-muted)" fontFamily="JetBrains Mono, monospace">{t}k</text>
        </g>
      ))}
      <path d={area} fill="url(#revGrad)" />
      <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="4" fill="var(--bg-elev)" stroke="var(--brand)" strokeWidth="2" />
          <text x={p[0]} y={h - pad.b + 18} fontSize="11" textAnchor="middle" fill="var(--text-muted)">{data[i].m}</text>
          {i === data.length - 1 && (
            <g>
              <rect x={p[0] - 34} y={p[1] - 30} width="68" height="22" rx="5" fill="#0F172A" />
              <text x={p[0]} y={p[1] - 15} fontSize="11" textAnchor="middle" fill="#fff" fontWeight="600">Rs. {data[i].v}k</text>
            </g>
          )}
        </g>
      ))}
    </svg>
  );
}

export function Donut({ segments, size = 200, thickness = 28, center }: {
  segments: { label: string; value: number; color: string }[];
  size?: number; thickness?: number;
  center?: { value: number | string; label: string };
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = size / 2 - thickness / 2;
  const cx = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--bg-muted)" strokeWidth={thickness} />
      {segments.map((s, i) => {
        const frac = s.value / total;
        const dash = frac * circ;
        const el = (
          <circle key={i} cx={cx} cy={cy} r={r} fill="none"
            stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${dash} ${circ - dash}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            strokeLinecap="butt"
          />
        );
        offset += dash;
        return el;
      })}
      {center && (
        <g>
          <text x={cx} y={cy - 2} fontSize="22" textAnchor="middle" fill="var(--text)" fontWeight="600" style={{ letterSpacing: '-0.02em' }}>{center.value}</text>
          <text x={cx} y={cy + 16} fontSize="11" textAnchor="middle" fill="var(--text-muted)">{center.label}</text>
        </g>
      )}
    </svg>
  );
}

export function BarChart({ data, height = 220, accent, labelKey = 'd', valueKey = 'v', unit = 'k' }: {
  data: BarDatum[];
  height?: number; accent?: string; labelKey?: string; valueKey?: string; unit?: string;
}) {
  const fill = accent || 'var(--brand)';
  const w = 640, h = height;
  const pad = { l: 40, r: 16, t: 20, b: 30 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const max = Math.ceil(Math.max(...data.map(d => Number(d[valueKey] ?? 0))) / 20) * 20 + 20;
  const barW = innerW / data.length * 0.58;
  const gap = innerW / data.length;
  const ticks = [0, Math.round(max / 2), max];
  const hatchId = `hatch-${Math.random().toString(36).slice(2, 8)}`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} style={{ display: 'block' }}>
      <defs>
        <pattern id={hatchId} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
          <rect width="6" height="6" fill={fill} />
          <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(255,255,255,0.35)" strokeWidth="3" />
        </pattern>
      </defs>
      {ticks.map(tk => {
        const yy = pad.t + (1 - tk / max) * innerH;
        return (
          <g key={tk}>
            <line x1={pad.l} x2={w - pad.r} y1={yy} y2={yy} stroke="var(--border)" strokeDasharray="3 3" />
            <text x={pad.l - 8} y={yy + 4} fontSize="10" textAnchor="end" fill="var(--text-muted)" fontFamily="JetBrains Mono, monospace">{tk}{unit}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const bx = pad.l + i * gap + gap / 2 - barW / 2;
        const value = Number(d[valueKey] ?? 0);
        const bh = (value / max) * innerH;
        const yy = pad.t + innerH - bh;
        const rx = barW / 2;
        return (
          <g key={i}>
            <rect x={bx} y={yy} width={barW} height={bh} fill={fill} rx={rx} opacity={d.highlight ? 1 : 0.85} />
            <text x={bx + barW / 2} y={h - pad.b + 16} fontSize="11" textAnchor="middle" fill="var(--text-muted)">{String(d[labelKey] ?? '')}</text>
            <text x={bx + barW / 2} y={yy - 6} fontSize="10" textAnchor="middle" fill="var(--text)" fontWeight="600" fontFamily="JetBrains Mono, monospace">{value}{unit}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function Sparkline({ data, color = '#F05A2B', width = 120, height = 30 }: {
  data: number[]; color?: string; width?: number; height?: number;
}) {
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const px = (i / (data.length - 1)) * width;
    const py = height - ((v - min) / range) * height;
    return [px, py] as [number, number];
  });
  const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0] + ',' + p[1]).join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <path d={`${d} L ${width},${height} L 0,${height} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
