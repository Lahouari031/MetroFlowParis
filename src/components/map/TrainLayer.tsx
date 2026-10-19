'use client';

/**
 * Rames animées (couche canevas au-dessus du plan).
 *
 * Représentation VISUELLE dérivée du moteur, qui est macroscopique (débits, pas de trains
 * individuels) : pour chaque ligne, le nombre de rames en service calculé par le moteur
 * circule en boucle terminus → terminus, régulièrement espacé. La vitesse sur chaque
 * inter-station suit le temps de parcours effectif (un incident ralentit visiblement les
 * rames), le remplissage affiché est le taux d'occupation du tronçon (débit / capacité).
 */
import { useEffect, useRef } from 'react';
import type { Network, Waypoint } from '@/types/network';
import type { SimSnapshot } from '@/types/simulation';
import { controller } from '@/lib/simulationController';
import { useMapView } from '@/store/mapViewStore';
import { useSimulation } from '@/store/simulationStore';
import { TURNAROUND_SECONDS } from '@/engine/networkState';
import { DWELL_SECONDS } from '@/engine/graph';
import { mapSizes } from './sizes';

interface EdgeGeo {
  pts: Waypoint[];
  cum: number[];
  len: number;
}

interface Service {
  line: string;
  color: string;
  /** Arcs orientés aller puis retour. */
  legs: number[];
  /** Index de la station de retournement après l'aller (dans legs) */
  turnAfter: number[];
  nServicesOnLine: number;
  base: number;
}

/** Itinéraires de service : du premier terminus vers chacun des autres terminus. */
export function buildServices(network: Network): Service[] {
  const edgeKey = new Map<string, number>();
  for (const e of network.edges) edgeKey.set(`${e.line}:${e.from}>${e.to}`, e.index);
  const services: Service[] = [];
  for (const line of network.lines) {
    const adj = new Map<string, string[]>();
    for (const s of network.segments) {
      if (s.line !== line.id) continue;
      (adj.get(s.a) ?? adj.set(s.a, []).get(s.a)!).push(s.b);
      (adj.get(s.b) ?? adj.set(s.b, []).get(s.b)!).push(s.a);
    }
    const origin = line.branches[0][0] as string;
    const prev = new Map<string, string | null>([[origin, null]]);
    const order = [origin];
    for (let i = 0; i < order.length; i++) {
      for (const n of adj.get(order[i]) ?? []) {
        if (!prev.has(n)) {
          prev.set(n, order[i]);
          order.push(n);
        }
      }
    }
    let dests = [...adj.keys()].filter((k) => k !== origin && adj.get(k)!.length === 1);
    if (dests.length === 0) dests = [order[order.length - 1]];
    for (const dest of dests) {
      const path: string[] = [];
      for (let cur: string | null | undefined = dest; cur; cur = prev.get(cur)) path.unshift(cur);
      const fwd: number[] = [];
      for (let i = 1; i < path.length; i++) fwd.push(edgeKey.get(`${line.id}:${path[i - 1]}>${path[i]}`)!);
      const bwd: number[] = [];
      for (let i = path.length - 1; i > 0; i--) bwd.push(edgeKey.get(`${line.id}:${path[i]}>${path[i - 1]}`)!);
      services.push({ line: line.id, color: line.color, legs: [...fwd, ...bwd], turnAfter: [fwd.length - 1, fwd.length + bwd.length - 1], nServicesOnLine: dests.length, base: Math.random() });
    }
  }
  return services;
}

function edgeGeometry(network: Network): EdgeGeo[] {
  return network.edges.map((e) => {
    const seg = network.segments[e.segment];
    const pts = e.direction === 1 ? seg.points : [...seg.points].reverse();
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    return { pts, cum, len: cum[cum.length - 1] };
  });
}

function pointOn(g: EdgeGeo, f: number): { x: number; y: number; angle: number } {
  const d = Math.max(0, Math.min(1, f)) * g.len;
  for (let i = 1; i < g.pts.length; i++) {
    if (d <= g.cum[i] || i === g.pts.length - 1) {
      const a = g.pts[i - 1];
      const b = g.pts[i];
      const seg = g.cum[i] - g.cum[i - 1] || 1;
      const t = Math.max(0, Math.min(1, (d - g.cum[i - 1]) / seg));
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
    }
  }
  return { x: g.pts[0].x, y: g.pts[0].y, angle: 0 };
}

export function TrainLayer({ network, visible }: { network: Network; visible: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!visible) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const services = buildServices(network);
    const geo = edgeGeometry(network);
    let raf = 0;
    let lastVisual = controller.visualTime();
    const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const draw = () => {
      raf = requestAnimationFrame(draw);
      const snap: SimSnapshot | null = useSimulation.getState().snapshot;
      const view = useMapView.getState();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(view.width * dpr);
      const h = Math.round(view.height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!snap) return;
      const now = controller.visualTime();
      let dt = now - lastVisual;
      lastVisual = now;
      if (dt < 0 || dt > 900) dt = 0; // retour arrière ou saut : positions conservées

      ctx.setTransform(dpr * view.k, 0, 0, dpr * view.k, dpr * view.x, dpr * view.y);
      const sz = mapSizes(view.k);
      const len = sz.trainLength;
      const wid = sz.trainWidth;
      const off = sz.trainOffset;

      for (const s of services) {
        // Durée de chaque étape (temps de parcours effectif) et du cycle complet.
        let cycle = 0;
        const durs = s.legs.map((e) => Math.max(30, snap.edgeTravelTime[e]));
        for (const d of durs) cycle += d;
        cycle += 2 * TURNAROUND_SECONDS;
        const n = Math.round((snap.lineTrains[s.line as keyof typeof snap.lineTrains] ?? 0) / s.nServicesOnLine);
        if (n <= 0 || cycle <= 0) continue;
        if (!reduceMotion) s.base = (s.base + dt / cycle) % 1;
        for (let k = 0; k < n; k++) {
          let t = ((s.base + k / n) % 1) * cycle;
          let edge = -1;
          let frac = 0;
          for (let i = 0; i < s.legs.length; i++) {
            if (t < durs[i]) {
              edge = s.legs[i];
              const moving = Math.max(10, durs[i] - DWELL_SECONDS);
              frac = Math.min(1, t / moving);
              break;
            }
            t -= durs[i];
            if (i === s.turnAfter[0] || i === s.turnAfter[1]) {
              if (t < TURNAROUND_SECONDS) {
                edge = s.legs[i];
                frac = 1;
                break;
              }
              t -= TURNAROUND_SECONDS;
            }
          }
          if (edge < 0) continue;
          const seg = network.edges[edge].segment;
          if (!snap.segmentAvailable[seg]) continue;
          const p = pointOn(geo[edge], frac);
          const cap = snap.edgeCapacity[edge];
          const load = cap > 0 ? Math.min(1, snap.edgeFlow[edge] / cap) : 0;
          ctx.save();
          ctx.translate(p.x - Math.sin(p.angle) * off, p.y + Math.cos(p.angle) * off);
          ctx.rotate(p.angle);
          // Caisse : couleur de la ligne ; partie claire = places libres.
          ctx.fillStyle = s.color;
          ctx.strokeStyle = '#1E1E1E';
          ctx.lineWidth = 0.9 / view.k;
          ctx.beginPath();
          ctx.roundRect(-len / 2, -wid / 2, len, wid, wid * 0.3);
          ctx.fill();
          ctx.stroke();
          const free = 1 - load;
          if (free > 0.04) {
            ctx.fillStyle = 'rgba(255,255,255,0.85)';
            const inset = wid * 0.2;
            const fw = (len - 2 * inset) * free;
            ctx.fillRect(len / 2 - inset - fw, -wid / 2 + inset, fw, wid - 2 * inset);
          }
          ctx.restore();
        }
      }
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [network, visible]);

  if (!visible) return null;
  return <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
