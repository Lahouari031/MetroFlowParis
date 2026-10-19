import { describe, expect, it } from 'vitest';
import { defaultEffects } from '@/engine/incidentManager';
import { computeNetworkState } from '@/engine/networkState';
import { Router } from '@/engine/passengerAssignment';
import type { Incident, IncidentSpec } from '@/types/incident';
import { config, network, station } from './helpers';

function routerWith(specs: IncidentSpec[] = [], closedStations: string[] = []) {
  const cfg = config();
  cfg.regulation.closedStations = closedStations;
  const incidents: Incident[] = specs.map((spec, i) => ({
    id: `T${i}`,
    type: spec.type,
    label: '',
    target: spec.target,
    severity: spec.severity,
    radius: spec.radius,
    startTime: 0,
    duration: null,
    elapsed: 0,
    status: 'active',
    effects: defaultEffects(network, spec),
    customEffects: false,
    origin: 'user',
    history: [],
  }));
  const state = computeNetworkState(network, cfg, incidents, 1);
  const router = new Router(network);
  router.update(state, null, true);
  return { router, state };
}

const lines = (route: Int32Array) => [...new Set(Array.from(route).map((e) => network.edges[e].line))];
const visits = (route: Int32Array) => Array.from(route).flatMap((e) => [network.edges[e].from, network.edges[e].to]);

describe("Calcul d'itinéraires (Dijkstra)", () => {
  it('trouve un trajet direct sur la ligne 1', () => {
    const { router } = routerWith();
    const r = router.bestRoute(station('la-defense').index, station('chateau-de-vincennes').index)!;
    expect(r).not.toBeNull();
    expect(lines(r)).toEqual(['1']);
    expect(r.length).toBe(24);
  });

  it('calcule Poissonnière → Châtelet par la ligne 7', () => {
    const { router } = routerWith();
    const r = router.bestRoute(station('poissonniere').index, station('chatelet').index)!;
    expect(lines(r)).toEqual(['7']);
    expect(network.edges[r[0]].from).toBe('poissonniere');
    expect(network.edges[r[r.length - 1]].to).toBe('chatelet');
  });

  it('ne traverse jamais un tronçon fermé', () => {
    const { router, state } = routerWith([
      { type: 'segment_interruption', target: { kind: 'segment', segmentId: '7:gare-de-l-est|poissonniere' }, severity: 3, radius: 0, duration: null },
    ]);
    const seg = network.segmentById.get('7:gare-de-l-est|poissonniere')!;
    expect(state.segmentAvailable[seg.index]).toBe(0);
    const r = router.bestRoute(station('gare-de-l-est').index, station('chatelet').index)!;
    expect(r).not.toBeNull();
    for (const e of r) expect(network.edges[e].segment).not.toBe(seg.index);
    // L'alternative naturelle est la ligne 4.
    expect(lines(r)).toContain('4');
  });

  it("une station fermée n'est plus utilisable pour entrer, sortir ou changer de ligne", () => {
    const { router } = routerWith([], ['chatelet']);
    expect(Number.isFinite(router.bestCost(station('chatelet').index, station('nation').index))).toBe(false);
    expect(Number.isFinite(router.bestCost(station('nation').index, station('chatelet').index))).toBe(false);
    // Les Halles → Gare de Lyon : sans correspondance à Châtelet, il faut un autre chemin.
    const r = router.bestRoute(station('les-halles').index, station('gare-de-lyon').index)!;
    expect(r).not.toBeNull();
    const at = Array.from(r).map((e) => network.edges[e]);
    for (let i = 1; i < at.length; i++) {
      if (at[i].line !== at[i - 1].line) expect(at[i].from).not.toBe('chatelet');
    }
    // Les trains traversent Châtelet sans s'arrêter : un trajet direct L1 reste possible.
    const direct = router.bestRoute(station('louvre-rivoli').index, station('hotel-de-ville').index)!;
    expect(visits(direct)).toContain('chatelet');
    expect(lines(direct)).toEqual(['1']);
  });

  it('propose des alternatives réparties par un logit (parts sommant à 1)', () => {
    const { router } = routerWith();
    const opts = router.options(station('gare-de-l-est').index, station('chatelet').index);
    expect(opts.length).toBeGreaterThanOrEqual(1);
    expect(opts.reduce((a, o) => a + o.share, 0)).toBeCloseTo(1, 6);
  });
});
