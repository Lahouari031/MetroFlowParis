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
import { useMapView, mapCommands } from '@/store/mapViewStore';
import { useSettings } from '@/store/settingsStore';
import { useSelection, useSimulation } from '@/store/simulationStore';
import type { Incident } from '@/types/incident';
import type { Network } from '@/types/network';
import { getGeometry } from './geometry';
import { IncidentMarker, SlowdownGlyph } from './IncidentMarker';
import { MapControls } from './MapControls';
import { MapLegend } from './MapLegend';
import { FlowParticles, MetroSegment, type SegmentVisual } from './MetroSegment';
import { MiniMap } from './MiniMap';
import { StationNode, type StationVisual } from './StationNode';

const MIN_K = 0.25;
const MAX_K = 6;
/** En dessous de ce zoom, seules les étiquettes des correspondances et terminus sont affichées. */
const LABEL_ZOOM = 0.75;

type Hover = { kind: 'station' | 'segment'; id: string; x: number; y: number } | null;

export function MetroMap() {
  const network = loadNetwork().network as Network;
  const geo = useMemo(() => getGeometry(network), [network]);
  const svgRef = useRef<SVGSVGElement>(null);
  const gRef = useRef<SVGGElement>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [k, setK] = useState(1);
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
    useMapView.getState().set({ k: t.k, x: t.x, y: t.y });
    setK((prev) => ((prev < LABEL_ZOOM) !== (t.k < LABEL_ZOOM) || Math.abs(prev - t.k) > 0.5 ? t.k : prev));
  }, []);

  const fitTransform = useCallback(() => {
    const svg = svgRef.current;
    if (!svg) return zoomIdentity;
    const { width, height } = svg.getBoundingClientRect();
    const c = geo.content;
    const scale = Math.min(width / c.width, height / c.height) * 0.98;
    return zoomIdentity
      .translate(width / 2 - (c.x + c.width / 2) * scale, height / 2 - (c.y + c.height / 2) * scale)
      .scale(scale);
  }, [geo]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const z = d3zoom<SVGSVGElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      .clickDistance(4)
      .filter((event: Event) => {
        // Pas de zoom au double-clic (réservé au centrage sur une station), molette et glisser autorisés.
        if (event.type === 'dblclick') return false;
        return !(event as MouseEvent).button;
      })
      .on('zoom', (event: { transform: ZoomTransform }) => applyTransform(event.transform));
    zoomRef.current = z;
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
    mapCommands.fit = () => sel.transition().duration(350).call(z.transform, fitTransform());
    mapCommands.centerOn = (x, y, kk) => {
      const r = svg.getBoundingClientRect();
      const cur = useMapView.getState().k;
      const scale = kk ?? Math.max(cur, 2.2);
      sel
        .transition()
        .duration(450)
        .call(z.transform, zoomIdentity.translate(r.width / 2 - x * scale, r.height / 2 - y * scale).scale(scale));
    };
    return () => {
      ro.disconnect();
      sel.on('.zoom', null);
    };
  }, [applyTransform, fitTransform]);

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
      if (st) mapCommands.centerOn(st.x, st.y, Math.max(useMapView.getState().k * 1.6, 2.4));
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

  const showSegmentsMetric = layers.flows && flowMode !== 'heatmap';
  const showHeat = layers.flows && flowMode !== 'segments';

  const segmentMetric = useCallback(
    (i: number): number => {
      if (!snapshot) return 0;
      switch (metric) {
        case 'saturation':
          return snapshot.segmentSaturation[i];
        case 'flow':
          return snapshot.segmentFlow[i];
        case 'delay':
          return snapshot.segmentDelay[i];
        case 'variation': {
          const ref = refSnapshot?.segmentFlow[i];
          if (ref === undefined) return NaN;
          return ref < 300 ? (snapshot.segmentFlow[i] < 300 ? 0 : 1) : (snapshot.segmentFlow[i] - ref) / ref;
        }
      }
    },
    [snapshot, refSnapshot, metric],
  );

  const colorFor = useCallback(
    (i: number): string => {
      const v = segmentMetric(i);
      switch (metric) {
        case 'saturation':
          return levelColor(saturationLevel(v, thresholds));
        case 'flow':
          return levelColor(stepLevel(v, FLOW_STEPS));
        case 'delay':
          return levelColor(stepLevel(v, DELAY_STEPS));
        case 'variation':
          return variationColor(v);
      }
    },
    [segmentMetric, metric, thresholds],
  );

  // Tronçons ralentis (effets de temps de parcours actifs).
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

  const routeSegments = useMemo(() => {
    if (!route) return null;
    return route.edges.map((e) => network.edges[e].segment);
  }, [route, network]);

  const segmentVisuals: SegmentVisual[] = network.segments.map((seg) => {
    const line = network.lineById.get(seg.line)!;
    const sat = snapshot?.segmentSaturation[seg.index] ?? 0;
    const available = snapshot ? snapshot.segmentAvailable[seg.index] === 1 : true;
    return {
      id: seg.id,
      path: geo.segmentPath[seg.index],
      lineColor: line.color,
      metricColor: showSegmentsMetric && available ? colorFor(seg.index) : null,
      available,
      disrupted: layers.incidents && slowedSegments.has(seg.id),
      overCapacity: showSegmentsMetric && metric === 'saturation' && available && sat >= thresholds[3],
      selected: selected?.kind === 'segment' && selected.id === seg.id,
      hovered: hover?.kind === 'segment' && hover.id === seg.id,
    };
  });

  const stationVisuals: StationVisual[] = network.stations.map((st) => ({
    station: st,
    open: snapshot ? snapshot.stationOpen[st.index] === 1 : true,
    disrupted: layers.incidents && disruptedStations.has(st.id),
    selected: selected?.kind === 'station' && selected.id === st.id,
    showLabel: layers.labels && (k >= LABEL_ZOOM || st.isInterchange || st.isTerminus),
    strongLabel: st.isInterchange || st.isTerminus,
    showInterchange: layers.interchanges,
    routeEnd: !!route && (route.from === st.id || route.to === st.id),
  }));

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
        return { inc, x: p.x + n * 16, y: p.y };
      });
  }, [layers.incidents, snapshot, network, geo]);

  const heatGradients = ['low', 'moderate', 'high', 'veryHigh', 'over'] as const;

  return (
    <div className="relative h-full w-full overflow-hidden bg-[radial-gradient(ellipse_at_center,#0c1526_0%,#060a13_75%)]">
      <svg
        ref={svgRef}
        className="h-full w-full touch-none select-none"
        role="application"
        aria-label="Plan schématique interactif du métro (molette : zoom, glisser : déplacer, clic : sélectionner, double-clic : centrer)"
        onClick={() => {
          const sel = useSelection.getState();
          if (!sel.incidentDraft) sel.select(null);
        }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M40 0H0V40" fill="none" stroke="#14203a" strokeWidth="0.6" />
          </pattern>
          {heatGradients.map((lvl) => (
            <radialGradient key={lvl} id={`heat-${lvl}`}>
              <stop offset="0%" stopColor={levelColor(lvl)} stopOpacity={0.85} />
              <stop offset="55%" stopColor={levelColor(lvl)} stopOpacity={0.35} />
              <stop offset="100%" stopColor={levelColor(lvl)} stopOpacity={0} />
            </radialGradient>
          ))}
          <filter id="route-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        <g ref={gRef}>
          <rect x={geo.content.x - 400} y={geo.content.y - 400} width={geo.content.width + 800} height={geo.content.height + 800} fill="url(#grid)" />

          {/* Couche heatmap (densité autour des stations) */}
          {showHeat && snapshot && (
            <g opacity={heatOpacity} pointerEvents="none">
              {network.stations.map((st) => {
                const load = snapshot.stationLoad[st.index];
                const activity = snapshot.stationEntries[st.index] + snapshot.stationExits[st.index];
                const lvl = saturationLevel(load, thresholds);
                const r = 16 + 26 * Math.sqrt(Math.min(3, activity / 6000)) + 10 * Math.min(2, load);
                return <circle key={st.id} cx={st.x} cy={st.y} r={r} fill={`url(#heat-${lvl === 'none' ? 'low' : lvl})`} />;
              })}
            </g>
          )}

          {/* Correspondances piétonnes */}
          {layers.interchanges &&
            network.walkingTransfers.map((w) => {
              const a = network.stationById.get(w.from)!;
              const b = network.stationById.get(w.to)!;
              return <line key={`${w.from}-${w.to}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#cbd5e1" strokeWidth={2.4} strokeDasharray="1 4" strokeLinecap="round" />;
            })}

          {/* Tronçons */}
          {segmentVisuals.map((v) => (
            <MetroSegment key={v.id} v={v} onSelect={onSelectSegment} onHover={onHoverSegment} />
          ))}

          {/* Particules de flux */}
          {layers.particles && layers.flows && snapshot && (
            <g pointerEvents="none">
              {network.edges.map((e) => {
                const cap = snapshot.edgeCapacity[e.index];
                if (!cap || !snapshot.segmentAvailable[e.segment]) return null;
                return <FlowParticles key={e.index} path={geo.edgePath[e.index]} intensity={snapshot.edgeFlow[e.index] / cap} />;
              })}
            </g>
          )}

          {/* Itinéraire sélectionné */}
          {layers.routes && routeSegments && (
            <g pointerEvents="none">
              {routeSegments.map((si, i) => (
                <path key={`g${i}`} d={geo.segmentPath[si]} fill="none" stroke="#ffffff" strokeWidth={12} opacity={0.35} filter="url(#route-glow)" />
              ))}
              {routeSegments.map((si, i) => (
                <path key={`r${i}`} d={geo.segmentPath[si]} fill="none" stroke="#ffffff" strokeWidth={2.2} strokeDasharray="7 4" strokeLinecap="round" />
              ))}
            </g>
          )}

          {/* Symboles de ralentissement */}
          {layers.incidents &&
            network.segments.filter((s) => slowedSegments.has(s.id)).map((s) => <SlowdownGlyph key={s.id} x={geo.segmentMid[s.index].x} y={geo.segmentMid[s.index].y} />)}

          {/* Numéros de ligne aux terminus */}
          {layers.lineNumbers &&
            geo.terminusBadges.map((b) => {
              const line = network.lineById.get(b.line as never)!;
              return (
                <g key={`${b.stationId}-${b.line}`} transform={`translate(${b.x},${b.y})`} pointerEvents="none">
                  <circle r={8.5} fill={line.color} stroke="#0b1020" strokeWidth={1.5} />
                  <text textAnchor="middle" dy={3.6} fontSize={b.line.length > 1 ? 8.5 : 10} fontWeight={800} fill={line.textColor}>
                    {b.line}
                  </text>
                </g>
              );
            })}

          {/* Stations */}
          {stationVisuals.map((v) => (
            <StationNode key={v.station.id} v={v} onSelect={onSelectStation} onFocus={onFocusStation} onHover={onHoverStation} />
          ))}

          {/* Incidents */}
          {incidentMarkers.map(({ inc, x, y }) => (
            <IncidentMarker key={inc.id} incident={inc} x={x} y={y} selected={selected?.kind === 'incident' && selected.id === inc.id} onSelect={onSelectIncident} />
          ))}
        </g>
      </svg>

      <MapControls />
      <MapLegend />
      {layers.minimap && <MiniMap content={geo.content} paths={geo.segmentPath} colors={network.segments.map((s) => network.lineById.get(s.line)!.color)} />}
      {hover && <HoverCard hover={hover} network={network} />}
    </div>
  );
}

function incidentPosition(network: Network, geo: ReturnType<typeof getGeometry>, inc: Incident) {
  const t = inc.target;
  if (t.kind === 'station') {
    const st = network.stationById.get(t.stationId);
    if (st) return { x: st.x + 9, y: st.y - 15 };
  }
  if (t.kind === 'segment') {
    const seg = network.segmentById.get(t.segmentId);
    if (seg) return { x: geo.segmentMid[seg.index].x, y: geo.segmentMid[seg.index].y - 14 };
  }
  if (t.kind === 'line') {
    const segs = network.segments.filter((s) => s.line === t.line);
    const mid = segs[Math.floor(segs.length / 2)];
    if (mid) return { x: geo.segmentMid[mid.index].x + 14, y: geo.segmentMid[mid.index].y - 14 };
  }
  return { x: geo.content.x + 60, y: geo.content.y + 60 };
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
          Lignes {st.lines.join(', ')} · {snapshot.stationOpen[st.index] ? 'ouverte' : 'fermée'}
        </div>
        <div>À quai : {fmtInt(snapshot.stationWaiting[st.index])} voy. ({fmtPct(snapshot.stationLoad[st.index])} de la capacité)</div>
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
          L{seg.line} · {a.name} ↔ {b.name}
        </div>
        {snapshot.segmentAvailable[seg.index] ? (
          <>
            <div>
              → {b.name} : {fmtPct(snapshot.edgeSaturation[fwd.index])} · {fmtInt(snapshot.edgeFlow[fwd.index])} voy./h
            </div>
            <div>
              → {a.name} : {fmtPct(snapshot.edgeSaturation[bwd.index])} · {fmtInt(snapshot.edgeFlow[bwd.index])} voy./h
            </div>
            {snapshot.segmentDelay[seg.index] > 5 && <div className="text-amber-300">Retard estimé : {fmtMin(snapshot.segmentDelay[seg.index])}</div>}
          </>
        ) : (
          <div className="text-red-300">Tronçon interrompu</div>
        )}
      </>
    );
  }
  return (
    <div
      className="pointer-events-none fixed z-50 max-w-xs rounded-md border border-edge-strong bg-[#0b1322]/95 px-2.5 py-1.5 text-[11px] leading-relaxed shadow-xl"
      style={{ left: hover.x + 14, top: hover.y + 14 }}
    >
      {body}
    </div>
  );
}
