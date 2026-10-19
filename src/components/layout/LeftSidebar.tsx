'use client';

import { Gauge, Lock, Pause, Play, RotateCcw, Siren, SlidersHorizontal, Unlock } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { loadNetwork } from '@/data/network';
import { describeTarget } from '@/engine/incidentManager';
import { fmtClock } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { IncidentList } from '../simulation/IncidentList';
import { NetworkControls } from '../simulation/NetworkControls';
import { Button, ConfirmDialog, Panel, Segmented } from '../ui/primitives';
import { SPEEDS } from './TopBar';

export function LeftSidebar() {
  return (
    <aside className="panel-scroll flex w-[272px] shrink-0 flex-col gap-2 border-r border-edge bg-panel p-2" aria-label="Commandes de simulation">
      <SimulationControls />
      <Panel
        title="Perturbations"
        icon={<Siren size={12} />}
        actions={
          <Button size="xs" variant="danger" onClick={() => useSelection.getState().openIncidentForm({})} title="Création rapide d'une perturbation">
            + Nouvelle
          </Button>
        }
      >
        <IncidentList />
      </Panel>
      <Panel title="Contrôle du réseau" icon={<SlidersHorizontal size={12} />}>
        <NetworkControls />
      </Panel>
      <ManualClosures />
    </aside>
  );
}

function SimulationControls() {
  const running = useSimulation((s) => s.running);
  const speed = useSimulation((s) => s.speed);
  const title = useSimulation((s) => s.scenarioTitle);
  const seed = useSimulation((s) => s.seed);
  const start = useSimulation((s) => s.startTime);
  const end = useSimulation((s) => s.endTime);
  const time = useSimulation((s) => s.snapshot?.time ?? s.startTime);
  const finished = useSimulation((s) => s.snapshot?.finished ?? false);
  const [confirm, setConfirm] = useState(false);
  const progress = (time - start) / Math.max(1, end - start);
  return (
    <Panel title="Simulation" icon={<Gauge size={12} />} actions={<Link href="/scenarios" className="text-[10px] text-accent hover:underline">Changer</Link>}>
      <div className="mb-2 text-xs font-medium leading-snug">{title}</div>
      <div className="mb-2 h-1 overflow-hidden rounded bg-panel-3">
        <div className="h-full bg-accent" style={{ width: `${Math.min(100, progress * 100)}%` }} />
      </div>
      <div className="mb-2 flex items-center justify-between text-[10px] text-muted">
        <span className="tabular">
          {fmtClock(start)} → {fmtClock(end)}
        </span>
        <span title="Graine aléatoire : même graine + mêmes actions = même simulation">graine {seed}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <Button variant={running ? 'subtle' : 'primary'} className="flex-1" onClick={() => controller.toggle()} disabled={finished}>
          {running ? <Pause size={13} /> : <Play size={13} />} {running ? 'Pause' : finished ? 'Terminé' : 'Lancer'}
        </Button>
        <Button onClick={() => setConfirm(true)} title="Retour au début du scénario">
          <RotateCcw size={13} />
        </Button>
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[10px] text-muted">Vitesse (×1 = 1 min/s)</span>
        <Segmented size="xs" value={speed} onChange={(v) => controller.setSpeed(v)} options={SPEEDS.map((s) => ({ value: s, label: `×${s}` }))} />
      </div>
      <ConfirmDialog
        open={confirm}
        title="Revenir au début ?"
        message="La simulation repart du début du scénario (même graine). Vos actions seront effacées."
        confirmLabel="Revenir au début"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          controller.restart();
        }}
      />
    </Panel>
  );
}

function ManualClosures() {
  const network = loadNetwork().network!;
  const reg = useSimulation((s) => s.snapshot?.regulation);
  if (!reg || (reg.closedStations.length === 0 && reg.disabledSegments.length === 0)) return null;
  return (
    <Panel title="Fermetures de régulation" icon={<Lock size={12} />}>
      <ul className="space-y-1 text-[11px]">
        {reg.closedStations.map((id) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="truncate">{network.stationById.get(id)?.name}</span>
            <Button size="xs" variant="success" onClick={() => controller.dispatch({ type: 'station.open', stationId: id })}>
              <Unlock size={11} /> Rouvrir
            </Button>
          </li>
        ))}
        {reg.disabledSegments.map((id) => (
          <li key={id} className="flex items-center justify-between gap-2">
            <span className="truncate">{describeTarget(network, { kind: 'segment', segmentId: id })}</span>
            <Button size="xs" variant="success" onClick={() => controller.dispatch({ type: 'segment.enable', segmentId: id })}>
              <Unlock size={11} /> Réactiver
            </Button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
