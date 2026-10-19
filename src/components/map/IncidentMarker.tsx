'use client';

import { memo } from 'react';
import type { Incident } from '@/types/incident';

export type MarkerKind = 'alert' | 'closure' | 'interruption' | 'slowdown' | 'crowd';

export function markerKind(inc: Incident): MarkerKind {
  switch (inc.type) {
    case 'station_closure':
      return 'closure';
    case 'segment_interruption':
      return 'interruption';
    case 'line_slowdown':
    case 'technical_failure':
    case 'major_delay':
    case 'frequency_reduction':
      return 'slowdown';
    case 'crowd_surge':
      return 'crowd';
    default:
      return 'alert';
  }
}

/** Marqueur d'incident cliquable (point d'exclamation, croix, interruption, ralentissement, affluence). */
export const IncidentMarker = memo(function IncidentMarker({
  incident,
  x,
  y,
  selected,
  onSelect,
}: {
  incident: Incident;
  x: number;
  y: number;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const kind = markerKind(incident);
  const active = incident.status === 'active';
  const color = kind === 'slowdown' ? '#f59e0b' : kind === 'crowd' ? '#a855f7' : kind === 'interruption' ? '#ff2d55' : '#ef4444';
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: 'pointer' }}
      opacity={active ? 1 : 0.55}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(incident.id);
      }}
    >
      <title>{`${incident.label} (${incident.status === 'active' ? 'actif' : incident.status === 'scheduled' ? 'programmé' : incident.status === 'suspended' ? 'suspendu' : 'levé'})`}</title>
      {active && <circle r={11} fill={color} opacity={0.5} className="incident-pulse" />}
      {selected && <circle r={13} fill="none" stroke="#38bdf8" strokeWidth={2} />}
      {kind === 'alert' && (
        <>
          <path d="M0,-11 L10,7 L-10,7 Z" fill={color} stroke="#0b1020" strokeWidth={1.5} strokeLinejoin="round" />
          <rect x={-1.3} y={-5} width={2.6} height={6.5} rx={1} fill="#fff" />
          <circle cy={4.2} r={1.4} fill="#fff" />
        </>
      )}
      {kind === 'closure' && (
        <>
          <circle r={9} fill={color} stroke="#0b1020" strokeWidth={1.5} />
          <g stroke="#fff" strokeWidth={2.4} strokeLinecap="round">
            <line x1={-4} y1={-4} x2={4} y2={4} />
            <line x1={-4} y1={4} x2={4} y2={-4} />
          </g>
        </>
      )}
      {kind === 'interruption' && (
        <>
          <rect x={-9} y={-9} width={18} height={18} rx={4} fill={color} stroke="#0b1020" strokeWidth={1.5} />
          <rect x={-5.5} y={-1.6} width={11} height={3.2} rx={1} fill="#fff" />
        </>
      )}
      {kind === 'slowdown' && (
        <>
          <circle r={9} fill={color} stroke="#0b1020" strokeWidth={1.5} />
          {/* Symbole de ralentissement : compteur à aiguille basse */}
          <path d="M-5.5,3 A6,6 0 1 1 5.5,3" fill="none" stroke="#1a1205" strokeWidth={1.8} strokeLinecap="round" />
          <line x1={0} y1={1.5} x2={-3.6} y2={-1.8} stroke="#1a1205" strokeWidth={1.8} strokeLinecap="round" />
        </>
      )}
      {kind === 'crowd' && (
        <>
          <circle r={9} fill={color} stroke="#0b1020" strokeWidth={1.5} />
          <g fill="#fff">
            <circle cx={-3.2} cy={-2.5} r={2} />
            <circle cx={3.2} cy={-2.5} r={2} />
            <path d="M-6.5,5 Q-3.2,-0.5 0,5 Z" />
            <path d="M0,5 Q3.2,-0.5 6.5,5 Z" />
          </g>
        </>
      )}
    </g>
  );
});

/** Petit symbole de ralentissement posé au milieu d'un tronçon ralenti. */
export function SlowdownGlyph({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      <rect x={-7} y={-5} width={14} height={10} rx={3} fill="#0b1020" stroke="#f59e0b" strokeWidth={1.2} />
      <path d="M-3.5,-2.5 L-0.5,0 L-3.5,2.5 M0.5,-2.5 L3.5,0 L0.5,2.5" fill="none" stroke="#f59e0b" strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
    </g>
  );
}
