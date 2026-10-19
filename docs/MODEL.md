# Modèle de simulation — règles de calcul, hypothèses et limites

Le moteur (`src/engine/`) est écrit en TypeScript pur, sans dépendance à React. Il peut être exécuté dans un test, un script Node, un Web Worker ou être porté vers un backend Python/FastAPI.

## 1. Graphe

- **Nœuds de routage** : entrée E(s) et sortie X(s) de chaque station, et un quai P(s, ligne, sens) par ligne et par sens.
- **Arcs** : attente (E → P, ½ intervalle), parcours (P → P', temps du tronçon), correspondance (P → P'' dans la même station), sortie (P → X), correspondance piétonne (X(s) → E(t)).
- **Plus court chemin** : Dijkstra avec tas binaire (`pathfinding.ts`). Coût généralisé :
  `temps de parcours × (1 + poids_encombrement × pénalité(saturation)) + 1,5 × attente + correspondance (marche + pénalité)`
  avec `pénalité(s) = 2 × max(0, s − 0,7)²`.

## 2. Demande synthétique (`demandGenerator.ts`)

- Volume total : `210 000 entrées/h × profil(heure) × multiplicateur de demande`. Le profil horaire est interpolé entre des points fixes (creux de nuit, montée 6–8 h, pointe 8 h 30, creux de journée, pointe 18 h 15, soirée).
- Trois motifs pondérés selon l'heure : domicile → travail (gaussienne centrée sur 8 h 30), travail → domicile (18 h), autres déplacements (constant).
- Émission d'une station ∝ poids résidentiel (matin) / emplois (soir) / moyenne (autres) × bonus de correspondance.
- Destination : modèle gravitaire `attractivité × exp(−temps / 25 min)`, trajets de moins de 5 min fortement réduits.
- Génération chaque minute simulée, en « cohortes » (groupes de voyageurs de taille réelle, éventuellement fractionnaire).
- **Reproductibilité** : générateur mulberry32 initialisé par la graine. Le moteur consomme toujours le même nombre de tirages par minute, quel que soit l'état du réseau ; l'affluence exceptionnelle utilise un flux aléatoire séparé. Deux simulations de même graine reçoivent donc exactement la même demande, ce qui permet de comparer des stratégies.
- Un **préchauffage** de 30 min simulées avant l'heure de début charge le réseau ; les compteurs cumulés sont remis à zéro ensuite.

## 3. Affectation des itinéraires (`passengerAssignment.ts`)

- Pour chaque origine, trois arbres de plus courts chemins : profil standard, « évitement de la congestion » (encombrement ×4), « moins de correspondances » (pénalité 480 s).
- Les itinéraires distincts sont évalués au coût standard ; ceux qui dépassent `1,35 × coût minimal + 240 s` sont écartés ; les autres sont répartis par un **logit** de paramètre θ = 240 s ; les parts < 5 % sont supprimées.
- Les arbres sont recalculés immédiatement après tout changement d'état du réseau (incident, fermeture, fréquence), et rafraîchis toutes les 5 minutes simulées pour tenir compte de l'encombrement.
- **Recalcul des voyageurs déjà en route** : après un changement, chaque cohorte à quai vérifie son itinéraire restant ; s'il est devenu impossible, ou s'il coûte plus que `meilleur + max(300 s, 20 %)`, elle change d'itinéraire. Les cohortes en train sont vérifiées à la station suivante. Une cohorte qui attend plus de 10 minutes (refus d'embarquement) cherche aussi une alternative.

## 4. Dynamique (`simulationEngine.ts`)

Pas de temps : **10 s simulées** (configurable). À chaque pas :

1. démarrage / expiration des incidents ;
2. génération de la demande (chaque minute) ;
3. arrivées en station : poursuite à bord, correspondance (marche puis attente de ½ intervalle), correspondance piétonne, sortie ;
4. **embarquement limité par la capacité** de chaque arc orienté pendant le pas (`capacité/h × pas / 3600`) : d'abord les voyageurs déjà à bord, puis la file du quai dans l'ordre d'arrivée. Le dépassement éventuel dû à une cohorte entière est reporté au pas suivant (dette de capacité), ce qui conserve le débit moyen exact sans scinder les cohortes ;
5. mise à jour des indicateurs.

Conséquences :

- quand la demande dépasse la capacité, la file d'attente grossit **progressivement** ;
- quand la capacité revient, la file se vide au rythme de la capacité disponible : le retour à la normale n'est **pas instantané** ;
- un train retenu (capacité réduite) bloque aussi les voyageurs à bord, qui comptent comme « affectés ».

Capacité d'un arc : `fréquence effective × part de service × capacité d'une rame × facteur d'incident`.
Fréquence effective : `min(fréquence programmée × facteur global, fréquence max., flotte disponible × 3600 / temps de cycle) × facteur d'incident`. Un ralentissement allonge le temps de cycle : à flotte constante, la fréquence réelle baisse.

## 5. Indicateurs

| Indicateur | Définition |
|---|---|
| **Taux de saturation d'un tronçon** | `(débit lissé sur 5 min + file d'attente × 3600 / 600 s) / capacité` ; sens le plus chargé pour la couleur du tronçon. C'est un rapport demande / capacité sur l'intervalle : il dépasse 100 % quand une file se forme. |
| Voyageurs par intervalle | débit transporté (voyageurs/h), moyenne glissante 5 min |
| Retard estimé d'un tronçon | allongement du temps de parcours + attente due à la file (`file / capacité`) |
| Variation vs référence | `(débit − débit de référence) / débit de référence` |
| Densité (heatmap) | voyageurs à quai / capacité des quais (couleur) ; entrées + sorties par heure (taille) |
| Retard moyen | moyenne pondérée, sur ~10 min, de `durée réelle − durée de référence` des trajets terminés ; la référence est le plus rapide trajet en conditions nominales |
| Attente moyenne | attente à quai avant embarquement (½ intervalle + refus), moyenne glissante 10 min |
| Voyageurs affectés | voyageurs ayant subi un incident : tronçon ou station perturbés, itinéraire recalculé, report vers une autre station, renoncement |
| Qualité de service | `100 − 50·min(1, retard/10 min) − 30·min(1, 3·part de tronçons saturés) − 20·min(1, attente/10 min)` |
| Coût opérationnel | rames en service × 0,6 k€/h + 4 k€ par rame de réserve mobilisée (fictif) |

Seuils de couleur par défaut : 40 / 65 / 85 / 100 %. Le KPI « tronçons saturés » utilise le seuil de 85 %.

Deux simulations parallèles servent de comparaison :

- la **référence** (même scénario, mêmes incidents programmés, aucune intervention du joueur), calculée en continu : « que se serait-il passé sans mes décisions ? » ;
- la simulation **nominale** (même graine, aucun incident ni intervention), calculée en fin de partie : base du budget et de la mesure de résorption.

## 6. Perturbations (`incidentManager.ts`)

Chaque incident est converti en **effets élémentaires explicites**, visibles et décochables dans le formulaire. Paramètres par gravité (faible / moyenne / élevée) ; atténuation ×0,5 par inter-station de rayon :

| Type | Effets |
|---|---|
| Malaise voyageur | +60 / 150 / 300 s de parcours et capacité ×0,85 / 0,6 / 0,35 sur les tronçons adjacents ; fréquence de la ligne ×0,9 en gravité élevée. La station **reste ouverte**. |
| Fermeture de station | station fermée (pas d'entrée, sortie, correspondance) ; trains sans arrêt, ou circulation interrompue en option. Les voyageurs à quai sont évacués vers la station ouverte la plus proche (6 min de marche). |
| Interruption de tronçon | tronçon retiré du graphe |
| Panne technique | temps ×1,3 / 1,6 / 2,2 et capacité ×0,75 / 0,5 / 0,3 |
| Ralentissement de ligne | temps ×1,15 / 1,3 / 1,5 sur toute la ligne |
| Réduction de fréquence | fréquence ×0,85 / 0,7 / 0,5 |
| Retard important | +180 / 360 / 600 s et capacité ×0,7 / 0,5 / 0,35, rayon 2 par défaut |
| Affluence exceptionnelle | demande émise et attirée ×2 / 4 / 8 (station) et atténuée autour |
| Incident de correspondance | correspondances +180 / 420 s, ou impossibles (gravité élevée) |
| Retour à la normale | lève les incidents actifs de la cible |

Cycle de vie : programmé → actif → (suspendu ↔ actif) → levé (durée écoulée ou levée manuelle), avec historique horodaté. Les incidents peuvent être prolongés et leur gravité modifiée.

Voyageurs dont l'origine ou la destination est fermée : report vers la station ouverte la plus proche (≤ 15 min). S'il n'existe plus aucun itinéraire dans le réseau simulé, le voyageur est compté comme « sans itinéraire » (report hors métro).

## 7. Score (`scoring.ts`)

| Critère | Poids | 100 pts | 0 pt |
|---|---|---|---|
| Attente moyenne | 20 % | 0,75 min | 2,5 min |
| Retard moyen | 30 % | 0,2 min | 3 min |
| Voyageurs affectés | 15 % | 1 % | 15 % |
| Tronçons saturés (part moyenne) | 20 % | 1 % | 12 % |
| Coût / budget | 15 % | 100 % | 140 % |

- Interpolation linéaire, total = Σ sous-score × poids / 10 (sur 1000).
- Difficulté : seuils (hors coût) × 1,3 en facile, × 0,75 en difficile.
- Budget = coût de la simulation nominale × (1 + marge du scénario).
- « Congestion résorbée » : minutes entre la fin du dernier incident et le premier instant où les tronçons saturés ≤ nominal + 2 et les voyageurs à quai ≤ nominal × 1,1 + 300.
- Médaille seulement si tous les objectifs principaux sont atteints : or ≥ 850, argent ≥ 700, bronze sinon.
- Les objectifs de chaque défi ont été calibrés par simulation : sans régulation, au moins un objectif principal échoue ; une stratégie de régulation de référence réussit (vérifié par `tests/scoring.test.ts`).

## 8. Limites connues

- **Demande synthétique** : aucune donnée de fréquentation réelle ; les volumes absolus et la répartition géographique ne doivent pas être interprétés comme des mesures.
- **Sous-réseau** : 5 lignes sur 16 ; les voyageurs ne peuvent pas emprunter les lignes non modélisées, ce qui surestime la charge de certaines alternatives et peut créer des voyageurs « sans itinéraire » (par ex. si la ligne 4 est coupée au nord).
- **Modèle macroscopique** : pas de trains individuels ni d'horaires ; la capacité est un débit continu. Les branches de la ligne 7 sont modélisées par une part de service (½) ; l'attente d'un train d'une branche donnée sur le tronc commun est approximée.
- Les voyageurs à bord sont toujours prioritaires ; la sortie des voyageurs ne libère pas de capacité « au quai » (la capacité est celle du tronçon).
- Pas de choix de mode (bus, RER, marche longue), pas d'élasticité de la demande aux perturbations, sauf report vers une station voisine.
- Temps de parcours dérivés du schéma (sauf exceptions saisies) : ordres de grandeur.
- Le rafraîchissement des itinéraires selon l'encombrement (toutes les 5 min) peut produire de légères oscillations entre alternatives.
- Le moteur tourne dans le fil principal du navigateur : aux vitesses élevées, si le calcul dépasse le budget d'une image, la vitesse effective (affichée) devient inférieure à la vitesse demandée.
