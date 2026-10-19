import { buildNetwork, NetworkDataError } from '@/engine/graph';
import type { DataIssue, Network } from '@/types/network';
import { SEGMENT_TIME_OVERRIDES, WALKING_TRANSFERS } from './connections';
import { LINES } from './lines';
import { LABEL_OVERRIDES, STATIONS } from './stations';

export const NETWORK_INPUT = {
  stations: STATIONS,
  lines: LINES,
  walkingTransfers: WALKING_TRANSFERS,
  segmentTimeOverrides: SEGMENT_TIME_OVERRIDES,
  labelOverrides: LABEL_OVERRIDES,
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
