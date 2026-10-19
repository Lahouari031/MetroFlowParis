'use client';

import { CheckCircle2, Clock, Pause, Play, Plus, X } from 'lucide-react';
import { loadNetwork } from '@/data/network';
import { describeEffect, SEVERITY_LABELS } from '@/engine/incidentManager';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSelection, useSimulation } from '@/store/simulationStore';
import type { Incident, Severity } from '@/types/incident';
import { Button, cx, Segmented } from '../ui/primitives';

export const STATUS_LABEL: Record<Incident['status'], string> = {
  scheduled: 'Programmé',
  active: 'Actif',
  suspended: 'Suspendu',
  resolved: 'Levé',
};

const STATUS_STYLE: Record<Incident['status'], string> = {
  scheduled: 'bg-sky-500/15 text-sky-300',
  active: 'bg-red-500/20 text-red-300',
  suspended: 'bg-amber-500/15 text-amber-300',
  resolved: 'bg-slate-500/20 text-slate-300',
};

export function remainingSeconds(inc: Incident): number | null {
  if (inc.duration === null) return null;
  return Math.max(0, inc.duration - inc.elapsed);
}

/** Liste compacte des perturbations (barre latérale gauche). */
export function IncidentList({ showResolved = false }: { showResolved?: boolean }) {
  const incidents = useSimulation((s) => s.snapshot?.incidents ?? []);
  const selected = useSelection((s) => s.selected);
  const list = incidents.filter((i) => showResolved || i.status !== 'resolved').slice().reverse();
  if (list.length === 0) return <p className="text-[11px] text-faint">Aucune perturbation en cours.</p>;
  return (
    <ul className="space-y-1.5">
      {list.map((inc) => {
        const rem = remainingSeconds(inc);
        const isSel = selected?.kind === 'incident' && selected.id === inc.id;
        return (
          <li key={inc.id}>
            <button
              type="button"
              onClick={() => useSelection.getState().select({ kind: 'incident', id: inc.id })}
              className={cx('w-full rounded-md border px-2 py-1.5 text-left transition-colors', isSel ? 'border-accent/60 bg-accent/10' : 'border-edge bg-panel-3/50 hover:border-edge-strong')}
            >
              <div className="flex items-center gap-1.5">
                <span className={cx('rounded px-1 py-px text-[9px] font-semibold uppercase', STATUS_STYLE[inc.status])}>{STATUS_LABEL[inc.status]}</span>
                <span className="text-[10px] text-faint">{inc.id}</span>
                <span className="ml-auto flex items-center gap-1 text-[10px] text-muted">
                  <Clock size={10} />
                  {inc.status === 'scheduled' ? fmtClock(inc.startTime) : rem === null ? '∞' : `${Math.ceil(rem / 60)} min`}
                </span>
              </div>
              <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink/90">{inc.label}</div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Détail d'un incident : cause, horaires, conséquences, actions de gestion et historique. */
export function IncidentDetail({ incident }: { incident: Incident }) {
  const network = loadNetwork().network!;
  const kpis = useSimulation((s) => s.snapshot?.kpis);
  const rem = remainingSeconds(incident);
  const open = incident.status !== 'resolved';
  const id = incident.id;
  return (
    <div className="space-y-3 text-xs">
      <div>
        <div className="flex items-center gap-2">
          <span className={cx('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', STATUS_STYLE[incident.status])}>{STATUS_LABEL[incident.status]}</span>
          <span className="text-faint">{incident.id}</span>
          <span className="text-faint">· {incident.origin === 'scenario' ? 'scénario' : 'déclenché par vous'}</span>
        </div>
        <div className="mt-1 text-sm font-semibold leading-snug">{incident.label}</div>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px]">
        <dt className="text-muted">Début</dt>
        <dd className="tabular">{fmtClock(incident.startTime)}</dd>
        <dt className="text-muted">Durée</dt>
        <dd className="tabular">{incident.duration === null ? 'permanente' : `${Math.round(incident.duration / 60)} min`}</dd>
        <dt className="text-muted">Restant</dt>
        <dd className="tabular">{incident.status === 'resolved' ? '—' : rem === null ? 'jusqu’à levée' : `${Math.ceil(rem / 60)} min`}</dd>
        <dt className="text-muted">Gravité</dt>
        <dd>{SEVERITY_LABELS[incident.severity]}</dd>
        <dt className="text-muted">Rayon</dt>
        <dd>{incident.radius} inter-station(s)</dd>
        {incident.endTime !== undefined && (
          <>
            <dt className="text-muted">Fin</dt>
            <dd className="tabular">{fmtClock(incident.endTime)}</dd>
          </>
        )}
      </dl>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Conséquences appliquées</div>
        <ul className="max-h-32 space-y-0.5 overflow-auto text-[11px] text-ink/85">
          {incident.effects.map((e, i) => (
            <li key={i}>• {describeEffect(network, e)}</li>
          ))}
        </ul>
        {kpis && incident.status === 'active' && (
          <p className="mt-1 text-[10px] text-muted">
            Estimation réseau actuelle : {Math.round(kpis.affectedNow).toLocaleString('fr-FR')} voyageurs affectés en circulation, {kpis.saturatedSegments} tronçon(s) saturé(s).
          </p>
        )}
      </div>

      {open && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {incident.status === 'active' && (
              <Button size="xs" onClick={() => controller.dispatch({ type: 'incident.suspend', incidentId: id })} title="Suspendre : effets désactivés, durée gelée">
                <Pause size={11} /> Suspendre
              </Button>
            )}
            {incident.status === 'suspended' && (
              <Button size="xs" onClick={() => controller.dispatch({ type: 'incident.resume', incidentId: id })}>
                <Play size={11} /> Reprendre
              </Button>
            )}
            {incident.duration !== null && (
              <Button size="xs" onClick={() => controller.dispatch({ type: 'incident.extend', incidentId: id, seconds: 300 })}>
                <Plus size={11} /> 5 min
              </Button>
            )}
            <Button size="xs" variant="success" onClick={() => controller.dispatch({ type: 'incident.resolve', incidentId: id })}>
              <CheckCircle2 size={11} /> Lever l&apos;incident
            </Button>
          </div>
          {!incident.customEffects && incident.type !== 'station_closure' && incident.type !== 'segment_interruption' && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted">Gravité</span>
              <Segmented<Severity>
                size="xs"
                value={incident.severity}
                onChange={(s) => controller.dispatch({ type: 'incident.severity', incidentId: id, severity: s })}
                options={([1, 2, 3] as Severity[]).map((s) => ({ value: s, label: SEVERITY_LABELS[s] }))}
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Historique</div>
        <ul className="space-y-0.5 text-[11px]">
          {incident.history.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span className="tabular text-faint">{fmtClock(h.time)}</span>
              <span className="text-ink/85">{h.action}</span>
            </li>
          ))}
        </ul>
      </div>
      <button type="button" className="flex items-center gap-1 text-[10px] text-faint hover:text-ink" onClick={() => useSelection.getState().select(null)}>
        <X size={10} /> Fermer
      </button>
    </div>
  );
}
