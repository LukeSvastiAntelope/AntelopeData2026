"use client";

import React from 'react';

type Props = {
  dataCards: any[];
};

const PIE_COLORS = [
  'var(--chart-2)', 'var(--chart-3)', 'var(--chart-1)', 'var(--chart-4)',
  'var(--chart-5)', 'var(--neutral-500)', 'var(--neutral-700)', 'var(--neutral-400)',
];

function polar(cx: number, cy: number, r: number, angleDeg: number): [number, number] {
  const a = ((angleDeg - 90) * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
}

// Donut arc path between two angles (degrees, clockwise from top).
function arcPath(cx: number, cy: number, rO: number, rI: number, start: number, end: number): string {
  const [x1, y1] = polar(cx, cy, rO, start);
  const [x2, y2] = polar(cx, cy, rO, end);
  const [x3, y3] = polar(cx, cy, rI, end);
  const [x4, y4] = polar(cx, cy, rI, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${rO} ${rO} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${rI} ${rI} 0 ${large} 0 ${x4} ${y4} Z`;
}

// Self-contained SVG donut pie chart + legend (no chart lib → no width-measure
// issues inside chat bubbles).
function PieChartCard({ data }: { data: Array<{ label: string; value: number }> }) {
  const clean = (data || []).filter((d) => Number(d.value) > 0);
  const total = clean.reduce((s, d) => s + Number(d.value), 0) || 1;
  let angle = 0;
  const slices = clean.map((d, i) => {
    const frac = Number(d.value) / total;
    const start = angle;
    let end = angle + frac * 360;
    angle = end;
    if (end >= 360) end = 359.999; // keep a full-circle slice renderable
    return { label: d.label, value: d.value, start, end, color: PIE_COLORS[i % PIE_COLORS.length] };
  });
  const size = 132, cx = 66, cy = 66, rO = 62, rI = 34;
  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {slices.length === 1 ? (
          <>
            <circle cx={cx} cy={cy} r={rO} fill={slices[0].color} />
            <circle cx={cx} cy={cy} r={rI} fill="var(--card)" />
          </>
        ) : (
          slices.map((s, i) => <path key={i} d={arcPath(cx, cy, rO, rI, s.start, s.end)} fill={s.color} />)
        )}
      </svg>
      <div className="space-y-1 flex-1 min-w-0">
        {slices.map((s, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="inline-block h-2.5 w-2.5 rounded-sm shrink-0" style={{ background: s.color }} />
            <span className="text-foreground truncate flex-1">{s.label}</span>
            <span className="font-medium tabular-nums">{s.value}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DataCards({ dataCards }: Props) {
  if (!dataCards || dataCards.length === 0) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4 mb-4">
      {dataCards.map((card, index) => (
        <div key={index} className="bg-muted/30 rounded-lg p-4 border">
          <h4 className="font-medium text-sm text-foreground mb-3">{card.title}</h4>

          {card.chart_type === 'horizontal_bar' && (
            <div className="space-y-3">
              {card.data.map((item: any, i: number) => (
                <div key={i} className="space-y-1">
                  <div className="flex justify-between items-center">
                    <div className="text-xs text-muted-foreground leading-tight">{item.label}</div>
                    <div className="text-xs font-medium">{item.value}%</div>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 relative">
                    <div className="bg-primary h-2 rounded-full" style={{ width: `${Math.min(item.value, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {card.chart_type === 'metric_card' && (
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.average}</div>
                <div className="text-xs text-muted-foreground">Average</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.median}</div>
                <div className="text-xs text-muted-foreground">Median</div>
              </div>
              <div>
                <div className="text-lg font-bold text-foreground">{card.data.range}</div>
                <div className="text-xs text-muted-foreground">Range</div>
              </div>
            </div>
          )}

          {card.chart_type === 'pie' && <PieChartCard data={card.data} />}
        </div>
      ))}
    </div>
  );
}



