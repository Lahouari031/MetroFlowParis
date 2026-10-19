/**
 * Graphe de recherche d'itinéraires et algorithme de Dijkstra.
 *
 * Nœuds :
 *  - E(s) : entrée dans la station s (origine d'un trajet) ;
 *  - X(s) : sortie de la station s (destination) ;
 *  - P(s, ligne, sens) : quai d'une ligne dans un sens.
 * Arcs :
 *  - ENTRY  E(s) → P : attente moyenne du train (½ intervalle) ;
 *  - RIDE   P → P'   : parcours d'un tronçon (temps × pénalité d'encombrement) ;
 *  - TRANSFER P → P'' (même station) : marche + pénalité de correspondance + attente ;
 *  - EXIT   P → X(s) ;
 *  - WALK   X(s) → E(t) : correspondance piétonne entre deux stations.
 */
import { DEFAULT_TRANSFER_SECONDS, STATION_TRANSFER_SECONDS } from '@/data/connections';
import type { Network } from '@/types/network';
import type { NetworkState } from './networkState';

export const ARC_ENTRY = 0;
export const ARC_EXIT = 1;
export const ARC_RIDE = 2;
export const ARC_TRANSFER = 3;
export const ARC_WALK = 4;

export interface CostProfile {
  name: string;
  /** Poids de l'attente (perçue plus pénible que le trajet). */
  waitWeight: number;
  /** Pénalité fixe par correspondance (s). */
  transferPenalty: number;
  /** Poids de la pénalité d'encombrement. */
  crowdWeight: number;
}

export const PROFILES: CostProfile[] = [
  { name: 'standard', waitWeight: 1.5, transferPenalty: 120, crowdWeight: 1 },
  { name: 'évitement de la congestion', waitWeight: 1.5, transferPenalty: 60, crowdWeight: 4 },
];

/** Profil « temps pur » : sert au temps de trajet de référence (calcul des retards). */
export const TIME_PROFILE: CostProfile = { name: 'temps', waitWeight: 1, transferPenalty: 0, crowdWeight: 0 };

/** Pénalité d'encombrement : nulle sous 70 % de saturation, croissance quadratique au-delà. */
export function crowdingPenalty(saturation: number): number {
  const x = Math.max(0, saturation - 0.7);
  return 2 * x * x;
}

export function transferSeconds(stationId: string): number {
  return STATION_TRANSFER_SECONDS[stationId] ?? DEFAULT_TRANSFER_SECONDS;
}

export class RoutingGraph {
  readonly S: number;
  readonly nodeCount: number;
  readonly arcFrom: Int32Array;
  readonly arcTo: Int32Array;
  readonly arcType: Uint8Array;
  /** RIDE : index d'arc orienté ; ENTRY/EXIT/TRANSFER : index de station ; WALK : index de correspondance. */
  readonly arcRef: Int32Array;
  /** Pour ENTRY et TRANSFER : quai d'arrivée (pour l'attente). */
  readonly adjStart: Int32Array;
  readonly adjArcs: Int32Array;
  /** Quai de chaque nœud plateforme : liste des arcs orientés au départ. */
  readonly platformEdges: number[][];
  readonly platformStation: Int32Array;
  readonly stationTransferBase: Float64Array;
  /** Nœud plateforme de départ de chaque arc orienté. */
  readonly edgeFromNode: Int32Array;

  constructor(private readonly network: Network) {
    const S = network.stations.length;
    this.S = S;
    const platformKey = new Map<string, number>();
    const platformEdges: number[][] = [];
    const platformStationList: number[] = [];
    const nodeOf = (stationId: string, line: string, dir: number) => {
      const key = `${stationId}|${line}|${dir}`;
      let id = platformKey.get(key);
      if (id === undefined) {
        id = 2 * S + platformEdges.length;
        platformKey.set(key, id);
        platformEdges.push([]);
        platformStationList.push(network.stationById.get(stationId)!.index);
      }
      return id;
    };
    const edgeFromNode = new Int32Array(network.edges.length);
    const edgeToNode = new Int32Array(network.edges.length);
    for (const e of network.edges) {
      edgeFromNode[e.index] = nodeOf(e.from, e.line, e.direction);
      edgeToNode[e.index] = nodeOf(e.to, e.line, e.direction);
      platformEdges[edgeFromNode[e.index] - 2 * S].push(e.index);
    }
    this.nodeCount = 2 * S + platformEdges.length;
    this.platformEdges = platformEdges;
    this.platformStation = Int32Array.from(platformStationList);
    this.edgeFromNode = edgeFromNode;

    const from: number[] = [];
    const to: number[] = [];
    const type: number[] = [];
    const ref: number[] = [];
    const add = (f: number, t: number, ty: number, r: number) => {
      from.push(f);
      to.push(t);
      type.push(ty);
      ref.push(r);
    };
    // Plateformes par station.
    const platformsByStation: number[][] = Array.from({ length: S }, () => []);
    platformStationList.forEach((s, i) => platformsByStation[s].push(2 * S + i));

    for (let s = 0; s < S; s++) {
      for (const p of platformsByStation[s]) {
        add(s, p, ARC_ENTRY, s);
        add(p, S + s, ARC_EXIT, s);
        for (const q of platformsByStation[s]) if (q !== p) add(p, q, ARC_TRANSFER, s);
      }
    }
    for (const e of network.edges) add(edgeFromNode[e.index], edgeToNode[e.index], ARC_RIDE, e.index);
    network.walkingTransfers.forEach((w, i) => {
      const a = network.stationById.get(w.from)!.index;
      const b = network.stationById.get(w.to)!.index;
      add(S + a, b, ARC_WALK, i);
      add(S + b, a, ARC_WALK, i);
    });

    const A = from.length;
    this.arcFrom = Int32Array.from(from);
    this.arcTo = Int32Array.from(to);
    this.arcType = Uint8Array.from(type);
    this.arcRef = Int32Array.from(ref);
    // CSR
    const counts = new Int32Array(this.nodeCount + 1);
    for (let a = 0; a < A; a++) counts[from[a] + 1]++;
    for (let n = 0; n < this.nodeCount; n++) counts[n + 1] += counts[n];
    this.adjStart = counts;
    const fill = counts.slice(0, this.nodeCount);
    this.adjArcs = new Int32Array(A);
    for (let a = 0; a < A; a++) this.adjArcs[fill[from[a]]++] = a;

    this.stationTransferBase = Float64Array.from(network.stations.map((st) => transferSeconds(st.id)));
  }

  get arcCount(): number {
    return this.arcFrom.length;
  }

  /** Intervalle de desserte d'un quai (le plus court parmi les arcs au départ). */
  platformHeadway(node: number, state: NetworkState): number {
    let h = Infinity;
    for (const e of this.platformEdges[node - 2 * this.S]) {
      if (state.edgeAvailable[e] && state.edgeHeadway[e] < h) h = state.edgeHeadway[e];
    }
    return h;
  }

  /**
   * Calcule les coûts de tous les arcs pour un profil donné.
   * @param saturation saturation courante par arc orienté (peut être nulle : pas d'encombrement).
   */
  computeCosts(state: NetworkState, profile: CostProfile, saturation: Float32Array | null, out?: Float64Array): Float64Array {
    const A = this.arcCount;
    const cost = out ?? new Float64Array(A);
    const S = this.S;
    const platformHeadway = new Float64Array(this.nodeCount - 2 * S);
    for (let p = 0; p < platformHeadway.length; p++) platformHeadway[p] = this.platformHeadway(2 * S + p, state);

    for (let a = 0; a < A; a++) {
      const r = this.arcRef[a];
      switch (this.arcType[a]) {
        case ARC_ENTRY: {
          const h = platformHeadway[this.arcTo[a] - 2 * S];
          cost[a] = state.stationOpen[r] && Number.isFinite(h) ? profile.waitWeight * 0.5 * h : Infinity;
          break;
        }
        case ARC_EXIT:
          cost[a] = state.stationOpen[r] ? 0 : Infinity;
          break;
        case ARC_TRANSFER: {
          const h = platformHeadway[this.arcTo[a] - 2 * S];
          const extra = state.stationTransferExtra[r];
          cost[a] =
            state.stationOpen[r] && Number.isFinite(extra) && Number.isFinite(h)
              ? this.stationTransferBase[r] + extra + profile.transferPenalty + profile.waitWeight * 0.5 * h
              : Infinity;
          break;
        }
        case ARC_RIDE: {
          if (!state.edgeAvailable[r]) {
            cost[a] = Infinity;
            break;
          }
          const sat = saturation ? saturation[r] : 0;
          cost[a] = state.edgeTravelTime[r] * (1 + profile.crowdWeight * crowdingPenalty(sat));
          break;
        }
        case ARC_WALK: {
          const w = this.network.walkingTransfers[r];
          cost[a] = w.walkSeconds + profile.transferPenalty;
          break;
        }
      }
    }
    return cost;
  }
}

/** Tas binaire minimal sur des nœuds entiers. */
export class MinHeap {
  private nodes: Int32Array;
  private keys: Float64Array;
  size = 0;
  constructor(capacity: number) {
    this.nodes = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }
  push(node: number, key: number) {
    if (this.size >= this.nodes.length) {
      const n = new Int32Array(this.nodes.length * 2);
      n.set(this.nodes);
      const k = new Float64Array(this.keys.length * 2);
      k.set(this.keys);
      this.nodes = n;
      this.keys = k;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= key) break;
      this.nodes[i] = this.nodes[p];
      this.keys[i] = this.keys[p];
      i = p;
    }
    this.nodes[i] = node;
    this.keys[i] = key;
  }
  pop(): number {
    const top = this.nodes[0];
    const lastNode = this.nodes[--this.size];
    const lastKey = this.keys[this.size];
    let i = 0;
    for (;;) {
      let c = 2 * i + 1;
      if (c >= this.size) break;
      if (c + 1 < this.size && this.keys[c + 1] < this.keys[c]) c++;
      if (this.keys[c] >= lastKey) break;
      this.nodes[i] = this.nodes[c];
      this.keys[i] = this.keys[c];
      i = c;
    }
    this.nodes[i] = lastNode;
    this.keys[i] = lastKey;
    return top;
  }
  topKey(): number {
    return this.keys[0];
  }
  clear() {
    this.size = 0;
  }
}

export interface ShortestPathTree {
  origin: number;
  dist: Float64Array;
  prevArc: Int32Array;
}

/** Dijkstra depuis l'entrée E(origin). */
export function dijkstra(graph: RoutingGraph, cost: Float64Array, origin: number, heap?: MinHeap): ShortestPathTree {
  const N = graph.nodeCount;
  const dist = new Float64Array(N).fill(Infinity);
  const prevArc = new Int32Array(N).fill(-1);
  const done = new Uint8Array(N);
  const h = heap ?? new MinHeap(N * 2);
  h.clear();
  dist[origin] = 0;
  h.push(origin, 0);
  while (h.size > 0) {
    const d = h.topKey();
    const u = h.pop();
    if (done[u]) continue;
    done[u] = 1;
    if (d > dist[u]) continue;
    for (let k = graph.adjStart[u]; k < graph.adjStart[u + 1]; k++) {
      const a = graph.adjArcs[k];
      const c = cost[a];
      if (c === Infinity) continue;
      const v = graph.arcTo[a];
      const nd = d + c;
      if (nd < dist[v]) {
        dist[v] = nd;
        prevArc[v] = a;
        h.push(v, nd);
      }
    }
  }
  return { origin, dist, prevArc };
}

export function createHeap(graph: RoutingGraph): MinHeap {
  return new MinHeap(graph.nodeCount * 2);
}

/** Liste des arcs du chemin E(origin) → X(dest), ou null si inaccessible. */
export function extractArcPath(graph: RoutingGraph, tree: ShortestPathTree, dest: number): number[] | null {
  const target = graph.S + dest;
  if (!Number.isFinite(tree.dist[target])) return null;
  const arcs: number[] = [];
  let node = target;
  let guard = 0;
  while (node !== tree.origin) {
    const a = tree.prevArc[node];
    if (a < 0 || ++guard > graph.nodeCount) return null;
    arcs.push(a);
    node = graph.arcFrom[a];
  }
  arcs.reverse();
  return arcs;
}

/** Arcs orientés (tronçons parcourus) d'un chemin. */
export function rideEdges(graph: RoutingGraph, arcs: number[]): number[] {
  const out: number[] = [];
  for (const a of arcs) if (graph.arcType[a] === ARC_RIDE) out.push(graph.arcRef[a]);
  return out;
}

export function pathCost(cost: Float64Array, arcs: number[]): number {
  let c = 0;
  for (const a of arcs) c += cost[a];
  return c;
}
