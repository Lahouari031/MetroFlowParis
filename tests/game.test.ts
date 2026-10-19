import { describe, expect, it } from 'vitest';
import { defaultConfig } from '@/engine/defaults';
import { generateRandomIncidents } from '@/engine/randomIncidents';
import { demandOpen, servicePeriod } from '@/engine/servicePeriods';
import { SimulationEngine } from '@/engine/simulationEngine';
import { FeedBuilder } from '@/lib/trafficFeed';
import { network } from './helpers';

const H = 3600;

describe('Horaires de service', () => {
  it('ferme la nuit et suit les périodes de la journée (y compris après minuit)', () => {
    expect(servicePeriod(8 * H).level).toBe(1);
    expect(servicePeriod(3 * H).level).toBe(0);
    expect(servicePeriod(27 * H).level).toBe(0); // 3 h le lendemain
    expect(servicePeriod(12 * H).level).toBeLessThan(1);
    expect(demandOpen(0.8 * H)).toBe(false);
    expect(demandOpen(6 * H)).toBe(true);
  });

  it('le métro fermé ne transporte personne, puis rouvre le matin', () => {
    const e = new SimulationEngine(network, defaultConfig(network, { startTime: 0, duration: 7 * H, warmupSeconds: 0 }), [], { quiet: false });
    e.advance(2.5 * H);
    expect(e.service.level).toBe(0);
    expect(e.computeKPIs().inNetwork).toBe(0);
    expect(e.getSnapshot().lineTrains['1']).toBe(0);
    e.advance(4 * H); // 6 h 30
    expect(e.service.level).toBeGreaterThan(0);
    expect(e.computeKPIs().inNetwork).toBeGreaterThan(1000);
    expect(e.events.some((ev) => ev.kind === 'service' && /ferme/.test(ev.message))).toBe(true);
  }, 60_000);
});

describe('Incidents aléatoires', () => {
  const opts = { seed: 42, startTime: 7 * H, duration: 24 * H, lines: ['4', '7'] as const, rate: 'normal' as const };
  it('sont reproductibles et ne touchent que les lignes choisies, hors nuit', () => {
    const a = generateRandomIncidents(network, { ...opts, lines: [...opts.lines] });
    const b = generateRandomIncidents(network, { ...opts, lines: [...opts.lines] });
    expect(a).toEqual(b);
    expect(a.length).toBeGreaterThan(5);
    for (const inc of a) {
      const t = inc.target;
      const line = t.kind === 'line' ? t.line : t.kind === 'segment' ? network.segmentById.get(t.segmentId)!.line : t.kind === 'station' ? t.line : null;
      expect(['4', '7']).toContain(line);
      expect(servicePeriod(opts.startTime + inc.offset).level).toBeGreaterThan(0);
      expect(inc.offset).toBeLessThan(opts.duration);
    }
  });

  it('sont acceptés par le moteur', () => {
    const scheduled = generateRandomIncidents(network, { seed: 7, startTime: 7 * H, duration: 3 * H, lines: ['13'], rate: 'frequent' });
    const e = new SimulationEngine(network, defaultConfig(network, { startTime: 7 * H, duration: 3 * H }), scheduled);
    expect(e.incidents).toHaveLength(scheduled.length);
  });

  it('aucun incident si le réglage est « aucun »', () => {
    expect(generateRandomIncidents(network, { ...opts, lines: ['1'], rate: 'aucun' })).toHaveLength(0);
  });
});

describe("Fil d'info trafic", () => {
  it('annonce un malaise puis le rétablissement, avec la ligne et l’heure de reprise', () => {
    const e = new SimulationEngine(network, defaultConfig(network, { startTime: 8 * H, duration: H }), [
      { offset: 60, type: 'malaise', target: { kind: 'station', stationId: 'poissonniere', line: '7' }, severity: 3, radius: 1, duration: 600 },
    ]);
    e.advance(20 * 60);
    const feed = new FeedBuilder(network);
    const posts = e.events.map((ev) => feed.build(ev, e.incidents, ['7'])).filter((p) => p !== null);
    const start = posts.find((p) => p.tone === 'alert')!;
    expect(start.line).toBe('7');
    expect(start.text).toMatch(/malaise voyageur à Poissonnière/);
    expect(start.text).toMatch(/Reprise estimée vers 08:11/);
    expect(start.mine).toBe(true);
    expect(posts.some((p) => p.tone === 'ok' && /rétabli/.test(p.text))).toBe(true);
  });
});
