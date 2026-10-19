import type { Network } from '@/types/network';
import type { ScenarioDefinition } from '@/types/scenario';
import type { SimulationConfig } from '@/types/simulation';
import { defaultRegulation } from './networkState';

/** Coût fictif d'une rame en service pendant une heure (k€ fictifs). */
export const COST_PER_TRAIN_HOUR = 0.6;
/** Coût fictif de mobilisation d'une rame de réserve (k€ fictifs). */
export const COST_PER_RESERVE_TRAIN = 4;

export function defaultConfig(network: Network, overrides: Partial<SimulationConfig> = {}): SimulationConfig {
  return {
    seed: 20251,
    startTime: 7 * 3600 + 30 * 60,
    duration: 3 * 3600,
    stepSeconds: 10,
    warmupSeconds: 1800,
    demandScale: 1,
    reserveLimit: null,
    costPerTrainHour: COST_PER_TRAIN_HOUR,
    costPerReserveTrain: COST_PER_RESERVE_TRAIN,
    regulation: defaultRegulation(network),
    ...overrides,
  };
}

/** Configuration initiale d'un scénario prédéfini. */
export function scenarioConfig(network: Network, scenario: ScenarioDefinition, base?: Partial<SimulationConfig>): SimulationConfig {
  const config = defaultConfig(network, {
    ...base,
    seed: scenario.seed,
    startTime: scenario.startTime,
    duration: scenario.duration,
    demandScale: scenario.demandScale,
  });
  for (const [line, freq] of Object.entries(scenario.frequencyOverrides ?? {})) {
    const ctl = config.regulation.lines[line as keyof typeof config.regulation.lines];
    if (ctl && freq !== undefined) ctl.frequency = freq;
  }
  return config;
}
