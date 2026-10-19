/**
 * Affectation des voyageurs aux itinéraires.
 *
 * Méthode : pour chaque origine, trois arbres de plus courts chemins sont calculés
 * (profils « standard », « évitement de la congestion », « moins de correspondances »).
 * Les itinéraires distincts obtenus pour un couple origine–destination sont évalués
 * avec le coût généralisé standard puis répartis par un modèle logit :
 *   part_i ∝ exp(−(coût_i − coût_min) / θ), θ = LOGIT_SCALE secondes.
 * Les options trop coûteuses ou marginales sont écartées.
 */
import type { Network } from '@/types/network';
import type { NetworkState } from './networkState';
import {
  createHeap,
  crowdingPenalty,
  dijkstra,
  extractArcPath,
  pathCost,
  PROFILES,
  rideEdges,
  RoutingGraph,
  type MinHeap,
  type ShortestPathTree,
} from './pathfinding';

export const LOGIT_SCALE = 240;
export const MAX_COST_RATIO = 1.35;
export const MAX_COST_SLACK = 240;
export const MIN_SHARE = 0.05;

export interface RouteOption {
  edges: Int32Array;
  cost: number;
  share: number;
}

interface CacheEntry {
  epoch: number;
  options: RouteOption[];
}

export class Router {
  readonly graph: RoutingGraph;
  private costs: Float64Array[];
  private trees: (ShortestPathTree | null)[][];
  private originEpoch: Int32Array;
  private cache = new Map<number, CacheEntry>();
  private heap: MinHeap;
  private state!: NetworkState;
  private refreshCursor = 0;
  /** Nombre d'exécutions de Dijkstra (diagnostic de performance). */
  dijkstraRuns = 0;

  constructor(private readonly network: Network) {
    this.graph = new RoutingGraph(network);
    this.costs = PROFILES.map(() => new Float64Array(this.graph.arcCount));
    this.trees = PROFILES.map(() => new Array<ShortestPathTree | null>(network.stations.length).fill(null));
    this.originEpoch = new Int32Array(network.stations.length);
    this.heap = createHeap(this.graph);
  }

  /**
   * Met à jour les coûts. full = true : changement d'état du réseau, tous les arbres sont invalidés.
   * full = false : mise à jour de l'encombrement, les arbres sont rafraîchis progressivement.
   */
  update(state: NetworkState, saturation: Float32Array | null, full: boolean) {
    this.state = state;
    PROFILES.forEach((p, i) => this.graph.computeCosts(state, p, saturation, this.costs[i]));
    if (full) {
      for (const t of this.trees) t.fill(null);
      for (let o = 0; o < this.originEpoch.length; o++) this.originEpoch[o]++;
      this.cache.clear();
    }
  }

  /** Recalcule les arbres de `count` origines (rafraîchissement progressif de l'encombrement). */
  refreshSome(count: number) {
    const S = this.network.stations.length;
    for (let k = 0; k < count; k++) {
      const o = this.refreshCursor;
      this.refreshCursor = (this.refreshCursor + 1) % S;
      for (let p = 0; p < PROFILES.length; p++) this.trees[p][o] = null;
      this.originEpoch[o]++;
    }
  }

  tree(profile: number, origin: number): ShortestPathTree {
    let t = this.trees[profile][origin];
    if (!t) {
      t = dijkstra(this.graph, this.costs[profile], origin, this.heap);
      this.dijkstraRuns++;
      this.trees[profile][origin] = t;
    }
    return t;
  }

  /** Coût généralisé standard du meilleur itinéraire origine → destination. */
  bestCost(origin: number, dest: number): number {
    return this.tree(0, origin).dist[this.graph.S + dest];
  }

  /** Itinéraires possibles et parts modales pour un couple origine–destination. */
  options(origin: number, dest: number): RouteOption[] {
    const key = origin * this.network.stations.length + dest;
    const cached = this.cache.get(key);
    if (cached && cached.epoch === this.originEpoch[origin]) return cached.options;

    const found: { edges: number[]; cost: number; sig: string }[] = [];
    for (let p = 0; p < PROFILES.length; p++) {
      const arcs = extractArcPath(this.graph, this.tree(p, origin), dest);
      if (!arcs) continue;
      const edges = rideEdges(this.graph, arcs);
      if (edges.length === 0) continue;
      const sig = edges.join(',');
      if (found.some((f) => f.sig === sig)) continue;
      found.push({ edges, cost: pathCost(this.costs[0], arcs), sig });
    }
    let options: RouteOption[] = [];
    if (found.length > 0) {
      const cmin = Math.min(...found.map((f) => f.cost));
      const kept = found.filter((f) => f.cost <= cmin * MAX_COST_RATIO + MAX_COST_SLACK);
      const weights = kept.map((f) => Math.exp(-(f.cost - cmin) / LOGIT_SCALE));
      let sum = weights.reduce((a, b) => a + b, 0);
      options = kept.map((f, i) => ({ edges: Int32Array.from(f.edges), cost: f.cost, share: weights[i] / sum }));
      options = options.filter((o) => o.share >= MIN_SHARE);
      sum = options.reduce((a, o) => a + o.share, 0);
      for (const o of options) o.share /= sum;
    }
    this.cache.set(key, { epoch: this.originEpoch[origin], options });
    return options;
  }

  /** Meilleur itinéraire (profil standard) depuis une station, ou null si inaccessible. */
  bestRoute(origin: number, dest: number): Int32Array | null {
    const arcs = extractArcPath(this.graph, this.tree(0, origin), dest);
    if (!arcs) return null;
    const edges = rideEdges(this.graph, arcs);
    return edges.length ? Int32Array.from(edges) : null;
  }

  /**
   * Coût généralisé (profil standard) de la fin d'un itinéraire, à partir de l'arc d'indice `start`.
   * onboard = le voyageur est déjà à bord du train qui emprunte route[start].
   * Retourne Infinity si l'itinéraire n'est plus réalisable.
   */
  remainingCost(route: Int32Array, start: number, onboard: boolean): number {
    const st = this.state;
    const net = this.network;
    const profile = PROFILES[0];
    let cost = 0;
    for (let k = start; k < route.length; k++) {
      const e = route[k];
      if (!st.edgeAvailable[e]) return Infinity;
      const edge = net.edges[e];
      const fromIdx = net.stationById.get(edge.from)!.index;
      if (k === start) {
        if (!onboard) {
          if (!st.stationOpen[fromIdx]) return Infinity;
          cost += profile.waitWeight * 0.5 * st.edgeHeadway[e];
        }
      } else {
        const prev = net.edges[route[k - 1]];
        if (prev.to !== edge.from) {
          // Correspondance piétonne.
          const w = net.walkingTransfers.find(
            (t) => (t.from === prev.to && t.to === edge.from) || (t.to === prev.to && t.from === edge.from),
          );
          const toIdx = net.stationById.get(prev.to)!.index;
          if (!w || !st.stationOpen[toIdx] || !st.stationOpen[fromIdx]) return Infinity;
          cost += w.walkSeconds + profile.transferPenalty + profile.waitWeight * 0.5 * st.edgeHeadway[e];
        } else if (prev.line !== edge.line || prev.direction !== edge.direction) {
          const extra = st.stationTransferExtra[fromIdx];
          if (!st.stationOpen[fromIdx] || !Number.isFinite(extra)) return Infinity;
          cost += this.graph.stationTransferBase[fromIdx] + extra + profile.transferPenalty + profile.waitWeight * 0.5 * st.edgeHeadway[e];
        }
      }
      cost += this.costs[0][this.rideArc(e)];
    }
    const last = net.edges[route[route.length - 1]];
    if (!st.stationOpen[net.stationById.get(last.to)!.index]) return Infinity;
    return cost;
  }

  private rideArcIndex: Int32Array | null = null;
  private rideArc(edge: number): number {
    if (!this.rideArcIndex) {
      this.rideArcIndex = new Int32Array(this.network.edges.length);
      for (let a = 0; a < this.graph.arcCount; a++) {
        if (this.graph.arcType[a] === 2) this.rideArcIndex[this.graph.arcRef[a]] = a;
      }
    }
    return this.rideArcIndex[edge];
  }
}

/** Temps de trajet de référence (s) entre toutes les stations, réseau nominal sans encombrement. */
export function referenceTravelTimes(graph: RoutingGraph, cost: Float64Array): Float64Array {
  const S = graph.S;
  const out = new Float64Array(S * S);
  const heap = createHeap(graph);
  for (let o = 0; o < S; o++) {
    const tree = dijkstra(graph, cost, o, heap);
    for (let d = 0; d < S; d++) out[o * S + d] = o === d ? 0 : tree.dist[S + d];
  }
  return out;
}

export { crowdingPenalty };
