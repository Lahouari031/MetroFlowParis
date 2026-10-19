'use client';

import { memo } from 'react';
import { sameVisual } from './sameVisual';
import type { Station } from '@/types/network';

export interface StationVisual {
  station: Station;
  open: boolean;
  disrupted: boolean;
  selected: boolean;
  showLabel: boolean;
  strongLabel: boolean;
  showInterchange: boolean;
  routeEnd: boolean;
}

export const StationNode = memo(function StationNode({
  v,
  onSelect,
  onFocus,
  onHover,
}: {
  v: StationVisual;
  onSelect: (id: string) => void;
  onFocus: (id: string) => void;
  onHover: (id: string | null, e?: React.PointerEvent) => void;
}) {
  const s = v.station;
  const big = v.showInterchange && s.isInterchange;
  const r = big ? 5.6 : 3.4;
  return (
    <g
      transform={`translate(${s.x},${s.y})`}
      style={{ cursor: 'pointer' }}
      role="button"
      tabIndex={-1}
      aria-label={s.name}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(s.id);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onFocus(s.id);
      }}
      onPointerEnter={(e) => onHover(s.id, e)}
      onPointerLeave={() => onHover(null)}
    >
      <circle r={12} fill="transparent" />
      {v.selected && <circle r={r + 6} fill="none" stroke="#38bdf8" strokeWidth={2} className="glow-selected" />}
      {v.routeEnd && <circle r={r + 4} fill="none" stroke="#ffffff" strokeWidth={2} />}
      {v.disrupted && v.open && <circle r={r + 3.5} fill="none" stroke="#ef4444" strokeWidth={1.6} opacity={0.9} />}
      {big && <circle r={r + 1.8} fill="#0b1020" />}
      <circle r={r} fill={v.open ? '#ffffff' : '#475569'} stroke="#0b1020" strokeWidth={big ? 2.2 : 1.6} />
      {!v.open && (
        <g stroke="#ff2d55" strokeWidth={2.4} strokeLinecap="round">
          <line x1={-6} y1={-6} x2={6} y2={6} />
          <line x1={-6} y1={6} x2={6} y2={-6} />
        </g>
      )}
      {v.showLabel && (
        <text
          className={v.strongLabel ? 'map-label map-label-strong' : 'map-label'}
          x={s.label.dx}
          y={s.label.dy}
          textAnchor={s.label.anchor}
          transform={s.label.rotate ? `rotate(${s.label.rotate} ${s.label.dx} ${s.label.dy})` : undefined}
          style={big ? { fontSize: 9.6 } : undefined}
        >
          {s.mapLabel}
        </text>
      )}
    </g>
  );
}, sameVisual);
