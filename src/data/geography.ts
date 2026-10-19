/**
 * Repères géographiques du fond de plan (approximatifs, tracés simplifiés pour l'orientation) :
 * la Seine, le boulevard périphérique, les bois et quelques monuments.
 * Coordonnées WGS84 approximatives, projetées avec la même projection que les stations.
 */
import { project } from './network';

type LatLon = [number, number];

/** Cours de la Seine, de l'amont (Ivry) vers l'aval (Saint-Denis). */
const SEINE: LatLon[] = [
  [48.8095, 2.4235],
  [48.8165, 2.4125],
  [48.8235, 2.3985],
  [48.8295, 2.3865],
  [48.8355, 2.3775],
  [48.8405, 2.3715],
  [48.8445, 2.3665],
  [48.8485, 2.3615],
  [48.8515, 2.3555],
  [48.8545, 2.3495],
  [48.8572, 2.3425],
  [48.8592, 2.3345],
  [48.8618, 2.3255],
  [48.8636, 2.3175],
  [48.8640, 2.3095],
  [48.8634, 2.3015],
  [48.8605, 2.2935],
  [48.8558, 2.2870],
  [48.8505, 2.2810],
  [48.8460, 2.2762],
  [48.8400, 2.2705],
  [48.8335, 2.2625],
  [48.8285, 2.2520],
  [48.8262, 2.2410],
  [48.8285, 2.2300],
  [48.8355, 2.2240],
  [48.8440, 2.2225],
  [48.8540, 2.2250],
  [48.8650, 2.2295],
  [48.8745, 2.2380],
  [48.8830, 2.2510],
  [48.8905, 2.2640],
  [48.8975, 2.2770],
  [48.9055, 2.2900],
  [48.9125, 2.3040],
  [48.9180, 2.3200],
  [48.9225, 2.3360],
  [48.9300, 2.3440],
  [48.9400, 2.3480],
];

/** Boulevard périphérique (limite de Paris intra-muros), tracé simplifié. */
const PERIPHERIQUE: LatLon[] = [
  [48.8785, 2.281],
  [48.886, 2.2905],
  [48.8925, 2.3045],
  [48.8955, 2.3125],
  [48.899, 2.329],
  [48.901, 2.344],
  [48.8998, 2.3595],
  [48.899, 2.3775],
  [48.8955, 2.389],
  [48.889, 2.398],
  [48.878, 2.411],
  [48.865, 2.4135],
  [48.853, 2.4155],
  [48.847, 2.416],
  [48.836, 2.411],
  [48.8295, 2.4],
  [48.8268, 2.389],
  [48.8215, 2.373],
  [48.8185, 2.36],
  [48.8195, 2.344],
  [48.8215, 2.326],
  [48.8262, 2.306],
  [48.831, 2.289],
  [48.834, 2.271],
  [48.838, 2.256],
  [48.847, 2.2535],
  [48.858, 2.2625],
  [48.869, 2.274],
  [48.8785, 2.281],
];

const BOIS_DE_BOULOGNE: LatLon[] = [
  [48.8785, 2.2575],
  [48.8765, 2.2715],
  [48.866, 2.2705],
  [48.8575, 2.2635],
  [48.8478, 2.2555],
  [48.8462, 2.2465],
  [48.8515, 2.2365],
  [48.861, 2.2355],
  [48.8705, 2.2405],
];

const BOIS_DE_VINCENNES: LatLon[] = [
  [48.8432, 2.4185],
  [48.8445, 2.4365],
  [48.8425, 2.4565],
  [48.8355, 2.4695],
  [48.8265, 2.4655],
  [48.8235, 2.4475],
  [48.8285, 2.4295],
  [48.8325, 2.4155],
];

/** Petits espaces verts (centre, demi-axes en mètres). */
const PARKS: { name: string; center: LatLon; rx: number; ry: number }[] = [
  { name: 'Jardin du Luxembourg', center: [48.8462, 2.3372], rx: 320, ry: 220 },
  { name: 'Buttes-Chaumont', center: [48.8809, 2.3828], rx: 260, ry: 180 },
  { name: 'Jardin des Tuileries', center: [48.8634, 2.3275], rx: 380, ry: 110 },
  { name: 'Champ-de-Mars', center: [48.8556, 2.2986], rx: 170, ry: 420 },
  { name: 'Parc Montsouris', center: [48.8222, 2.3378], rx: 200, ry: 150 },
  { name: 'Parc de la Villette', center: [48.8938, 2.3903], rx: 260, ry: 220 },
];

export type MonumentKind = 'tower' | 'arch' | 'dome' | 'church' | 'museum' | 'stadium' | 'skyscraper';

const MONUMENTS: { name: string; at: LatLon; kind: MonumentKind }[] = [
  { name: 'Tour Eiffel', at: [48.8584, 2.2945], kind: 'tower' },
  { name: 'Arc de Triomphe', at: [48.8738, 2.295], kind: 'arch' },
  { name: 'Louvre', at: [48.8606, 2.3376], kind: 'museum' },
  { name: 'Notre-Dame', at: [48.853, 2.3499], kind: 'church' },
  { name: 'Sacré-Cœur', at: [48.8867, 2.3431], kind: 'dome' },
  { name: 'Panthéon', at: [48.8462, 2.3464], kind: 'dome' },
  { name: 'Invalides', at: [48.855, 2.3125], kind: 'dome' },
  { name: 'Opéra Garnier', at: [48.872, 2.3316], kind: 'museum' },
  { name: 'Tour Montparnasse', at: [48.8421, 2.3219], kind: 'skyscraper' },
  { name: 'Grande Arche', at: [48.8925, 2.2361], kind: 'arch' },
  { name: 'Stade de France', at: [48.9245, 2.3602], kind: 'stadium' },
  { name: 'Bibliothèque nationale', at: [48.8336, 2.3758], kind: 'museum' },
];

const proj = (pts: LatLon[]) => pts.map(([lat, lon]) => project(lat, lon));

export const GEOGRAPHY = {
  seine: proj(SEINE),
  peripherique: proj(PERIPHERIQUE),
  woods: [
    { name: 'Bois de Boulogne', points: proj(BOIS_DE_BOULOGNE) },
    { name: 'Bois de Vincennes', points: proj(BOIS_DE_VINCENNES) },
  ],
  parks: PARKS.map((p) => ({ name: p.name, ...project(p.center[0], p.center[1]), rx: p.rx / 10, ry: p.ry / 10 })),
  monuments: MONUMENTS.map((m) => ({ name: m.name, kind: m.kind, ...project(m.at[0], m.at[1]) })),
  islands: [
    { name: 'Île de la Cité', ...project(48.8545, 2.3475), rx: 45, ry: 14, rotate: -20 },
    { name: 'Île Saint-Louis', ...project(48.8517, 2.3567), rx: 28, ry: 11, rotate: -25 },
  ],
};
