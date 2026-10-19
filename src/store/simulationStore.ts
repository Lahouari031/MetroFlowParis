'use client';

import { create } from 'zustand';
import type { DataIssue } from '@/types/network';
import type { ChallengeProgress, SavedScenario, ScoreResult } from '@/types/scenario';
import type { HistoryPoint, SimAction, SimEvent, SimSnapshot } from '@/types/simulation';

export type Speed = 1 | 2 | 5 | 10;

export interface SimulationStore {
  ready: boolean;
  dataIssues: DataIssue[];
  snapshot: SimSnapshot | null;
  refSnapshot: SimSnapshot | null;
  history: HistoryPoint[];
  refHistory: HistoryPoint[] | null;
  segmentSeries: Float32Array[];
  stationSeries: Float32Array[];
  refSegmentSeries: Float32Array[] | null;
  events: SimEvent[];
  actions: SimAction[];
  running: boolean;
  speed: Speed;
  /** Vitesse réellement atteinte (le moteur ralentit si le calcul dépasse le budget d'une image). */
  effectiveSpeed: number;
  scenarioId: string | null;
  scenarioTitle: string;
  startTime: number;
  endTime: number;
  seed: number;
  /** Calcul en cours (rejeu, avance rapide) : progression 0–1. */
  busy: { label: string; progress: number } | null;
  result: ScoreResult | null;
  resultOpen: boolean;
  saves: SavedScenario[];
  progress: Record<string, ChallengeProgress>;
  notice: { level: 'info' | 'error' | 'success'; message: string; id: number } | null;
}

export const useSimulation = create<SimulationStore>(() => ({
  ready: false,
  dataIssues: [],
  snapshot: null,
  refSnapshot: null,
  history: [],
  refHistory: null,
  segmentSeries: [],
  stationSeries: [],
  refSegmentSeries: null,
  events: [],
  actions: [],
  running: false,
  speed: 2,
  effectiveSpeed: 0,
  scenarioId: null,
  scenarioTitle: '',
  startTime: 0,
  endTime: 0,
  seed: 0,
  busy: null,
  result: null,
  resultOpen: false,
  saves: [],
  progress: {},
  notice: null,
}));

let noticeId = 0;
export function notify(level: 'info' | 'error' | 'success', message: string) {
  useSimulation.setState({ notice: { level, message, id: ++noticeId } });
}

export type Selection =
  | { kind: 'station'; id: string }
  | { kind: 'segment'; id: string }
  | { kind: 'incident'; id: string }
  | null;

export interface IncidentDraft {
  stationId?: string;
  segmentId?: string;
  line?: string;
}

interface SelectionStore {
  selected: Selection;
  incidentDraft: IncidentDraft | null;
  /** Itinéraire mis en évidence (arcs orientés). */
  route: { from: string; to: string; edges: number[]; cost: number } | null;
  focus: { stationId: string; nonce: number } | null;
  hoverSegment: string | null;
  select: (s: Selection) => void;
  openIncidentForm: (d: IncidentDraft) => void;
  closeIncidentForm: () => void;
  setRoute: (r: SelectionStore['route']) => void;
  focusStation: (id: string) => void;
  setHoverSegment: (id: string | null) => void;
  clear: () => void;
}

let focusNonce = 0;
export const useSelection = create<SelectionStore>((set) => ({
  selected: null,
  incidentDraft: null,
  route: null,
  focus: null,
  hoverSegment: null,
  select: (selected) => set({ selected }),
  openIncidentForm: (incidentDraft) => set({ incidentDraft }),
  closeIncidentForm: () => set({ incidentDraft: null }),
  setRoute: (route) => set({ route }),
  focusStation: (stationId) => set({ focus: { stationId, nonce: ++focusNonce } }),
  setHoverSegment: (hoverSegment) => set({ hoverSegment }),
  clear: () => set({ selected: null, incidentDraft: null }),
}));

/** Tableau vide partagé : un sélecteur ne doit pas renvoyer un nouvel objet à chaque appel. */
export const NO_INCIDENTS: import('@/types/incident').Incident[] = [];
