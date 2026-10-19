'use client';

import { memo } from 'react';
import { GEOGRAPHY, type MonumentKind } from '@/data/geography';
import { MAP_COLORS } from './palette';

const toPoints = (pts: { x: number; y: number }[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');

/** Fond de plan : bois, parcs, Seine, périphérique et monuments (repères d'orientation). */
export const GeographyLayer = memo(function GeographyLayer({ showLabels, fontSize }: { showLabels: boolean; fontSize: number }) {
  const g = GEOGRAPHY;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {g.woods.map((w) => (
        <polygon key={w.name} points={toPoints(w.points)} fill={MAP_COLORS.wood} stroke={MAP_COLORS.wood} strokeWidth={30} strokeLinejoin="round" />
      ))}
      {g.parks.map((p) => (
        <ellipse key={p.name} cx={p.x} cy={p.y} rx={p.rx} ry={p.ry} fill={MAP_COLORS.park} />
      ))}
      <polyline points={toPoints(g.peripherique)} fill="none" stroke={MAP_COLORS.ring} strokeWidth={5} strokeLinejoin="round" strokeDasharray="2 14" strokeLinecap="round" />
      <polyline points={toPoints(g.seine)} fill="none" stroke={MAP_COLORS.water} strokeWidth={26} strokeLinejoin="round" strokeLinecap="round" />
      {g.islands.map((i) => (
        <ellipse key={i.name} cx={i.x} cy={i.y} rx={i.rx} ry={i.ry} fill={MAP_COLORS.land} transform={`rotate(${i.rotate} ${i.x} ${i.y})`} />
      ))}
      {showLabels &&
        g.woods.map((w) => {
          const cx = w.points.reduce((a, p) => a + p.x, 0) / w.points.length;
          const cy = w.points.reduce((a, p) => a + p.y, 0) / w.points.length;
          return (
            <text key={w.name} x={cx} y={cy} textAnchor="middle" className="geo-label" style={{ fill: MAP_COLORS.woodLabel, fontSize }}>
              {w.name}
            </text>
          );
        })}
      {showLabels && (
        <text x={g.seine[9].x + 40} y={g.seine[9].y + 34} className="geo-label" style={{ fill: MAP_COLORS.waterLabel, letterSpacing: 6, fontSize }} transform={`rotate(-28 ${g.seine[9].x + 40} ${g.seine[9].y + 34})`}>
          LA SEINE
        </text>
      )}
      {g.monuments.map((m) => (
        <g key={m.name} transform={`translate(${m.x},${m.y}) scale(${fontSize / 12})`}>
          <MonumentIcon kind={m.kind} />
          {showLabels && (
            <text y={26} textAnchor="middle" className="geo-label" style={{ fontSize: 12 }}>
              {m.name}
            </text>
          )}
        </g>
      ))}
    </g>
  );
});

/** Pictogrammes simplifiés (un trait, couleur unique). */
function MonumentIcon({ kind }: { kind: MonumentKind }) {
  const c = MAP_COLORS.monument;
  const common = { fill: 'none', stroke: c, strokeWidth: 2.2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  switch (kind) {
    case 'tower':
      return (
        <g {...common}>
          <path d="M-9,12 L0,-16 L9,12" />
          <path d="M-5,2 L5,2 M-7,8 Q0,2 7,8" />
        </g>
      );
    case 'arch':
      return (
        <g {...common}>
          <path d="M-11,10 L-11,-8 L11,-8 L11,10 M-5,10 L-5,1 Q0,-5 5,1 L5,10" />
          <path d="M-12,-12 L12,-12" />
        </g>
      );
    case 'dome':
      return (
        <g {...common}>
          <path d="M-11,10 L11,10 M-9,10 L-9,2 M9,10 L9,2 M-9,2 Q0,-14 9,2" />
          <path d="M0,-6 L0,-12" />
        </g>
      );
    case 'church':
      return (
        <g {...common}>
          <path d="M-11,10 L-11,-10 L-6,-10 L-6,10 M6,10 L6,-10 L11,-10 L11,10 M-6,-2 L6,-2 M-11,10 L11,10" />
          <circle cx={0} cy={4} r={3} />
        </g>
      );
    case 'museum':
      return (
        <g {...common}>
          <path d="M-12,-3 L0,-12 L12,-3 Z M-10,-3 L-10,9 M-3.5,-3 L-3.5,9 M3.5,-3 L3.5,9 M10,-3 L10,9 M-12,10 L12,10" />
        </g>
      );
    case 'stadium':
      return (
        <g {...common}>
          <ellipse rx={13} ry={8} />
          <ellipse rx={6} ry={3.5} />
        </g>
      );
    case 'skyscraper':
      return (
        <g {...common}>
          <path d="M-6,12 L-6,-14 L6,-14 L6,12 M-9,12 L9,12 M-2,-8 L2,-8 M-2,-2 L2,-2 M-2,4 L2,4" />
        </g>
      );
  }
}
