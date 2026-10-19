import type { IncidentSpec } from './incident';
import type { LineId } from './network';
import type { HistoryPoint, SimAction, SimulationConfig } from './simulation';

export type Difficulty = 'facile' | 'normal' | 'difficile';

/** Incident programmé dans un scénario (décalage par rapport au début). */
export interface ScheduledIncident extends Omit<IncidentSpec, 'startTime'> {
  /** Décalage de déclenchement (s depuis le début du scénario). */
  offset: number;
}

export type ObjectiveMetric =
  | 'avgDelayEnd'
  | 'avgDelayMean'
  | 'avgWaitMean'
  | 'maxSaturatedSegments'
  | 'saturatedSegmentsEnd'
  | 'affectedShare'
  | 'lostTrips'
  | 'operatingCost'
  | 'congestionClearedAfterIncidents'
  | 'serviceQualityMean'
  | 'waitingEnd';

export interface ObjectiveDefinition {
  id: string;
  label: string;
  metric: ObjectiveMetric;
  op: '<=' | '>=';
  value: number;
  /** Unité d'affichage. */
  unit: string;
  primary: boolean;
}

export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  objective: string;
  difficulty: Difficulty;
  seed: number;
  startTime: number;
  duration: number;
  demandScale: number;
  incidents: ScheduledIncident[];
  frequencyOverrides?: Partial<Record<LineId, number>>;
  objectives: ObjectiveDefinition[];
  /**
   * Marge budgétaire : budget = coût opérationnel de la simulation nominale
   * (même graine, sans incident ni intervention) × (1 + marge).
   */
  budgetMargin: number;
}

export interface ObjectiveResult {
  objective: ObjectiveDefinition;
  value: number;
  achieved: boolean;
}

export interface ScoreBreakdown {
  key: 'wait' | 'delay' | 'affected' | 'saturation' | 'cost';
  label: string;
  weight: number;
  value: number;
  unit: string;
  /** Sous-score 0–100. */
  score: number;
  explanation: string;
}

export type Medal = 'or' | 'argent' | 'bronze' | null;

export interface RunSummary {
  avgWaitMean: number;
  avgDelayMean: number;
  avgDelayEnd: number;
  affectedShare: number;
  saturatedShareMean: number;
  maxSaturatedSegments: number;
  saturatedSegmentsEnd: number;
  lostTrips: number;
  operatingCost: number;
  referenceCost: number;
  completedTrips: number;
  serviceQualityMean: number;
  waitingEnd: number;
  /** Minutes entre la fin du dernier incident et le retour sous le seuil de congestion (null si non résorbé). */
  congestionClearedAfterIncidents: number | null;
}

export interface ScoreResult {
  total: number;
  breakdown: ScoreBreakdown[];
  medal: Medal;
  objectives: ObjectiveResult[];
  success: boolean;
  summary: RunSummary;
}

/** Scénario sauvegardé par l'utilisateur (localStorage). */
export interface SavedScenario {
  schemaVersion: number;
  networkFingerprint: string;
  id: string;
  name: string;
  savedAt: string;
  baseScenarioId: string | null;
  config: SimulationConfig;
  /** Incidents programmés du scénario de base. */
  scheduled: ScheduledIncident[];
  /** Journal d'actions du joueur (rejoué pour restaurer l'état). */
  actions: SimAction[];
  /** Temps simulé atteint au moment de la sauvegarde. */
  savedTime: number;
}

export interface ChallengeProgress {
  scenarioId: string;
  bestScore: number;
  medal: Medal;
  completedAt: string;
  attempts: number;
}

export interface RecordedRun {
  id: string;
  name: string;
  createdAt: string;
  history: HistoryPoint[];
  summary: RunSummary;
}
