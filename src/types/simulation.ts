import type { Incident, IncidentSpec, Severity } from './incident';
import type { LineId } from './network';

export interface LineControl {
  /** Fréquence programmée (trains / heure / sens). */
  frequency: number;
  /** Rames de réserve mobilisées. */
  reserveMobilized: number;
}

/** Paramètres de régulation modifiables par le joueur. */
export interface RegulationState {
  lines: Record<LineId, LineControl>;
  /** Multiplicateur global appliqué à toutes les fréquences (1 = 100 %). */
  globalFrequencyFactor: number;
  /** Stations fermées manuellement (régulation, hors incident). */
  closedStations: string[];
  /** Tronçons désactivés manuellement. */
  disabledSegments: string[];
}

export interface SimulationConfig {
  /** Graine aléatoire : même graine + mêmes paramètres + mêmes actions = même simulation. */
  seed: number;
  /** Heure de début (s depuis minuit). */
  startTime: number;
  /** Durée de la simulation (s). */
  duration: number;
  /** Pas de simulation (s simulées par mise à jour logique). */
  stepSeconds: number;
  /**
   * Préchauffage (s) simulé avant l'heure de début pour que le réseau soit déjà chargé
   * au lancement. Les indicateurs cumulés sont remis à zéro à la fin du préchauffage.
   */
  warmupSeconds: number;
  /** Multiplicateur de la demande synthétique. */
  demandScale: number;
  /** Limite de rames de réserve mobilisables par ligne (null = valeur par défaut de la ligne). */
  reserveLimit: number | null;
  /** Coût fictif d'une rame en service pendant une heure (k€ fictifs). */
  costPerTrainHour: number;
  /** Coût fictif de mobilisation d'une rame de réserve (k€ fictifs, une fois). */
  costPerReserveTrain: number;
  regulation: RegulationState;
}

export type ActionType =
  | 'incident.create'
  | 'incident.resolve'
  | 'incident.suspend'
  | 'incident.resume'
  | 'incident.extend'
  | 'incident.severity'
  | 'line.frequency'
  | 'line.reserve'
  | 'global.frequency'
  | 'station.close'
  | 'station.open'
  | 'segment.disable'
  | 'segment.enable';

export type ActionPayload =
  | { type: 'incident.create'; spec: IncidentSpec }
  | { type: 'incident.resolve'; incidentId: string }
  | { type: 'incident.suspend'; incidentId: string }
  | { type: 'incident.resume'; incidentId: string }
  | { type: 'incident.extend'; incidentId: string; seconds: number }
  | { type: 'incident.severity'; incidentId: string; severity: Severity }
  | { type: 'line.frequency'; line: LineId; frequency: number }
  | { type: 'line.reserve'; line: LineId; count: number }
  | { type: 'global.frequency'; factor: number }
  | { type: 'station.close'; stationId: string }
  | { type: 'station.open'; stationId: string }
  | { type: 'segment.disable'; segmentId: string }
  | { type: 'segment.enable'; segmentId: string };

/** Action horodatée : le journal des actions permet de rejouer une simulation à l'identique. */
export type SimAction = ActionPayload & { time: number };

export type EventLevel = 'info' | 'warning' | 'critical' | 'success';

export type SimEventKind =
  | 'incident.start'
  | 'incident.end'
  | 'incident.update'
  | 'incident.scheduled'
  | 'regulation'
  | 'station.closed'
  | 'station.opened'
  | 'segment.closed'
  | 'segment.opened'
  | 'service'
  | 'alert.segment'
  | 'alert.station'
  | 'end';

export interface SimEvent {
  id: number;
  /** Nature de l'événement (sert au fil d'info trafic). */
  kind?: SimEventKind;
  /** Ligne concernée (régulation, alertes). */
  line?: LineId;
  time: number;
  level: EventLevel;
  message: string;
  stationId?: string;
  segmentId?: string;
  incidentId?: string;
}

/** Indicateurs agrégés instantanés (tous issus du moteur). */
export interface KPIs {
  /** Voyageurs présents dans le réseau simulé. */
  inNetwork: number;
  /** Voyageurs en attente sur les quais (y compris refusés à l'embarquement). */
  waiting: number;
  /** Taux de saturation moyen des tronçons ouverts (0–1+). */
  avgSaturation: number;
  /** Nombre de tronçons au-dessus du seuil rouge. */
  saturatedSegments: number;
  activeIncidents: number;
  /** Retard moyen estimé des trajets terminés récemment (s). */
  avgDelay: number;
  /** Attente moyenne estimée à l'embarquement (s). */
  avgWait: number;
  /** Voyageurs affectés par les incidents (cumul). */
  affectedTotal: number;
  /** Voyageurs affectés actuellement dans le réseau. */
  affectedNow: number;
  /** Entrées dans le réseau (voyageurs / heure, moyenne glissante). */
  entriesPerHour: number;
  /** Capacité disponible (part de la capacité totale non utilisée, 0–1). */
  availableCapacity: number;
  /** Qualité de service globale (0–100). */
  serviceQuality: number;
  /** Trajets terminés (cumul). */
  completedTrips: number;
  /** Voyageurs ayant renoncé (destination inaccessible, station d'origine fermée). */
  lostTrips: number;
  /** Coût opérationnel fictif cumulé (k€). */
  operatingCost: number;
  /** Rames en service (toutes lignes). */
  trainsInService: number;
  /** Retard moyen des trajets terminés par des voyageurs affectés par un incident (s, cumul). */
  affectedDelay: number;
}

export interface HistoryPoint {
  time: number;
  inNetwork: number;
  waiting: number;
  entriesPerHour: number;
  avgSaturation: number;
  saturatedSegments: number;
  avgDelay: number;
  avgWait: number;
  affectedTotal: number;
  affectedNow: number;
  activeIncidents: number;
  serviceQuality: number;
  operatingCost: number;
  lostTrips: number;
  lineSaturation: Record<LineId, number>;
  /** Saturation maximale par ligne. */
  lineMaxSaturation: Record<LineId, number>;
}

/** État instantané destiné à l'interface (copie, indépendante du moteur). */
export interface SimSnapshot {
  time: number;
  tick: number;
  finished: boolean;
  /** Période de service horaire (fermeture de nuit, heures creuses…). */
  service: { label: string; level: number };
  /** Par arc orienté. */
  edgeFlow: Float32Array;
  edgeSaturation: Float32Array;
  edgeCapacity: Float32Array;
  edgeQueue: Float32Array;
  edgeDelay: Float32Array;
  /** Temps de parcours effectif de chaque arc (s), incidents compris. */
  edgeTravelTime: Float32Array;
  /** Par tronçon (max des deux sens). */
  segmentSaturation: Float32Array;
  segmentFlow: Float32Array;
  segmentDelay: Float32Array;
  segmentAvailable: Uint8Array;
  /** Par station. */
  stationWaiting: Float32Array;
  stationLoad: Float32Array;
  stationEntries: Float32Array;
  stationExits: Float32Array;
  stationOpen: Uint8Array;
  lineFrequency: Record<LineId, number>;
  lineCapacity: Record<LineId, number>;
  lineTrains: Record<LineId, number>;
  lineFleetLimit: Record<LineId, number>;
  kpis: KPIs;
  incidents: Incident[];
  regulation: RegulationState;
  networkVersion: number;
}
