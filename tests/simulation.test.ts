import { describe, expect, it } from 'vitest';
import { replaySimulation, SimulationEngine, QUEUE_HORIZON } from '@/engine/simulationEngine';
import { config, network } from './helpers';

describe('Moteur de simulation', () => {
  it('produit des taux de saturation cohérents (demande / capacité)', () => {
    const e = new SimulationEngine(network, config());
    e.advance(1200);
    for (const edge of network.edges) {
      const cap = e.state.edgeCapacity[edge.index];
      const sat = e.edgeSaturation[edge.index];
      expect(sat).toBeGreaterThanOrEqual(0);
      if (cap > 0) {
        const expected = (e.edgeFlow[edge.index] + (e.edgeQueue[edge.index] * 3600) / QUEUE_HORIZON) / cap;
        expect(sat).toBeCloseTo(expected, 4);
        // Le débit lissé ne peut pas dépasser durablement la capacité.
        expect(e.edgeFlow[edge.index]).toBeLessThanOrEqual(cap * 1.05 + 50);
      }
    }
    const k = e.computeKPIs();
    expect(k.inNetwork).toBeGreaterThan(10000);
    expect(k.avgSaturation).toBeGreaterThan(0.1);
    expect(k.availableCapacity).toBeGreaterThan(0);
    expect(k.availableCapacity).toBeLessThan(1);
  });

  it('la congestion augmente lorsque la demande dépasse la capacité', () => {
    const e = new SimulationEngine(network, config());
    e.advance(300);
    const seg = network.segmentById.get('7:chateau-landon|gare-de-l-est')!;
    const before = Math.max(e.edgeSaturation[seg.index * 2], e.edgeSaturation[seg.index * 2 + 1]);
    const queueBefore = e.computeKPIs().waiting;
    e.applyAction({ type: 'line.frequency', line: '7', frequency: 8 });
    const samples: number[] = [];
    for (let i = 0; i < 4; i++) {
      e.advance(300);
      samples.push(e.computeKPIs().waiting);
    }
    const after = Math.max(e.edgeSaturation[seg.index * 2], e.edgeSaturation[seg.index * 2 + 1]);
    expect(after).toBeGreaterThan(1);
    expect(after).toBeGreaterThan(before);
    // Accumulation progressive des voyageurs en attente.
    expect(samples[3]).toBeGreaterThan(samples[0]);
    expect(samples[0]).toBeGreaterThan(queueBefore);
  });

  it('la congestion se résorbe progressivement (pas instantanément) quand la capacité revient', () => {
    const e = new SimulationEngine(network, config({ duration: 7200 }));
    e.applyAction({ type: 'line.frequency', line: '7', frequency: 8 });
    e.advance(1500);
    const peak = e.computeKPIs().waiting;
    e.applyAction({ type: 'line.frequency', line: '7', frequency: 30 });
    e.advance(60);
    const justAfter = e.computeKPIs().waiting;
    e.advance(1200);
    const later = e.computeKPIs().waiting;
    expect(justAfter).toBeGreaterThan(peak * 0.6); // pas de retour instantané
    expect(later).toBeLessThan(justAfter);
  });

  it('les itinéraires sont recalculés après une interruption (report sur la ligne 4)', () => {
    const cfg = config();
    const a = new SimulationEngine(network, cfg);
    const b = new SimulationEngine(network, cfg);
    a.advance(300);
    b.advance(300);
    b.applyAction({ type: 'incident.create', spec: { type: 'segment_interruption', target: { kind: 'segment', segmentId: '7:gare-de-l-est|poissonniere' }, severity: 3, radius: 0, duration: 1800 } });
    a.advance(900);
    b.advance(900);
    const l4 = network.segments.filter((s) => s.line === '4' && ['4:reaumur-sebastopol|strasbourg-saint-denis', '4:chateau-d-eau|strasbourg-saint-denis'].includes(s.id));
    const flow = (e: SimulationEngine) => l4.reduce((acc, s) => acc + e.edgeFlow[s.index * 2] + e.edgeFlow[s.index * 2 + 1], 0);
    expect(flow(b)).toBeGreaterThan(flow(a) * 1.05);
    const seg = network.segmentById.get('7:gare-de-l-est|poissonniere')!;
    expect(b.edgeFlow[seg.index * 2]).toBeLessThan(1);
    expect(b.computeKPIs().affectedTotal).toBeGreaterThan(a.computeKPIs().affectedTotal);
  });

  it('la fréquence influence la capacité simulée', () => {
    const e = new SimulationEngine(network, config());
    const cap0 = e.state.lineCapacity['9'];
    e.applyAction({ type: 'line.reserve', line: '9', count: 13 });
    e.applyAction({ type: 'line.frequency', line: '9', frequency: 36 });
    expect(e.state.lineCapacity['9']).toBeCloseTo((cap0 * 36) / 30, 0);
    e.applyAction({ type: 'line.frequency', line: '9', frequency: 20 });
    expect(e.state.lineCapacity['9']).toBeCloseTo((cap0 * 20) / 30, 0);
    // Sans rames de réserve, la flotte limite la hausse de fréquence.
    const f = new SimulationEngine(network, config());
    f.applyAction({ type: 'line.frequency', line: '9', frequency: 36 });
    expect(f.state.lineFrequency['9']).toBeLessThan(36);
  });

  it('est reproductible avec une graine fixe, et différente avec une autre graine', () => {
    const run = (seed: number) => {
      const e = new SimulationEngine(network, config({ seed }));
      e.advance(900);
      e.applyAction({ type: 'incident.create', spec: { type: 'malaise', target: { kind: 'station', stationId: 'poissonniere' }, severity: 3, radius: 1, duration: 600 } });
      e.advance(900);
      return { k: e.computeKPIs(), sat: Array.from(e.segmentSaturation()) };
    };
    const a = run(42);
    const b = run(42);
    const c = run(43);
    expect(a.k).toEqual(b.k);
    expect(a.sat).toEqual(b.sat);
    expect(c.k.inNetwork).not.toBe(a.k.inNetwork);
  });

  it('le rejeu du journal d’actions reproduit exactement la partie', () => {
    const cfg = config();
    const live = new SimulationEngine(network, cfg);
    live.advance(600);
    live.applyAction({ type: 'line.frequency', line: '7', frequency: 34 });
    live.advance(300);
    live.applyAction({ type: 'station.close', stationId: 'cadet' });
    live.advance(600);
    const replay = replaySimulation(network, cfg, [], live.actions, live.time);
    expect(replay.time).toBe(live.time);
    expect(replay.computeKPIs()).toEqual(live.computeKPIs());
  });

  it('les deux sens de circulation sont simulés indépendamment', () => {
    const e = new SimulationEngine(network, config());
    e.advance(1200);
    const seg = network.segmentById.get('1:chatelet|hotel-de-ville')!;
    expect(e.edgeFlow[seg.index * 2]).toBeGreaterThan(0);
    expect(e.edgeFlow[seg.index * 2 + 1]).toBeGreaterThan(0);
    expect(e.edgeFlow[seg.index * 2]).not.toBe(e.edgeFlow[seg.index * 2 + 1]);
  });
});
