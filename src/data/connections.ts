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
 * Temps de parcours estimés (s) pour les inter-stations longues, que la
 * géométrie schématique ne reflète pas (prolongements de la ligne 14 notamment).
 * Clé : "ligne:stationA|stationB" (ordre indifférent). Valeurs de modèle.
 */
export const SEGMENT_TIME_OVERRIDES: Record<string, number> = {
  '14:saint-denis-pleyel|mairie-de-saint-ouen': 120,
  '14:mairie-de-saint-ouen|saint-ouen': 90,
  '14:saint-ouen|porte-de-clichy': 90,
  '14:porte-de-clichy|pont-cardinet': 90,
  '14:pont-cardinet|saint-lazare': 120,
  '14:saint-lazare|madeleine': 90,
  '14:madeleine|pyramides': 90,
  '14:pyramides|chatelet': 120,
  '14:chatelet|gare-de-lyon': 150,
  '14:maison-blanche|hopital-bicetre': 120,
  '14:hopital-bicetre|villejuif-gustave-roussy': 120,
  '14:villejuif-gustave-roussy|l-hay-les-roses': 120,
  '14:l-hay-les-roses|chevilly-larue': 120,
  '14:chevilly-larue|thiais-orly': 150,
  '14:thiais-orly|aeroport-d-orly': 210,
  '1:la-defense|esplanade-de-la-defense': 90,
  '1:pont-de-neuilly|les-sablons': 100,
  '9:pont-de-sevres|billancourt': 100,
};
