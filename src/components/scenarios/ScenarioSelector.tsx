'use client';

import { Clock, Download, FileUp, Play, RotateCcw, Save, Settings2, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { SCENARIOS } from '@/data/scenarios';
import { INCIDENT_TYPE_INFO } from '@/engine/incidentManager';
import { downloadText, historyToCsv, runToJson } from '@/lib/export';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSimulation } from '@/store/simulationStore';
import type { Difficulty, SavedScenario } from '@/types/scenario';
import { MedalBadge } from './ResultModal';
import { Button, ConfirmDialog, cx, Panel } from '../ui/primitives';

export const DIFFICULTY_STYLE: Record<Difficulty, string> = {
  facile: 'bg-emerald-500/15 text-emerald-300',
  normal: 'bg-sky-500/15 text-sky-300',
  difficile: 'bg-red-500/15 text-red-300',
};

export function ScenarioSelector() {
  const router = useRouter();
  const current = useSimulation((s) => s.scenarioId);
  const progress = useSimulation((s) => s.progress);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
      {SCENARIOS.map((sc) => {
        const p = progress[sc.id];
        return (
          <article key={sc.id} className={cx('flex flex-col rounded-lg border bg-panel-2 p-4', current === sc.id ? 'border-accent/60' : 'border-edge')}>
            <div className="mb-2 flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-snug">{sc.title}</h3>
              <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', DIFFICULTY_STYLE[sc.difficulty])}>{sc.difficulty}</span>
            </div>
            <div className="mb-2 flex items-center gap-3 text-[11px] text-muted">
              <span className="flex items-center gap-1">
                <Clock size={11} /> {fmtClock(sc.startTime)} → {fmtClock(sc.startTime + sc.duration)}
              </span>
              <span>demande ×{sc.demandScale}</span>
              <span>graine {sc.seed}</span>
            </div>
            <p className="mb-2 text-xs leading-relaxed text-ink/85">{sc.description}</p>
            <p className="mb-2 text-xs leading-relaxed text-accent/90">
              <span className="font-semibold">Objectif : </span>
              {sc.objective}
            </p>
            {sc.incidents.length > 0 && (
              <ul className="mb-2 space-y-0.5 text-[11px] text-muted">
                {sc.incidents.map((i, k) => (
                  <li key={k}>
                    • {fmtClock(sc.startTime + i.offset)} — {INCIDENT_TYPE_INFO[i.type].label}
                    {i.duration ? ` (${Math.round(i.duration / 60)} min)` : ''}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-auto flex items-center justify-between pt-2">
              <div className="flex items-center gap-2 text-[11px] text-muted">
                {p ? (
                  <>
                    <MedalBadge medal={p.medal} size={22} /> meilleur score {p.bestScore} · {p.attempts} essai(s)
                  </>
                ) : (
                  'Pas encore joué'
                )}
              </div>
              <Button
                variant="primary"
                onClick={() => {
                  controller.loadScenario(sc.id);
                  router.push('/');
                }}
              >
                <Play size={13} /> Charger
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Paramètres avancés : graine, volume de demande, horaires (scénario personnalisé reproductible). */
export function AdvancedLauncher() {
  const router = useRouter();
  const cfg = controller.currentConfig;
  const scenarioId = useSimulation((s) => s.scenarioId) ?? SCENARIOS[0].id;
  const [base, setBase] = useState(scenarioId);
  const [seed, setSeed] = useState(String(cfg?.seed ?? 1));
  const [demand, setDemand] = useState(String(cfg?.demandScale ?? 1));
  const [start, setStart] = useState(fmtClock(cfg?.startTime ?? 27000));
  const [duration, setDuration] = useState(String(Math.round((cfg?.duration ?? 7200) / 60)));
  const [error, setError] = useState<string | null>(null);
  const launch = () => {
    const s = Number(seed);
    const d = Number(demand.replace(',', '.'));
    const [h, m] = start.split(':').map(Number);
    const dur = Number(duration);
    if (!Number.isInteger(s) || s < 0) return setError('Graine : entier positif attendu.');
    if (!(d >= 0.2 && d <= 2.5)) return setError('Demande : entre 0,2 et 2,5.');
    if (!Number.isFinite(h) || !Number.isFinite(m)) return setError('Heure de début invalide.');
    if (!(dur >= 15 && dur <= 360)) return setError('Durée : entre 15 et 360 minutes.');
    setError(null);
    controller.loadScenario(base, false, { seed: s, demandScale: d, startTime: h * 3600 + m * 60, duration: dur * 60 });
    router.push('/');
  };
  return (
    <div className="space-y-3 text-xs">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <label className="col-span-2 flex flex-col gap-1 sm:col-span-1">
          <span className="text-muted">Scénario de base</span>
          <select value={base} onChange={(e) => setBase(e.target.value)}>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Graine aléatoire</span>
          <input type="number" value={seed} onChange={(e) => setSeed(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Demande (×)</span>
          <input type="number" step="0.05" value={demand} onChange={(e) => setDemand(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Début</span>
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-muted">Durée (min)</span>
          <input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} />
        </label>
      </div>
      {error && <p className="text-red-300">{error}</p>}
      <p className="text-[11px] text-faint">
        Les incidents du scénario de base sont conservés (décalés depuis la nouvelle heure de début). Même graine + mêmes paramètres + mêmes actions = même simulation.
      </p>
      <Button variant="primary" onClick={launch}>
        <Settings2 size={13} /> Lancer avec ces paramètres
      </Button>
    </div>
  );
}

export function SavedScenarios() {
  const router = useRouter();
  const saves = useSimulation((s) => s.saves);
  const fileRef = useRef<HTMLInputElement>(null);
  const [toDelete, setToDelete] = useState<SavedScenario | null>(null);
  const [name, setName] = useState('');
  return (
    <div className="space-y-3 text-xs">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (controller.saveCurrent(name)) setName('');
        }}
      >
        <input type="text" className="flex-1" placeholder="Nom de la sauvegarde de la partie en cours" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        <Button type="submit" variant="primary">
          <Save size={13} /> Sauvegarder
        </Button>
        <Button onClick={() => fileRef.current?.click()} title="Importer un fichier de sauvegarde JSON">
          <Upload size={13} /> Importer
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            try {
              const raw = JSON.parse(await f.text());
              if (await controller.loadSave(raw)) router.push('/');
            } catch {
              useSimulation.setState({ notice: { level: 'error', message: 'Fichier illisible : JSON invalide.', id: Date.now() } });
            }
          }}
        />
      </form>
      {saves.length === 0 ? (
        <p className="text-faint">Aucune sauvegarde locale. Les sauvegardes sont stockées dans ce navigateur (localStorage).</p>
      ) : (
        <table className="w-full">
          <thead className="text-left text-[10px] uppercase text-faint">
            <tr>
              <th className="py-1">Nom</th>
              <th>Base</th>
              <th>Point de reprise</th>
              <th>Actions</th>
              <th>Enregistrée</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...saves].reverse().map((s) => (
              <tr key={s.id} className="border-t border-edge">
                <td className="py-1.5 font-medium">{s.name}</td>
                <td className="text-muted">{SCENARIOS.find((x) => x.id === s.baseScenarioId)?.title ?? 'personnalisé'}</td>
                <td className="tabular">{fmtClock(s.savedTime)}</td>
                <td className="tabular">{s.actions.length}</td>
                <td className="text-muted">{new Date(s.savedAt).toLocaleString('fr-FR')}</td>
                <td className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="xs" variant="primary" onClick={async () => (await controller.loadSave(s)) && router.push('/')}>
                      <RotateCcw size={11} /> Reprendre
                    </Button>
                    <Button size="xs" onClick={() => downloadText(`${s.name.replace(/[^\w-]+/g, '_')}.metroflow.json`, JSON.stringify(s, null, 2), 'application/json')}>
                      <FileUp size={11} /> Exporter
                    </Button>
                    <Button size="xs" variant="ghost" aria-label="Supprimer" onClick={() => setToDelete(s)}>
                      <Trash2 size={11} />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <ConfirmDialog
        open={!!toDelete}
        title="Supprimer la sauvegarde ?"
        message={`« ${toDelete?.name} » sera définitivement supprimée de ce navigateur.`}
        confirmLabel="Supprimer"
        onCancel={() => setToDelete(null)}
        onConfirm={() => {
          if (toDelete) controller.deleteSave(toDelete.id);
          setToDelete(null);
        }}
      />
    </div>
  );
}

export function ExportPanel() {
  const title = useSimulation((s) => s.scenarioTitle);
  const historyLen = useSimulation((s) => s.history.length);
  return (
    <Panel title="Exporter les résultats de la partie en cours">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted">
          {title} — {historyLen} minute(s) simulée(s)
        </span>
        <Button
          onClick={() => {
            const d = controller.exportData();
            if (d) downloadText('metroflow-historique.csv', historyToCsv(d.history, d.referenceHistory), 'text/csv');
          }}
        >
          <Download size={13} /> CSV (minute par minute)
        </Button>
        <Button
          onClick={() => {
            const d = controller.exportData();
            if (d) downloadText('metroflow-partie.json', runToJson(d), 'application/json');
          }}
        >
          <Download size={13} /> JSON complet
        </Button>
        <Button onClick={() => controller.recordRun(title)}>
          <Save size={13} /> Enregistrer pour comparaison
        </Button>
      </div>
    </Panel>
  );
}
