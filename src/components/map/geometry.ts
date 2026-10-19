/** Géométrie de rendu précalculée (chemins SVG, décalages des particules, badges de terminus). */
import type { Network, Waypoint } from '@/types/network';

export const CONTENT_MARGIN = { left: 110, right: 140, top: 60, bottom: 60 };

export interface MapGeometry {
  segmentPath: string[];
  /** Chemin décalé par arc orienté (particules), dans le sens de circulation. */
  edgePath: string[];
  segmentMid: Waypoint[];
  segmentLength: number[];
  /** Badges de numéro de ligne aux terminus. */
  terminusBadges: { line: string; x: number; y: number; stationId: string }[];
  content: { x: number; y: number; width: number; height: number };
}

export function toPath(points: Waypoint[]): string {
  return points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('');
}

/** Polyligne décalée à droite du sens de parcours. */
export function offsetPolyline(points: Waypoint[], d: number): Waypoint[] {
  const n = points.length;
  return points.map((p, i) => {
    const prev = points[Math.max(0, i - 1)];
    const next = points[Math.min(n - 1, i + 1)];
    let dx = next.x - prev.x;
    let dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    return { x: p.x - dy * d, y: p.y + dx * d };
  });
}

export function midpoint(points: Waypoint[]): Waypoint {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  let acc = 0;
  for (let i = 1; i < points.length; i++) {
    const l = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (acc + l >= total / 2) {
      const t = l ? (total / 2 - acc) / l : 0;
      return { x: points[i - 1].x + t * (points[i].x - points[i - 1].x), y: points[i - 1].y + t * (points[i].y - points[i - 1].y) };
    }
    acc += l;
  }
  return points[0];
}

const cache = new WeakMap<Network, MapGeometry>();

export function getGeometry(network: Network): MapGeometry {
  const hit = cache.get(network);
  if (hit) return hit;
  const segmentPath = network.segments.map((s) => toPath(s.points));
  const edgePath = network.edges.map((e) => {
    const seg = network.segments[e.segment];
    const pts = e.direction === 1 ? seg.points : [...seg.points].reverse();
    return toPath(offsetPolyline(pts, 3.4));
  });
  const segmentMid = network.segments.map((s) => midpoint(s.points));
  const segmentLength = network.segments.map((s) => s.length);
  const terminusBadges: MapGeometry['terminusBadges'] = [];
  for (const st of network.stations) {
    if (!st.isTerminus) continue;
    for (const line of st.lines) {
      const segs = network.segments.filter((s) => s.line === line && (s.a === st.id || s.b === st.id));
      if (segs.length !== 1) continue;
      const seg = segs[0];
      const pts = seg.a === st.id ? seg.points : [...seg.points].reverse();
      const dx = pts[1].x - pts[0].x;
      const dy = pts[1].y - pts[0].y;
      const len = Math.hypot(dx, dy) || 1;
      terminusBadges.push({ line, stationId: st.id, x: st.x - (dx / len) * 17, y: st.y - (dy / len) * 17 });
    }
  }
  const b = network.bounds;
  const content = {
    x: b.minX - CONTENT_MARGIN.left,
    y: b.minY - CONTENT_MARGIN.top,
    width: b.maxX - b.minX + CONTENT_MARGIN.left + CONTENT_MARGIN.right,
    height: b.maxY - b.minY + CONTENT_MARGIN.top + CONTENT_MARGIN.bottom,
  };
  const geo = { segmentPath, edgePath, segmentMid, segmentLength, terminusBadges, content };
  cache.set(network, geo);
  return geo;
}
