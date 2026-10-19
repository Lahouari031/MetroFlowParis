import { describe, expect, it } from 'vitest';
import { NETWORK_INPUT } from '@/data/network';
import { buildNetwork, NetworkDataError, validateNetworkInput } from '@/engine/graph';
import { network, station } from './helpers';

describe('Données du réseau', () => {
  it('ne contient aucune erreur de validation', () => {
    const issues = validateNetworkInput(NETWORK_INPUT);
    expect(issues.filter((i) => i.level === 'error')).toEqual([]);
  });

  it('contient les lignes 1, 4, 7, 9, 14 avec le bon nombre de stations', () => {
    const count = (line: string) => new Set(network.segments.filter((s) => s.line === line).flatMap((s) => [s.a, s.b])).size;
    expect(count('1')).toBe(25);
    expect(count('4')).toBe(29);
    expect(count('7')).toBe(38);
    expect(count('9')).toBe(37);
    expect(count('14')).toBe(21);
    expect(network.stations).toHaveLength(138);
  });

  it('chaque tronçon relie deux stations existantes et chaque arc a son sens opposé', () => {
    for (const s of network.segments) {
      expect(network.stationById.has(s.a)).toBe(true);
      expect(network.stationById.has(s.b)).toBe(true);
      expect(s.baseTravelTime).toBeGreaterThan(0);
    }
    expect(network.edges).toHaveLength(network.segments.length * 2);
  });

  it('respecte les connexions réelles autour de Poissonnière (ligne 7)', () => {
    expect(network.segmentById.has('7:gare-de-l-est|poissonniere')).toBe(true);
    expect(network.segmentById.has('7:cadet|poissonniere')).toBe(true);
    expect(station('poissonniere').lines).toEqual(['7']);
    // Pas de connexion inventée : Poissonnière n'est reliée qu'à ses deux voisines.
    expect(network.segments.filter((s) => s.a === 'poissonniere' || s.b === 'poissonniere')).toHaveLength(2);
  });

  it('identifie les correspondances principales', () => {
    expect(station('chatelet').lines).toEqual(['1', '4', '7', '14']);
    expect(station('nation').lines).toEqual(['1', '9']);
    expect(station('maison-blanche').lines).toEqual(['7', '14']);
    expect(station('gare-de-l-est').isInterchange).toBe(true);
  });

  it('modélise les branches de la ligne 7 (demi-service sur chaque branche)', () => {
    expect(network.segmentById.get('7:maison-blanche|porte-d-italie')!.serviceShare).toBe(0.5);
    expect(network.segmentById.get('7:le-kremlin-bicetre|maison-blanche')!.serviceShare).toBe(0.5);
    expect(network.segmentById.get('7:place-d-italie|tolbiac')!.serviceShare).toBe(1);
  });

  it('le graphe est connexe', () => {
    const adj = new Map<string, string[]>();
    for (const s of network.segments) {
      adj.set(s.a, [...(adj.get(s.a) ?? []), s.b]);
      adj.set(s.b, [...(adj.get(s.b) ?? []), s.a]);
    }
    const seen = new Set(['chatelet']);
    const queue = ['chatelet'];
    while (queue.length) for (const n of adj.get(queue.shift()!) ?? []) if (!seen.has(n)) (seen.add(n), queue.push(n));
    expect(seen.size).toBe(network.stations.length);
  });

  it('détecte les références à des stations inexistantes et les correspondances non ancrées', () => {
    const broken = {
      ...NETWORK_INPUT,
      lines: NETWORK_INPUT.lines.map((l) => (l.id === '7' ? { ...l, branches: [[...l.branches[0], 'station-fantome']] } : l)),
      walkingTransfers: [...NETWORK_INPUT.walkingTransfers, { from: 'chatelet', to: 'inconnue', walkSeconds: 60 }],
    };
    const codes = validateNetworkInput(broken).map((i) => i.code);
    expect(codes).toContain('UNKNOWN_STATION');
    expect(codes).toContain('UNKNOWN_TRANSFER');
    expect(() => buildNetwork(broken)).toThrow(NetworkDataError);

    const unanchored = {
      ...NETWORK_INPUT,
      stations: NETWORK_INPUT.stations.map((s) => (s.id === 'nation' ? { ...s, x: undefined, y: undefined } : s)),
    };
    expect(validateNetworkInput(unanchored).map((i) => i.code)).toContain('UNANCHORED_INTERCHANGE');
  });

  it('a une empreinte stable (compatibilité des sauvegardes)', () => {
    expect(buildNetwork(NETWORK_INPUT).network.fingerprint).toBe(network.fingerprint);
  });
});
