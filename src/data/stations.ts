import type { StationDefinition } from '@/types/network';

/**
 * Stations du sous-réseau chargé.
 *
 * Format compact : [id, nom officiel, poids résidentiel, poids emplois, x?, y?, autres lignes?]
 *
 * - Les noms suivent la dénomination RATP en vigueur (voir docs/DATA.md).
 * - Les poids résidentiels / emplois sont SYNTHÉTIQUES (échelle 1–10), choisis pour
 *   produire des flux plausibles : ce ne sont pas des comptages de fréquentation.
 * - Seules les stations "ancres" (correspondances, terminus, coudes) ont des
 *   coordonnées ; les autres sont réparties le long du tracé de leur ligne.
 * - "Autres lignes" liste les correspondances réelles hors périmètre de la
 *   simulation (affichage informatif uniquement, non simulées).
 */
type Row = [string, string, number, number, number?, number?, string?];

/** Capacité des quais des grands pôles (voyageurs), valeurs de modèle. Défaut : 250 par quai. */
const HUB_CAPACITY: Record<string, number> = {
  chatelet: 4000,
  'gare-de-lyon': 3000,
  'gare-du-nord': 2500,
  'saint-lazare': 2500,
  'montparnasse-bienvenue': 2500,
  'la-defense': 2500,
  'gare-de-l-est': 2000,
  nation: 2000,
};

const ROWS: Row[] = [
  // Ligne 1
  ['la-defense', 'La Défense', 3, 10, 140, 440, 'RER A, T2'],
  ['esplanade-de-la-defense', 'Esplanade de La Défense', 2, 6],
  ['pont-de-neuilly', 'Pont de Neuilly', 5, 3],
  ['les-sablons', 'Les Sablons', 5, 2],
  ['porte-maillot', 'Porte Maillot', 3, 5, undefined, undefined, 'RER E'],
  ['argentine', 'Argentine', 4, 3],
  ['charles-de-gaulle-etoile', 'Charles de Gaulle–Étoile', 3, 7, 520, 440, '2, 6, RER A'],
  ['george-v', 'George V', 2, 6],
  ['franklin-d-roosevelt', 'Franklin D. Roosevelt', 2, 7, 640, 560],
  ['champs-elysees-clemenceau', 'Champs-Élysées–Clemenceau', 1, 5, undefined, undefined, '13'],
  ['concorde', 'Concorde', 1, 6, 720, 640, '8, 12'],
  ['tuileries', 'Tuileries', 1, 4],
  ['palais-royal-musee-du-louvre', 'Palais Royal–Musée du Louvre', 2, 7, 880, 640],
  ['louvre-rivoli', 'Louvre–Rivoli', 2, 4],
  ['chatelet', 'Châtelet', 4, 9, 1000, 640, '11, RER A, B, D'],
  ['hotel-de-ville', 'Hôtel de Ville', 3, 5, undefined, undefined, '11'],
  ['saint-paul', 'Saint-Paul', 4, 3],
  ['bastille', 'Bastille', 5, 5, 1180, 640, '5, 8'],
  ['gare-de-lyon', 'Gare de Lyon', 6, 9, 1260, 720, 'RER A, D'],
  ['reuilly-diderot', 'Reuilly–Diderot', 5, 3, undefined, undefined, '8'],
  ['nation', 'Nation', 6, 5, 1420, 720, '2, 6, RER A'],
  ['porte-de-vincennes', 'Porte de Vincennes', 5, 2],
  ['saint-mande', 'Saint-Mandé', 6, 2],
  ['berault', 'Bérault', 6, 2],
  ['chateau-de-vincennes', 'Château de Vincennes', 8, 3, 1700, 780],

  // Ligne 4
  ['porte-de-clignancourt', 'Porte de Clignancourt', 8, 3, 1000, 60],
  ['simplon', 'Simplon', 6, 2],
  ['marcadet-poissonniers', 'Marcadet–Poissonniers', 6, 2, undefined, undefined, '12'],
  ['chateau-rouge', 'Château Rouge', 6, 2],
  ['barbes-rochechouart', 'Barbès–Rochechouart', 6, 3, undefined, undefined, '2'],
  ['gare-du-nord', 'Gare du Nord', 7, 9, 1000, 300, '5, RER B, D, E'],
  ['gare-de-l-est', "Gare de l'Est", 5, 7, 1060, 360, '5'],
  ['chateau-d-eau', "Château d'Eau", 4, 3],
  ['strasbourg-saint-denis', 'Strasbourg–Saint-Denis', 4, 5, 1060, 460, '8'],
  ['reaumur-sebastopol', 'Réaumur–Sébastopol', 3, 5, undefined, undefined, '3'],
  ['etienne-marcel', 'Étienne Marcel', 3, 4],
  ['les-halles', 'Les Halles', 3, 6, undefined, undefined, 'RER A, B, D'],
  ['cite', 'Cité', 1, 4],
  ['saint-michel', 'Saint-Michel', 3, 5, 1000, 720, 'RER B, C'],
  ['odeon', 'Odéon', 3, 4, undefined, undefined, '10'],
  ['saint-germain-des-pres', 'Saint-Germain-des-Prés', 3, 4],
  ['saint-sulpice', 'Saint-Sulpice', 3, 3],
  ['saint-placide', 'Saint-Placide', 4, 3],
  ['montparnasse-bienvenue', 'Montparnasse–Bienvenüe', 5, 8, 820, 900, '6, 12, 13'],
  ['vavin', 'Vavin', 4, 3],
  ['raspail', 'Raspail', 4, 3, undefined, undefined, '6'],
  ['denfert-rochereau', 'Denfert-Rochereau', 5, 4, 820, 1040, '6, RER B'],
  ['mouton-duvernet', 'Mouton-Duvernet', 5, 2],
  ['alesia', 'Alésia', 6, 2],
  ['porte-d-orleans', "Porte d'Orléans", 6, 3],
  ['mairie-de-montrouge', 'Mairie de Montrouge', 7, 2],
  ['barbara', 'Barbara', 7, 2],
  ['bagneux-lucie-aubrac', 'Bagneux–Lucie Aubrac', 8, 2, 820, 1380],

  // Ligne 7
  ['la-courneuve-8-mai-1945', 'La Courneuve–8 Mai 1945', 6, 2, 1240, -20],
  ['fort-d-aubervilliers', "Fort d'Aubervilliers", 5, 2],
  ['aubervilliers-pantin-quatre-chemins', 'Aubervilliers–Pantin–Quatre Chemins', 5, 2],
  ['porte-de-la-villette', 'Porte de la Villette', 5, 3],
  ['corentin-cariou', 'Corentin Cariou', 5, 2],
  ['crimee', 'Crimée', 5, 2],
  ['riquet', 'Riquet', 5, 2],
  ['stalingrad', 'Stalingrad', 5, 3, undefined, undefined, '2, 5'],
  ['louis-blanc', 'Louis Blanc', 5, 2, undefined, undefined, '7bis'],
  ['chateau-landon', 'Château-Landon', 4, 2],
  ['poissonniere', 'Poissonnière', 4, 3],
  ['cadet', 'Cadet', 4, 3],
  ['le-peletier', 'Le Peletier', 2, 5],
  ['chaussee-d-antin-la-fayette', "Chaussée d'Antin–La Fayette", 2, 8, 880, 460],
  ['opera', 'Opéra', 2, 8, undefined, undefined, '3, 8, RER A'],
  ['pyramides', 'Pyramides', 2, 6, 880, 580],
  ['pont-neuf', 'Pont Neuf', 2, 3, 940, 680],
  ['pont-marie', 'Pont Marie', 3, 2],
  ['sully-morland', 'Sully–Morland', 3, 3],
  ['jussieu', 'Jussieu', 3, 5, undefined, undefined, '10'],
  ['place-monge', 'Place Monge', 4, 2],
  ['censier-daubenton', 'Censier–Daubenton', 4, 3],
  ['les-gobelins', 'Les Gobelins', 5, 3],
  ['place-d-italie', "Place d'Italie", 6, 4, 1080, 940, '5, 6'],
  ['tolbiac', 'Tolbiac', 6, 2],
  ['maison-blanche', 'Maison Blanche', 6, 3, 1080, 1040],
  ['le-kremlin-bicetre', 'Le Kremlin-Bicêtre', 5, 3],
  ['villejuif-leo-lagrange', 'Villejuif–Léo Lagrange', 5, 2],
  ['villejuif-paul-vaillant-couturier', 'Villejuif–Paul Vaillant-Couturier', 5, 2],
  ['villejuif-louis-aragon', 'Villejuif–Louis Aragon', 6, 3, 1080, 1360],
  ['porte-d-italie', "Porte d'Italie", 4, 2],
  ['porte-de-choisy', 'Porte de Choisy', 4, 2],
  ['porte-d-ivry', "Porte d'Ivry", 4, 2],
  ['pierre-et-marie-curie', 'Pierre et Marie Curie', 5, 2],
  ['mairie-d-ivry', "Mairie d'Ivry", 6, 3, 1400, 1080],

  // Ligne 9
  ['pont-de-sevres', 'Pont de Sèvres', 8, 3, 260, 1080],
  ['billancourt', 'Billancourt', 6, 3],
  ['marcel-sembat', 'Marcel Sembat', 6, 3],
  ['porte-de-saint-cloud', 'Porte de Saint-Cloud', 5, 2],
  ['exelmans', 'Exelmans', 5, 2],
  ['michel-ange-molitor', 'Michel-Ange–Molitor', 5, 2, undefined, undefined, '10'],
  ['michel-ange-auteuil', 'Michel-Ange–Auteuil', 5, 2, undefined, undefined, '10'],
  ['jasmin', 'Jasmin', 5, 1],
  ['ranelagh', 'Ranelagh', 5, 1],
  ['la-muette', 'La Muette', 5, 2],
  ['rue-de-la-pompe', 'Rue de la Pompe', 5, 2],
  ['trocadero', 'Trocadéro', 3, 4, 460, 620, '6'],
  ['iena', 'Iéna', 2, 3],
  ['alma-marceau', 'Alma–Marceau', 2, 4, 580, 620],
  ['saint-philippe-du-roule', 'Saint-Philippe du Roule', 2, 4],
  ['miromesnil', 'Miromesnil', 2, 5, undefined, undefined, '13'],
  ['saint-augustin', 'Saint-Augustin', 2, 5, 740, 460],
  ['havre-caumartin', 'Havre–Caumartin', 2, 7, 830, 460, '3, RER A, E'],
  ['richelieu-drouot', 'Richelieu–Drouot', 2, 5, undefined, undefined, '8'],
  ['grands-boulevards', 'Grands Boulevards', 3, 4, undefined, undefined, '8'],
  ['bonne-nouvelle', 'Bonne Nouvelle', 3, 3, undefined, undefined, '8'],
  ['republique', 'République', 5, 5, 1160, 460, '3, 5, 8, 11'],
  ['oberkampf', 'Oberkampf', 5, 3, undefined, undefined, '5'],
  ['saint-ambroise', 'Saint-Ambroise', 5, 2],
  ['voltaire', 'Voltaire', 6, 2],
  ['charonne', 'Charonne', 6, 2],
  ['rue-des-boulets', 'Rue des Boulets', 6, 2],
  ['buzenval', 'Buzenval', 6, 1],
  ['maraichers', 'Maraîchers', 6, 1],
  ['porte-de-montreuil', 'Porte de Montreuil', 6, 2],
  ['robespierre', 'Robespierre', 7, 2],
  ['croix-de-chavaux', 'Croix de Chavaux', 7, 2],
  ['mairie-de-montreuil', 'Mairie de Montreuil', 8, 3, 1740, 720],

  // Ligne 14
  ['saint-denis-pleyel', 'Saint-Denis Pleyel', 7, 5, 790, -20, 'RER D'],
  ['mairie-de-saint-ouen', 'Mairie de Saint-Ouen', 6, 3, undefined, undefined, '13'],
  ['saint-ouen', 'Saint-Ouen', 6, 3, undefined, undefined, 'RER C'],
  ['porte-de-clichy', 'Porte de Clichy', 5, 4, undefined, undefined, '13, RER C'],
  ['pont-cardinet', 'Pont Cardinet', 5, 3],
  ['saint-lazare', 'Saint-Lazare', 6, 10, 790, 380, '3, 12, 13, RER E'],
  ['madeleine', 'Madeleine', 2, 7, 790, 520, '8, 12'],
  ['bercy', 'Bercy', 4, 5, undefined, undefined, '6'],
  ['cour-saint-emilion', 'Cour Saint-Émilion', 4, 4],
  ['bibliotheque-francois-mitterrand', 'Bibliothèque François Mitterrand', 5, 6, 1340, 880, 'RER C'],
  ['olympiades', 'Olympiades', 7, 3],
  ['hopital-bicetre', 'Hôpital Bicêtre', 5, 4],
  ['villejuif-gustave-roussy', 'Villejuif–Gustave Roussy', 6, 4],
  ['l-hay-les-roses', "L'Haÿ-les-Roses", 7, 2],
  ['chevilly-larue', 'Chevilly-Larue', 6, 2],
  ['thiais-orly', 'Thiais–Orly', 5, 3, undefined, undefined, 'RER C'],
  ['aeroport-d-orly', "Aéroport d'Orly", 3, 6, 980, 1480],
];

/** Noms courts utilisés pour les étiquettes du plan uniquement. */
const SHORT_NAMES: Record<string, string> = {
  'chaussee-d-antin-la-fayette': "Chaussée d'Antin",
  'palais-royal-musee-du-louvre': 'Palais Royal',
  'aubervilliers-pantin-quatre-chemins': 'Aubervilliers–Pantin',
  'villejuif-paul-vaillant-couturier': 'Villejuif–P. Vaillant-Couturier',
  'bibliotheque-francois-mitterrand': 'Bibliothèque F. Mitterrand',
};

export const STATIONS: StationDefinition[] = ROWS.map(([id, name, residential, employment, x, y, other]) => ({
  id,
  name,
  ...(SHORT_NAMES[id] ? { shortName: SHORT_NAMES[id] } : {}),
  ...(HUB_CAPACITY[id] ? { capacity: HUB_CAPACITY[id] } : {}),
  residential,
  employment,
  ...(x !== undefined && y !== undefined ? { x, y } : {}),
  ...(other ? { note: `Correspondances hors périmètre (non simulées) : ${other}` } : {}),
}));

/**
 * Ajustements manuels d'étiquettes, appliqués après le placement automatique.
 * Rempli au fil des vérifications visuelles du plan.
 */
const LEFT = { dx: -9, dy: 3, anchor: 'end' as const, rotate: 0 };

export const LABEL_OVERRIDES: Record<string, StationDefinition['label']> = {
  vavin: LEFT,
  raspail: LEFT,
  'denfert-rochereau': { ...LEFT, dx: -12 },
  'mouton-duvernet': LEFT,
  alesia: LEFT,
  'porte-d-orleans': LEFT,
  'mairie-de-montrouge': LEFT,
  barbara: LEFT,
  'bagneux-lucie-aubrac': LEFT,
  chatelet: { dx: 11, dy: -8, anchor: 'start', rotate: 0 },
};
