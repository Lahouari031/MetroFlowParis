import { beforeEach, describe, expect, it } from 'vitest';
import { scenarioConfig } from '@/engine/defaults';
import { SCENARIO_BY_ID } from '@/data/scenarios';
import { replaySimulation, SimulationEngine } from '@/engine/simulationEngine';
import {
  loadSavedScenarios,
  SCHEMA_VERSION,
  setStorageBackend,
  storeSavedScenarios,
  validateSavedScenario,
  type StorageBackend,
} from '@/lib/persistence';
import type { SavedScenario } from '@/types/scenario';
import { network } from './helpers';

class MemoryBackend implements StorageBackend {
  data = new Map<string, string>();
  get(k: string) {
    return this.data.get(k) ?? null;
  }
  set(k: string, v: string) {
    this.data.set(k, v);
  }
  remove(k: string) {
    this.data.delete(k);
  }
}

const ctx = {
  fingerprint: network.fingerprint,
  stationIds: new Set(network.stations.map((s) => s.id)),
  segmentIds: new Set(network.segments.map((s) => s.id)),
  lineIds: new Set(network.lines.map((l) => l.id)),
};

function makeSave(): SavedScenario {
  const sc = SCENARIO_BY_ID.get('malaise-poissonniere')!;
  const cfg = scenarioConfig(network, sc);
  const e = new SimulationEngine(network, cfg, sc.incidents);
  e.advance(600);
  e.applyAction({ type: 'line.frequency', line: '7', frequency: 33 });
  e.advance(300);
  return {
    schemaVersion: SCHEMA_VERSION,
    networkFingerprint: network.fingerprint,
    id: 'save-test',
    name: 'Test',
    savedAt: new Date(0).toISOString(),
    baseScenarioId: sc.id,
    config: cfg,
    scheduled: sc.incidents,
    actions: e.actions,
    savedTime: e.time,
  };
}

describe('Sauvegarde et rechargement', () => {
  let mem: MemoryBackend;
  beforeEach(() => {
    mem = new MemoryBackend();
    setStorageBackend(mem);
  });

  it('sauvegarde puis recharge un scénario identique (rejeu)', () => {
    const save = makeSave();
    expect(validateSavedScenario(save, ctx)).toEqual([]);
    expect(storeSavedScenarios([save])).toBeNull();
    const loaded = loadSavedScenarios();
    expect(loaded.error).toBeNull();
    expect(loaded.value).toHaveLength(1);
    const s = loaded.value[0];
    const a = replaySimulation(network, s.config, s.scheduled, s.actions, s.savedTime);
    const b = replaySimulation(network, save.config, save.scheduled, save.actions, save.savedTime);
    expect(a.computeKPIs()).toEqual(b.computeKPIs());
    expect(a.config.regulation.lines['7'].frequency).toBe(33);
  });

  it('rejette une version de sauvegarde incompatible', () => {
    const save = { ...makeSave(), schemaVersion: 99 };
    expect(validateSavedScenario(save, ctx)[0]).toMatch(/incompatible/);
  });

  it('rejette les références à des stations inconnues', () => {
    const save = makeSave();
    save.config.regulation.closedStations = ['station-inexistante'];
    expect(validateSavedScenario(save, ctx).join(' ')).toMatch(/Station inconnue/);
  });

  it('signale des données locales illisibles sans planter', () => {
    mem.set('metroflow:v1:saves', '{pas du json');
    const r = loadSavedScenarios();
    expect(r.value).toEqual([]);
    expect(r.error).toMatch(/illisibles/);
  });
});
