'use client';

import { Flag, Target, Trophy } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { SCENARIOS } from '@/data/scenarios';
import { DIFFICULTY_TOLERANCE, MEDAL_THRESHOLDS, SCORE_RULES } from '@/engine/scoring';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSimulation } from '@/store/simulationStore';
import { Button, cx, Panel } from '../ui/primitives';
import { MedalBadge, ResultContent } from './ResultModal';
import { DIFFICULTY_STYLE } from './ScenarioSelector';

export function ChallengeScreen() {
  const router = useRouter();
  const progress = useSimulation((s) => s.progress);
  const result = useSimulation((s) => s.result);
  const title = useSimulation((s) => s.scenarioTitle);
  const challenges = SCENARIOS.filter((s) => s.id !== 'libre');
  const medals = Object.values(progress).filter((p) => p.medal);

  return (
    <div className="panel-scroll h-full">
      <div className="mx-auto max-w-7xl space-y-4 p-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <Trophy size={18} className="text-amber-300" /> Défis
            </h1>
            <p className="text-xs text-muted">Relevez un défi : jouez le scénario jusqu&apos;à la fin du temps imparti. Le score est calculé par le moteur selon des règles publiques.</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-edge bg-panel-2 px-3 py-2 text-xs">
            <span className="text-muted">Médailles</span>
            {(['or', 'argent', 'bronze'] as const).map((m) => (
              <span key={m} className="flex items-center gap-1">
                <MedalBadge medal={m} size={18} /> {medals.filter((p) => p.medal === m).length}
              </span>
            ))}
            <span className="text-muted">· {Object.keys(progress).length}/{challenges.length} défis joués</span>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {challenges.map((sc) => {
            const p = progress[sc.id];
            return (
              <article key={sc.id} className="flex flex-col rounded-lg border border-edge bg-panel-2 p-4">
                <div className="mb-1 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{sc.title}</h3>
                  <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', DIFFICULTY_STYLE[sc.difficulty])}>{sc.difficulty}</span>
                </div>
                <p className="mb-2 text-xs text-ink/85">{sc.objective}</p>
                <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Objectifs</div>
                <ul className="mb-3 space-y-0.5 text-[11px]">
                  {sc.objectives.map((o) => (
                    <li key={o.id} className="flex items-center gap-1.5">
                      {o.primary ? <Target size={11} className="text-accent" /> : <Flag size={11} className="text-faint" />}
                      <span className={o.primary ? 'text-ink' : 'text-muted'}>{o.label}</span>
                      {!o.primary && <span className="text-[10px] text-faint">(secondaire)</span>}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[11px] text-muted">
                    {p ? (
                      <>
                        <MedalBadge medal={p.medal} size={24} />
                        Meilleur : <span className="tabular font-semibold text-ink">{p.bestScore}</span> pts · {p.attempts} essai(s)
                      </>
                    ) : (
                      <>
                        {fmtClock(sc.startTime)} → {fmtClock(sc.startTime + sc.duration)} · jamais joué
                      </>
                    )}
                  </span>
                  <Button
                    variant="primary"
                    onClick={() => {
                      controller.loadScenario(sc.id, true);
                      router.push('/');
                    }}
                  >
                    Relever le défi
                  </Button>
                </div>
              </article>
            );
          })}
        </div>

        <Panel title="Règles du score (aucun critère caché)">
          <div className="grid grid-cols-1 gap-4 text-xs md:grid-cols-2">
            <div>
              <table className="w-full">
                <thead className="text-left text-[10px] uppercase text-faint">
                  <tr>
                    <th className="py-1">Critère</th>
                    <th>Poids</th>
                    <th>100 pts</th>
                    <th>0 pt</th>
                  </tr>
                </thead>
                <tbody>
                  {SCORE_RULES.map((r) => (
                    <tr key={r.key} className="border-t border-edge">
                      <td className="py-1">{r.label}</td>
                      <td className="tabular">{r.weight} %</td>
                      <td className="tabular">
                        {r.good} {r.unit}
                      </td>
                      <td className="tabular">
                        {r.bad} {r.unit}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="space-y-1.5 text-[11px] leading-relaxed text-ink/85">
              <li>• Chaque critère donne un sous-score de 0 à 100 par interpolation linéaire entre les seuils ; total = Σ sous-score × poids / 10, sur 1000.</li>
              <li>
                • Difficulté : les seuils (hors coût) sont multipliés par {DIFFICULTY_TOLERANCE.facile} en facile, {DIFFICULTY_TOLERANCE.normal} en normal, {DIFFICULTY_TOLERANCE.difficile} en difficile.
              </li>
              <li>• Budget = coût de la simulation nominale (même graine, sans incident ni intervention) × (1 + marge du scénario).</li>
              <li>
                • Médaille uniquement si tous les objectifs principaux sont atteints : or ≥ {MEDAL_THRESHOLDS.or}, argent ≥ {MEDAL_THRESHOLDS.argent}, bronze sinon.
              </li>
              <li>• « Congestion résorbée » : premier instant après la fin du dernier incident où les tronçons saturés et les voyageurs à quai reviennent au niveau de la simulation nominale sans incident (marge : +2 tronçons, +10 % + 300 voyageurs).</li>
            </ul>
          </div>
        </Panel>

        {result && (
          <Panel title={`Dernier bilan — ${title}`}>
            <ResultContent result={result} />
          </Panel>
        )}
      </div>
    </div>
  );
}
