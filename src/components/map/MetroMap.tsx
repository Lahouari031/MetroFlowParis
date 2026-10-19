'use client';

import { select } from 'd3-selection';
import 'd3-transition';
import { zoom as d3zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadNetwork } from '@/data/network';
import {
  DELAY_STEPS,
  FLOW_STEPS,
  fmtInt,
  fmtMin,
  fmtPct,
  levelColor,
  saturationLevel,
  stepLevel,
  variationColor,
} from '@/lib/metrics';
import { mapCommands, useMapView } from '@/store/mapViewStore';
import { useSettings } from '@/store/settingsStore';
import { useSelection, useSimulation } from '@/store/simulationStore';
import type { Incident } from '@/types/incident';
import type { Network } from '@/types/network';
import { getGeometry } from './geometry';
import { GeographyLayer } from './GeographyLayer';
import { IncidentMarker, SlowdownGlyph } from './IncidentMarker';
import { MapControls } from './MapControls';
import { MetroSegment, type SegmentVisual } from './MetroSegment';
import { MiniMap } from './MiniMap';
import { MAP_COLORS } from './palette';
import { StationLabel, StationNode, type StationVisual } from './StationNode';
import { mapSizes } from './sizes';
import { TrainLayer } from './TrainLayer';

const MIN_K = 0.2;
const MAX_K = 5;
/** Voyageurs en attente représentés par un point sur le quai. */
const PASSENGERS_PER_DOT = 60;
/** Importance d'une station pour l'affichage des noms (3 = grand pôle, 0 = station simple). */
function rank(st: { id: string; lines: string[]; isTerminus: boolean }): number {
  if (MAJOR_STATIONS.has(st.id)) return 3;
  if (st.lines.length >= 2) return 2;
  if (st.isTerminus) return 1;
  return 0;
}

/** Grands pôles nommés même en vue d'ensemble. */
const MAJOR_STATIONS = new Set([
  'chatelet', 'gare-du-nord', 'gare-de-l-est', 'saint-lazare', 'gare-de-lyon', 'montparnasse-bienvenue', 'republique',
  'nation', 'bastille', 'la-defense', 'charles-de-gaulle-etoile', 'place-d-italie', 'denfert-rochereau', 'opera',
  'concorde', 'trocadero', 'gare-d-austerlitz', 'la-motte-picquet-grenelle', 'barbes-rochechouart', 'saint-denis-pleyel',
  'aeroport-d-orly', 'porte-maillot', 'bercy', 'stalingrad',
]);

type Hover = { kind: 'station' | 'segment'; id: string; x: number; y: number } | null;

export function MetroMap() {
  const network = loadNetwork().network as Network;
  const geo = useMemo(() => getGeometry(network), [network]);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const labelRef = useRef<SVGGElement>(null);
  const [k, setK] = useState(0.4);
  const [hover, setHover] = useState<Hover>(null);

  const snapshot = useSimulation((s) => s.snapshot);
  const refSnapshot = useSimulation((s) => s.refSnapshot);
  const layers = useSettings((s) => s.layers);
  const flowMode = useSettings((s) => s.flowMode);
  const metric = useSettings((s) => s.metric);
  const thresholds = useSettings((s) => s.thresholds);
  const heatOpacity = useSettings((s) => s.heatOpacity);
  const selected = useSelection((s) => s.selected);
  const route = useSelection((s) => s.route);
  const focus = useSelection((s) => s.focus);

  /* ------------------------------------------------------------ zoom / déplacement */

  const applyTransform = useCallback((t: ZoomTransform) => {
    gRef.current?.setAttribute('transform', t.toString());
    labelRef.current?.setAttribute('transform', t.toString());
    useMapView.getState().set({ k: t.k, x: t.x, y: t.y });
    // Palier de zoom (rendu des étiquettes et tailles) : mis à jour seulement par crans.
    const bucket = Math.round(t.k * 20) / 20;
    setK((prev) => (prev === bucket ? prev : bucket));
  }, []);

  const fitTransform = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return zoomIdentity;
    const { width, height } = svg.getBoundingClientRect();
    // Cadre par défaut : Paris intra-muros et proche banlieue, centré entre les panneaux latéraux.
    const c = { x: -1200, y: -800, width: 2450, height: 1650 };
    const padL = width > 1000 ? 280 : 0;
    const padR = width > 1000 ? 316 : 0;
    const w = width - padL - padR;
    const scale = Math.min(w / c.width, (height - 40) / c.height);
    return zoomIdentity.translate(padL + w / 2 - (c.x + c.width / 2) * scale, height / 2 - (c.y + c.height / 2) * scale).scale(scale);
  }, []);

  const fullTransform = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return zoomIdentity;
    const { width, height } = svg.getBoundingClientRect();
    const c = geo.content;
    const scale = Math.min(width / c.width, height / c.height) * 0.98;
    return zoomIdentity.translate(width / 2 - (c.x + c.width / 2) * scale, height / 2 - (c.y + c.height / 2) * scale).scale(scale);
  }, [geo]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z: ZoomBehavior<SVGSVGElement, unknown> = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      .clickDistance(4)
      .filter((event: Event) => event.type !== 'dblclick' && !(event as MouseEvent).button)
      .on('zoom', (event: { transform: ZoomTransform }) => applyTransform(event.transform));
    const sel = select(svg);
    sel.call(z);
    const resize = () => {
      const r = svg.getBoundingClientRect();
      useMapView.getState().set({ width: r.width, height: r.height });
    };
    resize();
    sel.call(z.transform, fitTransform());
    const ro = new ResizeObserver(resize);
    ro.observe(svg);

    mapCommands.zoomBy = (f) => sel.transition().duration(220).call(z.scaleBy, f);
    mapCommands.fit = () => sel.transition().duration(400).call(z.transform, fullTransform());
    mapCommands.centerOn = (x, y, kk) => {
      const r = svg.getBoundingClientRect();
      const scale = kk ?? Math.max(useMapView.getState().k, 1.6);
      sel
        .transition()
        .duration(450)
        .call(z.transform, zoomIdentity.translate(r.width / 2 - x * scale, r.height / 2 - y * scale).scale(scale));
    };
    return () => {
      ro.disconnect();
      sel.on('.zoom', null);
    };
  }, [applyTransform, fitTransform, fullTransform]);

  useEffect(() => {
    if (!focus) return;
    const st = network.stationById.get(focus.stationId);
    if (st) mapCommands.centerOn(st.x, st.y);
  }, [focus, network]);

  // Échap : ferme le panneau ou annule la sélection en cours.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const sel = useSelection.getState();
      if (sel.incidentDraft) sel.closeIncidentForm();
      else if (sel.route) sel.setRoute(null);
      else sel.select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ------------------------------------------------------------ callbacks stables */

  const onSelectSegment = useCallback((id: string) => useSelection.getState().select({ kind: 'segment', id }), []);
  const onSelectStation = useCallback((id: string) => useSelection.getState().select({ kind: 'station', id }), []);
  const onSelectIncident = useCallback((id: string) => useSelection.getState().select({ kind: 'incident', id }), []);
  const onFocusStation = useCallback(
    (id: string) => {
      useSelection.getState().select({ kind: 'station', id });
      const st = network.stationById.get(id);
      if (st) mapCommands.centerOn(st.x, st.y, Math.max(useMapView.getState().k * 1.8, 1.8));
    },
    [network],
  );
  const onHoverSegment = useCallback((id: string | null, e?: React.PointerEvent) => {
    setHover(id && e ? { kind: 'segment', id, x: e.clientX, y: e.clientY } : null);
  }, []);
  const onHoverStation = useCallback((id: string | null, e?: React.PointerEvent) => {
    setHover(id && e ? { kind: 'station', id, x: e.clientX, y: e.clientY } : null);
  }, []);

  /* ------------------------------------------------------------ données dérivées */

  const chargeMode = layers.flows && (flowMode === 'segments' || flowMode === 'mixed');
  const planMode = layers.flows && flowMode === 'plan';
  const showHeat = layers.flows && (flowMode === 'heatmap' || flowMode === 'mixed');

  const metricColor = useCallback(
    (i: number): string => {
      if (!snapshot) return '#999';
      switch (metric) {
        case 'saturation':
          return levelColor(saturationLevel(snapshot.segmentSaturation[i], thresholds));
        case 'flow':
          return levelColor(stepLevel(snapshot.segmentFlow[i], FLOW_STEPS));
        case 'delay':
          return levelColor(stepLevel(snapshot.segmentDelay[i], DELAY_STEPS));
        case 'variation': {
          const ref = refSnapshot?.segmentFlow[i];
          if (ref === undefined) return '#999';
          const v = ref < 300 ? (snapshot.segmentFlow[i] < 300 ? 0 : 1) : (snapshot.segmentFlow[i] - ref) / ref;
          return variationColor(v);
        }
      }
    },
    [snapshot, refSnapshot, metric, thresholds],
  );

  const slowedSegments = useMemo(() => {
    const out = new Set<string>();
    for (const inc of snapshot?.incidents ?? []) {
      if (inc.status !== 'active') continue;
      for (const e of inc.effects) {
        if (e.kind === 'segmentSpeedFactor' || e.kind === 'segmentTimeAdd') out.add(e.segmentId);
        if (e.kind === 'lineSpeedFactor') network.segments.filter((s) => s.line === e.line).forEach((s) => out.add(s.id));
      }
    }
    return out;
  }, [snapshot?.incidents, network]);

  const disruptedStations = useMemo(() => {
    const out = new Set<string>();
    for (const inc of snapshot?.incidents ?? []) {
      if (inc.status === 'active' && inc.target.kind === 'station') out.add(inc.target.stationId);
    }
    return out;
  }, [snapshot?.incidents]);

  const routeSegments = useMemo(() => (route ? route.edges.map((e) => network.edges[e].segment) : null), [route, network]);

  const sz = mapSizes(k);
  const segmentVisuals: SegmentVisual[] = network.segments.map((seg) => {
    const line = network.lineById.get(seg.line)!;
    const sat = snapshot?.segmentSaturation[seg.index] ?? 0;
    const available = snapshot ? snapshot.segmentAvailable[seg.index] === 1 : true;
    return {
      id: seg.id,
      path: geo.segmentPath[seg.index],
      lineColor: line.color,
      metricColor: chargeMode && available ? metricColor(seg.index) : null,
      haloColor: planMode && sat >= thresholds[1] ? (sat >= thresholds[2] ? '#E5383B' : '#F59E0B') : null,
      haloStrong: sat >= thresholds[2],
      available,
      disrupted: layers.incidents && slowedSegments.has(seg.id),
      overCapacity: (planMode || (chargeMode && metric === 'saturation')) && available && sat >= thresholds[3],
      selected: selected?.kind === 'segment' && selected.id === seg.id,
      hovered: hover?.kind === 'segment' && hover.id === seg.id,
      width: sz.line,
      haloWidth: sz.halo,
      hitWidth: sz.hit,
    };
  });

  // Étiquettes : en vue d'ensemble, noms horizontaux des pôles placés par ordre d'importance
  // sans chevauchement ; en zoomant, toutes les stations avec le placement précalculé.
  const labelFont = sz.labelFont;
  const horizontal = k < 1.1;
  const visibleLabels = useMemo(() => {
    const out = new Set<string>();
    if (!layers.labels) return out;
    if (!horizontal) {
      for (const st of network.stations) out.add(st.id);
      return out;
    }
    const boxes: [number, number, number, number][] = [];
    const ranked = [...network.stations].sort((a, b) => rank(b) - rank(a));
    for (const st of ranked) {
      const tier = rank(st);
      if (k < 0.6 && tier < 3) continue;
      if (k < 0.85 && tier < 2) continue;
      const font = labelFont * (tier >= 3 ? 1.05 : 0.95);
      const x0 = st.x + sz.station + font * 0.3;
      const box: [number, number, number, number] = [x0, st.y - font * 0.7, x0 + st.mapLabel.length * font * 0.56, st.y + font * 0.45];
      if (boxes.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) continue;
      boxes.push(box);
      out.add(st.id);
    }
    return out;
  }, [network, k, horizontal, labelFont, layers.labels, sz.station]);

  const stationVisuals: StationVisual[] = network.stations.map((st) => {
    const tier = rank(st);
    const waiting = snapshot?.stationWaiting[st.index] ?? 0;
    const load = snapshot?.stationLoad[st.index] ?? 0;
    return {
      station: st,
      open: snapshot ? snapshot.stationOpen[st.index] === 1 : true,
      disrupted: layers.incidents && disruptedStations.has(st.id),
      selected: selected?.kind === 'station' && selected.id === st.id,
      showLabel: visibleLabels.has(st.id),
      strongLabel: tier >= 3,
      fontSize: tier >= 3 ? labelFont * 1.05 : labelFont * 0.95,
      horizontalLabel: horizontal,
      radius: st.isInterchange && layers.interchanges ? sz.stationInterchange : sz.station,
      strokeWidth: sz.stroke,
      passengerR: sz.passenger,
      passengerGap: sz.passengerGap,
      showInterchange: layers.interchanges,
      routeEnd: !!route && (route.from === st.id || route.to === st.id),
      crowd: layers.crowds && k >= 0.7 ? Math.min(12, Math.round(waiting / PASSENGERS_PER_DOT)) : 0,
      overcrowded: layers.crowds && load >= 1,
    };
  });

  const markerScale = sz.marker;
  const incidentMarkers = useMemo(() => {
    if (!layers.incidents || !snapshot) return [];
    const placed = new Map<string, number>();
    return snapshot.incidents
      .filter((i) => i.status !== 'resolved')
      .map((inc) => {
        const p = incidentPosition(network, geo, inc);
        const key = `${Math.round(p.x)},${Math.round(p.y)}`;
        const n = placed.get(key) ?? 0;
        placed.set(key, n + 1);
        return { inc, x: p.x + n * 24 * sz.marker, y: p.y - 20 * sz.marker };
      });
  }, [layers.incidents, snapshot, network, geo]);

  const heatGradients = ['low', 'moderate', 'high', 'veryHigh', 'over'] as const;

  return (
    <div className="relative h-full w-full overflow-hidden" style={{ background: MAP_COLORS.land }}>
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        aria-label="Plan schématique interactif du métro (molette : zoom, glisser : déplacer, clic : sélectionner, double-clic : centrer)"
        onClick={() => {
          const sel = useSelection.getState();
          if (!sel.incidentDraft) sel.select(null);
        }}
      >
        <defs>
          {heatGradients.map((lvl) => (
            <radialGradient key={lvl} id={`heat-${lvl}`}>
              <stop offset="0%" stopColor={levelColor(lvl)} stopOpacity={0.75} />
              <stop offset="60%" stopColor={levelColor(lvl)} stopOpacity={0.25} />
              <stop offset="100%" stopColor={levelColor(lvl)} stopOpacity={0} />
            </radialGradient>
          ))}
        </defs>
        <g ref={gRef}>
          <rect x={geo.content.x - 3000} y={geo.content.y - 3000} width={geo.content.width + 6000} height={geo.content.height + 6000} fill={MAP_COLORS.land} />
          {layers.geography && <GeographyLayer showLabels={k >= 0.3} fontSize={Math.min(26, Math.max(12, 10 / k))} />}

          {showHeat && snapshot && (
            <g opacity={heatOpacity} pointerEvents="none">
              {network.stations.map((st) => {
                const load = snapshot.stationLoad[st.index];
                const activity = snapshot.stationEntries[st.index] + snapshot.stationExits[st.index];
                const lvl = saturationLevel(load, thresholds);
                const r = 25 + 40 * Math.sqrt(Math.min(3, activity / 6000)) + 15 * Math.min(2, load);
                return <circle key={st.id} cx={st.x} cy={st.y} r={r} fill={`url(#heat-${lvl === 'none' ? 'low' : lvl})`} />;
              })}
            </g>
          )}

          {layers.interchanges &&
            network.walkingTransfers.map((w) => {
              const a = network.stationById.get(w.from)!;
              const b = network.stationById.get(w.to)!;
              return <line key={`${w.from}-${w.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#1E1E1E" strokeWidth={3} strokeDasharray="1 6" strokeLinecap="round" />;
            })}

          {segmentVisuals.map((v) => (
            <MetroSegment key={v.id} v={v} onSelect={onSelectSegment} onHover={onHoverSegment} />
          ))}

          {layers.routes && routeSegments && (
            <g pointerEvents="none">
              {routeSegments.map((si, i) => (
                <path key={i} d={geo.segmentPath[si]} fill="none" stroke="#2563EB" strokeWidth={4} strokeDasharray="10 6" strokeLinecap="round" />
              ))}
            </g>
          )}

          {layers.incidents &&
            network.segments
              .filter((s) => slowedSegments.has(s.id))
              .map((s) => <SlowdownGlyph key={s.id} x={geo.segmentMid[s.index].x} y={geo.segmentMid[s.index].y} scale={markerScale} />)}

          {layers.lineNumbers &&
            geo.terminusBadges.map((b) => {
              const line = network.lineById.get(b.line as never)!;
              const label = b.line.replace('bis', 'b');
              return (
                <g key={`${b.stationId}-${b.line}`} transform={`translate(${b.x},${b.y}) scale(${markerScale * 0.85})`} pointerEvents="none">
                  <rect x={-12} y={-10} width={24} height={20} rx={5} fill={line.color} />
                  <text textAnchor="middle" dy={4.5} fontSize={label.length > 2 ? 10 : 13} fontWeight={800} fill={line.textColor}>
                    {label}
                  </text>
                </g>
              );
            })}

          {stationVisuals.map((v) => (
            <StationNode key={v.station.id} v={v} onSelect={onSelectStation} onFocus={onFocusStation} onHover={onHoverStation} />
          ))}

        </g>
      </svg>

      <TrainLayer network={network} visible={layers.trains} />
      <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
        <g ref={labelRef}>
          {stationVisuals.map((v) => (
            <StationLabel key={v.station.id} v={v} />
          ))}
          <g style={{ pointerEvents: 'auto' }}>
            {incidentMarkers.map(({ inc, x, y }) => (
              <IncidentMarker
                key={inc.id}
                incident={inc}
                x={x}
                y={y}
                scale={markerScale}
                selected={selected?.kind === 'incident' && selected.id === inc.id}
                onSelect={onSelectIncident}
              />
            ))}
          </g>
        </g>
      </svg>
      <MapControls />
      {layers.minimap && <MiniMap content={geo.content} paths={geo.segmentPath} colors={network.segments.map((s) => network.lineById.get(s.line)!.color)} />}
      {hover && <HoverCard hover={hover} network={network} />}
    </div>
  );
}

function incidentPosition(network: Network, geo: ReturnType<typeof getGeometry>, inc: Incident) {
  const t = inc.target;
  if (t.kind === 'station') {
    const st = network.stationById.get(t.stationId);
    if (st) return { x: st.x, y: st.y };
  }
  if (t.kind === 'segment') {
    const seg = network.segmentById.get(t.segmentId);
    if (seg) return { x: geo.segmentMid[seg.index].x, y: geo.segmentMid[seg.index].y };
  }
  if (t.kind === 'line') {
    const segs = network.segments.filter((s) => s.line === t.line);
    const mid = segs[Math.floor(segs.length / 2)];
    if (mid) return { x: geo.segmentMid[mid.index].x, y: geo.segmentMid[mid.index].y };
  }
  return { x: 0, y: 0 };
}

function HoverCard({ hover, network }: { hover: NonNullable<Hover>; network: Network }) {
  const snapshot = useSimulation((s) => s.snapshot);
  if (!snapshot) return null;
  let body: React.ReactNode = null;
  if (hover.kind === 'station') {
    const st = network.stationById.get(hover.id);
    if (!st) return null;
    body = (
      <>
        <div className="font-semibold">{st.name}</div>
        <div className="text-muted">
          Ligne{st.lines.length > 1 ? 's' : ''} {st.lines.join(', ')} · {snapshot.stationOpen[st.index] ? 'ouverte' : 'fermée'}
        </div>
        <div>
          {fmtInt(snapshot.stationWaiting[st.index])} voyageurs à quai ({fmtPct(snapshot.stationLoad[st.index])} de la capacité)
        </div>
      </>
    );
  } else {
    const seg = network.segmentById.get(hover.id);
    if (!seg) return null;
    const a = network.stationById.get(seg.a)!;
    const b = network.stationById.get(seg.b)!;
    const fwd = network.edges[seg.index * 2];
    const bwd = network.edges[seg.index * 2 + 1];
    body = (
      <>
        <div className="font-semibold">
          Ligne {seg.line} · {a.name} ↔ {b.name}
        </div>
        {snapshot.segmentAvailable[seg.index] ? (
          <>
            <div>
              vers {b.name} : {fmtPct(snapshot.edgeSaturation[fwd.index])} · {fmtInt(snapshot.edgeFlow[fwd.index])} voy./h
            </div>
            <div>
              vers {a.name} : {fmtPct(snapshot.edgeSaturation[bwd.index])} · {fmtInt(snapshot.edgeFlow[bwd.index])} voy./h
            </div>
            {snapshot.segmentDelay[seg.index] > 5 && <div className="text-amber-700">Retard estimé : {fmtMin(snapshot.segmentDelay[seg.index])}</div>}
          </>
        ) : (
          <div className="text-red-600">Tronçon interrompu</div>
        )}
      </>
    );
  }
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-edge bg-white/95 px-2.5 py-1.5 text-[11px] leading-relaxed text-ink shadow-lg"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      {body}
    </div>
  );
}
