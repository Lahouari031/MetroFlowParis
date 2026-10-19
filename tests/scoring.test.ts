import { describe, expect, it } from 'vitest';
import { SCENARIO_BY_ID, SCENARIOS } from '@/data/scenarios';
import { scenarioConfig } from '@/engine/defaults';
import { computeScore, congestionClearance, SCORE_RULES, summarizeRun } from '@/engine/scoring';
import { SimulationEngine } from '@/engine/simulationEngine';
import type { RunSummary } from '@/types/scenario';
import type { ActionPayload, HistoryPoint } from '@/types/simulation';
import { network } from './helpers';

const base: RunSummary = {
  avgWaitMean: 60,
  avgDelayMean: 30,
  avgDelayEnd: 30,
  affectedShare: 0.02,
  saturatedShareMean: 0.03,
  maxSaturatedSegments: 5,
  saturatedSegmentsEnd: 2,
  lostTrips: 0,
  operatingCost: 100,
  referenceCost: 100,
  completedTrips: 1000,
  serviceQualityMean: 90,
  waitingEnd: 1000,
  congestionClearedAfterIncidents: 5,
};

describe('Score', () => {
  it('est borné, égal à la somme pondérée des sous-scores et monotone', () => {
    const s = computeScore(base, [], 'normal', 0.1);
    expect(s.total).toBeGreaterThanOrEqual(0);
    expect(s.total).toBeLessThanOrEqual(1000);
    expect(s.total).toBe(Math.round(s.breakdown.reduce((a, b) => a + (b.score * b.weight) / 10, 0)));
    expect(SCORE_RULES.reduce((a, r) => a + r.weight, 0)).toBe(100);
    const worse = computeScore({ ...base, avgDelayMean: 150, saturatedShareMean: 0.1 }, [], 'normal', 0.1);
    expect(worse.total).toBeLessThan(s.total);
    const perfect = computeScore({ ...base, avgWaitMean: 0, avgDelayMean: 0, affectedShare: 0, saturatedShareMean: 0, operatingCost: 50 }, [], 'normal', 0.1);
    expect(perfect.total).toBe(1000);
  });

  it('la difficulté rend les seuils plus ou moins tolérants', () => {
    const facile = computeScore(base, [], 'facile', 0.1).total;
    const difficile = computeScore(base, [], 'difficile', 0.1).total;
    expect(facile).toBeGreaterThanOrEqual(difficile);
  });

  it("attribue une médaille seulement si les objectifs principaux sont atteints", () => {
    const objectives = [{ id: 'd', label: '', metric: 'avgDelayMean' as const, op: '<=' as const, value: 0.1, unit: 'min', primary: true }];
    const failed = computeScore(base, objectives, 'normal', 0.1);
    expect(failed.success).toBe(false);
    expect(failed.medal).toBeNull();
    const ok = computeScore(base, [{ ...objectives[0], value: 1 }], 'normal', 0.1);
    expect(ok.success).toBe(true);
    expect(ok.medal).not.toBeNull();
  });

  it('mesure la résorption de la congestion par rapport à la référence', () => {
    const pt = (time: number, sat: number, waiting: number, inc: number): HistoryPoint =>
      ({ time, saturatedSegments: sat, waiting, activeIncidents: inc } as HistoryPoint);
    const h = [pt(0, 5, 1000, 0), pt(60, 12, 3000, 1), pt(120, 12, 3000, 1), pt(180, 10, 2600, 0), pt(240, 6, 1100, 0)];
    const ref = [pt(0, 5, 1000, 0), pt(60, 5, 1000, 0), pt(120, 5, 1000, 0), pt(180, 5, 1000, 0), pt(240, 5, 1000, 0)];
    expect(congestionClearance(h, ref)).toBe(1);
    expect(congestionClearance(h.slice(0, 3), ref)).toBeNull();
    expect(congestionClearance([pt(0, 1, 1, 0)], ref)).toBe(0);
  });

  it('est calculé à partir des résultats du moteur et cohérent avec la référence', () => {
    const sc = SCENARIO_BY_ID.get('malaise-poissonniere')!;
    const cfg = scenarioConfig(network, sc);
    const e = new SimulationEngine(network, cfg, sc.incidents);
    const ref = new SimulationEngine(network, cfg, sc.incidents, { quiet: true });
    const nominal = new SimulationEngine(network, cfg, [], { quiet: true });
    e.advance(sc.duration);
    ref.advance(sc.duration);
    nominal.advance(sc.duration);
    // Sans intervention, la partie est identique à la référence « sans intervention » (même graine).
    expect(e.computeKPIs()).toEqual(ref.computeKPIs());
    const summary = summarizeRun({ history: e.history, kpis: e.computeKPIs(), segmentCount: network.segments.length, referenceCost: nominal.operatingCost, referenceHistory: nominal.history });
    expect(summary.congestionClearedAfterIncidents).not.toBe(0);
    const score = computeScore(summary, sc.objectives, sc.difficulty, sc.budgetMargin);
    expect(score.objectives).toHaveLength(sc.objectives.length);
    expect(score.total).toBeGreaterThan(0);
  });
});

/** Stratégies de régulation de référence : prouvent que chaque défi est réalisable et qu'il ne l'est pas sans agir. */
const boost = (line: '1' | '4' | '7' | '9' | '14', freq: number, reserve: number): ActionPayload[] => [
  { type: 'line.reserve', line, count: reserve },
  { type: 'line.frequency', line, frequency: freq },
];
const STRATEGIES: Record<string, [number, ActionPayload[]][]> = {
  'heure-de-pointe': [[0, [...boost('7', 36, 8), ...boost('9', 36, 6), ...boost('4', 40, 6)]]],
  'malaise-poissonniere': [[15 * 60, boost('4', 40, 6)], [30 * 60, boost('7', 36, 8)]],
  'station-fermee': [[15 * 60, [...boost('4', 40, 6), ...boost('7', 36, 8), ...boost('1', 42, 6), ...boost('14', 42, 6), ...boost('9', 36, 6)]]],
  'incident-multiple': [[10 * 60, [...boost('9', 36, 6), ...boost('7', 36, 8), ...boost('4', 40, 6)]]],
  'pic-affluence': [[10 * 60, boost('9', 36, 6)]],
};

function play(id: string, plan: [number, ActionPayload[]][]) {
  const sc = SCENARIO_BY_ID.get(id)!;
  const cfg = scenarioConfig(network, sc);
  const e = new SimulationEngine(network, cfg, sc.incidents);
  const ref = new SimulationEngine(network, cfg, [], { quiet: true });
  let k = 0;
  while (!e.finished) {
    while (k < plan.length && plan[k][0] <= e.time - cfg.startTime) for (const a of plan[k++][1]) expect(e.applyAction(a).ok).toBe(true);
    e.step();
    ref.step();
  }
  const summary = summarizeRun({ history: e.history, kpis: e.computeKPIs(), segmentCount: network.segments.length, referenceCost: ref.operatingCost, referenceHistory: ref.history });
  return computeScore(summary, sc.objectives, sc.difficulty, sc.budgetMargin);
}

describe('Défis', () => {
  for (const sc of SCENARIOS.filter((s) => s.id !== 'libre')) {
    it(`« ${sc.title} » : échoue sans régulation, réussit avec la stratégie de référence`, { timeout: 60000 }, () => {
      expect(play(sc.id, []).success).toBe(false);
      const active = play(sc.id, STRATEGIES[sc.id]);
      expect(active.success).toBe(true);
      expect(active.medal).not.toBeNull();
    });
  }
});
