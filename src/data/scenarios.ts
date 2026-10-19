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
      "La demande monte progressivement jusqu'à 125 % d'une pointe habituelle. Plusieurs tronçons des lignes 7 et 9 approchent la saturation.",
    objective: 'Maintenir le niveau de service : peu de tronçons saturés et un retard moyen contenu, sans exploser le budget.',
    difficulty: 'normal',
    seed: 1101,
    startTime: 7 * H + 15 * M,
    duration: 2 * H,
    demandScale: 1.25,
    incidents: [],
    objectives: [
      { id: 'sat', label: 'Au plus 22 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 22, unit: 'tronçons', primary: true },
      { id: 'delay', label: 'Retard moyen ≤ 1 min', metric: 'avgDelayMean', op: '<=', value: 1, unit: 'min', primary: true },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
      { id: 'wait', label: 'Attente moyenne ≤ 1 min', metric: 'avgWaitMean', op: '<=', value: 1, unit: 'min', primary: false },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'malaise-poissonniere',
    title: 'Malaise voyageur à Poissonnière',
    description:
      "À 08:05, un malaise voyageur de gravité élevée immobilise un train à Poissonnière (ligne 7) pendant 15 minutes. Les tronçons voisins perdent une grande partie de leur capacité.",
    objective:
      'Résorber la congestion en moins de 10 minutes simulées après la fin de l’incident, tout en maintenant le retard moyen final sous 3 minutes.',
    difficulty: 'normal',
    seed: 2202,
    startTime: 7 * H + 50 * M,
    duration: 75 * M,
    demandScale: 1.05,
    incidents: [
      {
        offset: 15 * M,
        type: 'malaise',
        target: { kind: 'station', stationId: 'poissonniere', line: '7' },
        severity: 3,
        radius: 1,
        duration: 15 * M,
      },
    ],
    objectives: [
      { id: 'clear', label: 'Congestion résorbée ≤ 10 min après l’incident', metric: 'congestionClearedAfterIncidents', op: '<=', value: 10, unit: 'min', primary: true },
      { id: 'delay-end', label: 'Retard moyen final ≤ 3 min', metric: 'avgDelayEnd', op: '<=', value: 3, unit: 'min', primary: true },
      { id: 'affected', label: 'Voyageurs affectés ≤ 4 %', metric: 'affectedShare', op: '<=', value: 4, unit: '%', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.08,
  },
  {
    id: 'station-fermee',
    title: 'Châtelet fermée',
    description:
      "Une alerte impose la fermeture de Châtelet de 08:15 à 08:55 (les trains traversent sans s'arrêter). Plus de correspondance possible entre les lignes 1, 4, 7 et 14 à Châtelet.",
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
      { id: 'sat', label: 'Au plus 20 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 20, unit: 'tronçons', primary: true },
      { id: 'delay', label: 'Retard moyen ≤ 1,65 min', metric: 'avgDelayMean', op: '<=', value: 1.65, unit: 'min', primary: true },
      { id: 'clear', label: 'Congestion résorbée ≤ 30 min après réouverture', metric: 'congestionClearedAfterIncidents', op: '<=', value: 30, unit: 'min', primary: false },
      { id: 'lost', label: 'Aucun voyageur sans itinéraire', metric: 'lostTrips', op: '<=', value: 0, unit: 'voy.', primary: false },
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
    demandScale: 1,
    incidents: [
      { offset: 10 * M, type: 'technical_failure', target: { kind: 'station', stationId: 'concorde', line: '1' }, severity: 2, radius: 1, duration: 30 * M },
      { offset: 20 * M, type: 'segment_interruption', target: { kind: 'segment', segmentId: '4:reaumur-sebastopol|strasbourg-saint-denis' }, severity: 3, radius: 0, duration: 35 * M },
      { offset: 30 * M, type: 'frequency_reduction', target: { kind: 'line', line: '9' }, severity: 2, radius: 0, duration: 40 * M },
      { offset: 45 * M, type: 'malaise', target: { kind: 'station', stationId: 'republique', line: '9' }, severity: 2, radius: 1, duration: 15 * M },
    ],
    objectives: [
      { id: 'delay-end', label: 'Retard moyen final ≤ 0,8 min', metric: 'avgDelayEnd', op: '<=', value: 0.8, unit: 'min', primary: true },
      { id: 'qos', label: 'Qualité de service moyenne ≥ 85', metric: 'serviceQualityMean', op: '>=', value: 85, unit: '/100', primary: true },
      { id: 'sat', label: 'Au plus 23 tronçons saturés au pic', metric: 'maxSaturatedSegments', op: '<=', value: 23, unit: 'tronçons', primary: false },
      { id: 'cost', label: 'Coût ≤ 120 % du budget', metric: 'operatingCost', op: '<=', value: 120, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
  {
    id: 'pic-affluence',
    title: "Pic d'affluence au Trocadéro",
    description:
      "Fin d'un grand événement au Trocadéro : la demande y est multipliée par 8 (et par 4,5 aux stations voisines) pendant 50 minutes, puis Alma–Marceau se remplit à son tour. La ligne 9, déjà chargée en fin de journée, absorbe l'essentiel du flux.",
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
      { id: 'wait', label: 'Attente moyenne ≤ 1,5 min', metric: 'avgWaitMean', op: '<=', value: 1.5, unit: 'min', primary: true },
      { id: 'sat-end', label: 'Au plus 5 tronçons saturés à la fin', metric: 'saturatedSegmentsEnd', op: '<=', value: 5, unit: 'tronçons', primary: true },
      { id: 'waiting-end', label: 'Moins de 21 000 voyageurs à quai à la fin', metric: 'waitingEnd', op: '<=', value: 21000, unit: 'voy.', primary: false },
      { id: 'cost', label: 'Coût ≤ 110 % du budget', metric: 'operatingCost', op: '<=', value: 110, unit: '% du budget', primary: false },
    ],
    budgetMargin: 0.1,
  },
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map((s) => [s.id, s]));
