/**
 * Moteur de simulation discrète des voyageurs (indépendant de React).
 *
 * Les voyageurs sont regroupés en « cohortes » : un groupe (taille réelle, éventuellement
 * fractionnaire) partageant origine, destination, itinéraire et position. À chaque pas :
 *   1. les incidents programmés démarrent / expirent ;
 *   2. la demande synthétique crée de nouvelles cohortes (chaque minute simulée) ;
 *   3. les cohortes en circulation arrivent en station (correspondance, sortie, poursuite) ;
 *   4. l'embarquement est limité par la capacité de chaque arc orienté pendant le pas :
 *      les voyageurs déjà à bord sont prioritaires, puis la file d'attente du quai (FIFO) ;
 *   5. les indicateurs (débit, file, saturation, retards) sont mis à jour.
 * Toute modification passe par applyAction() : le journal d'actions permet de rejouer
 * exactement une simulation (même graine, mêmes paramètres, mêmes actions).
 */
import type { Incident, IncidentSpec } from '@/types/incident';
import type { LineId, Network } from '@/types/network';
import type { ScheduledIncident } from '@/types/scenario';
import type {
  ActionPayload,
  EventLevel,
  HistoryPoint,
  KPIs,
  SimAction,
  SimEvent,
  SimSnapshot,
  SimulationConfig,
} from '@/types/simulation';
import { DemandModel, GENERATION_INTERVAL, type GeneratedTrip } from './demandGenerator';
import { demandOpen, SERVICE_PERIODS, servicePeriodIndex } from './servicePeriods';
import {
  defaultEffects,
  describeTarget,
  INCIDENT_TYPE_INFO,
  incidentMatchesTarget,
  SEVERITY_LABELS,
  validateIncidentSpec,
} from './incidentManager';
import { computeNetworkState, referenceFleet, type NetworkState } from './networkState';
import { referenceTravelTimes, Router } from './passengerAssignment';
import { TIME_PROFILE } from './pathfinding';
import { Rng } from './rng';

/** Seuil de saturation au-delà duquel un tronçon est compté comme saturé (KPI). */
export const SATURATION_ALERT = 0.85;
/** Fenêtre de lissage du débit (s). */
export const FLOW_WINDOW = 300;
/** Horizon de résorption de la file d'attente utilisé dans le taux de saturation (s). */
export const QUEUE_HORIZON = 600;
/** Fenêtre de lissage des retards et attentes (s). */
export const STAT_WINDOW = 600;
/** Période de rafraîchissement des itinéraires selon l'encombrement (s), étalé sur la période. */
export const CONGESTION_REFRESH = 900;
/** Recalcul volontaire d'itinéraire si le gain dépasse max(REROUTE_SLACK, 20 % du coût). */
export const REROUTE_SLACK = 300;
/** Attente au-delà de laquelle un voyageur bloqué cherche une alternative (s). */
export const STUCK_WAIT = 600;
/** Rayon de recherche d'une station de substitution si la destination est fermée (s). */
export const SUBSTITUTE_RADIUS = 900;

const WAITING = 0;
const ONBOARD = 1;
const RIDING = 2;

interface Cohort {
  id: number;
  origin: number;
  dest: number;
  size: number;
  route: Int32Array;
  step: number;
  state: 0 | 1 | 2;
  station: number;
  readyAt: number;
  arriveAt: number;
  waitStart: number;
  startTime: number;
  expected: number;
  affected: boolean;
  needsCheck: boolean;
  stuckChecked: boolean;
  rerouted: number;
}

export interface EngineOptions {
  /** Désactive le journal d'événements (moteur de référence). */
  quiet?: boolean;
}

export type ActionResult = { ok: true; incidentId?: string } | { ok: false; error: string };

export function timeLabel(seconds: number): string {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class SimulationEngine {
  readonly network: Network;
  readonly config: SimulationConfig;
  time: number;
  tick = 0;
  readonly endTime: number;

  state!: NetworkState;
  private networkVersion = 0;
  readonly router: Router;
  private readonly demand: DemandModel;
  /** Temps de trajet de référence (réseau nominal). */
  readonly refTime: Float64Array;
  private readonly substituteOrder: Int32Array[];
  private readonly rng: Rng;
  private readonly surgeRng: Rng;
  private readonly stationIndex: Map<string, number>;
  private readonly edgeFromIdx: Int32Array;
  private readonly edgeToIdx: Int32Array;

  incidents: Incident[] = [];
  private incidentCounter = 0;
  readonly actions: SimAction[] = [];
  events: SimEvent[] = [];
  private eventCounter = 0;
  private quiet: boolean;

  private cohorts: Cohort[] = [];
  private cohortCounter = 0;
  private lastGeneration = -Infinity;
  /** Période de service horaire en cours (voir servicePeriods.ts). */
  private servicePeriod = 0;
  private lastCongestionRefresh: number;
  private lastStuckCheck: number;

  // Statistiques par arc orienté.
  readonly edgeFlow: Float32Array;
  readonly edgeQueue: Float32Array;
  readonly edgeSaturation: Float32Array;
  private readonly edgeServedTick: Float64Array;
  private readonly edgeCarry: Float64Array;
  private readonly edgeAlert: Uint8Array;
  // Par station.
  readonly stationWaiting: Float32Array;
  readonly stationEntries: Float32Array;
  readonly stationExits: Float32Array;
  private readonly entriesTick: Float64Array;
  private readonly exitsTick: Float64Array;
  private readonly stationAlert: Uint8Array;

  // Statistiques globales.
  private delaySum = 0;
  private delayWeight = 0;
  private waitSum = 0;
  private waitWeight = 0;
  private entriesRate = 0;
  completedTrips = 0;
  lostTrips = 0;
  private affectedDone = 0;
  /** Retard cumulé et nombre de trajets terminés des voyageurs affectés (pour le KPI ciblé). */
  private affectedDelaySum = 0;
  private affectedTrips = 0;
  operatingCost = 0;
  history: HistoryPoint[] = [];
  /** Saturation par tronçon, échantillonnée chaque minute (alignée sur history). */
  segmentSeries: Float32Array[] = [];
  /** Voyageurs à quai par station, échantillonnés chaque minute (alignés sur history). */
  stationSeries: Float32Array[] = [];
  /** Fin du dernier incident levé ou expiré. */
  lastIncidentEnd: number | null = null;

  constructor(network: Network, config: SimulationConfig, scheduled: ScheduledIncident[] = [], options: EngineOptions = {}) {
    this.network = network;
    this.config = structuredClone(config);
    this.quiet = !!options.quiet;
    this.time = config.startTime;
    this.endTime = config.startTime + config.duration;
    this.rng = new Rng(config.seed);
    this.surgeRng = new Rng((config.seed ^ 0x5bd1e995) >>> 0);
    this.stationIndex = new Map(network.stations.map((s) => [s.id, s.index]));
    this.edgeFromIdx = Int32Array.from(network.edges.map((e) => this.stationIndex.get(e.from)!));
    this.edgeToIdx = Int32Array.from(network.edges.map((e) => this.stationIndex.get(e.to)!));
    this.lastCongestionRefresh = this.time;
    this.lastStuckCheck = this.time;

    const E = network.edges.length;
    const S = network.stations.length;
    this.edgeFlow = new Float32Array(E);
    this.edgeQueue = new Float32Array(E);
    this.edgeSaturation = new Float32Array(E);
    this.edgeServedTick = new Float64Array(E);
    this.edgeCarry = new Float64Array(E);
    this.edgeAlert = new Uint8Array(E);
    this.stationWaiting = new Float32Array(S);
    this.stationEntries = new Float32Array(S);
    this.stationExits = new Float32Array(S);
    this.entriesTick = new Float64Array(S);
    this.exitsTick = new Float64Array(S);
    this.stationAlert = new Uint8Array(S);

    // Temps de référence : réseau nominal (fréquences de référence, sans incident ni encombrement).
    const nominalConfig: SimulationConfig = {
      ...this.config,
      regulation: {
        ...this.config.regulation,
        globalFrequencyFactor: 1,
        closedStations: [],
        disabledSegments: [],
        lines: Object.fromEntries(network.lines.map((l) => [l.id, { frequency: l.baseFrequency, reserveMobilized: 0 }])) as SimulationConfig['regulation']['lines'],
      },
    };
    this.router = new Router(network);
    const nominal = computeNetworkState(network, nominalConfig, [], -1);
    this.refTime = referenceTravelTimes(this.router.graph, this.router.graph.computeCosts(nominal, TIME_PROFILE, null));
    this.demand = new DemandModel(network, this.refTime);
    this.substituteOrder = network.stations.map((_, o) => {
      const order = network.stations.map((s) => s.index).filter((d) => d !== o && this.refTime[o * S + d] <= SUBSTITUTE_RADIUS);
      order.sort((a, b) => this.refTime[o * S + a] - this.refTime[o * S + b]);
      return Int32Array.from(order);
    });

    for (const sch of scheduled) {
      this.createIncident({ ...sch, startTime: config.startTime + sch.offset, origin: 'scenario' }, false);
    }
    this.servicePeriod = servicePeriodIndex(config.startTime - (config.warmupSeconds ?? 0));
    this.rebuildState();
    this.warmUp(config.warmupSeconds ?? 0);
  }

  /** Simule la période précédant le début pour démarrer avec un réseau chargé, puis remet les compteurs à zéro. */
  private warmUp(seconds: number) {
    if (!(seconds > 0)) return;
    const quiet = this.quiet;
    this.quiet = true;
    this.time = this.config.startTime - seconds;
    this.lastCongestionRefresh = this.time;
    this.lastStuckCheck = this.time;
    while (this.time < this.config.startTime - 1e-9) this.step();
    this.time = this.config.startTime;
    this.quiet = quiet;
    this.tick = 0;
    this.history = [];
    this.segmentSeries = [];
    this.stationSeries = [];
    this.events = [];
    this.completedTrips = 0;
    this.lostTrips = 0;
    this.affectedDone = 0;
    this.affectedDelaySum = 0;
    this.affectedTrips = 0;
    this.operatingCost = 0;
    for (const c of this.cohorts) c.affected = false;
    this.recordHistory();
  }

  /* ------------------------------------------------------------------ état du réseau */

  private rebuildState() {
    this.networkVersion++;
    this.state = computeNetworkState(this.network, this.config, this.incidents, this.networkVersion, SERVICE_PERIODS[this.servicePeriod].level);
    this.router.update(this.state, this.edgeSaturation, true);
    for (const c of this.cohorts) c.needsCheck = true;
    this.checkAllCohorts();
  }

  get finished(): boolean {
    return this.time >= this.endTime;
  }

  /* ------------------------------------------------------------------ journal */

  private log(level: EventLevel, message: string, extra: Partial<SimEvent> = {}) {
    if (this.quiet) return;
    this.events.push({ id: ++this.eventCounter, time: this.time, level, message, ...extra });
    if (this.events.length > 300) this.events.splice(0, this.events.length - 300);
  }

  /* ------------------------------------------------------------------ actions */

  applyAction(payload: ActionPayload): ActionResult {
    const result = this.perform(payload);
    if (result.ok) this.actions.push({ ...payload, time: this.time } as SimAction);
    return result;
  }

  private perform(a: ActionPayload): ActionResult {
    const net = this.network;
    switch (a.type) {
      case 'incident.create': {
        const err = validateIncidentSpec(net, a.spec);
        if (err) return { ok: false, error: err };
        if (a.spec.type === 'return_to_normal') {
          let n = 0;
          for (const inc of this.incidents) {
            if (inc.origin === 'user' && (inc.status === 'active' || inc.status === 'suspended') && incidentMatchesTarget(net, inc, a.spec.target)) {
              this.endIncident(inc, 'Levé par « Retour à la normale »');
              n++;
            }
          }
          this.log('success', `Retour à la normale — ${describeTarget(net, a.spec.target)} : ${n} incident(s) levé(s)`, { kind: 'incident.end' });
          this.rebuildState();
          return { ok: true };
        }
        const inc = this.createIncident(a.spec, true);
        return { ok: true, incidentId: inc.id };
      }
      case 'incident.resolve':
      case 'incident.suspend':
      case 'incident.resume':
      case 'incident.extend':
      case 'incident.severity': {
        const inc = this.incidents.find((i) => i.id === a.incidentId);
        if (!inc) return { ok: false, error: `Incident introuvable : ${a.incidentId}` };
        if (inc.status === 'resolved') return { ok: false, error: 'Incident déjà levé' };
        if (inc.origin === 'scenario' && a.type !== 'incident.extend') {
          return { ok: false, error: 'Incident imposé par le scénario : il ne peut pas être levé ni modifié. Limitez ses effets par la régulation.' };
        }
        if (a.type === 'incident.resolve') {
          this.endIncident(inc, 'Levé par le régulateur');
          this.log('success', `Incident levé : ${inc.label}`, { incidentId: inc.id, kind: 'incident.end' });
        } else if (a.type === 'incident.suspend') {
          if (inc.status !== 'active') return { ok: false, error: "L'incident n'est pas actif" };
          inc.status = 'suspended';
          inc.history.push({ time: this.time, action: 'Suspendu' });
          this.log('info', `Incident suspendu : ${inc.label}`, { incidentId: inc.id, kind: 'incident.update' });
        } else if (a.type === 'incident.resume') {
          if (inc.status !== 'suspended') return { ok: false, error: "L'incident n'est pas suspendu" };
          inc.status = 'active';
          inc.history.push({ time: this.time, action: 'Repris' });
          this.log('warning', `Incident repris : ${inc.label}`, { incidentId: inc.id, kind: 'incident.update' });
        } else if (a.type === 'incident.extend') {
          if (!(a.seconds > 0)) return { ok: false, error: 'Prolongation invalide' };
          if (inc.duration === null) return { ok: false, error: 'Incident permanent : pas de durée à prolonger' };
          inc.duration += a.seconds;
          inc.history.push({ time: this.time, action: `Prolongé de ${Math.round(a.seconds / 60)} min` });
          this.log('info', `Incident prolongé de ${Math.round(a.seconds / 60)} min : ${inc.label}`, { incidentId: inc.id, kind: 'incident.update' });
          return { ok: true };
        } else {
          if (inc.customEffects) return { ok: false, error: 'Effets personnalisés : la gravité ne peut pas être recalculée' };
          inc.severity = a.severity;
          inc.effects = defaultEffects(net, { ...inc, startTime: inc.startTime });
          inc.history.push({ time: this.time, action: `Gravité : ${SEVERITY_LABELS[a.severity]}` });
          this.log('info', `Gravité modifiée (${SEVERITY_LABELS[a.severity]}) : ${inc.label}`, { incidentId: inc.id, kind: 'incident.update' });
        }
        this.rebuildState();
        return { ok: true };
      }
      case 'line.frequency': {
        const line = net.lineById.get(a.line);
        if (!line) return { ok: false, error: `Ligne inconnue : ${a.line}` };
        if (!(a.frequency >= 1 && a.frequency <= line.maxFrequency)) {
          return { ok: false, error: `Fréquence hors limites (1 à ${line.maxFrequency} trains/h)` };
        }
        this.config.regulation.lines[a.line].frequency = a.frequency;
        this.log('info', `Ligne ${a.line} : fréquence programmée ${a.frequency} trains/h`, { kind: 'regulation', line: a.line });
        this.rebuildState();
        return { ok: true };
      }
      case 'line.reserve': {
        const line = net.lineById.get(a.line);
        if (!line) return { ok: false, error: `Ligne inconnue : ${a.line}` };
        const limit = this.config.reserveLimit ?? line.reserveFleet;
        if (!(a.count >= 0 && a.count <= limit && Number.isInteger(a.count))) {
          return { ok: false, error: `Réserve limitée à ${limit} rames sur la ligne ${a.line}` };
        }
        const ctl = this.config.regulation.lines[a.line];
        const delta = a.count - ctl.reserveMobilized;
        if (delta > 0) this.operatingCost += delta * this.config.costPerReserveTrain;
        ctl.reserveMobilized = a.count;
        this.log('info', `Ligne ${a.line} : ${a.count} rame(s) de réserve mobilisée(s)`, { kind: 'regulation', line: a.line });
        this.rebuildState();
        return { ok: true };
      }
      case 'global.frequency': {
        if (!(a.factor >= 0.5 && a.factor <= 1.3)) return { ok: false, error: 'Facteur global hors limites (50 % à 130 %)' };
        this.config.regulation.globalFrequencyFactor = a.factor;
        this.log('info', `Fréquences globales : ${Math.round(a.factor * 100)} %`, { kind: 'regulation' });
        this.rebuildState();
        return { ok: true };
      }
      case 'station.close':
      case 'station.open': {
        const st = net.stationById.get(a.stationId);
        if (!st) return { ok: false, error: `Station indisponible dans cette version : ${a.stationId}` };
        const list = this.config.regulation.closedStations;
        const has = list.includes(st.id);
        if (a.type === 'station.close') {
          if (has) return { ok: false, error: 'Station déjà fermée' };
          list.push(st.id);
          this.log('warning', `Station fermée par le régulateur : ${st.name}`, { stationId: st.id, kind: 'station.closed' });
        } else {
          if (!has) return { ok: false, error: "La station n'est pas fermée par la régulation" };
          list.splice(list.indexOf(st.id), 1);
          this.log('success', `Station rouverte : ${st.name}`, { stationId: st.id, kind: 'station.opened' });
        }
        this.rebuildState();
        return { ok: true };
      }
      case 'segment.disable':
      case 'segment.enable': {
        const seg = net.segmentById.get(a.segmentId);
        if (!seg) return { ok: false, error: `Tronçon inconnu : ${a.segmentId}` };
        const list = this.config.regulation.disabledSegments;
        const has = list.includes(seg.id);
        const name = describeTarget(net, { kind: 'segment', segmentId: seg.id });
        if (a.type === 'segment.disable') {
          if (has) return { ok: false, error: 'Tronçon déjà désactivé' };
          list.push(seg.id);
          this.log('warning', `Tronçon désactivé : ${name}`, { segmentId: seg.id, kind: 'segment.closed' });
        } else {
          if (!has) return { ok: false, error: "Le tronçon n'est pas désactivé" };
          list.splice(list.indexOf(seg.id), 1);
          this.log('success', `Tronçon réactivé : ${name}`, { segmentId: seg.id, kind: 'segment.opened' });
        }
        this.rebuildState();
        return { ok: true };
      }
    }
  }

  private createIncident(spec: IncidentSpec, rebuild: boolean): Incident {
    const startTime = spec.startTime ?? this.time;
    const info = INCIDENT_TYPE_INFO[spec.type];
    const inc: Incident = {
      id: `INC-${String(++this.incidentCounter).padStart(3, '0')}`,
      type: spec.type,
      label: `${info.label} — ${describeTarget(this.network, spec.target)}`,
      target: spec.target,
      severity: spec.severity,
      radius: spec.radius,
      startTime,
      duration: spec.duration,
      elapsed: 0,
      status: startTime > this.time ? 'scheduled' : 'active',
      effects: spec.effects ?? defaultEffects(this.network, spec),
      customEffects: !!spec.effects,
      options: spec.options,
      origin: spec.origin ?? 'user',
      ...(spec.surprise ? { surprise: true } : {}),
      history: [{ time: this.time, action: startTime > this.time ? `Programmé pour ${timeLabel(startTime)}` : 'Déclenché' }],
    };
    this.incidents.push(inc);
    if (inc.status === 'active') {
      this.log('critical', `Incident : ${inc.label} (gravité ${SEVERITY_LABELS[inc.severity].toLowerCase()})`, {
        kind: 'incident.start',
        incidentId: inc.id,
        stationId: spec.target.kind === 'station' ? spec.target.stationId : undefined,
      });
    } else if (!spec.surprise) {
      this.log('info', `Incident programmé à ${timeLabel(startTime)} : ${inc.label}`, { incidentId: inc.id, kind: 'incident.scheduled' });
    }
    if (rebuild) this.rebuildState();
    return inc;
  }

  private endIncident(inc: Incident, reason: string) {
    inc.status = 'resolved';
    inc.endTime = this.time;
    inc.history.push({ time: this.time, action: reason });
    this.lastIncidentEnd = this.time;
  }

  /* ------------------------------------------------------------------ simulation */

  /** Avance la simulation d'un pas. */
  step(): void {
    if (this.finished) return;
    const dt = this.config.stepSeconds;
    const now = this.time;

    this.entriesTick.fill(0);
    this.exitsTick.fill(0);
    this.edgeServedTick.fill(0);

    this.updateIncidents(dt);
    this.updateServicePeriod(now);

    if (now - this.lastGeneration >= GENERATION_INTERVAL) {
      this.lastGeneration = now;
      this.generateDemand(now);
    }

    this.processArrivals(now, dt);
    this.processBoarding(now, dt);
    this.updateStatistics(dt);

    if (now - this.lastStuckCheck >= 60) {
      this.lastStuckCheck = now;
      this.checkStuckCohorts(now);
    }
    // Mise à jour des coûts d'encombrement toutes les minutes ; les arbres de plus courts
    // chemins sont rafraîchis progressivement (quelques origines par pas) sur CONGESTION_REFRESH.
    if (now - this.lastCongestionRefresh >= 60) {
      this.lastCongestionRefresh = now;
      this.router.update(this.state, this.edgeSaturation, false);
    }
    this.router.refreshSome(Math.ceil((this.network.stations.length * dt) / CONGESTION_REFRESH));

    this.time += dt;
    this.tick++;
    if (Math.floor(this.time / 60) !== Math.floor(now / 60)) this.recordHistory();
    if (this.finished) this.log('info', `Fin de la simulation (${timeLabel(this.time)})`, { kind: 'end' });
  }

  /** Avance de `seconds` secondes simulées. */
  advance(seconds: number): void {
    const target = Math.min(this.endTime, this.time + seconds);
    while (this.time < target - 1e-9 && !this.finished) this.step();
  }

  private updateIncidents(dt: number) {
    let changed = false;
    for (const inc of this.incidents) {
      if (inc.status === 'scheduled' && inc.startTime <= this.time) {
        inc.status = 'active';
        inc.history.push({ time: this.time, action: 'Déclenché' });
        this.log('critical', `Incident : ${inc.label} (gravité ${SEVERITY_LABELS[inc.severity].toLowerCase()})`, {
          kind: 'incident.start',
          incidentId: inc.id,
          stationId: inc.target.kind === 'station' ? inc.target.stationId : undefined,
        });
          changed = true;
      } else if (inc.status === 'active') {
        inc.elapsed += dt;
        if (inc.duration !== null && inc.elapsed >= inc.duration) {
          this.endIncident(inc, 'Fin de l’incident (durée écoulée)');
          this.log('success', `Fin d'incident : ${inc.label}`, { incidentId: inc.id, kind: 'incident.end' });
          changed = true;
        }
      }
    }
    if (changed) this.rebuildState();
  }

  /** Changement de période de service (fermeture de nuit, heures creuses…) : fréquences recalculées. */
  private updateServicePeriod(now: number) {
    const idx = servicePeriodIndex(now);
    if (idx === this.servicePeriod) return;
    const before = SERVICE_PERIODS[this.servicePeriod];
    const after = SERVICE_PERIODS[idx];
    this.servicePeriod = idx;
    this.rebuildState();
    if (after.level === 0) this.log('info', 'Fin de service : le métro ferme pour la nuit', { kind: 'service' });
    else if (before.level === 0) this.log('success', 'Ouverture du métro : premiers trains', { kind: 'service' });
    else this.log('info', `${after.label} : fréquences à ${Math.round(after.level * 100)} % du programme`, { kind: 'service' });
  }

  /** Période de service en cours (libellé et niveau de fréquence). */
  get service(): { label: string; level: number } {
    const p = SERVICE_PERIODS[this.servicePeriod];
    return { label: p.label, level: p.level };
  }

  private generateDemand(now: number) {
    const S = this.network.stations.length;
    const originFactor = new Float64Array(S);
    const destFactor = new Float64Array(S);
    for (let i = 0; i < S; i++) {
      const open = this.state.stationOpen[i] === 1;
      // Une station fermée continue d'émettre : ses voyageurs sont reportés vers une station voisine.
      originFactor[i] = this.state.stationDemandFactor[i];
      destFactor[i] = open ? this.state.stationDemandFactor[i] : 1;
    }
    const trips: GeneratedTrip[] = [];
    // La nuit, aucun nouveau voyageur (les tirages sont consommés quand même : reproductibilité).
    const scale = demandOpen(now) ? this.config.demandScale : 0;
    this.demand.generate(this.rng, now, GENERATION_INTERVAL, scale, originFactor, trips);
    this.demand.generateSurge(this.surgeRng, now, GENERATION_INTERVAL, scale, destFactor, trips);
    for (const t of trips) if (t.size > 0) this.startTrip(t, now);
  }

  /** Station ouverte la plus proche (temps de référence), ou -1. */
  private substitute(station: number, exclude: number): number {
    for (const d of this.substituteOrder[station]) if (this.state.stationOpen[d] === 1 && d !== exclude) return d;
    return -1;
  }

  private startTrip(t: GeneratedTrip, now: number) {
    const S = this.network.stations.length;
    let origin = t.origin;
    let dest = t.dest;
    let affected = false;
    // Station fermée : le voyageur se reporte à pied vers la station ouverte la plus proche.
    if (!this.state.stationOpen[origin]) {
      origin = this.substitute(origin, dest);
      affected = true;
    }
    if (origin >= 0 && !this.state.stationOpen[dest]) {
      dest = this.substitute(dest, origin);
      affected = true;
    }
    if (origin < 0 || dest < 0) {
      this.lostTrips += t.size;
      this.affectedDone += t.size;
      return;
    }
    if (origin === dest) {
      // Trajet devenu trop court : effectué à pied, hors métro.
      this.affectedDone += t.size;
      return;
    }
    const options = this.router.options(origin, dest);
    if (options.length === 0 && Number.isFinite(this.router.bestCost(origin, dest))) {
      // Trajet réalisable uniquement à pied (correspondance piétonne) : hors métro, ignoré.
      return;
    }
    if (options.length === 0) {
      // Aucun itinéraire dans le réseau simulé : report hors métro.
      this.lostTrips += t.size;
      this.affectedDone += t.size;
      return;
    }
    this.entriesTick[origin] += t.size;
    const expected = this.refTime[t.origin * S + t.dest];
    for (const opt of options) {
      const size = t.size * opt.share;
      if (size <= 1e-6) continue;
      const first = opt.edges[0];
      const c: Cohort = {
        id: ++this.cohortCounter,
        origin,
        dest,
        size,
        route: opt.edges,
        step: 0,
        state: WAITING,
        station: origin,
        readyAt: now + 0.5 * this.state.edgeHeadway[first],
        arriveAt: 0,
        waitStart: now,
        startTime: now,
        expected: Number.isFinite(expected) ? expected : this.refTime[origin * S + dest],
        affected: affected || this.state.stationDisrupted[origin] === 1,
        needsCheck: false,
        stuckChecked: false,
        rerouted: 0,
      };
      this.cohorts.push(c);
    }
  }

  private processArrivals(now: number, dt: number) {
    const net = this.network;
    const st = this.state;
    const cohorts = this.cohorts;
    for (let i = cohorts.length - 1; i >= 0; i--) {
      const c = cohorts[i];
      if (c.state !== RIDING || c.arriveAt > now + dt) continue;
      const e = c.route[c.step];
      const t = this.edgeToIdx[e];
      c.step++;
      c.station = t;
      if (st.segmentDisrupted[net.edges[e].segment]) c.affected = true;

      if (c.step >= c.route.length) {
        if (st.stationOpen[t]) {
          this.finishCohort(i, c, now + dt);
          continue;
        }
        // Destination fermée pendant le trajet : poursuite jusqu'à la station suivante, puis report.
        this.ensureDestination(c);
        if (!this.continueThrough(c, e, now)) this.loseCohort(i, c);
        continue;
      }
      if (c.needsCheck) {
        c.needsCheck = false;
        const onboardNext = this.continuesOnboard(e, c.route[c.step]);
        const rc = this.router.remainingCost(c.route, c.step, onboardNext);
        if (!Number.isFinite(rc) || this.shouldReroute(c, rc, t)) {
          if (!st.stationOpen[t]) {
            if (!this.continueThrough(c, e, now)) this.loseCohort(i, c);
            continue;
          }
          this.reroute(i, c, now, true, e);
          continue;
        }
      }
      this.prepareNextLeg(i, c, e, now);
    }
  }

  /** Le voyageur reste-t-il dans le même train entre deux arcs ? */
  private continuesOnboard(prevEdge: number, nextEdge: number): boolean {
    const a = this.network.edges[prevEdge];
    const b = this.network.edges[nextEdge];
    return a.to === b.from && a.line === b.line && a.direction === b.direction;
  }

  /** Prépare l'étape suivante d'une cohorte qui vient d'arriver en station via l'arc e. */
  private prepareNextLeg(i: number, c: Cohort, e: number, now: number) {
    const net = this.network;
    const st = this.state;
    const next = c.route[c.step];
    const t = c.station;
    if (this.continuesOnboard(e, next)) {
      c.state = ONBOARD;
      c.readyAt = now;
      c.waitStart = now;
      return;
    }
    const nextFrom = this.edgeFromIdx[next];
    if (nextFrom === t) {
      const extra = st.stationTransferExtra[t];
      if (!st.stationOpen[t] || !Number.isFinite(extra)) {
        this.reroute(i, c, now, true, e);
        return;
      }
      const walk = this.router.graph.stationTransferBase[t] + extra;
      c.state = WAITING;
      c.waitStart = now + walk;
      c.readyAt = now + walk + 0.5 * st.edgeHeadway[next];
      if (st.stationDisrupted[t]) c.affected = true;
      return;
    }
    // Correspondance piétonne vers une autre station.
    const from = net.edges[e].to;
    const to = net.edges[next].from;
    const w = net.walkingTransfers.find((x) => (x.from === from && x.to === to) || (x.to === from && x.from === to));
    if (!w || !st.stationOpen[nextFrom] || !st.stationOpen[t]) {
      this.reroute(i, c, now, true, e);
      return;
    }
    c.state = WAITING;
    c.station = nextFrom;
    c.waitStart = now + w.walkSeconds;
    c.readyAt = now + w.walkSeconds + 0.5 * st.edgeHeadway[next];
  }

  /** Station fermée traversée : la cohorte reste à bord jusqu'à la station suivante (même ligne, même sens). */
  private continueThrough(c: Cohort, e: number, now: number): boolean {
    const edge = this.network.edges[e];
    const cont = this.network.edges.find(
      (x) => x.from === edge.to && x.line === edge.line && x.direction === edge.direction && x.to !== edge.from && this.state.edgeAvailable[x.index],
    );
    if (!cont) return false;
    c.route = Int32Array.from([cont.index]);
    c.step = 0;
    c.state = ONBOARD;
    c.readyAt = now;
    c.waitStart = now;
    c.needsCheck = true;
    c.affected = true;
    return true;
  }

  /** Doit-on proposer un nouvel itinéraire (gain significatif) ? */
  private shouldReroute(c: Cohort, remaining: number, station: number): boolean {
    if (!this.state.stationOpen[station]) return false;
    const best = this.router.bestCost(station, c.dest);
    if (!Number.isFinite(best)) return false;
    return remaining > best + Math.max(REROUTE_SLACK, 0.2 * best);
  }

  /**
   * Recalcule l'itinéraire d'une cohorte depuis sa station courante.
   * Retourne false si la cohorte a été retirée (destination inaccessible).
   */
  private reroute(i: number, c: Cohort, now: number, fromArrival: boolean, arrivedEdge = -1): boolean {
    const st = this.state;
    const t = c.station;
    if (!st.stationOpen[t]) {
      this.loseCohort(i, c);
      return false;
    }
    if (c.dest === t) {
      this.finishCohort(i, c, now);
      return false;
    }
    if (!this.ensureDestination(c)) {
      this.loseCohort(i, c);
      return false;
    }
    if (c.dest === t) {
      this.finishCohort(i, c, now);
      return false;
    }
    const route = this.router.bestRoute(t, c.dest);
    c.affected = true;
    c.rerouted++;
    if (!route) {
      // Plus aucun itinéraire : le voyageur quitte le métro (report sur un autre mode).
      this.loseCohort(i, c);
      return false;
    }
    const wasOnboard = c.state === ONBOARD || (fromArrival && arrivedEdge >= 0);
    c.route = route;
    c.step = 0;
    if (wasOnboard && arrivedEdge >= 0 && this.continuesOnboard(arrivedEdge, route[0])) {
      c.state = ONBOARD;
      c.readyAt = now;
      c.waitStart = now;
      return true;
    }
    const walk = wasOnboard ? this.router.graph.stationTransferBase[t] : 0;
    c.state = WAITING;
    c.waitStart = now + walk;
    c.readyAt = now + walk + 0.5 * st.edgeHeadway[route[0]];
    return true;
  }

  /** Destination fermée : report vers la station ouverte la plus proche. Retourne false si aucune. */
  private ensureDestination(c: Cohort): boolean {
    if (this.state.stationOpen[c.dest]) return true;
    const sub = this.substitute(c.dest, -1);
    if (sub < 0) return false;
    c.dest = sub;
    c.affected = true;
    return true;
  }

  private finishCohort(i: number, c: Cohort, at: number) {
    const duration = at - c.startTime;
    const delay = Math.max(0, duration - c.expected);
    this.delaySum += delay * c.size;
    this.delayWeight += c.size;
    this.completedTrips += c.size;
    this.exitsTick[c.station] += c.size;
    if (c.affected) {
      this.affectedDone += c.size;
      this.affectedDelaySum += delay * c.size;
      this.affectedTrips += c.size;
    }
    this.removeCohort(i);
  }

  private loseCohort(i: number, c: Cohort) {
    this.lostTrips += c.size;
    this.affectedDone += c.size;
    if (this.state.stationOpen[c.station]) this.exitsTick[c.station] += c.size;
    this.removeCohort(i);
  }

  private removeCohort(i: number) {
    const last = this.cohorts.pop()!;
    if (i < this.cohorts.length) this.cohorts[i] = last;
  }

  /** Après un changement d'état du réseau : vérifie la validité des itinéraires des voyageurs à quai. */
  private checkAllCohorts() {
    const st = this.state;
    const now = this.time;
    for (let i = this.cohorts.length - 1; i >= 0; i--) {
      const c = this.cohorts[i];
      if (c.state === RIDING) continue; // vérifié à l'arrivée en station
      c.needsCheck = false;
      const t = c.station;
      if (!st.stationOpen[t]) {
        if (c.state === WAITING) {
          // Station évacuée : report à pied vers la station ouverte la plus proche.
          this.evacuate(i, c, now);
        } else if (!st.edgeAvailable[c.route[c.step]]) {
          this.loseCohort(i, c);
        } else {
          c.needsCheck = true; // reste à bord, contrôle à la station suivante
        }
        continue;
      }
      const onboard = c.state === ONBOARD;
      if (!this.ensureDestination(c)) {
        this.loseCohort(i, c);
        continue;
      }
      if (c.dest === t && !onboard) {
        this.finishCohort(i, c, now);
        continue;
      }
      const rc = this.router.remainingCost(c.route, c.step, onboard);
      if (!Number.isFinite(rc) || this.shouldReroute(c, rc, t)) {
        const keepTrain = onboard ? c.route[c.step] : -1;
        const route = this.router.bestRoute(t, c.dest);
        if (!route) {
          this.loseCohort(i, c);
          continue;
        }
        c.affected = true;
        c.rerouted++;
        const sameTrain = onboard && keepTrain >= 0 && route[0] === keepTrain;
        c.route = route;
        c.step = 0;
        if (!sameTrain) {
          const walk = onboard ? this.router.graph.stationTransferBase[t] : 0;
          c.state = WAITING;
          c.waitStart = now + walk;
          c.readyAt = Math.max(c.readyAt, now + walk + 0.5 * st.edgeHeadway[route[0]]);
        }
      }
    }
  }

  /** Temps de marche forfaitaire vers une station de report (s). */
  static readonly EVACUATION_WALK = 360;

  private evacuate(i: number, c: Cohort, now: number) {
    const sub = this.substitute(c.station, -1);
    c.affected = true;
    if (sub < 0) {
      this.loseCohort(i, c);
      return;
    }
    if (sub === c.dest) {
      this.finishCohort(i, c, now + SimulationEngine.EVACUATION_WALK);
      return;
    }
    const route = this.router.bestRoute(sub, c.dest);
    if (!route) {
      this.loseCohort(i, c);
      return;
    }
    c.station = sub;
    c.route = route;
    c.step = 0;
    c.rerouted++;
    c.state = WAITING;
    c.waitStart = now + SimulationEngine.EVACUATION_WALK;
    c.readyAt = c.waitStart + 0.5 * this.state.edgeHeadway[route[0]];
  }

  /** Voyageurs bloqués longtemps (refus d'embarquement) : recherche d'une alternative. */
  private checkStuckCohorts(now: number) {
    for (let i = this.cohorts.length - 1; i >= 0; i--) {
      const c = this.cohorts[i];
      if (c.state !== WAITING || c.stuckChecked || now - c.waitStart < STUCK_WAIT) continue;
      c.stuckChecked = true;
      const rc = this.router.remainingCost(c.route, c.step, false);
      if (!Number.isFinite(rc) || this.shouldReroute(c, rc, c.station)) {
        const route = this.router.bestRoute(c.station, c.dest);
        if (!route) continue;
        if (route.join(',') === Array.from(c.route.subarray(c.step)).join(',')) continue;
        c.route = route;
        c.step = 0;
        c.rerouted++;
        c.affected = true;
        c.readyAt = now + 0.5 * this.state.edgeHeadway[route[0]];
      }
    }
  }

  // Tampons réutilisés pour l'embarquement.
  private onboardBuckets: Cohort[][] | null = null;
  private waitingBuckets: Cohort[][] | null = null;

  private processBoarding(now: number, dt: number) {
    const E = this.network.edges.length;
    if (!this.onboardBuckets) {
      this.onboardBuckets = Array.from({ length: E }, () => []);
      this.waitingBuckets = Array.from({ length: E }, () => []);
    }
    const onboardB = this.onboardBuckets;
    const waitingB = this.waitingBuckets!;
    for (let e = 0; e < E; e++) {
      onboardB[e].length = 0;
      waitingB[e].length = 0;
    }
    this.stationWaiting.fill(0);
    this.edgeQueue.fill(0);
    const st = this.state;
    for (const c of this.cohorts) {
      if (c.state === RIDING) continue;
      const e = c.route[c.step];
      if (c.state === ONBOARD) onboardB[e].push(c);
      else {
        // Les voyageurs encore dans les couloirs (marche de correspondance) ne sont pas comptés sur le quai.
        if (c.waitStart <= now) this.stationWaiting[c.station] += c.size;
        if (c.readyAt <= now + dt) waitingB[e].push(c);
      }
    }

    const carry = this.edgeCarry;
    for (let e = 0; e < E; e++) {
      const ob = onboardB[e];
      const wb = waitingB[e];
      if (ob.length === 0 && wb.length === 0) {
        carry[e] = 0;
        continue;
      }
      // Capacité du pas + report (négatif si des voyageurs ont embarqué « en avance » au pas précédent).
      let cap = (st.edgeCapacity[e] * dt) / 3600 + carry[e];
      const travel = st.edgeTravelTime[e];
      const disrupted = st.segmentDisrupted[this.network.edges[e].segment] === 1;

      // 1. Voyageurs déjà à bord : prioritaires, servis par cohortes entières (FIFO).
      if (ob.length > 1) ob.sort((a, b) => a.readyAt - b.readyAt || a.id - b.id);
      for (const c of ob) {
        if (cap <= 1e-9) {
          // Train retenu / capacité réduite : la cohorte reste bloquée à bord.
          this.edgeQueue[e] += c.size;
          if (disrupted) c.affected = true;
          continue;
        }
        cap -= c.size;
        this.edgeServedTick[e] += c.size;
        this.board(c, e, now, travel);
      }
      // 2. File d'attente du quai (FIFO selon l'heure d'arrivée sur le quai).
      if (wb.length > 1) wb.sort((a, b) => a.readyAt - b.readyAt || a.id - b.id);
      for (const c of wb) {
        if (cap <= 1e-9) {
          this.edgeQueue[e] += c.size;
          continue;
        }
        const wait = Math.max(0, now - c.waitStart);
        cap -= c.size;
        this.waitSum += wait * c.size;
        this.waitWeight += c.size;
        this.edgeServedTick[e] += c.size;
        this.board(c, e, now, travel);
      }
      // La capacité inutilisée n'est pas reportée ; un dépassement l'est (dette de capacité).
      carry[e] = Math.min(0, cap);
    }
  }

  private board(c: Cohort, e: number, now: number, travel: number) {
    c.state = RIDING;
    c.arriveAt = now + travel;
    c.stuckChecked = false;
    if (this.state.segmentDisrupted[this.network.edges[e].segment]) c.affected = true;
  }

  private updateStatistics(dt: number) {
    const E = this.network.edges.length;
    const S = this.network.stations.length;
    const st = this.state;
    const a = dt / FLOW_WINDOW;
    for (let e = 0; e < E; e++) {
      if (!st.edgeAvailable[e]) {
        // Tronçon fermé : aucun train ne circule.
        this.edgeFlow[e] = 0;
        this.edgeSaturation[e] = 0;
        continue;
      }
      const rate = (this.edgeServedTick[e] / dt) * 3600;
      this.edgeFlow[e] += a * (rate - this.edgeFlow[e]);
      const cap = st.edgeCapacity[e];
      const demand = this.edgeFlow[e] + (this.edgeQueue[e] * 3600) / QUEUE_HORIZON;
      this.edgeSaturation[e] = cap > 0 ? demand / cap : 0;
    }
    for (let s = 0; s < S; s++) {
      this.stationEntries[s] += a * ((this.entriesTick[s] / dt) * 3600 - this.stationEntries[s]);
      this.stationExits[s] += a * ((this.exitsTick[s] / dt) * 3600 - this.stationExits[s]);
    }
    let entries = 0;
    for (let s = 0; s < S; s++) entries += this.entriesTick[s];
    this.entriesRate += a * ((entries / dt) * 3600 - this.entriesRate);

    // Décroissance exponentielle des moyennes de retard et d'attente.
    const decay = Math.exp(-dt / STAT_WINDOW);
    this.delaySum *= decay;
    this.delayWeight *= decay;
    this.waitSum *= decay;
    this.waitWeight *= decay;

    // Coût opérationnel fictif.
    let trains = 0;
    for (const l of this.network.lines) trains += st.lineTrains[l.id];
    this.operatingCost += (trains * this.config.costPerTrainHour * dt) / 3600;

    this.updateAlerts();
  }

  private updateAlerts() {
    if (this.quiet) return;
    const net = this.network;
    for (const edge of net.edges) {
      const sat = this.edgeSaturation[edge.index];
      if (!this.edgeAlert[edge.index] && sat >= 1 && this.state.edgeCapacity[edge.index] > 0) {
        this.edgeAlert[edge.index] = 1;
        this.log(
          'warning',
          `Saturation ${Math.round(sat * 100)} % — L${edge.line} ${net.stationById.get(edge.from)!.name} → ${net.stationById.get(edge.to)!.name}`,
          { segmentId: net.segments[edge.segment].id, kind: 'alert.segment', line: edge.line },
        );
      } else if (this.edgeAlert[edge.index] && sat < 0.85) {
        this.edgeAlert[edge.index] = 0;
      }
    }
    for (const s of net.stations) {
      const load = this.stationWaiting[s.index] / s.capacity;
      if (!this.stationAlert[s.index] && load >= 1) {
        this.stationAlert[s.index] = 1;
        this.log('warning', `Quais saturés à ${s.name} : ${Math.round(this.stationWaiting[s.index])} voyageurs en attente`, { stationId: s.id, kind: 'alert.station' });
      } else if (this.stationAlert[s.index] && load < 0.7) {
        this.stationAlert[s.index] = 0;
      }
    }
  }

  /* ------------------------------------------------------------------ indicateurs */

  segmentSaturation(): Float32Array {
    const out = new Float32Array(this.network.segments.length);
    for (const e of this.network.edges) out[e.segment] = Math.max(out[e.segment], this.edgeSaturation[e.index]);
    return out;
  }

  computeKPIs(): KPIs {
    const net = this.network;
    const st = this.state;
    let inNetwork = 0;
    let waiting = 0;
    let affectedNow = 0;
    for (const c of this.cohorts) {
      inNetwork += c.size;
      if (c.state === WAITING) waiting += c.size;
      if (c.affected) affectedNow += c.size;
    }
    const segSat = this.segmentSaturation();
    let satSum = 0;
    let satCount = 0;
    let saturated = 0;
    for (const s of net.segments) {
      if (!st.segmentAvailable[s.index]) continue;
      satSum += segSat[s.index];
      satCount++;
      if (segSat[s.index] >= SATURATION_ALERT) saturated++;
    }
    let capSum = 0;
    let flowSum = 0;
    for (const e of net.edges) {
      if (!st.edgeAvailable[e.index]) continue;
      capSum += st.edgeCapacity[e.index];
      flowSum += Math.min(this.edgeFlow[e.index], st.edgeCapacity[e.index]);
    }
    const avgDelay = this.delayWeight > 1e-6 ? this.delaySum / this.delayWeight : 0;
    const avgWait = this.waitWeight > 1e-6 ? this.waitSum / this.waitWeight : 0;
    const activeIncidents = this.incidents.filter((i) => i.status === 'active').length;
    const saturatedShare = satCount ? saturated / satCount : 0;
    const serviceQuality = serviceQualityIndex(avgDelay, avgWait, saturatedShare);
    let trains = 0;
    for (const l of net.lines) trains += st.lineTrains[l.id];
    return {
      inNetwork,
      waiting,
      avgSaturation: satCount ? satSum / satCount : 0,
      saturatedSegments: saturated,
      activeIncidents,
      avgDelay,
      avgWait,
      affectedTotal: this.affectedDone + affectedNow,
      affectedNow,
      entriesPerHour: this.entriesRate,
      availableCapacity: capSum > 0 ? 1 - flowSum / capSum : 0,
      serviceQuality,
      completedTrips: this.completedTrips,
      lostTrips: this.lostTrips,
      operatingCost: this.operatingCost,
      trainsInService: trains,
      affectedDelay: this.affectedTrips > 1e-6 ? this.affectedDelaySum / this.affectedTrips : 0,
    };
  }

  private recordHistory() {
    const k = this.computeKPIs();
    const segSat = this.segmentSaturation();
    const lineSaturation = {} as Record<LineId, number>;
    const lineMax = {} as Record<LineId, number>;
    for (const l of this.network.lines) {
      let sum = 0;
      let n = 0;
      let max = 0;
      for (const s of this.network.segments) {
        if (s.line !== l.id || !this.state.segmentAvailable[s.index]) continue;
        sum += segSat[s.index];
        n++;
        max = Math.max(max, segSat[s.index]);
      }
      lineSaturation[l.id] = n ? sum / n : 0;
      lineMax[l.id] = max;
    }
    this.segmentSeries.push(segSat);
    this.stationSeries.push(Float32Array.from(this.stationWaiting));
    this.history.push({
      time: this.time,
      inNetwork: k.inNetwork,
      waiting: k.waiting,
      entriesPerHour: k.entriesPerHour,
      avgSaturation: k.avgSaturation,
      saturatedSegments: k.saturatedSegments,
      avgDelay: k.avgDelay,
      avgWait: k.avgWait,
      affectedTotal: k.affectedTotal,
      affectedNow: k.affectedNow,
      activeIncidents: k.activeIncidents,
      serviceQuality: k.serviceQuality,
      operatingCost: k.operatingCost,
      lostTrips: k.lostTrips,
      lineSaturation,
      lineMaxSaturation: lineMax,
    });
  }

  getSnapshot(): SimSnapshot {
    const net = this.network;
    const st = this.state;
    const G = net.segments.length;
    const segmentSaturation = this.segmentSaturation();
    const segmentFlow = new Float32Array(G);
    const segmentDelay = new Float32Array(G);
    const edgeDelay = new Float32Array(net.edges.length);
    const edgeCapacity = new Float32Array(net.edges.length);
    for (const e of net.edges) {
      const seg = net.segments[e.segment];
      const cap = st.edgeCapacity[e.index];
      edgeCapacity[e.index] = cap;
      const queueWait = cap > 0 ? (this.edgeQueue[e.index] / cap) * 3600 : 0;
      const d = Math.max(0, st.edgeTravelTime[e.index] - seg.baseTravelTime) + queueWait;
      edgeDelay[e.index] = d;
      segmentFlow[e.segment] = Math.max(segmentFlow[e.segment], this.edgeFlow[e.index]);
      segmentDelay[e.segment] = Math.max(segmentDelay[e.segment], d);
    }
    const stationLoad = new Float32Array(net.stations.length);
    for (const s of net.stations) stationLoad[s.index] = this.stationWaiting[s.index] / s.capacity;
    return {
      time: this.time,
      tick: this.tick,
      finished: this.finished,
      service: this.service,
      edgeFlow: Float32Array.from(this.edgeFlow),
      edgeSaturation: Float32Array.from(this.edgeSaturation),
      edgeCapacity,
      edgeQueue: Float32Array.from(this.edgeQueue),
      edgeDelay,
      edgeTravelTime: Float32Array.from(st.edgeTravelTime),
      segmentSaturation,
      segmentFlow,
      segmentDelay,
      segmentAvailable: Uint8Array.from(st.segmentAvailable),
      stationWaiting: Float32Array.from(this.stationWaiting),
      stationLoad,
      stationEntries: Float32Array.from(this.stationEntries),
      stationExits: Float32Array.from(this.stationExits),
      stationOpen: Uint8Array.from(st.stationOpen),
      lineFrequency: { ...st.lineFrequency },
      lineCapacity: { ...st.lineCapacity },
      lineTrains: { ...st.lineTrains },
      lineFleetLimit: { ...st.lineFleetLimit },
      kpis: this.computeKPIs(),
      incidents: structuredClone(this.incidents),
      regulation: structuredClone(this.config.regulation),
      networkVersion: this.networkVersion,
    };
  }

  /** Nombre de cohortes actives (diagnostic de performance). */
  get cohortCount(): number {
    return this.cohorts.length;
  }

  /** Flotte de référence d'une ligne (rames nécessaires à la fréquence de référence). */
  referenceFleet(line: LineId): number {
    return referenceFleet(this.network, this.network.lineById.get(line)!);
  }
}

/**
 * Indice de qualité de service (0–100) :
 * 100 − 50 × min(1, retard / 10 min) − 30 × min(1, 3 × part de tronçons saturés) − 20 × min(1, attente / 10 min).
 */
export function serviceQualityIndex(avgDelay: number, avgWait: number, saturatedShare: number): number {
  const q =
    100 -
    50 * Math.min(1, avgDelay / 600) -
    30 * Math.min(1, saturatedShare * 3) -
    20 * Math.min(1, avgWait / 600);
  return Math.max(0, Math.min(100, q));
}

/** Rejoue une simulation (graine + configuration + incidents programmés + journal d'actions) jusqu'à `until`. */
export function replaySimulation(
  network: Network,
  config: SimulationConfig,
  scheduled: ScheduledIncident[],
  actions: SimAction[],
  until: number,
  options: EngineOptions = {},
): SimulationEngine {
  const engine = new SimulationEngine(network, config, scheduled, options);
  const sorted = [...actions].sort((a, b) => a.time - b.time);
  let k = 0;
  const limit = Math.min(until, engine.endTime);
  while (true) {
    while (k < sorted.length && sorted[k].time <= engine.time + 1e-9) {
      const { time: _t, ...payload } = sorted[k++];
      void _t;
      engine.applyAction(payload as ActionPayload);
    }
    if (engine.time >= limit - 1e-9 || engine.finished) break;
    engine.step();
  }
  return engine;
}
