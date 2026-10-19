# MétroFlow Paris

**Anticipez. Régulez. Maîtrisez le réseau.**

![MétroFlow Paris — malaise voyageur à Poissonnière](docs/screenshot.png)

Simulateur interactif de gestion du métro parisien : vous êtes au poste de supervision, vous déclenchez des incidents, observez la propagation des perturbations sur un plan schématique, puis régulez le réseau (fréquences, rames de réserve, fermetures) pour limiter retards et congestion.

> ⚠️ **Simulateur expérimental — pas un outil officiel de la RATP.** La topologie des lignes est celle du réseau réel, mais la **demande de voyageurs est synthétique** : les flux, retards et indicateurs sont générés par le modèle et ne sont pas des mesures RATP ou Île-de-France Mobilités. Voir [`docs/DATA.md`](docs/DATA.md) et [`docs/MODEL.md`](docs/MODEL.md).

## Installation et lancement

Prérequis : Node.js ≥ 20.9.

```bash
npm install
npm run dev          # serveur de développement : http://localhost:3000
```

Version de production :

```bash
npm run build
npm start            # http://localhost:3000
```

Contrôles qualité :

```bash
npm test             # tests automatisés (Vitest)
npm run typecheck    # TypeScript strict
npm run validate:data  # contrôles de cohérence des données du réseau
```

Version autonome sans serveur (un dossier à ouvrir directement dans le navigateur) :

```bash
npm run build:standalone   # génère dist-standalone/index.html
```

Aucune API externe ni clé n'est nécessaire : une fois les dépendances installées, tout fonctionne hors ligne. Les sauvegardes sont stockées dans le navigateur (localStorage).

## Prise en main (2 minutes)

1. La carte s'ouvre sur le scénario « Malaise voyageur à Poissonnière ». Cliquez sur **Reprendre** (ou barre d'espace) et choisissez une vitesse (×1 = 1 minute simulée par seconde).
2. **Cliquez sur Poissonnière** (ligne 7) : le panneau de droite affiche la station. **Ajouter une perturbation** → « Malaise voyageur », gravité élevée, 15 min → **Déclencher**.
3. Observez : marqueur d'incident, tronçons voisins qui passent au rouge, report des voyageurs vers la ligne 4 (Gare de l'Est ↔ Châtelet), alertes, graphiques comparés à la référence (pointillés).
4. Régulez dans **Contrôle du réseau** : mobilisez des rames de réserve (+), augmentez la fréquence des lignes 7 et 4. Mesurez l'effet dans **Statistiques → Performance des mesures de régulation**.
5. À la fin du scénario, le **bilan** donne votre score, les objectifs atteints et une médaille.

### Interactions avec la carte

| Action | Effet |
|---|---|
| Molette | zoom vers le pointeur |
| Glisser | déplacer la carte |
| Clic sur une station / un tronçon | panneau d'informations |
| Double-clic sur une station | centrer et zoomer |
| Boutons + / − / ⤢ | zoom, vue complète |
| Échap | fermer le formulaire, effacer l'itinéraire, désélectionner |
| Barre d'espace | pause / reprise |
| Timeline (bas) | cliquer pour revenir en arrière (rejeu déterministe) ou avancer |

Modes d'affichage : **Tronçons** (couleur par saturation, voyageurs/h, retard ou variation vs référence), **Densité** (heatmap autour des stations), **Mixte** (avec curseur d'opacité). Couches activables : noms, numéros de ligne, correspondances, flux, particules animées, incidents, itinéraires, mini-carte.

## Fonctionnalités

- **Plan schématique SVG** des lignes 1, 4, 7 (deux branches), 9 et 14 — 138 stations, 145 tronçons, correspondances, terminus, branches. Zoom/déplacement (d3-zoom), étiquettes anti-collision, légende, mini-carte.
- **Moteur de simulation** discret (pas de 10 s) : demande synthétique horaire reproductible (graine), affectation multi-itinéraires (Dijkstra + logit), capacités par sens, files d'attente, refus d'embarquement, recalcul des itinéraires après incident, résorption progressive.
- **10 types de perturbations** avec effets explicites et modifiables, gravité, durée, rayon, déclenchement immédiat ou programmé ; suspension, prolongation, changement de gravité, levée, historique. Marqueurs cliquables.
- **Régulation** : fréquence globale et par ligne (curseur + saisie), rames de réserve limitées, fermeture/réouverture de stations et de liaisons (avec confirmation), coût opérationnel fictif.
- **Tableau de bord** : 12 indicateurs avec unités, explications et écart à la référence ; graphiques de fréquentation, saturation par ligne, stations les plus chargées, retards/attentes, voyageurs affectés.
- **Mode expert** (Statistiques) : stations congestionnées, tronçons fragiles, lignes affectées, propagation, attentes, performance de chaque décision ; filtres par ligne, intervalle, type d'incident ; **comparaison A/B** (deux variantes lancées avec la même graine, ou parties enregistrées).
- **6 scénarios** (libre, heure de pointe, malaise à Poissonnière, Châtelet fermée, incidents multiples, pic d'affluence) et **5 défis** avec objectifs mesurables, difficulté, score sur 1000, médailles, bilan et progression sauvegardée.
- **Sauvegarde / reprise** (journal d'actions rejoué à l'identique), import/export JSON, export CSV des résultats, gestion des versions incompatibles.

## Architecture

```
src/
  app/                 routes Next.js (App Router) : / (carte), /statistiques, /scenarios, /defis
  components/
    layout/            AppShell, TopBar, BottomTimeline, LeftSidebar, RightSidebar, MapDashboard
    map/               MetroMap, MetroSegment, StationNode, IncidentMarker, MapLegend, MapControls, MiniMap
    simulation/        IncidentForm, IncidentList, NetworkControls
    dashboard/         KPIGrid, charts, SelectionPanels, StatisticsScreen
    scenarios/         ScenarioSelector, ChallengePanel, ResultModal
    ui/                composants réutilisables
  data/                lignes, stations, correspondances, scénarios (données de référence + paramètres)
  engine/              moteur pur TypeScript : graph, pathfinding, demandGenerator, passengerAssignment,
                       networkState, incidentManager, simulationEngine, scoring, defaults, rng
  lib/                 simulationController (pont moteur ↔ UI), persistence, export, metrics, comparison
  store/               Zustand : simulationStore, settingsStore, mapViewStore
  types/               network, incident, simulation, scenario
tests/                 Vitest
docs/                  DATA.md (sources, licences), MODEL.md (règles de calcul, limites)
```

Séparation stricte : le **moteur** (`src/engine`) ne dépend ni de React ni du navigateur ; le **contrôleur** (`src/lib/simulationController.ts`) fait tourner la boucle `requestAnimationFrame` hors React, à une vitesse simulée indépendante du rendu, et publie des instantanés dans le store à ~8 Hz. Toute modification passe par des **actions horodatées** (`engine.applyAction`) : c'est ce journal qui permet le rejeu, la timeline et les sauvegardes. Pour passer à un Web Worker ou à un backend Python/FastAPI, il suffit de remplacer le contrôleur par un pont qui transmet ces actions et reçoit ces instantanés. La persistance passe par une interface `StorageBackend` (remplaçable par PostgreSQL/Supabase).

Stack : Next.js 16 (App Router, Turbopack), React 19, TypeScript strict, Tailwind CSS 4, Zustand, Recharts, Lucide, d3-zoom, Vitest.

## Tests

`npm test` couvre notamment : connexions du graphe et validation des données ; itinéraire entre deux stations ; impossibilité de traverser un tronçon fermé ; effet d'une fermeture de station ; création, suspension, prolongation et fin d'un incident ; cohérence des taux de saturation ; hausse de la congestion quand la demande dépasse la capacité ; retour progressif ; reproductibilité avec graine fixe ; rejeu du journal ; cohérence du score ; défis impossibles sans régulation et réalisables avec une stratégie de référence ; sauvegarde/rechargement et rejet des versions incompatibles.

## État d'avancement

Voir la fin de [`docs/MODEL.md`](docs/MODEL.md) pour les limites du modèle. Fonctionnalités non terminées :

- seules 5 lignes sur 16 (et pas le RER) sont modélisées ;
- données du réseau saisies manuellement, non recoupées automatiquement avec le GTFS IDFM ;
- le moteur tourne dans le fil principal (pas encore de Web Worker) ;
- pas de linter configuré (TypeScript strict et tests seulement) ;
- interface optimisée pour ≥ 1440 × 900 ; utilisable mais dense sur petits écrans, pas de version mobile dédiée.

## Licence

Code sous licence MIT (voir `LICENSE`). Les éventuelles données ouvertes importées à l'avenir restent soumises à leur propre licence (voir `docs/DATA.md`).
