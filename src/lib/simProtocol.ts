/** Messages échangés entre l'interface et le cœur de simulation (Web Worker ou repli local). */
import type { ScheduledIncident, ScoreResult } from '@/types/scenario';
import type { ActionPayload, SimAction, SimulationConfig } from '@/types/simulation';
import type { SimulationStore } from '@/store/simulationStore';

export type StatePatch = Partial<
  Pick<
    SimulationStore,
    | 'snapshot'
    | 'refSnapshot'
    | 'events'
    | 'actions'
    | 'running'
    | 'effectiveSpeed'
    | 'history'
    | 'refHistory'
    | 'segmentSeries'
    | 'stationSeries'
    | 'refSegmentSeries'
    | 'busy'
    | 'result'
    | 'resultOpen'
  >
>;

export type ToCore =
  | {
      type: 'load';
      config: SimulationConfig;
      scheduled: ScheduledIncident[];
      scenarioId: string | null;
      actions: SimAction[];
      /** Rejoue le journal jusqu'à cet instant (restauration d'une sauvegarde). */
      until?: number;
      referenceEnabled: boolean;
      autoplay: boolean;
    }
  | { type: 'run'; running: boolean }
  | { type: 'speed'; speed: number }
  | { type: 'action'; action: ActionPayload }
  | { type: 'seek'; time: number }
  | { type: 'restart' }
  | { type: 'reference'; enabled: boolean }
  | { type: 'request'; id: number; kind: 'export' | 'route' | 'compare'; args?: unknown };

export type FromCore =
  | { type: 'state'; patch: StatePatch; clock?: { time: number; running: boolean; speed: number } }
  | { type: 'notice'; level: 'info' | 'error' | 'success'; message: string }
  | { type: 'result'; result: ScoreResult; scenarioId: string | null }
  | { type: 'response'; id: number; data: unknown; error?: string }
  | { type: 'progress'; id: number; progress: number };
