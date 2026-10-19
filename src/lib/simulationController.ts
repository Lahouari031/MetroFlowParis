'use client';

/**
 * Contrôleur de simulation : relie le moteur (pur TypeScript) à l'interface.
 * - boucle requestAnimationFrame indépendante du rendu React ;
 * - vitesse du temps simulé indépendante de la fréquence d'affichage ;
 * - publication throttlée des instantanés dans le store Zustand ;
 * - rejeu déterministe (retour arrière sur la timeline, chargement de sauvegardes).
 * Cette classe est le seul point d'accès au moteur : elle pourra être remplacée par un
 * pont vers un Web Worker sans modifier les composants.
 */
import { loadNetwork } from '@/data/network';
import { SCENARIO_BY_ID, SCENARIOS } from '@/data/scenarios';
import { scenarioConfig } from '@/engine/defaults';
import { computeScore, summarizeRun } from '@/engine/scoring';
import { replaySimulation, SimulationEngine } from '@/engine/simulationEngine';
import type { Network } from '@/types/network';
import type { RecordedRun, SavedScenario, ScenarioDefinition, ScheduledIncident } from '@/types/scenario';
import type { ActionPayload, SimAction, SimulationConfig } from '@/types/simulation';
import { useSettings } from '@/store/settingsStore';
import { notify, useSimulation, type Speed } from '@/store/simulationStore';
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

/** Secondes simulées par seconde réelle à la vitesse ×1. */
export const BASE_RATE = 60;
/** Budget de calcul par image (ms) : au-delà, la simulation ralentit au lieu de figer l'interface. */
const FRAME_BUDGET_MS = 14;
const PUBLISH_INTERVAL_MS = 125;
const HISTORY_PUBLISH_INTERVAL_MS = 500;

class SimulationController {
  network: Network | null = null;
  engine: SimulationEngine | null = null;
  reference: SimulationEngine | null = null;
  scenario: ScenarioDefinition | null = null;
  /** Configuration initiale (avant toute action du joueur) : base du rejeu. */
  private initialConfig: SimulationConfig | null = null;
  private scheduled: ScheduledIncident[] = [];
  private raf = 0;
  private lastFrame = 0;
  private accumulator = 0;
  private lastPublish = 0;
  private lastHistoryPublish = 0;
  private resultComputed = false;
  private initialized = false;
  private busyToken = 0;
  private simulatedThisSecond = 0;
  private speedWindowStart = 0;

  init() {
    if (this.initialized) return;
    this.initialized = true;
    const { network, issues } = loadNetwork();
    this.network = network;
    const saves = loadSavedScenarios();
    const progress = loadProgress();
    useSimulation.setState({
      dataIssues: issues,
      saves: saves.value,
      progress: progress.value,
    });
    if (saves.error) notify('error', saves.error);
    if (progress.error) notify('error', progress.error);
    if (!network) {
      useSimulation.setState({ ready: false });
      return;
    }
    const id = useSettings.getState().lastScenarioId;
    this.loadScenario(SCENARIO_BY_ID.has(id) ? id : SCENARIOS[0].id, false);
    useSimulation.setState({ ready: true });
  }

  /* ------------------------------------------------------------------ chargement */

  loadScenario(id: string, autoplay = false, overrides: Partial<Pick<SimulationConfig, 'seed' | 'demandScale' | 'startTime' | 'duration'>> = {}) {
    const scenario = SCENARIO_BY_ID.get(id);
    if (!scenario || !this.network) return;
    this.scenario = scenario;
    this.scheduled = structuredClone(scenario.incidents);
    this.initialConfig = { ...scenarioConfig(this.network, scenario), ...overrides };
    useSettings.getState().set('lastScenarioId', id);
    this.createEngines([]);
    this.setRunning(autoplay);
    notify('info', `Scénario chargé : ${scenario.title}`);
  }

  private createEngines(actions: SimAction[], until?: number) {
    if (!this.network || !this.initialConfig) return;
    const cfg = this.initialConfig;
    this.engine = until !== undefined
      ? replaySimulation(this.network, cfg, this.scheduled, actions, until)
      : new SimulationEngine(this.network, cfg, this.scheduled);
    this.reference = useSettings.getState().referenceEnabled
      ? until !== undefined
        ? replaySimulation(this.network, cfg, this.scheduled, [], until, { quiet: true })
        : new SimulationEngine(this.network, cfg, this.scheduled, { quiet: true })
      : null;
    this.accumulator = 0;
    this.resultComputed = this.engine.finished;
    useSimulation.setState({
      scenarioId: this.scenario?.id ?? null,
      scenarioTitle: this.scenario?.title ?? 'Scénario personnalisé',
      startTime: cfg.startTime,
      endTime: cfg.startTime + cfg.duration,
      seed: cfg.seed,
      result: null,
      resultOpen: false,
    });
    this.publish(true);
  }

  /**
   * Référence = même scénario (incidents programmés compris) sans aucune intervention du joueur.
   * Elle répond à la question « qu'aurait-il se passé si je n'avais rien fait ? ».
   */
  setReferenceEnabled(enabled: boolean) {
    useSettings.getState().set('referenceEnabled', enabled);
    if (!this.engine || !this.network || !this.initialConfig) return;
    if (enabled && !this.reference) {
      this.reference = replaySimulation(this.network, this.initialConfig, this.scheduled, [], this.engine.time, { quiet: true });
    } else if (!enabled) {
      this.reference = null;
    }
    this.publish(true);
  }

  /* ------------------------------------------------------------------ boucle */

  setRunning(running: boolean) {
    if (running && this.engine?.finished) {
      notify('info', 'Simulation terminée : revenez au début ou rechargez le scénario.');
      running = false;
    }
    useSimulation.setState({ running });
    // À la pause, l'affichage doit refléter exactement l'état du moteur.
    if (!running) this.publish(true);
    if (running && !this.raf && typeof window !== 'undefined') {
      this.lastFrame = performance.now();
      this.speedWindowStart = this.lastFrame;
      this.simulatedThisSecond = 0;
      this.raf = requestAnimationFrame(this.frame);
    }
  }

  toggle() {
    this.setRunning(!useSimulation.getState().running);
  }

  setSpeed(speed: Speed) {
    useSimulation.setState({ speed });
  }

  private frame = (now: number) => {
    this.raf = 0;
    const st = useSimulation.getState();
    if (!st.running || !this.engine || st.busy) return;
    const realDt = Math.min(0.25, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.accumulator += realDt * BASE_RATE * st.speed;
    const step = this.engine.config.stepSeconds;
    const t0 = performance.now();
    while (this.accumulator >= step && !this.engine.finished) {
      this.engine.step();
      this.reference?.step();
      this.accumulator -= step;
      this.simulatedThisSecond += step;
      if (performance.now() - t0 > FRAME_BUDGET_MS) {
        // Calcul trop long : on abandonne le retard plutôt que de bloquer l'interface.
        this.accumulator = Math.min(this.accumulator, step);
        break;
      }
    }
    if (now - this.speedWindowStart >= 1000) {
      useSimulation.setState({ effectiveSpeed: this.simulatedThisSecond / ((now - this.speedWindowStart) / 1000) / BASE_RATE });
      this.speedWindowStart = now;
      this.simulatedThisSecond = 0;
    }
    if (now - this.lastPublish >= PUBLISH_INTERVAL_MS) this.publish(false);
    if (this.engine.finished) {
      this.publish(true);
      this.onFinished();
      useSimulation.setState({ running: false });
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Publie l'état courant dans le store. */
  publish(force: boolean) {
    const engine = this.engine;
    if (!engine) return;
    const now = typeof performance !== 'undefined' ? performance.now() : 0;
    this.lastPublish = now;
    const patch: Partial<ReturnType<typeof useSimulation.getState>> = {
      snapshot: engine.getSnapshot(),
      refSnapshot: this.reference ? this.reference.getSnapshot() : null,
      events: engine.events.slice(-120),
      actions: [...engine.actions],
    };
    if (force || now - this.lastHistoryPublish >= HISTORY_PUBLISH_INTERVAL_MS) {
      this.lastHistoryPublish = now;
      patch.history = [...engine.history];
      patch.refHistory = this.reference ? [...this.reference.history] : null;
      patch.segmentSeries = engine.segmentSeries;
      patch.stationSeries = engine.stationSeries;
      patch.refSegmentSeries = this.reference ? this.reference.segmentSeries : null;
    }
    useSimulation.setState(patch);
  }

  /* ------------------------------------------------------------------ actions */

  dispatch(action: ActionPayload): boolean {
    if (!this.engine) return false;
    if (this.engine.finished) {
      notify('error', 'La simulation est terminée : revenez en arrière sur la timeline pour agir.');
      return false;
    }
    const r = this.engine.applyAction(action);
    if (!r.ok) {
      notify('error', r.error);
      return false;
    }
    this.publish(true);
    return true;
  }

  /** Revient au début du scénario (même graine, mêmes paramètres initiaux, journal d'actions vidé). */
  restart() {
    this.createEngines([]);
    this.setRunning(false);
    notify('info', 'Retour au début du scénario : actions du joueur effacées.');
  }

  /**
   * Déplacement sur la timeline. En arrière : rejeu déterministe jusqu'à t (les actions
   * postérieures sont abandonnées). En avant : avance rapide.
   */
  async seek(time: number) {
    const engine = this.engine;
    if (!engine || !this.network || !this.initialConfig) return;
    const wasRunning = useSimulation.getState().running;
    this.setRunning(false);
    const target = Math.max(this.initialConfig.startTime, Math.min(engine.endTime, time));
    const token = ++this.busyToken;
    if (target < engine.time) {
      const kept = engine.actions.filter((a) => a.time <= target);
      const dropped = engine.actions.length - kept.length;
      useSimulation.setState({ busy: { label: 'Rejeu de la simulation…', progress: 0 } });
      await this.replayChunked(kept, target, token);
      if (dropped > 0) notify('info', `${dropped} action(s) postérieure(s) à ce point ont été abandonnées.`);
    } else {
      useSimulation.setState({ busy: { label: 'Avance rapide…', progress: 0 } });
      const from = engine.time;
      while (engine.time < target - 1e-9 && token === this.busyToken) {
        const until = Math.min(target, engine.time + 300);
        engine.advance(until - engine.time);
        this.reference?.advance(until - this.reference.time);
        useSimulation.setState({ busy: { label: 'Avance rapide…', progress: (engine.time - from) / (target - from) } });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (token !== this.busyToken) return;
    useSimulation.setState({ busy: null });
    this.resultComputed = this.engine?.finished ?? false;
    this.publish(true);
    if (this.engine?.finished) this.onFinished();
    else if (wasRunning) this.setRunning(true);
  }

  private async replayChunked(actions: SimAction[], until: number, token: number) {
    if (!this.network || !this.initialConfig) return;
    const engine = new SimulationEngine(this.network, this.initialConfig, this.scheduled);
    const reference = useSettings.getState().referenceEnabled
      ? new SimulationEngine(this.network, this.initialConfig, this.scheduled, { quiet: true })
      : null;
    const sorted = [...actions].sort((a, b) => a.time - b.time);
    let k = 0;
    const from = engine.time;
    let lastYield = performance.now();
    while (true) {
      while (k < sorted.length && sorted[k].time <= engine.time + 1e-9) {
        const { time: _t, ...payload } = sorted[k++];
        void _t;
        engine.applyAction(payload as ActionPayload);
      }
      if (engine.time >= until - 1e-9 || engine.finished) break;
      engine.step();
      reference?.step();
      if (performance.now() - lastYield > 40) {
        useSimulation.setState({ busy: { label: 'Rejeu de la simulation…', progress: (engine.time - from) / Math.max(1, until - from) } });
        await new Promise((r) => setTimeout(r, 0));
        lastYield = performance.now();
        if (token !== this.busyToken) return;
      }
    }
    this.engine = engine;
    this.reference = reference;
    this.accumulator = 0;
  }

  /* ------------------------------------------------------------------ fin de scénario et score */

  private onFinished() {
    if (this.resultComputed || !this.engine || !this.network) return;
    this.resultComputed = true;
    const result = this.computeResult();
    if (!result) return;
    useSimulation.setState({ result, resultOpen: true });
    const sc = this.scenario;
    if (sc && sc.id !== 'libre') {
      const progress = { ...useSimulation.getState().progress };
      const prev = progress[sc.id];
      const better = !prev || result.total > prev.bestScore;
      progress[sc.id] = {
        scenarioId: sc.id,
        bestScore: better ? result.total : prev.bestScore,
        medal: better ? result.medal : prev.medal,
        completedAt: new Date().toISOString(),
        attempts: (prev?.attempts ?? 0) + 1,
      };
      useSimulation.setState({ progress });
      const err = storeProgress(progress);
      if (err) notify('error', err);
    }
  }

  computeResult() {
    const engine = this.engine;
    const network = this.network;
    if (!engine || !network || !this.initialConfig) return null;
    // Le budget et la résorption se mesurent par rapport à la simulation nominale
    // (même graine et paramètres initiaux, sans incident ni intervention).
    const ref = replaySimulation(network, this.initialConfig, [], [], engine.time, { quiet: true });
    const summary = summarizeRun({
      history: engine.history,
      kpis: engine.computeKPIs(),
      segmentCount: network.segments.length,
      referenceCost: ref.operatingCost,
      referenceHistory: ref.history,
    });
    const sc = this.scenario;
    return computeScore(summary, sc?.objectives ?? [], sc?.difficulty ?? 'normal', sc?.budgetMargin ?? 0.1);
  }

  closeResult() {
    useSimulation.setState({ resultOpen: false });
  }

  /* ------------------------------------------------------------------ sauvegardes */

  saveCurrent(name: string): boolean {
    if (!this.engine || !this.network || !this.initialConfig) return false;
    const save: SavedScenario = {
      schemaVersion: SCHEMA_VERSION,
      networkFingerprint: this.network.fingerprint,
      id: `save-${Date.now().toString(36)}`,
      name: name.trim() || 'Sans nom',
      savedAt: new Date().toISOString(),
      baseScenarioId: this.scenario?.id ?? null,
      config: structuredClone(this.initialConfig),
      scheduled: structuredClone(this.scheduled),
      actions: structuredClone(this.engine.actions),
      savedTime: this.engine.time,
    };
    const saves = [...useSimulation.getState().saves, save];
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
    this.setRunning(false);
    this.scenario = save.baseScenarioId ? SCENARIO_BY_ID.get(save.baseScenarioId) ?? null : null;
    this.initialConfig = structuredClone(save.config);
    this.scheduled = structuredClone(save.scheduled);
    const token = ++this.busyToken;
    useSimulation.setState({ busy: { label: 'Restauration de la sauvegarde…', progress: 0 } });
    try {
      await this.replayChunked(save.actions, save.savedTime, token);
    } catch (e) {
      useSimulation.setState({ busy: null });
      notify('error', `Échec du rejeu de la sauvegarde : ${e instanceof Error ? e.message : String(e)}`);
      this.loadScenario(SCENARIOS[0].id);
      return false;
    }
    useSimulation.setState({
      busy: null,
      scenarioId: this.scenario?.id ?? null,
      scenarioTitle: `${save.name}${this.scenario ? ` (${this.scenario.title})` : ''}`,
      startTime: save.config.startTime,
      endTime: save.config.startTime + save.config.duration,
      seed: save.config.seed,
      result: null,
      resultOpen: false,
    });
    this.resultComputed = this.engine?.finished ?? false;
    this.publish(true);
    notify('success', `Sauvegarde restaurée : ${save.name}`);
    return true;
  }

  /** Données de la partie en cours, pour l'export et l'enregistrement. */
  exportData() {
    const engine = this.engine;
    if (!engine) return null;
    return {
      scenario: useSimulation.getState().scenarioTitle,
      seed: engine.config.seed,
      history: engine.history,
      referenceHistory: this.reference?.history ?? null,
      incidents: engine.incidents,
      actions: engine.actions,
      summary: this.computeResult()?.summary,
    };
  }

  /** Enregistre la partie courante pour la comparer plus tard (écran Statistiques). */
  recordRun(name: string): RecordedRun | null {
    const data = this.exportData();
    if (!data?.summary) return null;
    const run: RecordedRun = {
      id: `run-${Date.now().toString(36)}`,
      name: name.trim() || data.scenario,
      createdAt: new Date().toISOString(),
      history: data.history,
      summary: data.summary,
    };
    const runs = [...loadRuns().value, run];
    const err = storeRuns(runs);
    if (err) notify('error', err);
    else notify('success', `Résultats enregistrés pour comparaison : ${run.name}`);
    return run;
  }

  get currentConfig(): SimulationConfig | null {
    return this.initialConfig;
  }

  /** Itinéraire conseillé (état courant du réseau) entre deux stations. */
  routeBetween(from: string, to: string): { edges: number[]; cost: number } | null {
    const engine = this.engine;
    const network = this.network;
    if (!engine || !network) return null;
    const a = network.stationById.get(from);
    const b = network.stationById.get(to);
    if (!a || !b || a === b) return null;
    const route = engine.router.bestRoute(a.index, b.index);
    if (!route) return null;
    return { edges: Array.from(route), cost: engine.router.bestCost(a.index, b.index) };
  }
}

export const controller = new SimulationController();
