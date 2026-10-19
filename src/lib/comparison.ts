/**
 * Comparaison de deux simulations exécutées sans interface (même graine), par ex.
 * « A : fréquence normale » contre « B : rames ajoutées sur la ligne 7 ».
 * Les calculs sont découpés en tranches pour ne pas bloquer l'interface.
 */
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { scenarioConfig } from '@/engine/defaults';
import { summarizeRun } from '@/engine/scoring';
import { SimulationEngine } from '@/engine/simulationEngine';
import type { LineId, Network } from '@/types/network';
import type { RunSummary } from '@/types/scenario';
import type { ActionPayload, HistoryPoint } from '@/types/simulation';

export interface Variant {
  label: string;
  /** Fréquences programmées par ligne (trains/h). */
  frequencies: Partial<Record<LineId, number>>;
  /** Rames de réserve mobilisées par ligne. */
  reserves: Partial<Record<LineId, number>>;
  globalFactor: number;
}

export interface VariantResult {
  label: string;
  history: HistoryPoint[];
  summary: RunSummary;
}

export function variantActions(v: Variant): ActionPayload[] {
  const out: ActionPayload[] = [];
  for (const [line, count] of Object.entries(v.reserves)) if (count) out.push({ type: 'line.reserve', line: line as LineId, count });
  for (const [line, frequency] of Object.entries(v.frequencies)) if (frequency) out.push({ type: 'line.frequency', line: line as LineId, frequency });
  if (v.globalFactor !== 1) out.push({ type: 'global.frequency', factor: v.globalFactor });
  return out;
}

export async function runComparison(
  network: Network,
  scenarioId: string,
  variants: [Variant, Variant],
  onProgress: (p: number) => void,
): Promise<[VariantResult, VariantResult]> {
  const sc = SCENARIO_BY_ID.get(scenarioId);
  if (!sc) throw new Error(`Scénario inconnu : ${scenarioId}`);
  const cfg = scenarioConfig(network, sc);
  const engines = variants.map((v) => {
    const e = new SimulationEngine(network, cfg, sc.incidents, { quiet: true });
    for (const a of variantActions(v)) {
      const r = e.applyAction(a);
      if (!r.ok) throw new Error(`${v.label} : ${r.error}`);
    }
    return e;
  });
  // Simulation nominale (sans incident ni intervention) : base du budget et de la résorption.
  const reference = new SimulationEngine(network, cfg, [], { quiet: true });
  const all = [...engines, reference];
  let last = performance.now();
  while (!all.every((e) => e.finished)) {
    for (const e of all) e.step();
    if (performance.now() - last > 40) {
      onProgress((engines[0].time - cfg.startTime) / cfg.duration);
      await new Promise((r) => setTimeout(r, 0));
      last = performance.now();
    }
  }
  return engines.map((e, i) => ({
    label: variants[i].label,
    history: e.history,
    summary: summarizeRun({
      history: e.history,
      kpis: e.computeKPIs(),
      segmentCount: network.segments.length,
      referenceCost: reference.operatingCost,
      referenceHistory: reference.history,
    }),
  })) as [VariantResult, VariantResult];
}
