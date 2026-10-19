'use client';

import { memo } from 'react';
import type { Station } from '@/types/network';
import { MAP_COLORS } from './palette';
import { sameVisual } from './sameVisual';

export interface StationVisual {
  station: Station;
  open: boolean;
  disrupted: boolean;
  selected: boolean;
  showLabel: boolean;
  strongLabel: boolean;
  /** Taille de police des étiquettes (unités de carte) selon le zoom. */
  fontSize: number;
  /** Rayon (unités de carte) et épaisseur du contour selon le zoom. */
  radius: number;
  strokeWidth: number;
  passengerR: number;
  passengerGap: number;
  /** Étiquette horizontale à droite (vue d'ensemble) au lieu du placement précalculé. */
  horizontalLabel: boolean;
  showInterchange: boolean;
  routeEnd: boolean;
  /** Nombre de petits points « voyageurs en attente » à dessiner (0 = aucun). */
  crowd: number;
  overcrowded: boolean;
  /** Station desservie uniquement par des lignes non gérées : estompée. */
  dimmed: boolean;
}

/** Station façon Mini Metro : rond blanc cerclé de noir, voyageurs en attente en petits points. */
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
  const r = v.radius;
  const sw = v.strokeWidth;
  return (
    <g
      transform={`translate(${s.x},${s.y})`}
      opacity={v.dimmed ? 0.3 : 1}
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
      <circle r={r * 2.2} fill="transparent" />
      {v.overcrowded && v.open && <circle r={r * 2} fill="none" stroke="#E5383B" strokeWidth={sw * 1.3} className="crowd-alarm" />}
      {v.selected && <circle r={r * 1.9} fill="none" stroke="#1E1E1E" strokeWidth={sw} strokeDasharray={`${sw * 2} ${sw * 1.5}`} />}
      {v.routeEnd && <circle r={r * 1.7} fill="none" stroke="#2563EB" strokeWidth={sw * 1.3} />}
      {v.disrupted && v.open && <circle r={r * 1.55} fill="none" stroke="#E5383B" strokeWidth={sw} />}
      <circle r={r} fill={v.open ? MAP_COLORS.stationFill : '#C9C3B8'} stroke={MAP_COLORS.stationStroke} strokeWidth={big ? sw * 1.25 : sw} />
      {!v.open && (
        <g stroke="#E5383B" strokeWidth={sw * 1.2} strokeLinecap="round">
          <line x1={-r} y1={-r} x2={r} y2={r} />
          <line x1={-r} y1={r} x2={r} y2={-r} />
        </g>
      )}
      {v.crowd > 0 && v.open && (
        <g fill={MAP_COLORS.passenger} transform={`translate(${r + v.passengerGap},${-r - v.passengerGap * 0.6})`}>
          {Array.from({ length: v.crowd }, (_, i) => (
            <circle key={i} cx={(i % 6) * v.passengerGap} cy={-Math.floor(i / 6) * v.passengerGap} r={v.passengerR} />
          ))}
        </g>
      )}
    </g>
  );
}, sameVisual);

/** Nom de station, dessiné dans une couche au-dessus des rames pour rester lisible. */
export const StationLabel = memo(function StationLabel({ v }: { v: StationVisual }) {
  const s = v.station;
  if (!v.showLabel) return null;
  const r = v.radius;
  const u = v.fontSize / 13; // placement précalculé pour une police de 13, ramené à la taille courante
  const lx = v.horizontalLabel ? r + v.fontSize * 0.3 : s.label.dx * u;
  const ly = v.horizontalLabel ? v.fontSize * 0.35 : s.label.dy * u;
  const anchor = v.horizontalLabel ? 'start' : s.label.anchor;
  const rotate = v.horizontalLabel ? 0 : s.label.rotate;
  return (
    <text
      className={v.strongLabel ? 'map-label map-label-strong' : 'map-label'}
      x={s.x + lx}
      y={s.y + ly}
      textAnchor={anchor}
      transform={rotate ? `rotate(${rotate} ${s.x + lx} ${s.y + ly})` : undefined}
      style={{ fontSize: v.fontSize, strokeWidth: v.fontSize * 0.3 }}
    >
      {s.mapLabel}
    </text>
  );
}, sameVisual);
