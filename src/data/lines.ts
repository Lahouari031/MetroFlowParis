import type { LineDefinition } from '@/types/network';

/**
 * Lignes du sous-réseau chargé (lignes 1, 4, 7, 9 et 14).
 *
 * - Ordre des stations : ordre de desserte réel (voir docs/DATA.md pour les sources).
 * - Coordonnées : uniquement des points de passage schématiques dessinés pour ce
 *   projet (pas de reprise du plan officiel RATP).
 * - Fréquences, capacités, rames de réserve : VALEURS DE MODÈLE (ordres de grandeur publics
 *   arrondis), pas des données d'exploitation RATP.
 */
export const LINES: LineDefinition[] = [
  {
    id: '1',
    name: 'Ligne 1',
    color: '#FFCD00',
    textColor: '#1a1a1a',
    automated: true,
    baseFrequency: 38,
    maxFrequency: 42,
    trainCapacity: 720,
    reserveFleet: 6,
    commercialSpeed: 30,
    branches: [
      [
        'la-defense', 'esplanade-de-la-defense', 'pont-de-neuilly', 'les-sablons', 'porte-maillot', 'argentine',
        'charles-de-gaulle-etoile', 'george-v', 'franklin-d-roosevelt', 'champs-elysees-clemenceau', 'concorde',
        'tuileries', 'palais-royal-musee-du-louvre', 'louvre-rivoli', 'chatelet', 'hotel-de-ville', 'saint-paul',
        'bastille', 'gare-de-lyon', 'reuilly-diderot', 'nation', { x: 1480, y: 780 }, 'porte-de-vincennes',
        'saint-mande', 'berault', 'chateau-de-vincennes',
      ],
    ],
  },
  {
    id: '4',
    name: 'Ligne 4',
    color: '#C04191',
    textColor: '#ffffff',
    automated: true,
    baseFrequency: 34,
    maxFrequency: 40,
    trainCapacity: 720,
    reserveFleet: 10,
    commercialSpeed: 24,
    branches: [
      [
        'porte-de-clignancourt', 'simplon', 'marcadet-poissonniers', 'chateau-rouge', 'barbes-rochechouart',
        'gare-du-nord', 'gare-de-l-est', 'chateau-d-eau', 'strasbourg-saint-denis', { x: 1000, y: 520 },
        'reaumur-sebastopol', 'etienne-marcel', 'les-halles', 'chatelet', 'cite', 'saint-michel', 'odeon',
        'saint-germain-des-pres', 'saint-sulpice', 'saint-placide', 'montparnasse-bienvenue', 'vavin', 'raspail',
        'denfert-rochereau', 'mouton-duvernet', 'alesia', 'porte-d-orleans', 'mairie-de-montrouge', 'barbara',
        'bagneux-lucie-aubrac',
      ],
    ],
  },
  {
    id: '7',
    name: 'Ligne 7',
    color: '#FA9ABA',
    textColor: '#1a1a1a',
    automated: false,
    baseFrequency: 30,
    maxFrequency: 36,
    trainCapacity: 574,
    reserveFleet: 12,
    commercialSpeed: 25,
    branches: [
      [
        'la-courneuve-8-mai-1945', 'fort-d-aubervilliers', 'aubervilliers-pantin-quatre-chemins',
        'porte-de-la-villette', { x: 1240, y: 180 }, 'corentin-cariou', 'crimee', 'riquet', 'stalingrad',
        'louis-blanc', 'chateau-landon', 'gare-de-l-est', { x: 980, y: 360 }, 'poissonniere', 'cadet', 'le-peletier',
        'chaussee-d-antin-la-fayette', 'opera', 'pyramides', 'palais-royal-musee-du-louvre', { x: 920, y: 680 },
        'pont-neuf', { x: 960, y: 680 }, 'chatelet', 'pont-marie', 'sully-morland', { x: 1080, y: 740 }, 'jussieu',
        'place-monge', 'censier-daubenton', 'les-gobelins', 'place-d-italie', 'tolbiac', 'maison-blanche',
        'le-kremlin-bicetre', 'villejuif-leo-lagrange', 'villejuif-paul-vaillant-couturier',
        'villejuif-louis-aragon',
      ],
      [
        'maison-blanche', { x: 1120, y: 1080 }, 'porte-d-italie', 'porte-de-choisy', 'porte-d-ivry',
        'pierre-et-marie-curie', 'mairie-d-ivry',
      ],
    ],
  },
  {
    id: '9',
    name: 'Ligne 9',
    color: '#B6BD00',
    textColor: '#1a1a1a',
    automated: false,
    baseFrequency: 30,
    maxFrequency: 36,
    trainCapacity: 620,
    reserveFleet: 13,
    commercialSpeed: 23,
    branches: [
      [
        'pont-de-sevres', 'billancourt', 'marcel-sembat', { x: 380, y: 960 }, 'porte-de-saint-cloud', 'exelmans',
        'michel-ange-molitor', 'michel-ange-auteuil', 'jasmin', 'ranelagh', 'la-muette', { x: 380, y: 700 },
        'rue-de-la-pompe', 'trocadero', 'iena', 'alma-marceau', 'franklin-d-roosevelt', 'saint-philippe-du-roule',
        'miromesnil', 'saint-augustin', 'havre-caumartin', 'chaussee-d-antin-la-fayette', 'richelieu-drouot',
        'grands-boulevards', 'bonne-nouvelle', 'strasbourg-saint-denis', 'republique', 'oberkampf',
        'saint-ambroise', 'voltaire', 'charonne', 'rue-des-boulets', 'nation', 'buzenval', 'maraichers',
        'porte-de-montreuil', 'robespierre', 'croix-de-chavaux', 'mairie-de-montreuil',
      ],
    ],
  },
  {
    id: '14',
    name: 'Ligne 14',
    color: '#62259D',
    textColor: '#ffffff',
    automated: true,
    baseFrequency: 40,
    maxFrequency: 42,
    trainCapacity: 950,
    reserveFleet: 6,
    commercialSpeed: 40,
    branches: [
      [
        'saint-denis-pleyel', 'mairie-de-saint-ouen', 'saint-ouen', 'porte-de-clichy', 'pont-cardinet',
        'saint-lazare', 'madeleine', 'pyramides', 'chatelet', 'gare-de-lyon', { x: 1340, y: 800 }, 'bercy',
        'cour-saint-emilion', 'bibliotheque-francois-mitterrand', { x: 1180, y: 1040 }, 'olympiades',
        'maison-blanche', { x: 980, y: 1140 }, 'hopital-bicetre', 'villejuif-gustave-roussy', 'l-hay-les-roses', 'chevilly-larue',
        'thiais-orly', 'aeroport-d-orly',
      ],
    ],
  },
];
