/**
 * Générateur pseudo-aléatoire reproductible (mulberry32).
 * Le moteur consomme toujours le même nombre de tirages par pas de temps,
 * indépendamment de l'état du réseau : deux simulations de même graine reçoivent
 * exactement la même demande, ce qui permet de comparer des stratégies.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0 || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  getState(): number {
    return this.state;
  }
}

/** Recherche dichotomique dans une fonction de répartition cumulée (dernier élément = total). */
export function sampleCdf(cdf: Float64Array, offset: number, length: number, u: number): number {
  const total = cdf[offset + length - 1];
  if (!(total > 0)) return -1;
  const target = u * total;
  let lo = 0;
  let hi = length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cdf[offset + mid] > target) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}
