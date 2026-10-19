import { describe, expect, it } from 'vitest';
import { SimulationEngine } from '@/engine/simulationEngine';
import { config, network, station } from './helpers';

const malaise = { type: 'malaise' as const, target: { kind: 'station' as const, stationId: 'poissonniere', line: '7' as const }, severity: 3 as const, radius: 1, duration: 900 };

describe('Cycle de vie des incidents', () => {
  it('crée un incident actif puis le termine à la fin de sa durée', () => {
    const e = new SimulationEngine(network, config());
    const r = e.applyAction({ type: 'incident.create', spec: malaise });
    expect(r.ok).toBe(true);
    const inc = e.incidents[0];
    expect(inc.status).toBe('active');
    const seg = network.segmentById.get('7:gare-de-l-est|poissonniere')!;
    const edge = seg.index * 2;
    const capBefore = network.lineById.get('7')!.trainCapacity * 30;
    expect(e.state.edgeCapacity[edge]).toBeLessThan(capBefore * 0.5);
    expect(e.state.edgeTravelTime[edge]).toBeGreaterThan(seg.baseTravelTime + 200);
    e.advance(890);
    expect(inc.status).toBe('active');
    e.advance(30);
    expect(inc.status).toBe('resolved');
    expect(inc.endTime).toBeDefined();
    expect(e.state.edgeTravelTime[edge]).toBe(seg.baseTravelTime);
  });

  it('un malaise ne ferme pas la station', () => {
    const e = new SimulationEngine(network, config());
    e.applyAction({ type: 'incident.create', spec: malaise });
    expect(e.state.stationOpen[station('poissonniere').index]).toBe(1);
  });

  it('gère suspension, reprise, prolongation, gravité et levée', () => {
    const e = new SimulationEngine(network, config());
    e.applyAction({ type: 'incident.create', spec: malaise });
    const id = e.incidents[0].id;
    expect(e.applyAction({ type: 'incident.suspend', incidentId: id }).ok).toBe(true);
    const seg = network.segmentById.get('7:gare-de-l-est|poissonniere')!;
    expect(e.state.segmentDisrupted[seg.index]).toBe(0);
    e.advance(600);
    expect(e.incidents[0].elapsed).toBe(0);
    expect(e.applyAction({ type: 'incident.resume', incidentId: id }).ok).toBe(true);
    expect(e.applyAction({ type: 'incident.extend', incidentId: id, seconds: 300 }).ok).toBe(true);
    expect(e.incidents[0].duration).toBe(1200);
    expect(e.applyAction({ type: 'incident.severity', incidentId: id, severity: 1 }).ok).toBe(true);
    const cap = e.incidents[0].effects.find((x) => x.kind === 'segmentCapacityFactor');
    expect(cap && 'factor' in cap && cap.factor).toBe(0.85);
    expect(e.applyAction({ type: 'incident.resolve', incidentId: id }).ok).toBe(true);
    expect(e.incidents[0].status).toBe('resolved');
    expect(e.applyAction({ type: 'incident.resolve', incidentId: id }).ok).toBe(false);
    expect(e.incidents[0].history.length).toBeGreaterThanOrEqual(6);
  });

  it('active un incident programmé à son heure', () => {
    const cfg = config();
    const e = new SimulationEngine(network, cfg);
    e.applyAction({ type: 'incident.create', spec: { ...malaise, startTime: cfg.startTime + 600 } });
    expect(e.incidents[0].status).toBe('scheduled');
    e.advance(590);
    expect(e.incidents[0].status).toBe('scheduled');
    e.advance(20);
    expect(e.incidents[0].status).toBe('active');
  });

  it('« retour à la normale » lève les incidents de la cible', () => {
    const e = new SimulationEngine(network, config());
    e.applyAction({ type: 'incident.create', spec: malaise });
    e.applyAction({ type: 'incident.create', spec: { type: 'frequency_reduction', target: { kind: 'line', line: '9' }, severity: 2, radius: 0, duration: 900 } });
    e.applyAction({ type: 'incident.create', spec: { type: 'return_to_normal', target: { kind: 'station', stationId: 'poissonniere' }, severity: 1, radius: 0, duration: 0 } });
    expect(e.incidents.map((i) => i.status)).toEqual(['resolved', 'active']);
  });

  it('refuse une station absente du sous-réseau au lieu de créer une connexion', () => {
    const e = new SimulationEngine(network, config());
    const r = e.applyAction({ type: 'incident.create', spec: { ...malaise, target: { kind: 'station', stationId: 'republique-ligne-3-inexistante' } } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/indisponible/);
  });

  it('une fermeture complète évacue les quais et rend la station indisponible', () => {
    const e = new SimulationEngine(network, config());
    e.advance(300);
    const idx = station('chatelet').index;
    expect(e.stationWaiting[idx]).toBeGreaterThan(0);
    e.applyAction({ type: 'incident.create', spec: { type: 'station_closure', target: { kind: 'station', stationId: 'chatelet' }, severity: 3, radius: 0, duration: null } });
    expect(e.state.stationOpen[idx]).toBe(0);
    const entriesBefore = e.stationEntries[idx];
    e.advance(60);
    expect(e.stationWaiting[idx]).toBe(0);
    e.advance(1200);
    // Moyenne glissante sur 5 min : les entrées décroissent vers zéro.
    expect(e.stationEntries[idx]).toBeLessThan(entriesBefore * 0.05);
  });
});
