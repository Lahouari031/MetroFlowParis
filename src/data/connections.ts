import type { WalkingTransfer } from '@/types/network';

/**
 * Correspondances piétonnes entre stations distinctes du périmètre.
 * Seules les correspondances signalées sur le plan RATP sont reprises.
 * Les durées de marche sont des estimations du modèle.
 */
export const WALKING_TRANSFERS: WalkingTransfer[] = [
  {
    from: 'havre-caumartin',
    to: 'saint-lazare',
    walkSeconds: 300,
    note: 'Correspondance par couloir (via la gare Haussmann–Saint-Lazare).',
  },
  {
    from: 'la-chapelle',
    to: 'gare-du-nord',
    walkSeconds: 240,
    note: 'Correspondance par couloir signalée sur le plan RATP.',
  },
];

/** Temps de correspondance de référence entre deux quais d'une même station (s). */
export const DEFAULT_TRANSFER_SECONDS = 180;

/** Temps de correspondance spécifiques (grandes stations aux couloirs longs), en secondes. */
export const STATION_TRANSFER_SECONDS: Record<string, number> = {
  chatelet: 300,
  'montparnasse-bienvenue': 300,
  'gare-de-lyon': 240,
  'gare-de-l-est': 210,
  nation: 210,
};

/**
 * Temps de parcours forcés (s) pour des inter-stations particulières.
 * Clé : "ligne:stationA|stationB" (ordre indifférent). Vide : les temps sont dérivés
 * des distances géographiques et de la vitesse commerciale de chaque ligne.
 */
export const SEGMENT_TIME_OVERRIDES: Record<string, number> = {};
