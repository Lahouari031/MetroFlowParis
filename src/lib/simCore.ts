/**
 * Cœur d'exécution de la simulation, conçu pour tourner dans un Web Worker (calcul hors du fil
 * d'affichage). Il peut aussi tourner dans le fil principal (repli si les workers sont indisponibles,
 * par exemple pour un fichier ouvert en local). Aucune dépendance au DOM ni à React.
 *
 * Il héberge le moteur du joueur et la simulation de référence, cadence le temps simulé
 * (indépendamment de l'affichage) et publie des instantanés à ~8 Hz.
 */
import { loadNetwork } from '@/data/network';
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { computeScore, summarizeRun } from '@/engine/scoring';
import { replaySimulation, SimulationEngine } from '@/engine/simulationEngine';
import type { Network } from '@/types/network';
import type { ScheduledIncident } from '@/types/scenario';
import type { ActionPayload, SimAction, SimulationConfig } from '@/types/simulation';
import { runComparison, type Variant } from './comparison';
import type { FromCore, StatePatch, ToCore } from './simProtocol';

/** Secondes simulées par seconde réelle à la vitesse ×1. */
export const BASE_RATE = 60;
const LOOP_MS = 8;
/** Budget de calcul par itération (ms) : au-delà, la vitesse effective baisse. */
const STEP_BUDGET_MS = 30;
const PUBLISH_INTERVAL_MS = 125;
const HISTORY_PUBLISH_INTERVAL_MS = 500;
/** Quand le métro est fermé (nuit), le temps défile au moins à cette vitesse. */
const NIGHT_SPEED = 60;

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const sleep = () => new Promise((r) => setTimeout(r, 0));

export class SimCore {
  private network: Network;
  private engine: SimulationEngine | null = null;
  private reference: SimulationEngine | null = null;
  private config: SimulationConfig | null = null;
  private scheduled: ScheduledIncident[] = [];
  private scenarioId: string | null = null;
  private referenceEnabled = true;
  private running = false;
  private speed = 1;
  private accumulator = 0;
  private lastLoop = 0;
  private lastPublish = 0;
  private lastHistoryPublish = 0;
  private simulatedInWindow = 0;
  private windowStart = 0;
  private effectiveSpeed = 0;
  private resultSent = false;
  private busyToken = 0;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Historiques déjà transmis (envoi incrémental : seuls les nouveaux points partent). */
  private sent = { engine: null as SimulationEngine | null, reference: null as SimulationEngine | null, history: 0, refHistory: 0 };

  constructor(private readonly post: (msg: FromCore) => void) {
    const { network } = loadNetwork();
    if (!network) throw new Error('Réseau invalide');
    this.network = network;
  }

  handle(msg: ToCore) {
    try {
      this.dispatch(msg);
    } catch (e) {
      this.notice('error', `Erreur du moteur : ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private dispatch(msg: ToCore) {
    switch (msg.type) {
      case 'load':
        this.config = msg.config;
        this.scheduled = msg.scheduled;
        this.scenarioId = msg.scenarioId;
        this.referenceEnabled = msg.referenceEnabled;
        this.setRunning(false);
        if (msg.until !== undefined) void this.replay(msg.actions, msg.until, 'Restauration de la sauvegarde…', msg.autoplay);
        else {
          this.engine = new SimulationEngine(this.network, msg.config, msg.scheduled);
          this.reference = this.referenceEnabled ? new SimulationEngine(this.network, msg.config, msg.scheduled, { quiet: true }) : null;
          this.afterReset();
          if (msg.autoplay) this.setRunning(true);
        }
        break;
      case 'run':
        this.setRunning(msg.running);
        break;
      case 'speed':
        this.speed = msg.speed;
        break;
      case 'action': {
        const engine = this.engine;
        if (!engine) return;
        if (engine.finished) {
          this.notice('error', 'La simulation est terminée : revenez en arrière sur la timeline pour agir.');
          return;
        }
        const r = engine.applyAction(msg.action);
        if (!r.ok) this.notice('error', r.error);
        this.publish(true);
        break;
      }
      case 'restart':
        if (!this.config) return;
        this.setRunning(false);
        this.engine = new SimulationEngine(this.network, this.config, this.scheduled);
        this.reference = this.referenceEnabled ? new SimulationEngine(this.network, this.config, this.scheduled, { quiet: true }) : null;
        this.afterReset();
        this.notice('info', 'Retour au début du scénario : actions du joueur effacées.');
        break;
      case 'seek':
        void this.seek(msg.time);
        break;
      case 'reference':
        this.referenceEnabled = msg.enabled;
        if (!this.engine || !this.config) return;
        if (msg.enabled && !this.reference) {
          this.reference = replaySimulation(this.network, this.config, this.scheduled, [], this.engine.time, { quiet: true });
        } else if (!msg.enabled) this.reference = null;
        this.publish(true);
        break;
      case 'request':
        void this.answer(msg.id, msg.kind, msg.args);
        break;
    }
  }

  /* ------------------------------------------------------------------ boucle */

  private setRunning(running: boolean) {
    if (running && this.engine?.finished) {
      this.notice('info', 'Simulation terminée : revenez au début ou rechargez le scénario.');
      running = false;
    }
    this.running = running;
    if (running) {
      this.lastLoop = now();
      this.windowStart = this.lastLoop;
      this.simulatedInWindow = 0;
      if (!this.timer) this.timer = setTimeout(this.loop, LOOP_MS);
    }
    this.publish(true);
  }

  private loop = () => {
    this.timer = null;
    const engine = this.engine;
    if (!this.running || !engine || this.busy) return;
    const t = now();
    const realDt = Math.min(0.25, (t - this.lastLoop) / 1000);
    this.lastLoop = t;
    this.accumulator += realDt * BASE_RATE * this.rate(engine);
    const step = engine.config.stepSeconds;
    while (this.accumulator >= step && !engine.finished) {
      engine.step();
      this.reference?.step();
      this.accumulator -= step;
      this.simulatedInWindow += step;
      if (now() - t > STEP_BUDGET_MS) {
        this.accumulator = Math.min(this.accumulator, step);
        break;
      }
    }
    if (t - this.windowStart >= 1000) {
      this.effectiveSpeed = this.simulatedInWindow / ((t - this.windowStart) / 1000) / BASE_RATE;
      this.windowStart = t;
      this.simulatedInWindow = 0;
    }
    if (engine.finished) {
      this.running = false;
      this.publish(true);
      this.onFinished();
      return;
    }
    if (t - this.lastPublish >= PUBLISH_INTERVAL_MS) this.publish(false);
    this.timer = setTimeout(this.loop, LOOP_MS);
  };

  /** Vitesse appliquée : la nuit (métro fermé), le temps est accéléré. */
  private rate(engine: SimulationEngine): number {
    return engine.service.level === 0 ? Math.max(this.speed, NIGHT_SPEED) : this.speed;
  }

  private afterReset() {
    this.accumulator = 0;
    this.resultSent = this.engine?.finished ?? false;
    this.publish(true, { result: null, resultOpen: false });
  }

  private publish(force: boolean, extra: StatePatch = {}) {
    const engine = this.engine;
    if (!engine) return;
    const t = now();
    this.lastPublish = t;
    const patch: StatePatch = {
      snapshot: engine.getSnapshot(),
      refSnapshot: this.reference ? this.reference.getSnapshot() : null,
      events: engine.events.slice(-120),
      actions: [...engine.actions],
      running: this.running,
      effectiveSpeed: this.running ? this.effectiveSpeed : 0,
      ...extra,
    };
    if (force || t - this.lastHistoryPublish >= HISTORY_PUBLISH_INTERVAL_MS) {
      this.lastHistoryPublish = t;
      const sent = this.sent;
      if (sent.engine !== engine || sent.history > engine.history.length) sent.history = 0;
      if (sent.reference !== this.reference || (this.reference && sent.refHistory > this.reference.history.length)) sent.refHistory = 0;
      sent.engine = engine;
      sent.reference = this.reference;
      patch.historyFrom = sent.history;
      patch.history = engine.history.slice(sent.history);
      patch.segmentSeries = engine.segmentSeries.slice(sent.history);
      patch.stationSeries = engine.stationSeries.slice(sent.history);
      sent.history = engine.history.length;
      patch.refHistoryFrom = sent.refHistory;
      patch.refHistory = this.reference ? this.reference.history.slice(sent.refHistory) : null;
      patch.refSegmentSeries = this.reference ? this.reference.segmentSeries.slice(sent.refHistory) : null;
      sent.refHistory = this.reference ? this.reference.history.length : 0;
    }
    this.post({ type: 'state', patch, clock: { time: engine.time, running: this.running, speed: this.rate(engine) } });
  }

  private notice(level: 'info' | 'error' | 'success', message: string) {
    this.post({ type: 'notice', level, message });
  }

  /* ------------------------------------------------------------------ rejeu */

  private async seek(time: number) {
    const engine = this.engine;
    if (!engine || !this.config) return;
    const wasRunning = this.running;
    this.setRunning(false);
    const target = Math.max(this.config.startTime, Math.min(engine.endTime, time));
    if (target < engine.time) {
      const kept = engine.actions.filter((a) => a.time <= target);
      const dropped = engine.actions.length - kept.length;
      await this.replay(kept, target, 'Rejeu de la simulation…', wasRunning);
      if (dropped > 0) this.notice('info', `${dropped} action(s) postérieure(s) à ce point ont été abandonnées.`);
      return;
    }
    const token = ++this.busyToken;
    this.busy = true;
    const from = engine.time;
    while (engine.time < target - 1e-9 && token === this.busyToken) {
      const until = Math.min(target, engine.time + 300);
      engine.advance(until - engine.time);
      this.reference?.advance(until - this.reference.time);
      this.post({ type: 'state', patch: { busy: { label: 'Avance rapide…', progress: (engine.time - from) / Math.max(1, target - from) } } });
      await sleep();
    }
    if (token !== this.busyToken) return;
    this.busy = false;
    this.publish(true, { busy: null });
    if (engine.finished) this.onFinished();
    else if (wasRunning) this.setRunning(true);
  }

  private async replay(actions: SimAction[], until: number, label: string, resume: boolean) {
    if (!this.config) return;
    const token = ++this.busyToken;
    this.busy = true;
    this.post({ type: 'state', patch: { busy: { label, progress: 0 } } });
    try {
      const engine = new SimulationEngine(this.network, this.config, this.scheduled);
      const reference = this.referenceEnabled ? new SimulationEngine(this.network, this.config, this.scheduled, { quiet: true }) : null;
      const sorted = [...actions].sort((a, b) => a.time - b.time);
      let k = 0;
      const from = engine.time;
      let lastYield = now();
      for (;;) {
        while (k < sorted.length && sorted[k].time <= engine.time + 1e-9) {
          const { time: _t, ...payload } = sorted[k++];
          void _t;
          engine.applyAction(payload as ActionPayload);
        }
        if (engine.time >= until - 1e-9 || engine.finished) break;
        engine.step();
        reference?.step();
        if (now() - lastYield > 60) {
          this.post({ type: 'state', patch: { busy: { label, progress: (engine.time - from) / Math.max(1, until - from) } } });
          await sleep();
          lastYield = now();
          if (token !== this.busyToken) return;
        }
      }
      this.engine = engine;
      this.reference = reference;
    } catch (e) {
      this.notice('error', `Échec du rejeu : ${e instanceof Error ? e.message : String(e)}`);
    }
    this.busy = false;
    this.afterReset();
    this.post({ type: 'state', patch: { busy: null } });
    if (this.engine?.finished) this.onFinished();
    else if (resume) this.setRunning(true);
  }

  /* ------------------------------------------------------------------ résultats */

  private onFinished() {
    if (this.resultSent) return;
    this.resultSent = true;
    void this.computeResult().then((result) => {
      if (result) this.post({ type: 'result', result, scenarioId: this.scenarioId });
    });
  }

  private async computeResult() {
    const engine = this.engine;
    if (!engine || !this.config) return null;
    // Budget et résorption : par rapport à la simulation nominale (même graine, sans incident ni action).
    // Calculée par tranches pour rester réactif sur les longues parties (jusqu'à 24 h).
    const nominal = new SimulationEngine(this.network, this.config, [], { quiet: true });
    const from = nominal.time;
    const long = engine.time - from > 4 * 3600;
    while (nominal.time < engine.time - 1e-9) {
      nominal.advance(Math.min(1800, engine.time - nominal.time));
      if (long) {
        this.post({ type: 'state', patch: { busy: { label: 'Calcul du bilan…', progress: (nominal.time - from) / Math.max(1, engine.time - from) } } });
        await sleep();
      }
    }
    if (long) this.post({ type: 'state', patch: { busy: null } });
    if (engine !== this.engine) return null;
    const summary = summarizeRun({
      history: engine.history,
      kpis: engine.computeKPIs(),
      segmentCount: this.network.segments.length,
      referenceCost: nominal.operatingCost,
      referenceHistory: nominal.history,
    });
    const sc = this.scenarioId ? SCENARIO_BY_ID.get(this.scenarioId) : undefined;
    return computeScore(summary, sc?.objectives ?? [], sc?.difficulty ?? 'normal', sc?.budgetMargin ?? 0.1);
  }

  private async answer(id: number, kind: 'export' | 'route' | 'compare', args: unknown) {
    try {
      let data: unknown = null;
      if (kind === 'export') {
        const engine = this.engine;
        if (engine) {
          data = {
            seed: engine.config.seed,
            history: engine.history,
            referenceHistory: this.reference?.history ?? null,
            incidents: engine.incidents,
            actions: engine.actions,
            summary: (await this.computeResult())?.summary,
          };
        }
      } else if (kind === 'route') {
        const { from, to } = args as { from: string; to: string };
        const a = this.network.stationById.get(from);
        const b = this.network.stationById.get(to);
        const engine = this.engine;
        if (engine && a && b && a !== b) {
          const route = engine.router.bestRoute(a.index, b.index);
          if (route) data = { edges: Array.from(route), cost: engine.router.bestCost(a.index, b.index) };
        }
      } else if (kind === 'compare') {
        const { scenarioId, variants } = args as { scenarioId: string; variants: [Variant, Variant] };
        data = await runComparison(this.network, scenarioId, variants, (p) => this.post({ type: 'progress', id, progress: p }));
      }
      this.post({ type: 'response', id, data });
    } catch (e) {
      this.post({ type: 'response', id, data: null, error: e instanceof Error ? e.message : String(e) });
    }
  }
}
