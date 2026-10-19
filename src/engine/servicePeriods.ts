/**
 * Horaires de service (valeurs de modèle, inspirées d'un jour de semaine) : le métro ferme la nuit
 * et circule moins souvent en début de matinée, en heures creuses et en soirée.
 * Le niveau de service multiplie la fréquence programmée de toutes les lignes.
 */
export interface ServicePeriod {
  /** Début (heure décimale, 0–24). */
  from: number;
  label: string;
  /** Multiplicateur de fréquence (0 = métro fermé). */
  level: number;
}

const H = 3600;

export const SERVICE_PERIODS: ServicePeriod[] = [
  { from: 0, label: 'Service de soirée', level: 0.55 },
  { from: 1.25, label: 'Métro fermé (nuit)', level: 0 },
  { from: 5.5, label: 'Début de service', level: 0.6 },
  { from: 6.5, label: 'Pointe du matin', level: 1 },
  { from: 10, label: 'Heures creuses', level: 0.8 },
  { from: 16, label: 'Pointe du soir', level: 1 },
  { from: 20.5, label: 'Service de soirée', level: 0.55 },
];

/** Plus de nouveaux voyageurs entre 0 h 40 (derniers trains) et la réouverture. */
export const DEMAND_STOP = 0.67;
export const DEMAND_RESUME = 5.5;

const hourOf = (timeOfDay: number) => (((timeOfDay / H) % 24) + 24) % 24;

export function servicePeriodIndex(timeOfDay: number): number {
  const h = hourOf(timeOfDay);
  let idx = 0;
  for (let i = 0; i < SERVICE_PERIODS.length; i++) if (h >= SERVICE_PERIODS[i].from) idx = i;
  return idx;
}

export function servicePeriod(timeOfDay: number): ServicePeriod {
  return SERVICE_PERIODS[servicePeriodIndex(timeOfDay)];
}

/** Vrai si de nouveaux voyageurs entrent dans le réseau à cette heure. */
export function demandOpen(timeOfDay: number): boolean {
  const h = hourOf(timeOfDay);
  return !(h >= DEMAND_STOP && h < DEMAND_RESUME);
}
