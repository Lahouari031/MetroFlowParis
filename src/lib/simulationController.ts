'use client';

/**
 * Contrôleur de simulation côté interface. Le moteur tourne dans un Web Worker (SimCore) :
 * le calcul ne bloque jamais l'affichage ni l'animation des rames. Si les workers sont
 * indisponibles (fichier ouvert en local, navigateur ancien), le même cœur tourne dans le
 * fil principal. Toutes les modifications passent par des messages (journal d'actions
 * horodaté), ce qui garde le rejeu déterministe.
 */
import { loadNetwork } from '@/data/network';
import { SCENARIO_BY_ID, SCENARIOS } from '@/data/scenarios';
import { scenarioConfig } from '@/engine/defaults';
import type { Network } from '@/types/network';
import type { RecordedRun, RunSummary, SavedScenario, ScenarioDefinition, ScheduledIncident, ScoreResult } from '@/types/scenario';
import type { ActionPayload, HistoryPoint, SimAction, SimulationConfig } from '@/types/simulation';
import type { Incident } from '@/types/incident';
import { useSettings } from '@/store/settingsStore';
import { notify, useSimulation, type Speed } from '@/store/simulationStore';
import type { VariantResult, Variant } from './comparison';
import {
  loadProgress,
  loadRuns,
  loadSavedScenarios,
  SCHEMA_VERSION,
  storeProgress,
  storeRuns,
  storeSavedScenarios,
  validateSavedScenario,
} from './persistence';
import { BASE_RATE, SimCore } from './simCore';
import type { FromCore, ToCore } from './simProtocol';
import { createSimWorker } from './workerFactory';

export { BASE_RATE };

export interface ExportData {
  scenario: string;
  seed: number;
  history: HistoryPoint[];
  referenceHistory: HistoryPoint[] | null;
  incidents: Incident[];
  actions: SimAction[];
  summary?: RunSummary;
}

class SimulationController {
  network: Network | null = null;
  scenario: ScenarioDefinition | null = null;
  /** Configuration initiale (avant toute action du joueur) : base du rejeu et des sauvegardes. */
  private initialConfig: SimulationConfig | null = null;
  private scheduled: ScheduledIncident[] = [];
  private initialized = false;
  private worker: Worker | null = null;
  private local: SimCore | null = null;
  private lastLoad: ToCore | null = null;
  private requestId = 0;
  private pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void; onProgress?: (p: number) => void }>();
  /** Horloge pour l'animation : dernier temps reçu et instant de réception. */
  private clock = { time: 0, receivedAt: 0, running: false, speed: 2 };
  private lastVisual = 0;
  /** Le worker a-t-il déjà répondu (sinon, une erreur de chargement déclenche le repli local) ? */
  private workerAlive = false;
  workerMode: 'worker' | 'local' = 'worker';

  init() {
    if (this.initialized) return;
    this.initialized = true;
    const { network, issues } = loadNetwork();
    this.network = network;
    const saves = loadSavedScenarios();
    const progress = loadProgress();
    useSimulation.setState({ dataIssues: issues, saves: saves.value, progress: progress.value });
    if (saves.error) notify('error', saves.error);
    if (progress.error) notify('error', progress.error);
    if (!network) return;
    this.startCore();
    const id = useSettings.getState().lastScenarioId;
    this.loadScenario(SCENARIO_BY_ID.has(id) ? id : SCENARIOS[0].id, false, {}, false);
    useSimulation.setState({ ready: true });
  }

  private startCore() {
    this.worker = createSimWorker();
    if (!this.worker) {
      this.fallbackToLocal();
      return;
    }
    this.workerMode = 'worker';
    this.worker.onmessage = (e: MessageEvent<FromCore>) => {
      this.workerAlive = true;
      this.receive(e.data);
    };
    this.worker.onerror = (e) => {
      if (!this.workerAlive) {
        e.preventDefault?.();
        this.fallbackToLocal();
      } else notify('error', `Erreur du moteur de simulation : ${e.message}`);
    };
  }

  private fallbackToLocal() {
    this.worker?.terminate();
    this.worker = null;
    this.workerMode = 'local';
    this.local = new SimCore((msg) => this.receive(msg));
    if (this.lastLoad) this.local.handle(this.lastLoad);
  }

  private send(msg: ToCore) {
    if (msg.type === 'load') this.lastLoad = msg;
    if (this.worker) this.worker.postMessage(msg);
    else this.local?.handle(msg);
  }

  private receive(msg: FromCore) {
    switch (msg.type) {
      case 'state':
        useSimulation.setState(msg.patch);
        if (msg.clock) {
          this.clock = { ...msg.clock, receivedAt: performance.now() };
          if (!msg.clock.running) this.lastVisual = msg.clock.time;
        }
        break;
      case 'notice':
        notify(msg.level, msg.message);
        break;
      case 'result':
        this.onResult(msg.result, msg.scenarioId);
        break;
      case 'progress':
        this.pending.get(msg.id)?.onProgress?.(msg.progress);
        break;
      case 'response': {
        const p = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (!p) return;
        if (msg.error) p.reject(new Error(msg.error));
        else p.resolve(msg.data);
        break;
      }
    }
  }

  private request<T>(kind: 'export' | 'route' | 'compare', args?: unknown, onProgress?: (p: number) => void): Promise<T> {
    const id = ++this.requestId;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, onProgress });
      this.send({ type: 'request', id, kind, args });
    });
  }

  /* ------------------------------------------------------------------ chargement */

  loadScenario(
    id: string,
    autoplay = false,
    overrides: Partial<Pick<SimulationConfig, 'seed' | 'demandScale' | 'startTime' | 'duration'>> = {},
    announce = true,
  ) {
    const scenario = SCENARIO_BY_ID.get(id);
    if (!scenario || !this.network) return;
    this.scenario = scenario;
    this.scheduled = structuredClone(scenario.incidents);
    this.initialConfig = { ...scenarioConfig(this.network, scenario), ...overrides };
    useSettings.getState().set('lastScenarioId', id);
    this.announce(scenario.title);
    this.send({
      type: 'load',
      config: this.initialConfig,
      scheduled: this.scheduled,
      scenarioId: scenario.id,
      actions: [],
      referenceEnabled: useSettings.getState().referenceEnabled,
      autoplay,
    });
    if (announce) notify('info', `Scénario chargé : ${scenario.title}`);
  }

  private announce(title: string) {
    const cfg = this.initialConfig!;
    useSimulation.setState({
      scenarioId: this.scenario?.id ?? null,
      scenarioTitle: title,
      startTime: cfg.startTime,
      endTime: cfg.startTime + cfg.duration,
      seed: cfg.seed,
      result: null,
      resultOpen: false,
    });
  }

  setReferenceEnabled(enabled: boolean) {
    useSettings.getState().set('referenceEnabled', enabled);
    this.send({ type: 'reference', enabled });
  }

  /* ------------------------------------------------------------------ temps */

  setRunning(running: boolean) {
    this.send({ type: 'run', running });
  }

  toggle() {
    this.setRunning(!useSimulation.getState().running);
  }

  setSpeed(speed: Speed) {
    useSimulation.setState({ speed });
    this.send({ type: 'speed', speed });
  }

  /**
   * Temps simulé « continu » pour les animations : extrapolé entre deux instantanés
   * (8 par seconde) à partir de la vitesse courante, sans jamais revenir en arrière.
   */
  visualTime(): number {
    const c = this.clock;
    if (!c.running) return c.time;
    const elapsed = (performance.now() - c.receivedAt) / 1000;
    const target = c.time + Math.min(elapsed, 0.5) * BASE_RATE * c.speed;
    if (target < this.lastVisual - 120) this.lastVisual = target; // saut en arrière (rejeu)
    this.lastVisual = Math.max(this.lastVisual, target);
    return this.lastVisual;
  }

  get currentConfig(): SimulationConfig | null {
    return this.initialConfig;
  }

  /* ------------------------------------------------------------------ actions */

  dispatch(action: ActionPayload): boolean {
    const snap = useSimulation.getState().snapshot;
    if (snap?.finished) {
      notify('error', 'La simulation est terminée : revenez en arrière sur la timeline pour agir.');
      return false;
    }
    this.send({ type: 'action', action });
    return true;
  }

  restart() {
    this.send({ type: 'restart' });
  }

  seek(time: number) {
    this.send({ type: 'seek', time });
  }

  /* ------------------------------------------------------------------ résultats */

  private onResult(result: ScoreResult, scenarioId: string | null) {
    useSimulation.setState({ result, resultOpen: true });
    if (!scenarioId || scenarioId === 'libre') return;
    const progress = { ...useSimulation.getState().progress };
    const prev = progress[scenarioId];
    const better = !prev || result.total > prev.bestScore;
    progress[scenarioId] = {
      scenarioId,
      bestScore: better ? result.total : prev.bestScore,
      medal: better ? result.medal : prev.medal,
      completedAt: new Date().toISOString(),
      attempts: (prev?.attempts ?? 0) + 1,
    };
    useSimulation.setState({ progress });
    const err = storeProgress(progress);
    if (err) notify('error', err);
  }

  closeResult() {
    useSimulation.setState({ resultOpen: false });
  }

  /** Données de la partie en cours (export CSV/JSON, enregistrement pour comparaison). */
  async exportData(): Promise<ExportData | null> {
    const data = await this.request<Omit<ExportData, 'scenario'> | null>('export');
    return data ? { scenario: useSimulation.getState().scenarioTitle, ...data } : null;
  }

  async recordRun(name: string): Promise<RecordedRun | null> {
    const data = await this.exportData();
    if (!data?.summary) return null;
    const run: RecordedRun = {
      id: `run-${Date.now().toString(36)}`,
      name: name.trim() || data.scenario,
      createdAt: new Date().toISOString(),
      history: data.history,
      summary: data.summary,
    };
    const err = storeRuns([...loadRuns().value, run]);
    if (err) notify('error', err);
    else notify('success', `Résultats enregistrés pour comparaison : ${run.name}`);
    return run;
  }

  /** Itinéraire conseillé (état courant du réseau) entre deux stations. */
  routeBetween(from: string, to: string): Promise<{ edges: number[]; cost: number } | null> {
    return this.request('route', { from, to });
  }

  /** Comparaison A/B de deux variantes (exécutée par le cœur de simulation). */
  compare(scenarioId: string, variants: [Variant, Variant], onProgress: (p: number) => void): Promise<[VariantResult, VariantResult]> {
    return this.request('compare', { scenarioId, variants }, onProgress);
  }

  /* ------------------------------------------------------------------ sauvegardes */

  saveCurrent(name: string): boolean {
    const st = useSimulation.getState();
    if (!this.network || !this.initialConfig || !st.snapshot) return false;
    const save: SavedScenario = {
      schemaVersion: SCHEMA_VERSION,
      networkFingerprint: this.network.fingerprint,
      id: `save-${Date.now().toString(36)}`,
      name: name.trim() || 'Sans nom',
      savedAt: new Date().toISOString(),
      baseScenarioId: this.scenario?.id ?? null,
      config: structuredClone(this.initialConfig),
      scheduled: structuredClone(this.scheduled),
      actions: structuredClone(st.actions),
      savedTime: st.snapshot.time,
    };
    const saves = [...st.saves, save];
    const err = storeSavedScenarios(saves);
    if (err) {
      notify('error', err);
      return false;
    }
    useSimulation.setState({ saves });
    notify('success', `Scénario sauvegardé : ${save.name}`);
    return true;
  }

  deleteSave(id: string) {
    const saves = useSimulation.getState().saves.filter((s) => s.id !== id);
    const err = storeSavedScenarios(saves);
    if (err) notify('error', err);
    useSimulation.setState({ saves });
  }

  /** Charge une sauvegarde (ou un fichier importé) : validation, puis rejeu jusqu'au point sauvegardé. */
  async loadSave(raw: unknown): Promise<boolean> {
    const network = this.network;
    if (!network) return false;
    const errors = validateSavedScenario(raw, {
      fingerprint: network.fingerprint,
      stationIds: new Set(network.stations.map((s) => s.id)),
      segmentIds: new Set(network.segments.map((s) => s.id)),
      lineIds: new Set(network.lines.map((l) => l.id)),
    });
    const save = raw as SavedScenario;
    const blocking = errors.filter((e) => !e.startsWith('Cette sauvegarde a été créée avec une autre version'));
    if (blocking.length) {
      notify('error', `Sauvegarde non chargée : ${blocking.join(' ')}`);
      return false;
    }
    if (errors.length) notify('info', errors.join(' '));
    this.scenario = save.baseScenarioId ? SCENARIO_BY_ID.get(save.baseScenarioId) ?? null : null;
    this.initialConfig = structuredClone(save.config);
    this.scheduled = structuredClone(save.scheduled);
    this.announce(`${save.name}${this.scenario ? ` (${this.scenario.title})` : ''}`);
    this.send({
      type: 'load',
      config: this.initialConfig,
      scheduled: this.scheduled,
      scenarioId: this.scenario?.id ?? null,
      actions: save.actions,
      until: save.savedTime,
      referenceEnabled: useSettings.getState().referenceEnabled,
      autoplay: false,
    });
    notify('success', `Sauvegarde restaurée : ${save.name}`);
    return true;
  }
}

export const controller = new SimulationController();
