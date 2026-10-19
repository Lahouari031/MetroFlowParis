'use client';

import { Award, CheckCircle2, Download, RotateCcw, Save, XCircle } from 'lucide-react';
import { SCORE_RULES, MEDAL_THRESHOLDS } from '@/engine/scoring';
import { downloadText, historyToCsv, runToJson } from '@/lib/export';
import { fmtNum } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSimulation } from '@/store/simulationStore';
import type { Medal, ScoreResult } from '@/types/scenario';
import { Button, cx, Modal } from '../ui/primitives';

export const MEDAL_STYLE: Record<Exclude<Medal, null>, { label: string; color: string; ring: string }> = {
  or: { label: 'Médaille d’or', color: '#fbbf24', ring: 'ring-amber-300/60' },
  argent: { label: 'Médaille d’argent', color: '#cbd5e1', ring: 'ring-slate-300/60' },
  bronze: { label: 'Médaille de bronze', color: '#d97706', ring: 'ring-orange-500/60' },
};

export function MedalBadge({ medal, size = 40 }: { medal: Medal; size?: number }) {
  if (!medal) return null;
  const st = MEDAL_STYLE[medal];
  return (
    <span
      className={cx('inline-flex items-center justify-center rounded-full ring-2', st.ring)}
      style={{ width: size, height: size, background: `radial-gradient(circle at 35% 30%, #fff8, ${st.color} 60%)` }}
      title={st.label}
    >
      <Award size={size * 0.55} color="#1a1205" />
    </span>
  );
}

export function ResultModal() {
  const result = useSimulation((s) => s.result);
  const open = useSimulation((s) => s.resultOpen);
  const title = useSimulation((s) => s.scenarioTitle);
  if (!result) return null;
  return (
    <Modal open={open} onClose={() => controller.closeResult()} title={`Bilan — ${title}`} width="max-w-3xl">
      <ResultContent result={result} />
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Button
          onClick={async () => {
            const data = await controller.exportData();
            if (data) downloadText('metroflow-resultats.csv', historyToCsv(data.history, data.referenceHistory), 'text/csv');
          }}
        >
          <Download size={14} /> CSV
        </Button>
        <Button
          onClick={async () => {
            const data = await controller.exportData();
            if (data) downloadText('metroflow-resultats.json', runToJson(data), 'application/json');
          }}
        >
          <Download size={14} /> JSON
        </Button>
        <Button onClick={() => controller.recordRun(title)} title="Enregistrer pour la comparaison (écran Statistiques)">
          <Save size={14} /> Enregistrer pour comparer
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            controller.closeResult();
            controller.restart();
          }}
        >
          <RotateCcw size={14} /> Rejouer
        </Button>
      </div>
    </Modal>
  );
}

export function ResultContent({ result }: { result: ScoreResult }) {
  return (
    <div className="space-y-5 text-sm">
      <div className="flex items-center gap-5 rounded-lg border border-edge bg-panel-2 p-4">
        <div className="text-center">
          <div className="tabular text-4xl font-bold text-accent">{result.total}</div>
          <div className="text-[11px] text-muted">/ 1000 points</div>
        </div>
        <div className="flex-1">
          <div className={cx('mb-1 flex items-center gap-2 font-semibold', result.success ? 'text-emerald-700' : 'text-red-600')}>
            {result.success ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
            {result.success ? 'Objectifs principaux atteints' : 'Objectifs principaux non atteints'}
          </div>
          <p className="text-xs text-muted">
            Médaille si tous les objectifs principaux sont atteints : or ≥ {MEDAL_THRESHOLDS.or} pts, argent ≥ {MEDAL_THRESHOLDS.argent} pts, bronze sinon.
          </p>
        </div>
        <MedalBadge medal={result.medal} size={52} />
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Objectifs</h3>
        <ul className="space-y-1">
          {result.objectives.map((o) => (
            <li key={o.objective.id} className="flex items-center gap-2 rounded border border-edge px-2.5 py-1.5 text-xs">
              {o.achieved ? <CheckCircle2 size={14} className="text-emerald-600" /> : <XCircle size={14} className="text-red-600" />}
              <span className="flex-1">
                {o.objective.label}
                {!o.objective.primary && <span className="ml-1.5 text-[10px] text-faint">(secondaire)</span>}
              </span>
              <span className="tabular text-muted">
                {Number.isFinite(o.value) ? fmtNum(o.value, 1) : 'non résorbée'} {Number.isFinite(o.value) ? o.objective.unit : ''}
              </span>
            </li>
          ))}
          {result.objectives.length === 0 && <li className="text-xs text-faint">Aucun objectif défini.</li>}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Détail du score (règles publiques)</h3>
        <table className="w-full text-xs">
          <thead className="text-left text-[10px] uppercase text-faint">
            <tr>
              <th className="py-1">Critère</th>
              <th className="w-24">Valeur</th>
              <th className="w-24">Sous-score</th>
              <th className="w-14">Poids</th>
              <th className="w-14 text-right">Points</th>
            </tr>
          </thead>
          <tbody>
            {result.breakdown.map((b) => (
              <tr key={b.key} className="border-t border-edge align-top" title={b.explanation}>
                <td className="py-1.5 pr-2">
                  <div>{b.label}</div>
                  <div className="text-[10px] leading-snug text-faint">{b.explanation}</div>
                </td>
                <td className="tabular whitespace-nowrap">
                  {fmtNum(b.value, 2)} {b.unit}
                </td>
                <td>
                  <div className="h-1.5 w-20 overflow-hidden rounded bg-panel-3">
                    <div className="h-full bg-accent" style={{ width: `${b.score}%` }} />
                  </div>
                  <span className="tabular text-[10px] text-muted">{b.score}/100</span>
                </td>
                <td className="tabular">{b.weight} %</td>
                <td className="tabular text-right font-semibold">{Math.round((b.score * b.weight) / 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[10px] text-faint">
          Score = Σ sous-score × poids / 10 (total sur 1000). Pondérations : {SCORE_RULES.map((r) => `${r.label.toLowerCase()} ${r.weight} %`).join(', ')}.
          Les valeurs proviennent du moteur de simulation (demande synthétique), pas de mesures réelles.
        </p>
      </div>
    </div>
  );
}
