import type { LineId } from './network';

export type IncidentType =
  | 'malaise'
  | 'station_closure'
  | 'segment_interruption'
  | 'technical_failure'
  | 'line_slowdown'
  | 'frequency_reduction'
  | 'major_delay'
  | 'crowd_surge'
  | 'transfer_incident'
  | 'return_to_normal';

/** 1 = faible, 2 = moyenne, 3 = élevée. */
export type Severity = 1 | 2 | 3;

export type IncidentTarget =
  | { kind: 'station'; stationId: string; line?: LineId }
  | { kind: 'segment'; segmentId: string }
  | { kind: 'line'; line: LineId }
  | { kind: 'network' };

/**
 * Effets élémentaires appliqués au réseau. Chaque incident se traduit par une liste
 * explicite de ces effets (visible et modifiable dans l'interface).
 */
export type IncidentEffect =
  /** Temps ajouté au parcours d'un tronçon (s) : arrêt prolongé, train retenu. */
  | { kind: 'segmentTimeAdd'; segmentId: string; seconds: number }
  /** Multiplicateur du temps de parcours d'un tronçon (ralentissement). */
  | { kind: 'segmentSpeedFactor'; segmentId: string; factor: number }
  /** Multiplicateur de la capacité de transport d'un tronçon. */
  | { kind: 'segmentCapacityFactor'; segmentId: string; factor: number }
  /** Tronçon interrompu (retiré du graphe utilisable). */
  | { kind: 'segmentClosed'; segmentId: string }
  /** Station fermée au public. passThrough : les trains traversent sans s'arrêter. */
  | { kind: 'stationClosed'; stationId: string; passThrough: boolean }
  /** Multiplicateur de fréquence d'une ligne (réduction de service). */
  | { kind: 'lineFrequencyFactor'; line: LineId; factor: number }
  /** Multiplicateur du temps de parcours de toute une ligne. */
  | { kind: 'lineSpeedFactor'; line: LineId; factor: number }
  /** Multiplicateur de la demande émise et attirée par une station. */
  | { kind: 'demandFactor'; stationId: string; factor: number }
  /** Pénalité de correspondance dans une station (s) ; null = correspondances impossibles. */
  | { kind: 'transferPenalty'; stationId: string; seconds: number | null };

export type IncidentStatus = 'scheduled' | 'active' | 'suspended' | 'resolved';

export interface IncidentHistoryEntry {
  time: number;
  action: string;
}

export interface Incident {
  id: string;
  type: IncidentType;
  label: string;
  target: IncidentTarget;
  severity: Severity;
  /** Rayon d'impact en nombre d'inter-stations le long de la ligne. */
  radius: number;
  /** Heure de début (s simulées depuis minuit). */
  startTime: number;
  /** Durée (s) ; null = permanent jusqu'à levée manuelle. */
  duration: number | null;
  /** Temps actif déjà écoulé (s), hors suspensions. */
  elapsed: number;
  status: IncidentStatus;
  effects: IncidentEffect[];
  /** Effets saisis manuellement (sinon recalculés selon la gravité). */
  customEffects: boolean;
  options?: { stopTraffic?: boolean };
  origin: 'user' | 'scenario';
  history: IncidentHistoryEntry[];
  /** Heure de fin effective (levée ou expiration). */
  endTime?: number;
}

/** Spécification d'un incident à créer (formulaire, scénario). */
export interface IncidentSpec {
  type: IncidentType;
  target: IncidentTarget;
  severity: Severity;
  radius: number;
  /** Durée (s), null = permanent. */
  duration: number | null;
  /** Heure de début (s depuis minuit) ; absente = immédiat. */
  startTime?: number;
  /** Effets personnalisés ; absents = effets par défaut selon type et gravité. */
  effects?: IncidentEffect[];
  /** Options spécifiques (fermeture : arrêt de la circulation, etc.). */
  options?: { stopTraffic?: boolean };
  origin?: 'user' | 'scenario';
}
