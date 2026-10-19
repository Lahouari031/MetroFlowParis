/**
 * Types du réseau de référence (données statiques) et de son état effectif
 * (données calculées par le moteur à partir des incidents et de la régulation).
 */

export type LineId = '1' | '4' | '7' | '9' | '14';

/** Point schématique libre (coude de tracé), sans station. */
export interface Waypoint {
  x: number;
  y: number;
}

/** Un élément de tracé : identifiant de station ou point de passage géométrique. */
export type PathItem = string | Waypoint;

export interface LineDefinition {
  id: LineId;
  name: string;
  /** Couleur proche de la couleur officielle de la ligne (référence visuelle). */
  color: string;
  /** Couleur du texte sur la pastille de ligne. */
  textColor: string;
  /**
   * Branches de la ligne. Chaque branche est une séquence ordonnée de stations
   * (avec points de passage éventuels pour le dessin). Les tronçons communs
   * apparaissent dans plusieurs branches et sont dédupliqués.
   */
  branches: PathItem[][];
  /** Fréquence de référence en heure de pointe (trains / heure / sens), valeur de modèle. */
  baseFrequency: number;
  /** Fréquence maximale permise par la signalisation (trains / heure), valeur de modèle. */
  maxFrequency: number;
  /** Capacité d'une rame (voyageurs, 4 voy./m²), ordre de grandeur. */
  trainCapacity: number;
  /**
   * Rames de réserve mobilisables au-delà de la flotte nécessaire à la fréquence de
   * référence (limite par défaut, modifiable dans les réglages).
   */
  reserveFleet: number;
  /** Vitesse commerciale de référence (km/h), sert à dériver les temps de parcours. */
  commercialSpeed: number;
  /** Ligne automatique (affiche un badge, pas d'effet de simulation spécifique). */
  automated: boolean;
}

export interface LabelPlacement {
  /** Décalage du texte par rapport au centre de la station, en unités de carte. */
  dx: number;
  dy: number;
  anchor: 'start' | 'middle' | 'end';
  /** Rotation du texte en degrés. */
  rotate?: number;
}

export interface StationDefinition {
  id: string;
  name: string;
  /** Nom court éventuel pour l'étiquette du plan (le nom officiel reste affiché dans les panneaux). */
  shortName?: string;
  /** Coordonnées schématiques ancrées (stations de correspondance, terminus, coudes). */
  x?: number;
  y?: number;
  /** Poids "résidentiel" synthétique (émission du matin, attraction du soir). */
  residential: number;
  /** Poids "emplois / pôles" synthétique (attraction du matin, émission du soir). */
  employment: number;
  /** Capacité de référence de la station (voyageurs sur les quais), valeur de modèle. Défaut : 250 par quai. */
  capacity?: number;
  /** Placement manuel de l'étiquette (sinon calculé automatiquement). */
  label?: Partial<LabelPlacement>;
  /** Note éventuelle (correspondances hors périmètre, etc.). */
  note?: string;
}

/** Correspondance piétonne entre deux stations distinctes (couloir). */
export interface WalkingTransfer {
  from: string;
  to: string;
  /** Durée de marche estimée (s). */
  walkSeconds: number;
  note?: string;
}

/** Station résolue : coordonnées calculées, lignes desservies. */
export interface Station {
  id: string;
  index: number;
  name: string;
  /** Texte affiché sur le plan. */
  mapLabel: string;
  x: number;
  y: number;
  lines: LineId[];
  residential: number;
  employment: number;
  capacity: number;
  label: LabelPlacement;
  isTerminus: boolean;
  isInterchange: boolean;
  note?: string;
}

/** Tronçon physique (non orienté) entre deux stations consécutives d'une ligne. */
export interface Segment {
  id: string;
  index: number;
  line: LineId;
  a: string;
  b: string;
  /** Polyligne de dessin (inclut les points de passage). */
  points: Waypoint[];
  /** Longueur schématique (unités de carte). */
  length: number;
  /** Temps de parcours de référence (s) arrêt compris. */
  baseTravelTime: number;
  /** Part des trains de la ligne qui desservent ce tronçon (1 sur le tronc commun, 0.5 sur une branche). */
  serviceShare: number;
}

/** Arc orienté (un sens de circulation d'un tronçon). */
export interface DirectedEdge {
  index: number;
  segment: number;
  line: LineId;
  from: string;
  to: string;
  /** +1 dans le sens de description de la ligne, -1 sinon. */
  direction: 1 | -1;
}

export interface Network {
  stations: Station[];
  stationById: Map<string, Station>;
  lines: LineDefinition[];
  lineById: Map<LineId, LineDefinition>;
  segments: Segment[];
  segmentById: Map<string, Segment>;
  edges: DirectedEdge[];
  walkingTransfers: WalkingTransfer[];
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  /** Empreinte des données (sert à vérifier la compatibilité des sauvegardes). */
  fingerprint: string;
}

export interface DataIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
}
