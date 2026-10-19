'use client';

import { memo } from 'react';
import { sameVisual } from './sameVisual';

export interface SegmentVisual {
  id: string;
  path: string;
  lineColor: string;
  /** Couleur de l'indicateur (gaine), null si les flux sont masqués. */
  metricColor: string | null;
  available: boolean;
  disrupted: boolean;
  overCapacity: boolean;
  selected: boolean;
  hovered: boolean;
}

/** Tronçon : zone de clic, gaine colorée selon l'indicateur, cœur à la couleur de la ligne. */
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
    <g>
      {(v.selected || v.hovered) && (
        <path d={v.path} fill="none" stroke="#7dd3fc" strokeOpacity={v.selected ? 0.55 : 0.3} strokeWidth={17} strokeLinecap="round" strokeLinejoin="round" />
      )}
      <path
        d={v.path}
        fill="none"
        stroke={v.metricColor ?? '#0a1020'}
        strokeWidth={v.metricColor ? 11 : 8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={v.overCapacity ? 'over-capacity' : undefined}
        style={{ transition: 'stroke 600ms linear' }}
      />
      {v.available ? (
        <path d={v.path} fill="none" stroke={v.lineColor} strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <>
          <path d={v.path} fill="none" stroke="#3b4354" strokeWidth={4.6} strokeLinecap="round" strokeLinejoin="round" />
          <path d={v.path} fill="none" stroke="#ff2d55" strokeWidth={3} strokeDasharray="6 5" strokeLinecap="butt" />
        </>
      )}
      {v.disrupted && v.available && (
        <path d={v.path} fill="none" stroke="#fbbf24" strokeWidth={1.4} strokeDasharray="2 4" strokeLinecap="round" opacity={0.95} />
      )}
      {/* Zone de clic élargie */}
      <path
        d={v.path}
        fill="none"
        stroke="transparent"
        strokeWidth={16}
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

/** Particules animées représentant symboliquement le sens et l'intensité des flux. */
export const FlowParticles = memo(function FlowParticles({ path, intensity }: { path: string; intensity: number }) {
  if (intensity < 0.04) return null;
  // Vitesse quantifiée pour éviter les sauts d'animation à chaque mise à jour.
  const bucket = Math.min(5, Math.floor(intensity * 6));
  const duration = [2.6, 2.1, 1.7, 1.35, 1.05, 0.8][bucket];
  return (
    <path
      d={path}
      fill="none"
      stroke="#f8fafc"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeDasharray="0.01 11.99"
      opacity={0.35 + 0.55 * Math.min(1, intensity)}
      className="flow-particles"
      style={{ animationDuration: `${duration}s` }}
    />
  );
});
