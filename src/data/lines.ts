import type { LineDefinition } from '@/types/network';

/**
 * Les 16 lignes du métro parisien.
 *
 * - Ordre des stations : ordre de desserte réel (voir docs/DATA.md).
 * - Les boucles à sens unique (ligne 10 à Auteuil, ligne 7bis à Pré-Saint-Gervais) sont
 *   représentées par deux branches ; elles sont simulées dans les deux sens (simplification).
 * - Fréquences, capacités, réserves, vitesses : VALEURS DE MODÈLE (ordres de grandeur
 *   arrondis), pas des données d'exploitation RATP.
 */
type Params = Omit<LineDefinition, 'id' | 'name' | 'color' | 'textColor' | 'branches'>;
const P = (baseFrequency: number, maxFrequency: number, trainCapacity: number, reserveFleet: number, commercialSpeed: number, automated = false): Params => ({
  baseFrequency,
  maxFrequency,
  trainCapacity,
  reserveFleet,
  commercialSpeed,
  automated,
});

export const LINES: LineDefinition[] = [
  {
    id: '1',
    name: 'Ligne 1',
    color: '#FFCD00',
    textColor: '#1a1a1a',
    ...P(38, 42, 720, 6, 30, true),
    branches: [
      [
        'la-defense', 'esplanade-de-la-defense', 'pont-de-neuilly', 'les-sablons', 'porte-maillot', 'argentine',
        'charles-de-gaulle-etoile', 'george-v', 'franklin-d-roosevelt', 'champs-elysees-clemenceau', 'concorde',
        'tuileries', 'palais-royal-musee-du-louvre', 'louvre-rivoli', 'chatelet', 'hotel-de-ville', 'saint-paul',
        'bastille', 'gare-de-lyon', 'reuilly-diderot', 'nation', 'porte-de-vincennes', 'saint-mande', 'berault',
        'chateau-de-vincennes',
      ],
    ],
  },
  {
    id: '2',
    name: 'Ligne 2',
    color: '#003CA6',
    textColor: '#ffffff',
    ...P(30, 34, 560, 6, 25),
    branches: [
      [
        'porte-dauphine', 'victor-hugo', 'charles-de-gaulle-etoile', 'ternes', 'courcelles', 'monceau', 'villiers',
        'rome', 'place-de-clichy', 'blanche', 'pigalle', 'anvers', 'barbes-rochechouart', 'la-chapelle', 'stalingrad',
        'jaures', 'colonel-fabien', 'belleville', 'couronnes', 'menilmontant', 'pere-lachaise', 'philippe-auguste',
        'alexandre-dumas', 'avron', 'nation',
      ],
    ],
  },
  {
    id: '3',
    name: 'Ligne 3',
    color: '#837902',
    textColor: '#ffffff',
    ...P(26, 30, 560, 6, 25),
    branches: [
      [
        'pont-de-levallois-becon', 'anatole-france', 'louise-michel', 'porte-de-champerret', 'pereire', 'wagram',
        'malesherbes', 'villiers', 'europe', 'saint-lazare', 'havre-caumartin', 'opera', 'quatre-septembre', 'bourse',
        'sentier', 'reaumur-sebastopol', 'arts-et-metiers', 'temple', 'republique', 'parmentier', 'rue-saint-maur',
        'pere-lachaise', 'gambetta', 'porte-de-bagnolet', 'gallieni',
      ],
    ],
  },
  {
    id: '3bis',
    name: 'Ligne 3bis',
    color: '#6EC4E8',
    textColor: '#1a1a1a',
    ...P(12, 16, 280, 2, 22),
    branches: [['gambetta', 'pelleport', 'saint-fargeau', 'porte-des-lilas']],
  },
  {
    id: '4',
    name: 'Ligne 4',
    color: '#CF009E',
    textColor: '#ffffff',
    ...P(34, 40, 720, 10, 24, true),
    branches: [
      [
        'porte-de-clignancourt', 'simplon', 'marcadet-poissonniers', 'chateau-rouge', 'barbes-rochechouart',
        'gare-du-nord', 'gare-de-l-est', 'chateau-d-eau', 'strasbourg-saint-denis', 'reaumur-sebastopol',
        'etienne-marcel', 'les-halles', 'chatelet', 'cite', 'saint-michel', 'odeon', 'saint-germain-des-pres',
        'saint-sulpice', 'saint-placide', 'montparnasse-bienvenue', 'vavin', 'raspail', 'denfert-rochereau',
        'mouton-duvernet', 'alesia', 'porte-d-orleans', 'mairie-de-montrouge', 'barbara', 'bagneux-lucie-aubrac',
      ],
    ],
  },
  {
    id: '5',
    name: 'Ligne 5',
    color: '#FF7E2E',
    textColor: '#1a1a1a',
    ...P(28, 32, 560, 6, 27),
    branches: [
      [
        'bobigny-pablo-picasso', 'bobigny-pantin-raymond-queneau', 'eglise-de-pantin', 'hoche', 'porte-de-pantin',
        'ourcq', 'laumiere', 'jaures', 'stalingrad', 'gare-du-nord', 'gare-de-l-est', 'jacques-bonsergent',
        'republique', 'oberkampf', 'richard-lenoir', 'breguet-sabin', 'bastille', 'quai-de-la-rapee',
        'gare-d-austerlitz', 'saint-marcel', 'campo-formio', 'place-d-italie',
      ],
    ],
  },
  {
    id: '6',
    name: 'Ligne 6',
    color: '#6ECA97',
    textColor: '#1a1a1a',
    ...P(28, 32, 560, 6, 26),
    branches: [
      [
        'charles-de-gaulle-etoile', 'kleber', 'boissiere', 'trocadero', 'passy', 'bir-hakeim', 'dupleix',
        'la-motte-picquet-grenelle', 'cambronne', 'sevres-lecourbe', 'pasteur', 'montparnasse-bienvenue',
        'edgar-quinet', 'raspail', 'denfert-rochereau', 'saint-jacques', 'glaciere', 'corvisart', 'place-d-italie',
        'nationale', 'chevaleret', 'quai-de-la-gare', 'bercy', 'dugommier', 'daumesnil', 'bel-air', 'picpus', 'nation',
      ],
    ],
  },
  {
    id: '7',
    name: 'Ligne 7',
    color: '#FA9ABA',
    textColor: '#1a1a1a',
    ...P(30, 36, 574, 12, 25),
    branches: [
      [
        'la-courneuve-8-mai-1945', 'fort-d-aubervilliers', 'aubervilliers-pantin-quatre-chemins',
        'porte-de-la-villette', 'corentin-cariou', 'crimee', 'riquet', 'stalingrad', 'louis-blanc', 'chateau-landon',
        'gare-de-l-est', 'poissonniere', 'cadet', 'le-peletier', 'chaussee-d-antin-la-fayette', 'opera', 'pyramides',
        'palais-royal-musee-du-louvre', 'pont-neuf', 'chatelet', 'pont-marie', 'sully-morland', 'jussieu',
        'place-monge', 'censier-daubenton', 'les-gobelins', 'place-d-italie', 'tolbiac', 'maison-blanche',
        'le-kremlin-bicetre', 'villejuif-leo-lagrange', 'villejuif-paul-vaillant-couturier', 'villejuif-louis-aragon',
      ],
      ['maison-blanche', 'porte-d-italie', 'porte-de-choisy', 'porte-d-ivry', 'pierre-et-marie-curie', 'mairie-d-ivry'],
    ],
  },
  {
    id: '7bis',
    name: 'Ligne 7bis',
    color: '#6ECA97',
    textColor: '#1a1a1a',
    ...P(12, 16, 290, 2, 20),
    branches: [
      ['louis-blanc', 'jaures', 'bolivar', 'buttes-chaumont', 'botzaris', 'place-des-fetes', 'pre-saint-gervais'],
      ['botzaris', 'danube', 'pre-saint-gervais'],
    ],
  },
  {
    id: '8',
    name: 'Ligne 8',
    color: '#E19BDF',
    textColor: '#1a1a1a',
    ...P(26, 30, 560, 8, 27),
    branches: [
      [
        'balard', 'lourmel', 'boucicaut', 'felix-faure', 'commerce', 'la-motte-picquet-grenelle', 'ecole-militaire',
        'la-tour-maubourg', 'invalides', 'concorde', 'madeleine', 'opera', 'richelieu-drouot', 'grands-boulevards',
        'bonne-nouvelle', 'strasbourg-saint-denis', 'republique', 'filles-du-calvaire', 'saint-sebastien-froissart',
        'chemin-vert', 'bastille', 'ledru-rollin', 'faidherbe-chaligny', 'reuilly-diderot', 'montgallet', 'daumesnil',
        'michel-bizot', 'porte-doree', 'porte-de-charenton', 'liberte', 'charenton-ecoles',
        'ecole-veterinaire-de-maisons-alfort', 'maisons-alfort-stade', 'maisons-alfort-les-juilliottes',
        'creteil-l-echat', 'creteil-universite', 'creteil-prefecture', 'pointe-du-lac',
      ],
    ],
  },
  {
    id: '9',
    name: 'Ligne 9',
    color: '#B6BD00',
    textColor: '#1a1a1a',
    ...P(30, 36, 620, 13, 23),
    branches: [
      [
        'pont-de-sevres', 'billancourt', 'marcel-sembat', 'porte-de-saint-cloud', 'exelmans', 'michel-ange-molitor',
        'michel-ange-auteuil', 'jasmin', 'ranelagh', 'la-muette', 'rue-de-la-pompe', 'trocadero', 'iena',
        'alma-marceau', 'franklin-d-roosevelt', 'saint-philippe-du-roule', 'miromesnil', 'saint-augustin',
        'havre-caumartin', 'chaussee-d-antin-la-fayette', 'richelieu-drouot', 'grands-boulevards', 'bonne-nouvelle',
        'strasbourg-saint-denis', 'republique', 'oberkampf', 'saint-ambroise', 'voltaire', 'charonne',
        'rue-des-boulets', 'nation', 'buzenval', 'maraichers', 'porte-de-montreuil', 'robespierre', 'croix-de-chavaux',
        'mairie-de-montreuil',
      ],
    ],
  },
  {
    id: '10',
    name: 'Ligne 10',
    color: '#C9910D',
    textColor: '#1a1a1a',
    ...P(22, 26, 560, 6, 24),
    branches: [
      [
        'boulogne-pont-de-saint-cloud', 'boulogne-jean-jaures', 'michel-ange-molitor', 'chardon-lagache', 'mirabeau',
        'javel-andre-citroen', 'charles-michels', 'avenue-emile-zola', 'la-motte-picquet-grenelle', 'segur', 'duroc',
        'vaneau', 'sevres-babylone', 'mabillon', 'odeon', 'cluny-la-sorbonne', 'maubert-mutualite', 'cardinal-lemoine',
        'jussieu', 'gare-d-austerlitz',
      ],
      ['boulogne-jean-jaures', 'porte-d-auteuil', 'michel-ange-auteuil', 'eglise-d-auteuil', 'javel-andre-citroen'],
    ],
  },
  {
    id: '11',
    name: 'Ligne 11',
    color: '#704B1C',
    textColor: '#ffffff',
    ...P(24, 28, 560, 6, 27),
    branches: [
      [
        'chatelet', 'hotel-de-ville', 'rambuteau', 'arts-et-metiers', 'republique', 'goncourt', 'belleville',
        'pyrenees', 'jourdain', 'place-des-fetes', 'telegraphe', 'porte-des-lilas', 'mairie-des-lilas',
        'serge-gainsbourg', 'romainville-carnot', 'montreuil-hopital', 'la-dhuys', 'coteaux-beauclair',
        'rosny-bois-perrier',
      ],
    ],
  },
  {
    id: '12',
    name: 'Ligne 12',
    color: '#007852',
    textColor: '#ffffff',
    ...P(26, 30, 560, 6, 26),
    branches: [
      [
        'mairie-d-aubervilliers', 'aime-cesaire', 'front-populaire', 'porte-de-la-chapelle', 'marx-dormoy',
        'marcadet-poissonniers', 'jules-joffrin', 'lamarck-caulaincourt', 'abbesses', 'pigalle', 'saint-georges',
        'notre-dame-de-lorette', 'trinite-d-estienne-d-orves', 'saint-lazare', 'madeleine', 'concorde',
        'assemblee-nationale', 'solferino', 'rue-du-bac', 'sevres-babylone', 'rennes', 'notre-dame-des-champs',
        'montparnasse-bienvenue', 'falguiere', 'pasteur', 'volontaires', 'vaugirard', 'convention',
        'porte-de-versailles', 'corentin-celton', 'mairie-d-issy',
      ],
    ],
  },
  {
    id: '13',
    name: 'Ligne 13',
    color: '#6EC4E8',
    textColor: '#1a1a1a',
    ...P(32, 36, 574, 8, 30),
    branches: [
      [
        'saint-denis-universite', 'basilique-de-saint-denis', 'saint-denis-porte-de-paris', 'carrefour-pleyel',
        'mairie-de-saint-ouen', 'garibaldi', 'porte-de-saint-ouen', 'guy-moquet', 'la-fourche', 'place-de-clichy',
        'liege', 'saint-lazare', 'miromesnil', 'champs-elysees-clemenceau', 'invalides', 'varenne',
        'saint-francois-xavier', 'duroc', 'montparnasse-bienvenue', 'gaite', 'pernety', 'plaisance', 'porte-de-vanves',
        'malakoff-plateau-de-vanves', 'malakoff-rue-etienne-dolet', 'chatillon-montrouge',
      ],
      [
        'asnieres-gennevilliers-les-courtilles', 'les-agnettes', 'gabriel-peri', 'mairie-de-clichy',
        'porte-de-clichy', 'brochant', 'la-fourche',
      ],
    ],
  },
  {
    id: '14',
    name: 'Ligne 14',
    color: '#62259D',
    textColor: '#ffffff',
    ...P(40, 42, 950, 6, 40, true),
    branches: [
      [
        'saint-denis-pleyel', 'mairie-de-saint-ouen', 'saint-ouen', 'porte-de-clichy', 'pont-cardinet',
        'saint-lazare', 'madeleine', 'pyramides', 'chatelet', 'gare-de-lyon', 'bercy', 'cour-saint-emilion',
        'bibliotheque-francois-mitterrand', 'olympiades', 'maison-blanche', 'hopital-bicetre',
        'villejuif-gustave-roussy', 'l-hay-les-roses', 'chevilly-larue', 'thiais-orly', 'aeroport-d-orly',
      ],
    ],
  },
];
