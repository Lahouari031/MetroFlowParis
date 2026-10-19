# Données — sources, licences, statut

MétroFlow Paris distingue quatre catégories de données. Chaque valeur affichée dans l'interface appartient à l'une d'elles.

| Catégorie | Contenu | Fichiers |
|---|---|---|
| **Données de référence du réseau** | Liste des stations, ordre de desserte, branches, correspondances | `src/data/lines.ts`, `src/data/stations.ts`, `src/data/connections.ts` |
| **Données historiques publiques** | *Aucune n'est utilisée dans cette version* (pas de comptages de fréquentation réels) | — |
| **Paramètres configurés** | Fréquences, capacités des rames, réserves, coûts, seuils de couleurs, graine, scénarios | `src/data/lines.ts`, `src/engine/defaults.ts`, `src/data/scenarios.ts`, réglages de l'interface |
| **Données générées par la simulation** | Demande, flux, files d'attente, saturations, retards, scores | moteur `src/engine/` |

## 1. Topologie du réseau (données de référence)

### Périmètre

Lignes **1, 4, 7, 9 et 14**, au complet, avec leurs terminus actuels :

| Ligne | Terminus | Stations | Particularités |
|---|---|---|---|
| 1 | La Défense ↔ Château de Vincennes | 25 | |
| 4 | Porte de Clignancourt ↔ Bagneux–Lucie Aubrac | 29 | prolongement 2022 inclus |
| 7 | La Courneuve–8 Mai 1945 ↔ Villejuif–Louis Aragon / Mairie d'Ivry | 38 | deux branches à partir de Maison Blanche |
| 9 | Pont de Sèvres ↔ Mairie de Montreuil | 37 | |
| 14 | Saint-Denis Pleyel ↔ Aéroport d'Orly | 21 | prolongements 2024 inclus |

Soit 138 stations, 145 tronçons et 290 arcs orientés. Les autres lignes (2, 3, 3bis, 5, 6, 7bis, 8, 10, 11, 12, 13) et le RER **ne sont pas simulés** ; les correspondances réelles vers ces lignes sont seulement mentionnées à titre informatif dans le panneau de chaque station (« Correspondances hors périmètre »).

Correspondance piétonne entre stations distinctes reprise : **Havre–Caumartin ↔ Saint-Lazare** (couloir via Haussmann–Saint-Lazare). Aucune autre liaison n'est créée.

### Origine et vérification

- L'ordre des stations et les noms officiels ont été **saisis manuellement** à partir de la connaissance publique du réseau (plans et fiches de ligne publiés par la RATP / Île-de-France Mobilités).
- L'environnement de développement n'avait **pas d'accès réseau** aux portails open data (`data.ratp.fr`, `data.iledefrance-mobilites.fr`) : les données n'ont donc **pas été recoupées automatiquement** avec un jeu officiel. C'est la première amélioration recommandée (voir ci-dessous).
- Toute incohérence structurelle est détectée au chargement par `validateNetworkInput()` (`src/engine/graph.ts`) : station inconnue, doublon, boucle, branche détachée, correspondance sans coordonnées, temps de parcours défini sur un tronçon inexistant… Le site **refuse de démarrer** et affiche la liste des erreurs plutôt que de les masquer. Ces contrôles sont aussi exécutés par les tests (`npm run validate:data`).

### Sources ouvertes à utiliser pour le recoupement

| Source | Contenu utile | Licence (à vérifier à la date d'usage) |
|---|---|---|
| RATP Open Data — « Positions géographiques des stations du réseau RATP » | stations, coordonnées WGS84 | ODbL |
| RATP Open Data — « Trafic annuel entrant par station » | fréquentation annuelle par station | ODbL / Licence ouverte selon le jeu |
| Île-de-France Mobilités — « Arrêts et lignes associées », « Référentiel des lignes » | identifiants stables (ID IDFM), lignes | ODbL / Licence Mobilités |
| Île-de-France Mobilités — GTFS statique « Offre horaires TC » | séquences d'arrêts, temps de parcours, fréquences | Licence Mobilités (ODbL) |

Les licences ODbL imposent l'attribution et le partage à l'identique des bases dérivées : en cas d'import, conserver la mention de la source et la date d'extraction dans ce fichier.

### Plan schématique

Les coordonnées **ne proviennent pas du plan officiel de la RATP** (dont la réutilisation est soumise à conditions). Elles ont été dessinées pour ce projet : seules les stations « ancres » (correspondances, terminus, coudes) ont des coordonnées explicites ; les autres sont réparties automatiquement le long du tracé de leur ligne. Les étiquettes sont placées par un algorithme glouton anti-collision, avec quelques ajustements manuels (`LABEL_OVERRIDES`). Les couleurs de ligne sont proches des couleurs officielles, pour la lisibilité.

## 2. Paramètres de modèle (valeurs configurées)

Ordres de grandeur publics arrondis, **pas des données d'exploitation** :

| Ligne | Fréquence de pointe (trains/h) | Max | Capacité d'une rame | Rames de réserve |
|---|---|---|---|---|
| 1 | 38 | 42 | 720 | 6 |
| 4 | 34 | 40 | 720 | 10 |
| 7 | 30 (tronc), 15 par branche | 36 | 574 | 12 |
| 9 | 30 | 36 | 620 | 13 |
| 14 | 40 | 42 | 950 | 6 |

- Temps de parcours : dérivés de la longueur schématique (1 unité ≈ 10 m) et d'une vitesse commerciale par ligne, avec 20 s d'arrêt et un minimum de 60 s ; les inter-stations longues (prolongements de la ligne 14, La Défense…) ont un temps saisi explicitement (`SEGMENT_TIME_OVERRIDES`).
- Correspondances : 180 s par défaut, 210–300 s dans les grandes stations (Châtelet, Montparnasse, Gare de Lyon, Gare de l'Est, Nation).
- Capacité des quais : 250 voyageurs par quai, valeurs majorées pour les grands pôles.
- Poids résidentiels / emplois des stations (1 à 10) : **synthétiques**, choisis pour produire des flux plausibles (pôles d'emploi au centre et à La Défense, quartiers résidentiels aux extrémités).
- Coûts : 0,6 k€ fictif par rame et par heure, 4 k€ fictifs par rame de réserve mobilisée.

## 3. Données générées

La demande (nombre de voyageurs, origines, destinations) est **entièrement synthétique** : volume de pointe calibré à 210 000 entrées/heure pour le sous-réseau, profil horaire type, modèle gravitaire. Elle ne reproduit pas les déplacements réels et ne doit pas être présentée comme une mesure RATP ou IDFM. Voir `docs/MODEL.md`.

## 4. Améliorations recommandées des données

1. Script d'import du GTFS IDFM (hors ligne, une fois) pour générer `lines.ts` et vérifier l'ordre des stations, les identifiants stables et les temps de parcours.
2. Calage des poids de stations sur le « trafic annuel entrant » RATP (en conservant la mention de la source).
3. Ajout des lignes 2, 3, 5, 6, 8… : le modèle accepte de nouvelles lignes sans réécriture (ajouter la ligne dans `lines.ts`, ses stations dans `stations.ts`, et des coordonnées pour les nouvelles correspondances).
