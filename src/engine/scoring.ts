/**
 * Calcul du score et des objectifs à partir des résultats du moteur.
 * Toutes les règles sont publiques (affichées dans l'écran de bilan et dans docs/MODEL.md) :
 * aucun critère caché.
 */
import type {
  Difficulty,
  Medal,
  ObjectiveDefinition,
  ObjectiveResult,
  RunSummary,
  ScoreBreakdown,
  ScoreResult,
} from '@/types/scenario';
import type { HistoryPoint, KPIs } from '@/types/simulation';

export interface ScoreRule {
  key: ScoreBreakdown['key'];
  label: string;
  weight: number;
  unit: string;
  /** Valeur donnant 100 points. */
  good: number;
  /** Valeur donnant 0 point. */
  bad: number;
  explanation: string;
}

export const SCORE_RULES: ScoreRule[] = [
  {
    key: 'wait',
    label: "Temps d'attente moyen",
    weight: 20,
    unit: 'min',
    good: 0.75,
    bad: 2.5,
    explanation: "Moyenne sur la partie de l'attente à quai (½ intervalle + refus d'embarquement).",
  },
  {
    key: 'delay',
    label: 'Retard moyen',
    weight: 30,
    unit: 'min',
    good: 0.2,
    bad: 3,
    explanation: 'Moyenne du retard des trajets terminés par rapport au trajet de référence en conditions nominales.',
  },
  {
    key: 'affected',
    label: 'Voyageurs affectés',
    weight: 15,
    unit: '%',
    good: 1,
    bad: 15,
    explanation: 'Part des voyageurs ayant subi un incident (itinéraire modifié, tronçon perturbé, station fermée).',
  },
  {
    key: 'saturation',
    label: 'Tronçons saturés',
    weight: 20,
    unit: '%',
    good: 1,
    bad: 12,
    explanation: 'Part moyenne des tronçons au-dessus de 85 % de saturation sur la durée du scénario.',
  },
  {
    key: 'cost',
    label: 'Coût opérationnel',
    weight: 15,
    unit: '% du budget',
    good: 100,
    bad: 140,
    explanation: 'Coût fictif (rames en service + mobilisation de réserve) rapporté au budget du scénario.',
  },
];

/** Tolérance selon la difficulté : les seuils « bon » et « mauvais » sont multipliés par ce facteur. */
export const DIFFICULTY_TOLERANCE: Record<Difficulty, number> = { facile: 1.3, normal: 1, difficile: 0.75 };

export const MEDAL_THRESHOLDS = { or: 850, argent: 700 } as const;

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Marges de tolérance pour juger la congestion « résorbée » par rapport à la référence. */
export const CLEARANCE_MARGIN = { saturatedSegments: 2, waitingRatio: 1.1, waitingAbsolute: 300 };

/**
 * Délai de résorption (minutes) après la fin du dernier incident : premier instant où le nombre de
 * tronçons saturés et le nombre de voyageurs à quai reviennent au niveau de la simulation
 * nominale (même graine, sans incident ni intervention), à une marge près.
 * Sans référence, la comparaison se fait avec l'état juste avant le premier incident.
 * Retourne 0 s'il n'y a eu aucun incident, null si la congestion n'est pas résorbée.
 */
export function congestionClearance(history: HistoryPoint[], reference: HistoryPoint[] | null): number | null {
  const lastActive = history.reduce((acc, h, i) => (h.activeIncidents > 0 ? i : acc), -1);
  const firstActive = history.findIndex((h) => h.activeIncidents > 0);
  if (lastActive < 0) return 0;
  if (lastActive === history.length - 1) return null;
  const endTime = history[lastActive + 1].time;
  const refAt = (t: number): HistoryPoint | undefined =>
    reference ? reference.find((r) => r.time === t) : history[Math.max(0, firstActive - 1)];
  for (let i = lastActive + 1; i < history.length; i++) {
    const h = history[i];
    const r = refAt(h.time);
    if (!r) continue;
    if (
      h.saturatedSegments <= r.saturatedSegments + CLEARANCE_MARGIN.saturatedSegments &&
      h.waiting <= r.waiting * CLEARANCE_MARGIN.waitingRatio + CLEARANCE_MARGIN.waitingAbsolute
    ) {
      return Math.max(0, (h.time - endTime) / 60);
    }
  }
  return null;
}

export function summarizeRun(params: {
  history: HistoryPoint[];
  kpis: KPIs;
  segmentCount: number;
  /** Coût opérationnel de la simulation nominale (même graine, sans incident ni intervention). */
  referenceCost: number;
  /** Historique de la simulation nominale (sert à mesurer la résorption de la congestion). */
  referenceHistory: HistoryPoint[] | null;
}): RunSummary {
  const { history, kpis, segmentCount } = params;
  const total = kpis.completedTrips + kpis.lostTrips + kpis.inNetwork;
  return {
    avgWaitMean: mean(history.map((h) => h.avgWait)),
    avgDelayMean: mean(history.map((h) => h.avgDelay)),
    avgDelayEnd: kpis.avgDelay,
    affectedShare: total > 0 ? kpis.affectedTotal / total : 0,
    saturatedShareMean: mean(history.map((h) => h.saturatedSegments / segmentCount)),
    maxSaturatedSegments: Math.max(0, ...history.map((h) => h.saturatedSegments)),
    saturatedSegmentsEnd: kpis.saturatedSegments,
    lostTrips: kpis.lostTrips,
    operatingCost: kpis.operatingCost,
    referenceCost: params.referenceCost,
    completedTrips: kpis.completedTrips,
    serviceQualityMean: mean(history.map((h) => h.serviceQuality)),
    waitingEnd: kpis.waiting,
    congestionClearedAfterIncidents: congestionClearance(history, params.referenceHistory),
  };
}

/** Valeur d'un indicateur d'objectif, dans l'unité de l'objectif (minutes, %, nombre, k€). */
export function objectiveValue(objective: ObjectiveDefinition, s: RunSummary): number {
  switch (objective.metric) {
    case 'avgDelayEnd':
      return s.avgDelayEnd / 60;
    case 'avgDelayMean':
      return s.avgDelayMean / 60;
    case 'avgWaitMean':
      return s.avgWaitMean / 60;
    case 'maxSaturatedSegments':
      return s.maxSaturatedSegments;
    case 'saturatedSegmentsEnd':
      return s.saturatedSegmentsEnd;
    case 'affectedShare':
      return s.affectedShare * 100;
    case 'lostTrips':
      return s.lostTrips;
    case 'operatingCost':
      return s.referenceCost > 0 ? (s.operatingCost / s.referenceCost) * 100 : 100;
    case 'congestionClearedAfterIncidents':
      return s.congestionClearedAfterIncidents ?? Infinity;
    case 'serviceQualityMean':
      return s.serviceQualityMean;
    case 'waitingEnd':
      return s.waitingEnd;
  }
}

function subScore(value: number, good: number, bad: number): number {
  if (!Number.isFinite(value)) return 0;
  const t = (value - good) / (bad - good);
  return Math.round(100 * Math.max(0, Math.min(1, 1 - t)));
}

export function computeScore(summary: RunSummary, objectives: ObjectiveDefinition[], difficulty: Difficulty, budgetMargin: number): ScoreResult {
  const tol = DIFFICULTY_TOLERANCE[difficulty];
  const budget = summary.referenceCost * (1 + budgetMargin);
  const values: Record<ScoreBreakdown['key'], number> = {
    wait: summary.avgWaitMean / 60,
    delay: summary.avgDelayMean / 60,
    affected: summary.affectedShare * 100,
    saturation: summary.saturatedShareMean * 100,
    cost: budget > 0 ? (summary.operatingCost / budget) * 100 : 100,
  };
  const breakdown: ScoreBreakdown[] = SCORE_RULES.map((r) => {
    // Le coût n'est pas assoupli par la difficulté (le budget l'intègre déjà).
    const good = r.key === 'cost' ? r.good : r.good * tol;
    const bad = r.key === 'cost' ? r.bad : r.bad * tol;
    return {
      key: r.key,
      label: r.label,
      weight: r.weight,
      value: values[r.key],
      unit: r.unit,
      score: subScore(values[r.key], good, bad),
      explanation: `${r.explanation} 100 pts à ${good.toFixed(1)} ${r.unit}, 0 pt à ${bad.toFixed(1)} ${r.unit}.`,
    };
  });
  const total = Math.round(breakdown.reduce((acc, b) => acc + (b.score * b.weight) / 10, 0));
  const results: ObjectiveResult[] = objectives.map((o) => {
    const v = o.metric === 'operatingCost' ? values.cost : objectiveValue(o, summary);
    return { objective: o, value: v, achieved: o.op === '<=' ? v <= o.value : v >= o.value };
  });
  const success = results.filter((r) => r.objective.primary).every((r) => r.achieved);
  let medal: Medal = null;
  if (success) medal = total >= MEDAL_THRESHOLDS.or ? 'or' : total >= MEDAL_THRESHOLDS.argent ? 'argent' : 'bronze';
  return { total, breakdown, medal, objectives: results, success, summary };
}
