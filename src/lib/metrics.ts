/** Échelles de couleurs et formatage des indicateurs (affichage uniquement). */

export const LEVEL_COLORS = {
  low: '#22c55e',
  moderate: '#eab308',
  high: '#f97316',
  veryHigh: '#ef4444',
  over: '#ff1744',
  none: '#334155',
} as const;

export type Level = keyof typeof LEVEL_COLORS;

/** Niveau de saturation selon les seuils configurés [vert|jaune, jaune|orange, orange|rouge, rouge|dépassement]. */
export function saturationLevel(v: number, t: readonly number[]): Level {
  if (!Number.isFinite(v)) return 'none';
  if (v < t[0]) return 'low';
  if (v < t[1]) return 'moderate';
  if (v < t[2]) return 'high';
  if (v < t[3]) return 'veryHigh';
  return 'over';
}

export function levelColor(level: Level): string {
  return LEVEL_COLORS[level];
}

export const LEVEL_LABELS: Record<Level, string> = {
  low: 'Faible',
  moderate: 'Modérée',
  high: 'Élevée',
  veryHigh: 'Très élevée',
  over: 'Dépassement',
  none: 'Hors service',
};

/** Seuils fixes pour les autres métriques de la carte (couleurs vert → rouge). */
export const FLOW_STEPS = [6000, 12000, 18000, 24000]; // voyageurs / heure / sens
export const DELAY_STEPS = [30, 90, 180, 300]; // secondes
export const VARIATION_STEPS = [0.1, 0.25, 0.5, 1]; // variation relative (hausse)

export function stepLevel(v: number, steps: readonly number[]): Level {
  return saturationLevel(v, steps);
}

/** Couleur de variation : bleu pour une baisse, vert → rouge pour une hausse. */
export function variationColor(v: number): string {
  if (!Number.isFinite(v)) return LEVEL_COLORS.none;
  if (v <= -0.25) return '#38bdf8';
  if (v <= -0.1) return '#7dd3fc';
  if (v < 0.1) return LEVEL_COLORS.low;
  return LEVEL_COLORS[stepLevel(v, VARIATION_STEPS)];
}

export const fmtInt = (v: number) => Math.round(v).toLocaleString('fr-FR');
export const fmtPct = (v: number, digits = 0) => `${(v * 100).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} %`;
export const fmtMin = (seconds: number, digits = 1) =>
  `${(seconds / 60).toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} min`;
export const fmtNum = (v: number, digits = 1) => v.toLocaleString('fr-FR', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export function fmtClock(seconds: number, withSeconds = false): string {
  const s = ((Math.floor(seconds) % 86400) + 86400) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}${withSeconds ? `:${String(sec).padStart(2, '0')}` : ''}`;
}

/** Variation relative entre une valeur et sa référence. */
export function relDelta(v: number, ref: number | undefined | null): number | null {
  if (ref === undefined || ref === null || !Number.isFinite(ref) || Math.abs(ref) < 1e-9) return null;
  return (v - ref) / Math.abs(ref);
}
