'use client';

import { AlertTriangle, CheckCircle2, Info, RotateCcw, SkipBack, Siren } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { controller } from '@/lib/simulationController';
import { fmtClock } from '@/lib/metrics';
import { useSimulation } from '@/store/simulationStore';
import { useSelection } from '@/store/simulationStore';
import type { EventLevel } from '@/types/simulation';
import { Button, ConfirmDialog, cx, Segmented } from '../ui/primitives';
import { SPEEDS } from './TopBar';

const LEVEL_ICON: Record<EventLevel, typeof Info> = {
  info: Info,
  warning: AlertTriangle,
  critical: Siren,
  success: CheckCircle2,
};
const LEVEL_COLOR: Record<EventLevel, string> = {
  info: 'text-sky-300',
  warning: 'text-amber-300',
  critical: 'text-red-400',
  success: 'text-emerald-300',
};

export function BottomTimeline() {
  const start = useSimulation((s) => s.startTime);
  const end = useSimulation((s) => s.endTime);
  const time = useSimulation((s) => s.snapshot?.time ?? s.startTime);
  const incidents = useSimulation((s) => s.snapshot?.incidents ?? []);
  const actions = useSimulation((s) => s.actions);
  const events = useSimulation((s) => s.events);
  const speed = useSimulation((s) => s.speed);
  const effective = useSimulation((s) => s.effectiveSpeed);
  const running = useSimulation((s) => s.running);
  const [hover, setHover] = useState<number | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);
  const duration = Math.max(1, end - start);
  const pct = (t: number) => `${Math.max(0, Math.min(100, ((t - start) / duration) * 100))}%`;

  const ticks = useMemo(() => {
    const out: number[] = [];
    const first = Math.ceil(start / 900) * 900;
    for (let t = first; t <= end; t += 900) out.push(t);
    return out;
  }, [start, end]);

  const timeAt = (clientX: number) => {
    const r = barRef.current!.getBoundingClientRect();
    return start + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
  };

  const recent = events.slice(-4).reverse();

  return (
    <footer className="flex h-[74px] shrink-0 items-stretch gap-3 border-t border-edge bg-panel px-3 py-2">
      <div className="flex w-[250px] shrink-0 flex-col justify-between">
        <div className="flex items-center gap-1.5">
          <Button size="xs" onClick={() => controller.seek(start)} title="Revenir au début du scénario (rejeu ; les actions postérieures sont abandonnées)">
            <SkipBack size={12} /> Début
          </Button>
          <Button size="xs" onClick={() => setConfirmReset(true)} title="Réinitialiser le scénario : supprime toutes vos actions">
            <RotateCcw size={12} /> Réinitialiser
          </Button>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted">
          <Segmented size="xs" value={speed} onChange={(v) => controller.setSpeed(v)} options={SPEEDS.map((s) => ({ value: s, label: `×${s}` }))} />
          <span className="tabular" title="Vitesse effective : le moteur ralentit si le calcul dépasse le budget d'une image">
            {running ? `eff. ×${effective.toFixed(1)}` : 'en pause'}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <div className="mb-1 flex justify-between text-[10px] text-faint">
          <span className="tabular">{fmtClock(start)}</span>
          <span className="text-muted">Timeline — cliquez pour revenir en arrière (rejeu déterministe) ou avancer</span>
          <span className="tabular">{fmtClock(end)}</span>
        </div>
        <div
          ref={barRef}
          role="slider"
          aria-label="Timeline de simulation"
          aria-valuemin={start}
          aria-valuemax={end}
          aria-valuenow={time}
          aria-valuetext={fmtClock(time)}
          tabIndex={0}
          className="relative h-6 cursor-pointer rounded bg-panel-3"
          onMouseMove={(e) => setHover(timeAt(e.clientX))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => controller.seek(timeAt(e.clientX))}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') controller.seek(time + 300);
            if (e.key === 'ArrowLeft') controller.seek(time - 300);
          }}
        >
          <div className="absolute inset-y-0 left-0 rounded-l bg-accent-strong/25" style={{ width: pct(time) }} />
          {ticks.map((t) => (
            <div key={t} className="absolute top-0 h-full border-l border-edge-strong/70" style={{ left: pct(t) }}>
              <span className="absolute left-1 top-0.5 text-[9px] text-faint">{fmtClock(t)}</span>
            </div>
          ))}
          {incidents.map((inc) => {
            const s = inc.startTime;
            const e = inc.endTime ?? (inc.duration !== null ? s + inc.duration : end);
            return (
              <button
                key={inc.id}
                type="button"
                title={`${inc.label} — ${fmtClock(s)} → ${fmtClock(e)} (${inc.status})`}
                onClick={(ev) => {
                  ev.stopPropagation();
                  useSelection.getState().select({ kind: 'incident', id: inc.id });
                }}
                className={cx(
                  'absolute bottom-0.5 h-2 rounded-sm',
                  inc.status === 'active' ? 'bg-red-500' : inc.status === 'scheduled' ? 'bg-red-500/40' : inc.status === 'suspended' ? 'bg-amber-400/70' : 'bg-slate-500/70',
                )}
                style={{ left: pct(s), width: `max(4px, calc(${pct(e)} - ${pct(s)}))` }}
              />
            );
          })}
          {actions.map((a, i) => (
            <div key={i} className="absolute top-0 h-2.5 w-0.5 bg-sky-300" style={{ left: pct(a.time) }} title={`Action ${a.type} à ${fmtClock(a.time)}`} />
          ))}
          <div className="absolute inset-y-[-3px] w-0.5 bg-white shadow-[0_0_6px_rgba(255,255,255,0.8)]" style={{ left: pct(time) }} />
          {hover !== null && (
            <div className="pointer-events-none absolute -top-6 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 text-[10px] tabular" style={{ left: pct(hover) }}>
              {fmtClock(hover)}
            </div>
          )}
        </div>
      </div>

      <div className="hidden w-[330px] shrink-0 flex-col justify-center gap-0.5 overflow-hidden lg:flex" aria-live="polite">
        {recent.length === 0 && <div className="text-[11px] text-faint">Aucun événement pour l&apos;instant.</div>}
        {recent.map((ev) => {
          const Icon = LEVEL_ICON[ev.level];
          return (
            <button
              key={ev.id}
              type="button"
              className="flex items-center gap-1.5 truncate text-left text-[11px] hover:text-ink"
              onClick={() => {
                if (ev.stationId) {
                  useSelection.getState().select({ kind: 'station', id: ev.stationId });
                  useSelection.getState().focusStation(ev.stationId);
                } else if (ev.segmentId) useSelection.getState().select({ kind: 'segment', id: ev.segmentId });
                else if (ev.incidentId) useSelection.getState().select({ kind: 'incident', id: ev.incidentId });
              }}
            >
              <Icon size={11} className={cx('shrink-0', LEVEL_COLOR[ev.level])} />
              <span className="tabular shrink-0 text-faint">{fmtClock(ev.time)}</span>
              <span className="truncate text-ink/85">{ev.message}</span>
            </button>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmReset}
        title="Réinitialiser le scénario ?"
        message="Toutes vos actions (incidents déclenchés, fréquences, fermetures) seront supprimées et la simulation reprendra au début avec la même graine."
        confirmLabel="Réinitialiser"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          controller.restart();
        }}
      />
    </footer>
  );
}
