import { buildNetwork, NetworkDataError } from '@/engine/graph';
import type { DataIssue, Network, StationDefinition } from '@/types/network';
import { SEGMENT_TIME_OVERRIDES, WALKING_TRANSFERS } from './connections';
import { LINES } from './lines';
import { EMPLOYMENT_BONUS, HUB_CAPACITY, SHORT_NAMES, STATION_ROWS } from './stations';

/** Projection locale (équirectangulaire centrée sur Paris) : 1 unité de carte ≈ 10 m. */
export const PROJECTION = { lat0: 48.8566, lon0: 2.3522, metersPerUnit: 10 };

export function project(lat: number, lon: number): { x: number; y: number } {
  const kx = 111_320 * Math.cos((PROJECTION.lat0 * Math.PI) / 180);
  const ky = 110_574;
  return {
    x: Math.round(((lon - PROJECTION.lon0) * kx) / PROJECTION.metersPerUnit),
    y: Math.round((-(lat - PROJECTION.lat0) * ky) / PROJECTION.metersPerUnit),
  };
}

/** Centre de gravité des emplois (quartier Opéra–Bourse–Louvre). */
const CBD = project(48.866, 2.338);

/**
 * Poids de demande SYNTHÉTIQUES, dérivés de la géographie (distance au centre) :
 * les emplois décroissent avec la distance au centre, la part résidentielle augmente.
 * Bonus explicites pour les gares et quartiers d'affaires (EMPLOYMENT_BONUS).
 */
function weights(x: number, y: number, id: string) {
  const dKm = (Math.hypot(x - CBD.x, y - CBD.y) * PROJECTION.metersPerUnit) / 1000;
  const employment = 1.5 + 6.5 * Math.exp(-dKm / 2.4) + (EMPLOYMENT_BONUS[id] ?? 0);
  const residential = 3 + 2.5 * (1 - Math.exp(-dKm / 3));
  return { employment: Math.round(employment * 10) / 10, residential: Math.round(residential * 10) / 10 };
}

export const STATIONS: StationDefinition[] = STATION_ROWS.map(([id, name, lat, lon, other]) => {
  const { x, y } = project(lat, lon);
  return {
    id,
    name,
    lat,
    lon,
    x,
    y,
    ...weights(x, y, id),
    ...(SHORT_NAMES[id] ? { shortName: SHORT_NAMES[id] } : {}),
    ...(HUB_CAPACITY[id] ? { capacity: HUB_CAPACITY[id] } : {}),
    ...(other ? { note: `Autres correspondances (non simulées) : ${other}` } : {}),
  };
});

export const NETWORK_INPUT = {
  stations: STATIONS,
  lines: LINES,
  walkingTransfers: WALKING_TRANSFERS,
  segmentTimeOverrides: SEGMENT_TIME_OVERRIDES,
  labelOverrides: {},
  octilinear: true,
  parallelSpacing: 9,
};

export interface LoadedNetwork {
  network: Network | null;
  issues: DataIssue[];
}

let cache: LoadedNetwork | null = null;

/**
 * Charge le réseau de référence (une seule fois). Les erreurs de données ne sont pas
 * masquées : elles sont renvoyées pour être affichées par l'interface.
 */
export function loadNetwork(): LoadedNetwork {
  if (cache) return cache;
  try {
    cache = buildNetwork(NETWORK_INPUT);
  } catch (e) {
    if (e instanceof NetworkDataError) cache = { network: null, issues: e.issues };
    else cache = { network: null, issues: [{ level: 'error', code: 'BUILD_FAILED', message: String(e) }] };
  }
  return cache;
}

/** Variante pour le moteur et les tests : lève une exception si le réseau est invalide. */
export function getNetwork(): Network {
  const { network, issues } = loadNetwork();
  if (!network) throw new NetworkDataError(issues);
  return network;
}
