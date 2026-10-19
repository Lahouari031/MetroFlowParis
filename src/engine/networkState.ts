/**
 * État effectif du réseau : combine les données de référence, la régulation du joueur
 * et les effets des incidents actifs. Recalculé uniquement lorsqu'un de ces éléments change.
 */
import type { Incident } from '@/types/incident';
import type { LineDefinition, LineId, Network } from '@/types/network';
import type { RegulationState, SimulationConfig } from '@/types/simulation';

/** Temps de retournement en terminus (s). */
export const TURNAROUND_SECONDS = 180;

export interface NetworkState {
  version: number;
  edgeAvailable: Uint8Array;
  edgeTravelTime: Float64Array;
  /** Capacité de transport (voyageurs / heure / sens). */
  edgeCapacity: Float64Array;
  /** Intervalle moyen entre deux trains desservant l'arc (s). */
  edgeHeadway: Float64Array;
  segmentAvailable: Uint8Array;
  /** 1 si un incident actif agit sur le tronçon. */
  segmentDisrupted: Uint8Array;
  stationOpen: Uint8Array;
  /** Les trains traversent une station fermée sans s'arrêter. */
  stationPassThrough: Uint8Array;
  /** Pénalité de correspondance supplémentaire (s), Infinity = impossible. */
  stationTransferExtra: Float64Array;
  stationDemandFactor: Float64Array;
  /** 1 si un incident actif concerne la station. */
  stationDisrupted: Uint8Array;
  lineFrequency: Record<LineId, number>;
  lineCapacity: Record<LineId, number>;
  lineTrains: Record<LineId, number>;
  /** Fréquence maximale permise par la flotte disponible. */
  lineFleetLimit: Record<LineId, number>;
  /** Rames disponibles (flotte de référence + réserve mobilisée). */
  lineFleet: Record<LineId, number>;
}

/** Temps de cycle (s) d'un train : aller-retour pondéré par la part de service + retournements. */
export function lineCycleSeconds(network: Network, line: LineId, travelTime: (segIndex: number) => number): number {
  let total = 0;
  for (const s of network.segments) if (s.line === line) total += 2 * travelTime(s.index) * s.serviceShare;
  return total + 2 * TURNAROUND_SECONDS;
}

/** Rames nécessaires pour assurer une fréquence donnée. */
export function trainsRequired(frequency: number, cycleSeconds: number): number {
  return Math.ceil((frequency * cycleSeconds) / 3600 - 1e-9);
}

/** Flotte de référence d'une ligne : rames nécessaires à la fréquence de référence en conditions nominales. */
export function referenceFleet(network: Network, line: LineDefinition): number {
  const cycle = lineCycleSeconds(network, line.id, (i) => network.segments[i].baseTravelTime);
  return trainsRequired(line.baseFrequency, cycle);
}

export function defaultRegulation(network: Network): RegulationState {
  const lines = {} as RegulationState['lines'];
  for (const l of network.lines) lines[l.id] = { frequency: l.baseFrequency, reserveMobilized: 0 };
  return { lines, globalFrequencyFactor: 1, closedStations: [], disabledSegments: [] };
}

export function computeNetworkState(
  network: Network,
  config: SimulationConfig,
  incidents: Incident[],
  version: number,
  /** Niveau de service horaire (voir servicePeriods.ts) : multiplie toutes les fréquences. */
  serviceLevel = 1,
): NetworkState {
  const S = network.stations.length;
  const G = network.segments.length;
  const E = network.edges.length;

  const segSpeed = new Float64Array(G).fill(1);
  const segTimeAdd = new Float64Array(G);
  const segCapFactor = new Float64Array(G).fill(1);
  const segmentAvailable = new Uint8Array(G).fill(1);
  const segmentDisrupted = new Uint8Array(G);
  const stationOpen = new Uint8Array(S).fill(1);
  const stationPassThrough = new Uint8Array(S).fill(1);
  const stationTransferExtra = new Float64Array(S);
  const stationDemandFactor = new Float64Array(S).fill(1);
  const stationDisrupted = new Uint8Array(S);
  const lineFreqFactor = {} as Record<LineId, number>;
  const lineSpeed = {} as Record<LineId, number>;
  for (const l of network.lines) {
    lineFreqFactor[l.id] = 1;
    lineSpeed[l.id] = 1;
  }

  const segIdx = (id: string) => network.segmentById.get(id)?.index ?? -1;
  const stIdx = (id: string) => network.stationById.get(id)?.index ?? -1;

  for (const inc of incidents) {
    if (inc.status !== 'active') continue;
    if (inc.target.kind === 'station' && inc.type !== 'crowd_surge') {
      const i = stIdx(inc.target.stationId);
      if (i >= 0) stationDisrupted[i] = 1;
    }
    for (const e of inc.effects) {
      switch (e.kind) {
        case 'segmentTimeAdd': {
          const i = segIdx(e.segmentId);
          if (i >= 0) {
            segTimeAdd[i] += e.seconds;
            segmentDisrupted[i] = 1;
          }
          break;
        }
        case 'segmentSpeedFactor': {
          const i = segIdx(e.segmentId);
          if (i >= 0) {
            segSpeed[i] *= e.factor;
            segmentDisrupted[i] = 1;
          }
          break;
        }
        case 'segmentCapacityFactor': {
          const i = segIdx(e.segmentId);
          if (i >= 0) {
            segCapFactor[i] *= e.factor;
            segmentDisrupted[i] = 1;
          }
          break;
        }
        case 'segmentClosed': {
          const i = segIdx(e.segmentId);
          if (i >= 0) {
            segmentAvailable[i] = 0;
            segmentDisrupted[i] = 1;
          }
          break;
        }
        case 'stationClosed': {
          const i = stIdx(e.stationId);
          if (i >= 0) {
            stationOpen[i] = 0;
            stationDisrupted[i] = 1;
            if (!e.passThrough) stationPassThrough[i] = 0;
          }
          break;
        }
        case 'lineFrequencyFactor':
          lineFreqFactor[e.line] *= e.factor;
          break;
        case 'lineSpeedFactor':
          lineSpeed[e.line] *= e.factor;
          break;
        case 'demandFactor': {
          const i = stIdx(e.stationId);
          // L'affluence ne « perturbe » pas les voyageurs en soi : elle augmente la demande.
          if (i >= 0) stationDemandFactor[i] *= e.factor;
          break;
        }
        case 'transferPenalty': {
          const i = stIdx(e.stationId);
          if (i >= 0) {
            stationTransferExtra[i] = e.seconds === null ? Infinity : stationTransferExtra[i] + e.seconds;
            stationDisrupted[i] = 1;
          }
          break;
        }
      }
    }
  }

  // Régulation manuelle.
  for (const id of config.regulation.closedStations) {
    const i = stIdx(id);
    if (i >= 0) stationOpen[i] = 0;
  }
  for (const id of config.regulation.disabledSegments) {
    const i = segIdx(id);
    if (i >= 0) segmentAvailable[i] = 0;
  }
  // Station fermée sans traversée : les tronçons adjacents sont coupés.
  for (const seg of network.segments) {
    const a = stIdx(seg.a);
    const b = stIdx(seg.b);
    if (!stationPassThrough[a] || !stationPassThrough[b]) segmentAvailable[seg.index] = 0;
  }

  const segTravel = new Float64Array(G);
  for (const seg of network.segments) {
    segTravel[seg.index] = seg.baseTravelTime * segSpeed[seg.index] * lineSpeed[seg.line] + segTimeAdd[seg.index];
  }

  const lineFrequency = {} as Record<LineId, number>;
  const lineCapacity = {} as Record<LineId, number>;
  const lineTrains = {} as Record<LineId, number>;
  const lineFleetLimit = {} as Record<LineId, number>;
  const lineFleet = {} as Record<LineId, number>;
  for (const line of network.lines) {
    const ctl = config.regulation.lines[line.id];
    const fleet = referenceFleet(network, line) + (ctl?.reserveMobilized ?? 0);
    const cycle = lineCycleSeconds(network, line.id, (i) => segTravel[i]);
    const fleetLimit = (fleet * 3600) / cycle;
    const programmed = Math.min(line.maxFrequency, (ctl?.frequency ?? line.baseFrequency) * config.regulation.globalFrequencyFactor);
    const freq = Math.max(0, Math.min(programmed * serviceLevel, fleetLimit) * lineFreqFactor[line.id]);
    lineFrequency[line.id] = freq;
    lineCapacity[line.id] = freq * line.trainCapacity;
    lineTrains[line.id] = Math.min(fleet, trainsRequired(freq, cycle)) || 0;
    lineFleetLimit[line.id] = fleetLimit;
    lineFleet[line.id] = fleet;
  }

  const edgeAvailable = new Uint8Array(E);
  const edgeTravelTime = new Float64Array(E);
  const edgeCapacity = new Float64Array(E);
  const edgeHeadway = new Float64Array(E);
  for (const edge of network.edges) {
    const seg = network.segments[edge.segment];
    const line = network.lineById.get(edge.line)!;
    const freq = lineFrequency[edge.line] * seg.serviceShare;
    const available = segmentAvailable[seg.index] === 1 && freq > 0;
    edgeAvailable[edge.index] = available ? 1 : 0;
    edgeTravelTime[edge.index] = segTravel[seg.index];
    edgeCapacity[edge.index] = available ? freq * line.trainCapacity * segCapFactor[seg.index] : 0;
    edgeHeadway[edge.index] = freq > 0 ? 3600 / freq : Infinity;
  }

  return {
    version,
    edgeAvailable,
    edgeTravelTime,
    edgeCapacity,
    edgeHeadway,
    segmentAvailable,
    segmentDisrupted,
    stationOpen,
    stationPassThrough,
    stationTransferExtra,
    stationDemandFactor,
    stationDisrupted,
    lineFrequency,
    lineCapacity,
    lineTrains,
    lineFleetLimit,
    lineFleet,
  };
}
