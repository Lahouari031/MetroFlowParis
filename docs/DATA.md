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

Les **16 lignes du métro** (1 à 14, 3bis, 7bis), avec leurs terminus actuels — 321 stations, 391 tronçons, 782 arcs orientés :

| Ligne | Terminus | Stations | Particularités |
|---|---|---|---|
| 1 | La Défense ↔ Château de Vincennes | 25 | automatique |
| 2 | Porte Dauphine ↔ Nation | 25 | |
| 3 | Pont de Levallois–Bécon ↔ Gallieni | 25 | |
| 3bis | Gambetta ↔ Porte des Lilas | 4 | |
| 4 | Porte de Clignancourt ↔ Bagneux–Lucie Aubrac | 29 | automatique, prolongement 2022 |
| 5 | Bobigny–Pablo Picasso ↔ Place d'Italie | 22 | |
| 6 | Charles de Gaulle–Étoile ↔ Nation | 28 | |
| 7 | La Courneuve–8 Mai 1945 ↔ Villejuif–Louis Aragon / Mairie d'Ivry | 38 | deux branches à partir de Maison Blanche |
| 7bis | Louis Blanc ↔ Pré-Saint-Gervais | 8 | boucle à sens unique simulée dans les deux sens |
| 8 | Balard ↔ Pointe du Lac | 38 | |
| 9 | Pont de Sèvres ↔ Mairie de Montreuil | 37 | |
| 10 | Boulogne–Pont de Saint-Cloud ↔ Gare d'Austerlitz | 23 | boucle d'Auteuil simulée dans les deux sens |
| 11 | Châtelet ↔ Rosny–Bois-Perrier | 19 | prolongement 2024 |
| 12 | Mairie d'Aubervilliers ↔ Mairie d'Issy | 31 | |
| 13 | Saint-Denis–Université / Asnières–Gennevilliers ↔ Châtillon–Montrouge | 32 | deux branches à partir de La Fourche |
| 14 | Saint-Denis Pleyel ↔ Aéroport d'Orly | 21 | automatique, prolongements 2024 |

Le RER, le tramway et le bus **ne sont pas simulés** ; les correspondances vers ces modes sont seulement mentionnées à titre informatif dans le panneau de chaque station.

Correspondances piétonnes entre stations distinctes reprises : **Havre–Caumartin ↔ Saint-Lazare** et **La Chapelle ↔ Gare du Nord**. Les correspondances internes (même nom de station) sont déduites automatiquement.

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

### Plan et fond de carte

- **Positions des stations** : latitude/longitude **approximatives**, saisies de mémoire à partir de la géographie publique de Paris (précision de l'ordre de 100 à 300 m), puis projetées (équirectangulaire centrée sur Paris, 1 unité ≈ 10 m). Elles ne proviennent ni du plan officiel RATP ni d'un jeu open data ; le recoupement avec « Positions géographiques des stations » est la première amélioration recommandée.
- **Tracé** : style épuré inspiré de *Mini Metro* — chaque tronçon est redressé en segments horizontaux, verticaux ou à 45°, et les lignes qui partagent un même tronçon sont décalées parallèlement. Le tracé suit donc la géographie réelle sans en reproduire les courbes exactes.
- **Fond de carte** (`src/data/geography.ts`) : Seine, îles de la Cité et Saint-Louis, boulevard périphérique, bois de Boulogne et de Vincennes, principaux parcs et une douzaine de monuments-repères (tour Eiffel, Arc de Triomphe, Sacré-Cœur, Notre-Dame, Louvre, Panthéon…). Contours **simplifiés dessinés à la main** à partir de coordonnées approximatives, à seule fin de repérage.
- Les étiquettes sont placées par un algorithme glouton anti-collision ; les couleurs de ligne sont proches des couleurs officielles, pour la lisibilité.

## 2. Paramètres de modèle (valeurs configurées)

Ordres de grandeur publics arrondis, **pas des données d'exploitation** :

| Ligne | Fréquence de pointe (trains/h) | Max | Capacité d'une rame | Rames de réserve | Vitesse commerciale (km/h) |
|---|---|---|---|---|---|
| 1 | 38 | 42 | 720 | 6 | 30 |
| 2 | 30 | 34 | 560 | 6 | 25 |
| 3 | 26 | 30 | 560 | 6 | 25 |
| 3bis | 12 | 16 | 280 | 2 | 22 |
| 4 | 34 | 40 | 720 | 10 | 24 |
| 5 | 28 | 32 | 560 | 6 | 27 |
| 6 | 28 | 32 | 560 | 6 | 26 |
| 7 | 30 (tronc), 15 par branche | 36 | 574 | 12 | 25 |
| 7bis | 12 | 16 | 290 | 2 | 20 |
| 8 | 26 | 30 | 560 | 8 | 27 |
| 9 | 30 | 36 | 620 | 13 | 23 |
| 10 | 22 | 26 | 560 | 6 | 24 |
| 11 | 24 | 28 | 560 | 6 | 27 |
| 12 | 26 | 30 | 560 | 6 | 26 |
| 13 | 32 (tronc), 16 par branche | 36 | 574 | 8 | 30 |
| 14 | 40 | 42 | 950 | 6 | 40 |

- Temps de parcours : dérivés de la distance entre stations (positions approximatives) et de la vitesse commerciale de la ligne, avec 20 s d'arrêt et un minimum de 60 s. Des valeurs explicites peuvent être saisies dans `SEGMENT_TIME_OVERRIDES` (aucune actuellement).
- Correspondances : 180 s par défaut, 210–300 s dans les grandes stations (Châtelet, Montparnasse, Gare de Lyon, Gare de l'Est, Nation).
- Capacité des quais : 250 voyageurs par quai, valeurs majorées pour les grands pôles.
- Poids résidentiels / emplois des stations : **synthétiques**, calculés à partir de la distance au centre des affaires et d'un bonus pour quelques pôles d'emploi (`EMPLOYMENT_BONUS`).
- Coûts : 0,6 k€ fictif par rame et par heure, 4 k€ fictifs par rame de réserve mobilisée.

## 3. Données générées

La demande (nombre de voyageurs, origines, destinations) est **entièrement synthétique** : volume de pointe calibré à 420 000 entrées/heure pour l'ensemble du métro, profil horaire type, modèle gravitaire. Elle ne reproduit pas les déplacements réels et ne doit pas être présentée comme une mesure RATP ou IDFM. Voir `docs/MODEL.md`.

## 4. Améliorations recommandées des données

1. Script d'import du GTFS IDFM (hors ligne, une fois) pour générer `lines.ts` et vérifier l'ordre des stations, les identifiants stables et les temps de parcours.
2. Calage des poids de stations sur le « trafic annuel entrant » RATP (en conservant la mention de la source).
3. Remplacement des positions approximatives par les coordonnées officielles des stations, et des contours simplifiés par un fond OpenStreetMap généralisé (ODbL).
4. Ajout du RER (A, B) : le modèle accepte de nouvelles lignes sans réécriture.
