/**
 * Construction du réseau résolu à partir des données de référence :
 * positions schématiques, tronçons, arcs orientés, étiquettes et contrôles de cohérence.
 *
 * Ce module est pur (aucune dépendance à React) et déterministe.
 */
import type {
  DataIssue,
  DirectedEdge,
  LabelPlacement,
  LineDefinition,
  LineId,
  Network,
  PathItem,
  Segment,
  Station,
  StationDefinition,
  Waypoint,
  WalkingTransfer,
} from '@/types/network';

/** Échelle du plan : 1 unité de carte ≈ 10 m (approximation pour les temps de parcours). */
export const MAP_UNIT_METERS = 10;
/** Temps d'arrêt moyen en station (s), inclus dans le temps de parcours d'un tronçon. */
export const DWELL_SECONDS = 20;
/** Temps de parcours minimal d'un tronçon (s). */
export const MIN_SEGMENT_SECONDS = 60;
/** Voyageurs supportables confortablement sur un quai (valeur de modèle). */
export const PLATFORM_CAPACITY = 250;

export interface NetworkInput {
  stations: StationDefinition[];
  lines: LineDefinition[];
  walkingTransfers: WalkingTransfer[];
  segmentTimeOverrides?: Record<string, number>;
  labelOverrides?: Record<string, Partial<LabelPlacement> | undefined>;
  /** Tracés à angles de 45° entre stations (style plan de métro) au lieu de lignes droites. */
  octilinear?: boolean;
  /** Écart entre deux lignes parallèles sur un même tronçon (unités de carte). */
  parallelSpacing?: number;
}

export class NetworkDataError extends Error {
  constructor(public readonly issues: DataIssue[]) {
    super(`Données réseau invalides :\n${issues.map((i) => `- [${i.code}] ${i.message}`).join('\n')}`);
    this.name = 'NetworkDataError';
  }
}

const isWaypoint = (item: PathItem): item is Waypoint => typeof item !== 'string';

export function segmentKey(line: LineId, a: string, b: string): string {
  return a < b ? `${line}:${a}|${b}` : `${line}:${b}|${a}`;
}

function dist(p: Waypoint, q: Waypoint): number {
  return Math.hypot(q.x - p.x, q.y - p.y);
}

/**
 * Vérifie les données brutes. Ne lève pas d'exception : retourne la liste des problèmes
 * pour qu'ils puissent être affichés dans l'interface.
 */
export function validateNetworkInput(input: NetworkInput): DataIssue[] {
  const issues: DataIssue[] = [];
  const ids = new Set<string>();
  for (const s of input.stations) {
    if (ids.has(s.id)) issues.push({ level: 'error', code: 'DUPLICATE_STATION', message: `Station en double : ${s.id}` });
    ids.add(s.id);
    if (!s.name.trim()) issues.push({ level: 'error', code: 'EMPTY_NAME', message: `Station sans nom : ${s.id}` });
    if ((s.x === undefined) !== (s.y === undefined)) {
      issues.push({ level: 'error', code: 'PARTIAL_COORDS', message: `Coordonnées incomplètes : ${s.id}` });
    }
    if (s.residential <= 0 || s.employment <= 0) {
      issues.push({ level: 'error', code: 'BAD_WEIGHT', message: `Poids de demande invalide : ${s.id}` });
    }
  }

  const used = new Set<string>();
  const lineIds = new Set<string>();
  const occurrences = new Map<string, Set<string>>();
  for (const line of input.lines) {
    if (lineIds.has(line.id)) issues.push({ level: 'error', code: 'DUPLICATE_LINE', message: `Ligne en double : ${line.id}` });
    lineIds.add(line.id);
    if (line.baseFrequency <= 0 || line.maxFrequency < line.baseFrequency) {
      issues.push({ level: 'error', code: 'BAD_FREQUENCY', message: `Fréquences incohérentes sur la ligne ${line.id}` });
    }
    if (line.branches.length === 0) issues.push({ level: 'error', code: 'EMPTY_LINE', message: `Ligne ${line.id} sans tracé` });
    line.branches.forEach((branch, bi) => {
      const stationsInBranch = branch.filter((i): i is string => !isWaypoint(i));
      if (stationsInBranch.length < 2) {
        issues.push({ level: 'error', code: 'SHORT_BRANCH', message: `Ligne ${line.id}, branche ${bi + 1} : moins de 2 stations` });
      }
      if (isWaypoint(branch[0]) || isWaypoint(branch[branch.length - 1])) {
        issues.push({ level: 'error', code: 'WAYPOINT_END', message: `Ligne ${line.id}, branche ${bi + 1} : un tracé doit commencer et finir par une station` });
      }
      const seen = new Set<string>();
      for (const id of stationsInBranch) {
        if (!ids.has(id)) {
          issues.push({ level: 'error', code: 'UNKNOWN_STATION', message: `Ligne ${line.id} : station inconnue « ${id} »` });
        }
        if (seen.has(id)) issues.push({ level: 'error', code: 'LOOP', message: `Ligne ${line.id} : « ${id} » apparaît deux fois dans une branche` });
        seen.add(id);
        used.add(id);
        if (!occurrences.has(id)) occurrences.set(id, new Set());
        occurrences.get(id)!.add(line.id);
      }
      if (bi > 0) {
        const first = stationsInBranch[0];
        const last = stationsInBranch[stationsInBranch.length - 1];
        const inPrevious = line.branches.slice(0, bi).some((b) => b.includes(first) || b.includes(last));
        if (!inPrevious) {
          issues.push({ level: 'error', code: 'DETACHED_BRANCH', message: `Ligne ${line.id}, branche ${bi + 1} : ne part pas d'une station déjà tracée` });
        }
      }
    });
  }

  const byId = new Map(input.stations.map((s) => [s.id, s]));
  for (const s of input.stations) {
    if (!used.has(s.id)) issues.push({ level: 'warning', code: 'ORPHAN_STATION', message: `Station non desservie : ${s.id}` });
  }
  for (const [id, lines] of occurrences) {
    const def = byId.get(id);
    if (lines.size > 1 && def && def.x === undefined) {
      issues.push({ level: 'error', code: 'UNANCHORED_INTERCHANGE', message: `Correspondance sans coordonnées fixes : ${id}` });
    }
  }
  for (const line of input.lines) {
    for (const branch of line.branches) {
      for (const end of [branch[0], branch[branch.length - 1]]) {
        if (typeof end === 'string' && byId.get(end)?.x === undefined) {
          issues.push({ level: 'error', code: 'UNANCHORED_END', message: `Extrémité de tracé sans coordonnées : ${end}` });
        }
      }
    }
  }
  for (const t of input.walkingTransfers) {
    for (const id of [t.from, t.to]) {
      if (!ids.has(id)) issues.push({ level: 'error', code: 'UNKNOWN_TRANSFER', message: `Correspondance vers une station inconnue : ${id}` });
    }
    if (t.from === t.to) issues.push({ level: 'error', code: 'SELF_TRANSFER', message: `Correspondance d'une station vers elle-même : ${t.from}` });
  }
  for (const key of Object.keys(input.segmentTimeOverrides ?? {})) {
    const [line, pair] = key.split(':');
    const [a, b] = (pair ?? '').split('|');
    const def = input.lines.find((l) => l.id === line);
    const adjacent = def?.branches.some((br) => {
      const st = br.filter((i): i is string => !isWaypoint(i));
      return st.some((s, i) => (s === a && st[i + 1] === b) || (s === b && st[i + 1] === a));
    });
    if (!adjacent) issues.push({ level: 'error', code: 'BAD_TIME_OVERRIDE', message: `Temps de parcours défini pour un tronçon inexistant : ${key}` });
  }
  return issues;
}

interface ResolvedBranch {
  line: LineDefinition;
  stations: string[];
  /** Polyligne complète de la branche et abscisse curviligne de chaque station. */
  polyline: Waypoint[];
  cumulative: number[];
  stationArc: number[];
}

/** Calcule les positions de toutes les stations en interpolant le long des tracés. */
function resolvePositions(input: NetworkInput) {
  const pos = new Map<string, Waypoint>();
  for (const s of input.stations) if (s.x !== undefined && s.y !== undefined) pos.set(s.id, { x: s.x, y: s.y });

  const branches: ResolvedBranch[] = [];
  for (const line of input.lines) {
    for (const branch of line.branches) {
      // Découpe la branche en sections entre points connus consécutifs (stations ancrées ou points de passage).
      const polyline: Waypoint[] = [];
      const stationsOrder: string[] = [];
      const stationArc: number[] = [];
      const cumulative: number[] = [];
      let i = 0;
      while (i < branch.length) {
        const item = branch[i];
        const known = isWaypoint(item) ? item : pos.get(item);
        if (!known) {
          i++;
          continue;
        }
        // Prochain élément connu (station ancrée ou déjà résolue, ou point de passage).
        let j = i + 1;
        const pending: string[] = [];
        const via: Waypoint[] = [];
        while (j < branch.length) {
          const it = branch[j];
          if (isWaypoint(it)) {
            via.push(it);
            j++;
            continue;
          }
          if (pos.has(it)) break;
          pending.push(it);
          j++;
        }
        if (polyline.length === 0) {
          polyline.push(known);
          cumulative.push(0);
        }
        if (!isWaypoint(item) && stationsOrder[stationsOrder.length - 1] !== item) {
          stationsOrder.push(item);
          stationArc.push(cumulative[cumulative.length - 1]);
        }
        if (j >= branch.length) break;
        const target = pos.get(branch[j] as string)!;
        const sectionStart = cumulative[cumulative.length - 1];
        for (const p of [...via, target]) {
          const last = polyline[polyline.length - 1];
          polyline.push(p);
          cumulative.push(cumulative[cumulative.length - 1] + dist(last, p));
        }
        const sectionEnd = cumulative[cumulative.length - 1];
        // Répartit uniformément les stations non ancrées sur la section.
        pending.forEach((id, k) => {
          const arc = sectionStart + ((k + 1) * (sectionEnd - sectionStart)) / (pending.length + 1);
          pos.set(id, pointAt(polyline, cumulative, arc));
          stationsOrder.push(id);
          stationArc.push(arc);
        });
        i = j;
      }
      branches.push({ line, stations: stationsOrder, polyline, cumulative, stationArc });
    }
  }
  return { pos, branches };
}

function pointAt(polyline: Waypoint[], cumulative: number[], arc: number): Waypoint {
  for (let k = 1; k < polyline.length; k++) {
    if (arc <= cumulative[k] + 1e-9) {
      const seg = cumulative[k] - cumulative[k - 1];
      const t = seg === 0 ? 0 : (arc - cumulative[k - 1]) / seg;
      return {
        x: polyline[k - 1].x + t * (polyline[k].x - polyline[k - 1].x),
        y: polyline[k - 1].y + t * (polyline[k].y - polyline[k - 1].y),
      };
    }
  }
  return { ...polyline[polyline.length - 1] };
}

function subPolyline(polyline: Waypoint[], cumulative: number[], from: number, to: number): Waypoint[] {
  const pts: Waypoint[] = [pointAt(polyline, cumulative, from)];
  for (let k = 0; k < polyline.length; k++) {
    if (cumulative[k] > from + 1e-6 && cumulative[k] < to - 1e-6) pts.push({ ...polyline[k] });
  }
  pts.push(pointAt(polyline, cumulative, to));
  return pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
}

function polylineLength(points: Waypoint[]): number {
  let l = 0;
  for (let k = 1; k < points.length; k++) l += dist(points[k - 1], points[k]);
  return l;
}

function hashString(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Construit le réseau. Lève NetworkDataError si les données contiennent des erreurs bloquantes. */
export function buildNetwork(input: NetworkInput): { network: Network; issues: DataIssue[] } {
  const issues = validateNetworkInput(input);
  if (issues.some((i) => i.level === 'error')) throw new NetworkDataError(issues);

  const { pos, branches } = resolvePositions(input);

  // Lignes desservant chaque station.
  const stationLines = new Map<string, Set<LineId>>();
  for (const b of branches) {
    for (const id of b.stations) {
      if (!stationLines.has(id)) stationLines.set(id, new Set());
      stationLines.get(id)!.add(b.line.id);
    }
  }

  // Tronçons (dédupliqués) et géométrie.
  const segments: Segment[] = [];
  const segmentById = new Map<string, Segment>();
  for (const b of branches) {
    for (let k = 0; k + 1 < b.stations.length; k++) {
      const a = b.stations[k];
      const c = b.stations[k + 1];
      const id = segmentKey(b.line.id, a, c);
      if (segmentById.has(id)) continue;
      const points = subPolyline(b.polyline, b.cumulative, b.stationArc[k], b.stationArc[k + 1]);
      const length = polylineLength(points);
      const speed = (b.line.commercialSpeed * 1000) / 3600;
      const override = input.segmentTimeOverrides?.[id];
      const baseTravelTime = Math.round(
        override ?? Math.max(MIN_SEGMENT_SECONDS, DWELL_SECONDS + (length * MAP_UNIT_METERS) / speed),
      );
      const seg: Segment = {
        id,
        index: segments.length,
        line: b.line.id,
        a,
        b: c,
        points,
        length,
        baseTravelTime,
        serviceShare: 1,
      };
      segments.push(seg);
      segmentById.set(id, seg);
    }
  }

  // Missions : du premier terminus de la ligne vers chacun des autres terminus.
  // La part de service d'un tronçon = proportion des missions qui l'empruntent.
  for (const line of input.lines) {
    const lineSegs = segments.filter((s) => s.line === line.id);
    const adj = new Map<string, string[]>();
    for (const s of lineSegs) {
      if (!adj.has(s.a)) adj.set(s.a, []);
      if (!adj.has(s.b)) adj.set(s.b, []);
      adj.get(s.a)!.push(s.b);
      adj.get(s.b)!.push(s.a);
    }
    const termini = [...adj.entries()].filter(([, n]) => n.length === 1).map(([id]) => id);
    const origin = line.branches[0][0] as string;
    const others = termini.filter((t) => t !== origin);
    if (others.length <= 1) continue;
    const count = new Map<string, number>();
    for (const dest of others) {
      // Parcours en largeur (la ligne est un arbre).
      const prev = new Map<string, string | null>([[origin, null]]);
      const queue = [origin];
      while (queue.length) {
        const cur = queue.shift()!;
        for (const n of adj.get(cur) ?? []) {
          if (!prev.has(n)) {
            prev.set(n, cur);
            queue.push(n);
          }
        }
      }
      let cur: string | null | undefined = dest;
      while (cur && prev.get(cur)) {
        const p: string = prev.get(cur)!;
        const key = segmentKey(line.id, cur, p);
        count.set(key, (count.get(key) ?? 0) + 1);
        cur = p;
      }
    }
    for (const s of lineSegs) s.serviceShare = (count.get(s.id) ?? others.length) / others.length;
  }

  if (input.octilinear) applyOctilinear(segments, pos, input.parallelSpacing ?? 8);

  // Arcs orientés.
  const edges: DirectedEdge[] = [];
  for (const s of segments) {
    edges.push({ index: edges.length, segment: s.index, line: s.line, from: s.a, to: s.b, direction: 1 });
    edges.push({ index: edges.length, segment: s.index, line: s.line, from: s.b, to: s.a, direction: -1 });
  }

  // Stations résolues.
  const degree = new Map<string, number>();
  for (const s of segments) {
    degree.set(`${s.line}:${s.a}`, (degree.get(`${s.line}:${s.a}`) ?? 0) + 1);
    degree.set(`${s.line}:${s.b}`, (degree.get(`${s.line}:${s.b}`) ?? 0) + 1);
  }
  const lineOrder = input.lines.map((l) => l.id);
  const stations: Station[] = input.stations
    .filter((def) => stationLines.has(def.id))
    .map((def, index) => {
      const p = pos.get(def.id)!;
      const lines = [...stationLines.get(def.id)!].sort((a, b) => lineOrder.indexOf(a) - lineOrder.indexOf(b));
      const isTerminus = lines.some((l) => degree.get(`${l}:${def.id}`) === 1);
      const transfersOnFoot = input.walkingTransfers.some((t) => t.from === def.id || t.to === def.id);
      return {
        id: def.id,
        index,
        name: def.name,
        mapLabel: def.shortName ?? def.name,
        x: Math.round(p.x * 10) / 10,
        y: Math.round(p.y * 10) / 10,
        lines,
        residential: def.residential,
        employment: def.employment,
        capacity: def.capacity ?? PLATFORM_CAPACITY * 2 * lines.length,
        label: { dx: 9, dy: 3, anchor: 'start' },
        lat: def.lat,
        lon: def.lon,
        isTerminus,
        isInterchange: lines.length > 1 || transfersOnFoot,
        note: def.note,
      };
    });
  const stationById = new Map(stations.map((s) => [s.id, s]));

  placeLabels(stations, segments, input.labelOverrides ?? {});

  // Avertissements de géométrie : stations trop proches.
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const d = Math.hypot(stations[i].x - stations[j].x, stations[i].y - stations[j].y);
      if (d < 18) {
        issues.push({
          level: 'warning',
          code: 'STATIONS_TOO_CLOSE',
          message: `Stations très proches sur le plan : ${stations[i].name} / ${stations[j].name} (${d.toFixed(0)} u)`,
        });
      }
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of stations) {
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x);
    maxY = Math.max(maxY, s.y);
  }

  const fingerprint = hashString(
    stations.map((s) => s.id).join(',') + '#' + segments.map((s) => s.id).join(','),
  );

  return {
    network: {
      stations,
      stationById,
      lines: input.lines,
      lineById: new Map(input.lines.map((l) => [l.id, l])),
      segments,
      segmentById,
      edges,
      walkingTransfers: input.walkingTransfers,
      bounds: { minX, minY, maxX, maxY },
      fingerprint,
    },
    issues,
  };
}

/* ------------------------------------------------------------------------------------------
 * Tracés « plan de métro » : chaque inter-station est dessinée avec des segments horizontaux,
 * verticaux ou à 45° (un coude centré), comme dans les plans schématiques et Mini Metro.
 * Les lignes qui partagent la même paire de stations sont décalées parallèlement.
 * ---------------------------------------------------------------------------------------- */

function octiPath(a: Waypoint, b: Waypoint): Waypoint[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  const sx = Math.sign(dx);
  const sy = Math.sign(dy);
  const diag = Math.min(adx, ady);
  const straight = Math.max(adx, ady) - diag;
  if (diag < 4 || straight < 4) return [a, b];
  const half = straight / 2;
  const p1 = adx > ady ? { x: a.x + sx * half, y: a.y } : { x: a.x, y: a.y + sy * half };
  const p2 = adx > ady ? { x: p1.x + sx * diag, y: p1.y + sy * diag } : { x: p1.x + sx * diag, y: p1.y + sy * diag };
  return [a, p1, p2, b];
}

function applyOctilinear(segments: Segment[], pos: Map<string, Waypoint>, spacing: number) {
  const groups = new Map<string, Segment[]>();
  for (const s of segments) {
    const key = s.a < s.b ? `${s.a}|${s.b}` : `${s.b}|${s.a}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  for (const group of groups.values()) {
    group.forEach((s, i) => {
      // Orientation commune (station de plus petit identifiant en premier) pour des décalages cohérents.
      const [from, to] = s.a < s.b ? [s.a, s.b] : [s.b, s.a];
      let pts = octiPath(pos.get(from)!, pos.get(to)!);
      const offset = (i - (group.length - 1) / 2) * spacing;
      if (offset !== 0) pts = offsetPoints(pts, offset);
      if (from !== s.a) pts = [...pts].reverse();
      s.points = pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 }));
      s.length = polylineLength(s.points);
    });
  }
}

function offsetPoints(points: Waypoint[], d: number): Waypoint[] {
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

/* ------------------------------------------------------------------------------------------
 * Placement des étiquettes : algorithme glouton avec évitement des collisions.
 * Chaque étiquette est approximée par une suite de points le long de sa ligne de base.
 * ---------------------------------------------------------------------------------------- */

const CHAR_W = 6.8;
const FONT_H = 13;

const CANDIDATES: LabelPlacement[] = [
  { dx: 13, dy: 4.5, anchor: 'start', rotate: 0 },
  { dx: -13, dy: 4.5, anchor: 'end', rotate: 0 },
  { dx: 0, dy: -13, anchor: 'middle', rotate: 0 },
  { dx: 0, dy: 22, anchor: 'middle', rotate: 0 },
  { dx: 9, dy: -9, anchor: 'start', rotate: -35 },
  { dx: -9, dy: 12, anchor: 'end', rotate: -35 },
  { dx: 9, dy: 12, anchor: 'start', rotate: 35 },
  { dx: -9, dy: -8, anchor: 'end', rotate: 35 },
];

function labelSamples(st: { x: number; y: number }, text: string, c: LabelPlacement, scale: number): Waypoint[] {
  const width = text.length * CHAR_W;
  const rot = ((c.rotate ?? 0) * Math.PI) / 180;
  const ux = Math.cos(rot);
  const uy = Math.sin(rot);
  // Repère : origine au point d'ancrage, axe le long du texte, hauteur vers le haut.
  const ox = st.x + c.dx * scale;
  const oy = st.y + c.dy * scale;
  const start = c.anchor === 'start' ? 0 : c.anchor === 'end' ? -width : -width / 2;
  const pts: Waypoint[] = [];
  for (let t = start; t <= start + width; t += 7) {
    // Point au milieu de la hauteur du texte (décalé de FONT_H/3 au-dessus de la ligne de base).
    const nx = uy * (FONT_H / 3);
    const ny = -ux * (FONT_H / 3);
    pts.push({ x: ox + ux * t + nx, y: oy + uy * t + ny });
  }
  return pts;
}

function placeLabels(
  stations: Station[],
  segments: Segment[],
  overrides: Record<string, Partial<LabelPlacement> | undefined>,
) {
  const CELL = 16;
  const makeGrid = () => {
    const grid = new Map<string, Waypoint[]>();
    return {
      add(p: Waypoint) {
        const k = `${Math.floor(p.x / CELL)},${Math.floor(p.y / CELL)}`;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k)!.push(p);
      },
      /** Nombre d'obstacles dans une ellipse (rx, ry) autour du point. */
      near(p: Waypoint, rx: number, ry: number) {
        let hits = 0;
        const cx = Math.floor(p.x / CELL);
        const cy = Math.floor(p.y / CELL);
        for (let i = -1; i <= 1; i++) {
          for (let j = -1; j <= 1; j++) {
            for (const q of grid.get(`${cx + i},${cy + j}`) ?? []) {
              const ex = (q.x - p.x) / rx;
              const ey = (q.y - p.y) / ry;
              if (ex * ex + ey * ey < 1) hits++;
            }
          }
        }
        return hits;
      },
    };
  };
  const lineGrid = makeGrid();
  const labelGrid = makeGrid();
  const add = (p: Waypoint) => lineGrid.add(p);

  // Obstacles : tracés et stations.
  for (const s of segments) {
    for (let k = 1; k < s.points.length; k++) {
      const p = s.points[k - 1];
      const q = s.points[k];
      const n = Math.max(1, Math.ceil(dist(p, q) / 4));
      for (let t = 0; t <= n; t++) add({ x: p.x + ((q.x - p.x) * t) / n, y: p.y + ((q.y - p.y) * t) / n });
    }
  }
  for (const s of stations) add({ x: s.x, y: s.y });

  const order = [...stations].sort((a, b) => Number(b.isInterchange) - Number(a.isInterchange) || Number(b.isTerminus) - Number(a.isTerminus));
  for (const st of order) {
    const scale = st.isInterchange ? 1.35 : 1;
    const override = overrides[st.id];
    if (override && override.dx !== undefined && override.dy !== undefined && override.anchor) {
      st.label = { rotate: 0, ...override } as LabelPlacement;
    } else {
      let best = CANDIDATES[0];
      let bestScore = Infinity;
      CANDIDATES.forEach((c, idx) => {
        const pts = labelSamples(st, st.mapLabel, c, scale);
        let score = idx * 0.3; // légère préférence pour l'ordre des candidats
        for (const p of pts) score += lineGrid.near(p, 8, 8) + 4 * labelGrid.near(p, 9, 14);
        if (score < bestScore) {
          bestScore = score;
          best = c;
        }
      });
      st.label = { ...best, ...(override ?? {}) };
      st.label.dx = (override?.dx ?? best.dx * scale);
      st.label.dy = (override?.dy ?? best.dy * scale);
    }
    for (const p of labelSamples(st, st.mapLabel, st.label, 1)) labelGrid.add(p);
  }
}
