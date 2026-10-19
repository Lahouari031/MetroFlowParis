import { getNetwork } from '@/data/network';
import { defaultConfig } from '@/engine/defaults';
import type { SimulationConfig } from '@/types/simulation';

export const network = getNetwork();

export const station = (id: string) => {
  const s = network.stationById.get(id);
  if (!s) throw new Error(`station inconnue ${id}`);
  return s;
};

export function config(overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return defaultConfig(network, { startTime: 8 * 3600, duration: 3600, warmupSeconds: 900, ...overrides });
}
