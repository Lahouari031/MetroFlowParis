/**
 * Génération de la demande SYNTHÉTIQUE de déplacements.
 *
 * Hypothèses (voir docs/MODEL.md) :
 *  - le volume total suit un profil horaire type (heures creuses, pointes du matin et du soir) ;
 *  - trois motifs se combinent : domicile → travail (matin), travail → domicile (soir), autres ;
 *  - l'émission d'une station dépend de ses poids résidentiel / emplois synthétiques ;
 *  - la destination est tirée selon un modèle gravitaire : attractivité × exp(−temps / 25 min).
 * Ces volumes ne sont pas des comptages réels.
 */
import type { Network } from '@/types/network';
import { Rng, sampleCdf } from './rng';

/** Entrées par heure dans le sous-réseau à l'heure de pointe pour demandScale = 1 (valeur calibrée). */
export const PEAK_ENTRIES_PER_HOUR = 210_000;

/** Intervalle de génération de la demande (s simulées). */
export const GENERATION_INTERVAL = 60;

/** Nombre de tirages consommés par station et par intervalle (constant pour la reproductibilité). */
export const SAMPLES_PER_ORIGIN = 4;

/** Profil horaire (heure, part du volume de pointe). Interpolation linéaire. */
export const DEMAND_PROFILE: [number, number][] = [
  [0, 0.12],
  [1.5, 0.03],
  [5, 0.05],
  [6, 0.25],
  [7, 0.6],
  [8, 0.95],
  [8.5, 1],
  [9.5, 0.7],
  [10.5, 0.45],
  [12.5, 0.5],
  [14.5, 0.45],
  [16, 0.6],
  [17.5, 0.92],
  [18.25, 1],
  [19.5, 0.7],
  [21, 0.38],
  [23, 0.2],
  [24, 0.12],
];

export function demandProfile(timeOfDay: number): number {
  const h = (((timeOfDay / 3600) % 24) + 24) % 24;
  for (let i = 1; i < DEMAND_PROFILE.length; i++) {
    const [h1, v1] = DEMAND_PROFILE[i];
    const [h0, v0] = DEMAND_PROFILE[i - 1];
    if (h <= h1) return v0 + ((h - h0) / (h1 - h0)) * (v1 - v0);
  }
  return DEMAND_PROFILE[DEMAND_PROFILE.length - 1][1];
}

/** Répartition des motifs [matin, soir, autres] à une heure donnée (somme = 1). */
export function patternMix(timeOfDay: number): [number, number, number] {
  const h = (((timeOfDay / 3600) % 24) + 24) % 24;
  const g = (mu: number, sigma: number) => Math.exp(-((h - mu) ** 2) / (2 * sigma * sigma));
  const morning = 1.4 * g(8.5, 1.4);
  const evening = 1.3 * g(18, 1.6);
  const other = 0.45;
  const sum = morning + evening + other;
  return [morning / sum, evening / sum, other / sum];
}

const IMPEDANCE_SECONDS = 1500;
const MIN_TRIP_SECONDS = 300;

export interface GeneratedTrip {
  origin: number;
  dest: number;
  size: number;
}

export class DemandModel {
  readonly S: number;
  /** Poids d'émission par motif : [motif * S + station]. */
  private emission: Float64Array;
  private emissionTotal: Float64Array;
  /** Fonctions de répartition des destinations : [(motif * S + origine) * S + destination]. */
  private destCdf: Float64Array;
  /** Fonction de répartition des origines pour l'affluence exceptionnelle. */
  private originCdf: Float64Array;

  constructor(network: Network, baseTime: Float64Array) {
    const S = network.stations.length;
    this.S = S;
    const r = network.stations.map((s) => s.residential);
    const e = network.stations.map((s) => s.employment);
    // Les correspondances concentrent plus de flux (lignes hors périmètre, gares).
    const hub = network.stations.map((s) => 1 + 0.35 * (s.lines.length - 1) + (s.note ? 0.25 : 0));
    this.emission = new Float64Array(3 * S);
    this.emissionTotal = new Float64Array(3);
    const attraction = new Float64Array(3 * S);
    for (let i = 0; i < S; i++) {
      const emit = [r[i], e[i], (r[i] + e[i]) / 2];
      const attract = [e[i], r[i], (r[i] + e[i]) / 2];
      for (let p = 0; p < 3; p++) {
        this.emission[p * S + i] = emit[p] * hub[i];
        this.emissionTotal[p] += emit[p] * hub[i];
        attraction[p * S + i] = attract[p] * hub[i];
      }
    }
    this.destCdf = new Float64Array(3 * S * S);
    for (let p = 0; p < 3; p++) {
      for (let o = 0; o < S; o++) {
        let acc = 0;
        const base = (p * S + o) * S;
        for (let d = 0; d < S; d++) {
          const t = baseTime[o * S + d];
          let w = 0;
          if (d !== o && Number.isFinite(t)) {
            w = attraction[p * S + d] * Math.exp(-t / IMPEDANCE_SECONDS) * (t < MIN_TRIP_SECONDS ? 0.15 : 1);
          }
          acc += w;
          this.destCdf[base + d] = acc;
        }
      }
    }
    this.originCdf = new Float64Array(S);
    let acc = 0;
    for (let i = 0; i < S; i++) {
      acc += r[i] + e[i];
      this.originCdf[i] = acc;
    }
  }

  /** Taux d'entrées (voyageurs / heure) émis par une station, hors facteurs d'incident. */
  rate(origin: number, timeOfDay: number, scale: number): number {
    const mix = patternMix(timeOfDay);
    let share = 0;
    for (let p = 0; p < 3; p++) share += (mix[p] * this.emission[p * this.S + origin]) / this.emissionTotal[p];
    return PEAK_ENTRIES_PER_HOUR * demandProfile(timeOfDay) * scale * share;
  }

  /**
   * Génère les trajets d'un intervalle. Consomme toujours SAMPLES_PER_ORIGIN × 2 tirages
   * par station, quel que soit l'état du réseau.
   * @param originFactor facteur multiplicatif par station (0 si station fermée).
   */
  generate(rng: Rng, timeOfDay: number, interval: number, scale: number, originFactor: Float64Array, out: GeneratedTrip[]) {
    const S = this.S;
    const mix = patternMix(timeOfDay);
    for (let o = 0; o < S; o++) {
      const n = (this.rate(o, timeOfDay, scale) * interval * originFactor[o]) / 3600;
      const m = n < 2 ? 1 : n < 6 ? 2 : n < 15 ? 3 : 4;
      for (let k = 0; k < SAMPLES_PER_ORIGIN; k++) {
        const u1 = rng.next();
        const u2 = rng.next();
        if (k >= m || n <= 0) continue;
        const p = u1 < mix[0] ? 0 : u1 < mix[0] + mix[1] ? 1 : 2;
        const d = sampleCdf(this.destCdf, (p * S + o) * S, S, u2);
        if (d < 0 || d === o) continue;
        out.push({ origin: o, dest: d, size: n / m });
      }
    }
  }

  /**
   * Demande supplémentaire attirée par les stations en affluence exceptionnelle
   * (flux stream séparé pour ne pas décaler la demande de base).
   */
  generateSurge(rng: Rng, timeOfDay: number, interval: number, scale: number, destFactor: Float64Array, out: GeneratedTrip[]) {
    for (let d = 0; d < this.S; d++) {
      if (destFactor[d] <= 1) continue;
      const extra = (this.rate(d, timeOfDay, scale) * (destFactor[d] - 1) * interval) / 3600;
      const m = extra < 6 ? 2 : 4;
      for (let k = 0; k < m; k++) {
        const o = sampleCdf(this.originCdf, 0, this.S, rng.next());
        if (o < 0 || o === d) continue;
        out.push({ origin: o, dest: d, size: extra / m });
      }
    }
  }
}
