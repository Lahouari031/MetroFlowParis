import type { ScenarioDefinition } from '@/types/scenario';

const H = 3600;
const M = 60;

/**
 * Scénarios prédéfinis. Les objectifs sont mesurés par le moteur (voir engine/scoring.ts).
 * Les seuils ont été calibrés par simulation sans intervention du joueur (voir tests/scenarios.test.ts).
 */
export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'libre',
    title: 'Simulation libre',
    description:
      "Matinée de semaine, sans incident programmé. Déclenchez vos propres perturbations, testez des régulations et comparez avec la référence.",
    objective: 'Aucun objectif imposé : maintenir une qualité de service élevée.',
    difficulty: 'normal',
    seed: 20251,
    startTime: 7 * H + 30 * M,
    duration: 3 * H,
    demandScale: 1,
    incidents: [],
    objectives: [
      { id: 'qos', label: 'Qualité de service moyenne ≥ 85', metric: 'serviceQualityMean', op: '>=', value: 85, unit: '/100', primary: true },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'heure-de-pointe',
    title: 'Heure de pointe renforcée',
    description:
      "La demande monte progressivement jusqu'à 125 % d'une pointe habituelle. Les lignes 13, 11 et 8 approchent la saturation.",
    objective: 'Maintenir le niveau de service : peu de tronçons saturés et un retard moyen contenu, sans exploser le budget.',
    difficulty: 'normal',
    seed: 1101,
    startTime: 7 * H + 15 * M,
    duration: 2 * H,
    demandScale: 1.25,
    incidents: [],
    objectives: [
      { id: 'sat', label: 'Au plus 38 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 38, unit: 'tronçons', primary: true },
      { id: 'sat-end', label: 'Au plus 20 tronçons saturés à la fin', metric: 'saturatedSegmentsEnd', op: '<=', value: 20, unit: 'tronçons', primary: true },
      { id: 'wait', label: 'Attente moyenne ≤ 1,05 min', metric: 'avgWaitMean', op: '<=', value: 1.05, unit: 'min', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'malaise-poissonniere',
    title: 'Malaise voyageur à Poissonnière',
    description:
      "À 08:05, un malaise voyageur de gravité élevée immobilise un train à Poissonnière (ligne 7) pendant 20 minutes. Les trains de toute la ligne sont retenus et les tronçons voisins perdent l'essentiel de leur capacité.",
    objective:
      'Résorber la congestion en 10 minutes simulées au plus après la fin de l’incident, en limitant le nombre de tronçons saturés.',
    difficulty: 'normal',
    seed: 2202,
    startTime: 7 * H + 50 * M,
    duration: 75 * M,
    demandScale: 1.15,
    incidents: [
      {
        offset: 15 * M,
        type: 'malaise',
        target: { kind: 'station', stationId: 'poissonniere', line: '7' },
        severity: 3,
        radius: 1,
        duration: 20 * M,
      },
    ],
    objectives: [
      { id: 'clear', label: 'Congestion résorbée ≤ 10 min après l’incident', metric: 'congestionClearedAfterIncidents', op: '<=', value: 10, unit: 'min', primary: true },
      { id: 'sat', label: 'Au plus 41 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 41, unit: 'tronçons', primary: true },
      { id: 'aff-delay', label: 'Retard des voyageurs touchés ≤ 5,3 min', metric: 'affectedDelay', op: '<=', value: 5.3, unit: 'min', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.08,
  },
  {
    id: 'station-fermee',
    title: 'Châtelet fermée',
    description:
      "Une alerte impose la fermeture de Châtelet de 08:15 à 08:55 (les trains traversent sans s'arrêter). Plus de correspondance possible entre les lignes 1, 4, 7, 11 et 14 à Châtelet.",
    objective: 'Redistribuer les flux vers les itinéraires alternatifs et limiter le nombre de voyageurs qui renoncent.',
    difficulty: 'difficile',
    seed: 3303,
    startTime: 8 * H,
    duration: 90 * M,
    demandScale: 1,
    incidents: [
      {
        offset: 15 * M,
        type: 'station_closure',
        target: { kind: 'station', stationId: 'chatelet' },
        severity: 3,
        radius: 0,
        duration: 40 * M,
      },
    ],
    objectives: [
      { id: 'sat', label: 'Au plus 22 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 22, unit: 'tronçons', primary: true },
      { id: 'delay', label: 'Retard moyen ≤ 0,3 min', metric: 'avgDelayMean', op: '<=', value: 0.3, unit: 'min', primary: true },
      { id: 'clear', label: 'Congestion résorbée ≤ 5 min après réouverture', metric: 'congestionClearedAfterIncidents', op: '<=', value: 5, unit: 'min', primary: false },
      { id: 'cost', label: 'Coût ≤ 125 % du budget', metric: 'operatingCost', op: '<=', value: 125, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'incident-multiple',
    title: 'Incidents multiples',
    description:
      'Pointe du soir : panne technique sur la ligne 1 à Concorde, interruption de la ligne 4 entre Strasbourg–Saint-Denis et Réaumur–Sébastopol, réduction de fréquence sur la ligne 9 puis malaise à République.',
    objective: 'Gérer les priorités et éviter l’effondrement du réseau.',
    difficulty: 'difficile',
    seed: 4404,
    startTime: 17 * H + 20 * M,
    duration: 100 * M,
    demandScale: 1.1,
    incidents: [
      { offset: 10 * M, type: 'technical_failure', target: { kind: 'station', stationId: 'concorde', line: '1' }, severity: 3, radius: 1, duration: 30 * M },
      { offset: 20 * M, type: 'segment_interruption', target: { kind: 'segment', segmentId: '4:reaumur-sebastopol|strasbourg-saint-denis' }, severity: 3, radius: 0, duration: 35 * M },
      { offset: 30 * M, type: 'frequency_reduction', target: { kind: 'line', line: '9' }, severity: 3, radius: 0, duration: 40 * M },
      { offset: 45 * M, type: 'malaise', target: { kind: 'station', stationId: 'republique', line: '9' }, severity: 3, radius: 1, duration: 15 * M },
    ],
    objectives: [
      { id: 'clear', label: 'Congestion résorbée ≤ 20 min après le dernier incident', metric: 'congestionClearedAfterIncidents', op: '<=', value: 20, unit: 'min', primary: true },
      { id: 'delay-end', label: 'Retard moyen final ≤ 0,5 min', metric: 'avgDelayEnd', op: '<=', value: 0.5, unit: 'min', primary: true },
      { id: 'sat', label: 'Au plus 45 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 45, unit: 'tronçons', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'pic-affluence',
    title: "Pic d'affluence au Trocadéro",
    description:
      "Fin d'un grand événement au Trocadéro : la demande y est multipliée par 8 (et par 4,5 aux stations voisines) pendant 50 minutes, puis Alma–Marceau se remplit à son tour. Les lignes 6 et 9, déjà chargées en fin de journée, absorbent l'essentiel du flux.",
    objective: 'Augmenter la capacité là où elle manque et résorber les files d’attente avant la fin du scénario.',
    difficulty: 'normal',
    seed: 5505,
    startTime: 17 * H + 15 * M,
    duration: 90 * M,
    demandScale: 1,
    incidents: [
      { offset: 10 * M, type: 'crowd_surge', target: { kind: 'station', stationId: 'trocadero' }, severity: 3, radius: 1, duration: 50 * M },
      { offset: 25 * M, type: 'crowd_surge', target: { kind: 'station', stationId: 'alma-marceau' }, severity: 2, radius: 0, duration: 30 * M },
    ],
    objectives: [
      { id: 'clear', label: 'Files résorbées ≤ 25 min après l’événement', metric: 'congestionClearedAfterIncidents', op: '<=', value: 25, unit: 'min', primary: true },
      { id: 'sat', label: 'Au plus 18 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 18, unit: 'tronçons', primary: true },
      { id: 'waiting-end', label: 'Moins de 33 300 voyageurs à quai à la fin', metric: 'waitingEnd', op: '<=', value: 33300, unit: 'voy.', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
