'use client';

import { memo } from 'react';
import { sameVisual } from './sameVisual';

export interface SegmentVisual {
  id: string;
  path: string;
  lineColor: string;
  /** Mode « Charge » : couleur de l'indicateur à la place de la couleur de ligne. */
  metricColor: string | null;
  /** Mode « Plan » : halo de congestion sous la ligne (null si fluide). */
  haloColor: string | null;
  haloStrong: boolean;
  available: boolean;
  disrupted: boolean;
  overCapacity: boolean;
  selected: boolean;
  hovered: boolean;
  /** Épaisseurs (unités de carte) selon le zoom. */
  width: number;
  haloWidth: number;
  hitWidth: number;
  /** Ligne non gérée par le joueur : estompée. */
  dimmed: boolean;
}

/** Tronçon : halo de congestion éventuel, trait de ligne épais, zone de clic élargie. */
export const MetroSegment = memo(function MetroSegment({
  v,
  onSelect,
  onHover,
}: {
  v: SegmentVisual;
  onSelect: (id: string) => void;
  onHover: (id: string | null, e?: React.PointerEvent) => void;
}) {
  return (
    <g opacity={v.dimmed ? 0.2 : 1}>
      {(v.selected || v.hovered) && (
        <path d={v.path} fill="none" stroke="#1E1E1E" strokeOpacity={v.selected ? 0.25 : 0.12} strokeWidth={v.haloWidth * 1.3} strokeLinecap="round" strokeLinejoin="round" />
      )}
      {v.haloColor && v.available && (
        <path
          d={v.path}
          fill="none"
          stroke={v.haloColor}
          strokeOpacity={v.haloStrong ? 0.6 : 0.35}
          strokeWidth={v.haloStrong ? v.haloWidth * 1.3 : v.haloWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={v.overCapacity ? 'over-capacity' : undefined}
        />
      )}
      {v.available ? (
        <path
          d={v.path}
          fill="none"
          stroke={v.metricColor ?? v.lineColor}
          strokeWidth={v.width}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={v.metricColor && v.overCapacity ? 'over-capacity' : undefined}
          style={{ transition: 'stroke 600ms linear' }}
        />
      ) : (
        <>
          <path d={v.path} fill="none" stroke="#C9C3B8" strokeWidth={v.width} strokeLinecap="round" strokeLinejoin="round" />
          <path d={v.path} fill="none" stroke="#E5383B" strokeWidth={v.width * 0.45} strokeDasharray={`${v.width} ${v.width * 0.8}`} />
        </>
      )}
      {v.disrupted && v.available && (
        <path d={v.path} fill="none" stroke="#1E1E1E" strokeWidth={v.width * 0.3} strokeDasharray={`0.1 ${v.width}`} strokeLinecap="round" />
      )}
      <path
        d={v.path}
        fill="none"
        stroke="transparent"
        strokeWidth={v.hitWidth}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(v.id);
        }}
        onPointerEnter={(e) => onHover(v.id, e)}
        onPointerMove={(e) => onHover(v.id, e)}
        onPointerLeave={() => onHover(null)}
      />
    </g>
  );
}, sameVisual);
