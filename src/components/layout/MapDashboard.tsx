'use client';

import { BarChart3, ChevronLeft, ChevronRight, Lock, Siren, SlidersHorizontal, Unlock } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { loadNetwork } from '@/data/network';
import { describeTarget } from '@/engine/incidentManager';
import { fmtInt, fmtMin } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { DualSeriesChart, LineSaturationChart, StationRanking, TimeSeriesChart } from '../dashboard/charts';
import { KPIGrid } from '../dashboard/KPIGrid';
import { SelectionPanel } from '../dashboard/SelectionPanels';
import { MetroMap } from '../map/MetroMap';
import { IncidentFormModal } from '../simulation/IncidentForm';
import { IncidentList } from '../simulation/IncidentList';
import { NetworkControls } from '../simulation/NetworkControls';
import { Button, cx, Segmented } from '../ui/primitives';
import { networkStatus } from './TopBar';

/**
 * Écran principal : le plan occupe tout l'espace ; commandes et indicateurs flottent
 * dans des cartes repliables (gauche : perturbations et lignes ; droite : détails et graphiques).
 */
export function MapDashboard() {
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const selected = useSelection((s) => s.selected);
  return (
    <div className="relative h-full min-h-0">
      <MetroMap />

      {/* Dock gauche */}
      {leftOpen ? (
        <aside className="panel-scroll absolute bottom-3 left-3 top-3 flex w-[268px] flex-col gap-2" aria-label="Commandes">
          <Card
            title="Perturbations"
            icon={<Siren size={12} />}
            actions={
              <div className="flex items-center gap-1">
                <Button size="xs" variant="danger" onClick={() => useSelection.getState().openIncidentForm({})}>
                  + Incident
                </Button>
                <DockToggle side="left" onClick={() => setLeftOpen(false)} />
              </div>
            }
          >
            <IncidentList />
          </Card>
          <Card title="Lignes et rames" icon={<SlidersHorizontal size={12} />}>
            <NetworkControls />
          </Card>
          <ManualClosures />
        </aside>
      ) : (
        <button type="button" onClick={() => setLeftOpen(true)} className="absolute left-3 top-3 flex items-center gap-1 rounded-lg border border-edge bg-white px-2.5 py-1.5 text-xs shadow-sm hover:bg-panel-3">
          <ChevronRight size={13} /> Commandes
        </button>
      )}

      {/* Dock droit */}
      {rightOpen ? (
        <aside className="panel-scroll absolute bottom-3 right-3 top-3 flex w-[304px] flex-col gap-2" aria-label="Détails">
          {selected && (
            <Card
              title={selected.kind === 'station' ? 'Station' : selected.kind === 'segment' ? 'Tronçon' : 'Perturbation'}
            >
              <SelectionPanel />
            </Card>
          )}
          <Card title="Indicateurs simulés" actions={<DockToggle side="right" onClick={() => setRightOpen(false)} />}>
            <KPIGrid compact />
          </Card>
          <ChartsCard />
        </aside>
      ) : (
        <button type="button" onClick={() => setRightOpen(true)} className="absolute right-3 top-3 flex items-center gap-1 rounded-lg border border-edge bg-white px-2.5 py-1.5 text-xs shadow-sm hover:bg-panel-3">
          Indicateurs <ChevronLeft size={13} />
        </button>
      )}

      <StatusStrip leftOffset={leftOpen ? 284 : 12} />
      <IncidentFormModal />
    </div>
  );
}

function Card({ title, icon, actions, children }: { title: string; icon?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-edge bg-white/95 shadow-sm backdrop-blur">
      <header className="flex items-center justify-between gap-2 px-3 pb-1 pt-2.5">
        <h2 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted">
          {icon}
          {title}
        </h2>
        {actions}
      </header>
      <div className="px-3 pb-3 pt-1">{children}</div>
    </section>
  );
}

function DockToggle({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Replier le panneau" title="Replier" className="rounded p-0.5 text-faint hover:bg-panel-3 hover:text-ink">
      {side === 'left' ? <ChevronLeft size={14} /> : <ChevronRight size={14} />}
    </button>
  );
}

/** Bandeau d'état minimal en bas du plan : l'essentiel en un coup d'œil. */
function StatusStrip({ leftOffset }: { leftOffset: number }) {
  const k = useSimulation((s) => s.snapshot?.kpis);
  if (!k) return null;
  const status = networkStatus(k);
  const items: [string, string][] = [
    ['Voyageurs', fmtInt(k.inNetwork)],
    ['Retard moyen', fmtMin(k.avgDelay)],
    ['Tronçons saturés', fmtInt(k.saturatedSegments)],
    ['Qualité', `${fmtInt(k.serviceQuality)}/100`],
  ];
  return (
    <div className="pointer-events-none absolute bottom-3 flex justify-center" style={{ left: leftOffset, right: 324 }}>
      <div className="pointer-events-auto flex items-center gap-4 rounded-full border border-edge bg-white/95 px-4 py-1.5 text-xs shadow-sm backdrop-blur">
        <span className={cx('flex items-center gap-1.5 font-semibold', status.color)}>
          <span className={cx('h-2 w-2 rounded-full', status.dot)} /> {status.label}
        </span>
        {items.map(([label, value]) => (
          <span key={label} className="flex items-baseline gap-1">
            <span className="text-faint">{label}</span>
            <span className="tabular font-semibold">{value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

type ChartTab = 'trafic' | 'lignes' | 'stations' | 'retards';

function ChartsCard() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<ChartTab>('trafic');
  return (
    <section className="rounded-xl border border-edge bg-white/95 shadow-sm backdrop-blur">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="flex items-center gap-1.5">
          <BarChart3 size={12} /> Graphiques
        </span>
        <ChevronRight size={13} className={cx('transition-transform', open && 'rotate-90')} />
      </button>
      {open && (
        <div className="px-3 pb-3">
          <div className="mb-2">
            <Segmented<ChartTab>
              size="xs"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'trafic', label: 'Trafic' },
                { value: 'lignes', label: 'Lignes' },
                { value: 'stations', label: 'Stations' },
                { value: 'retards', label: 'Retards' },
              ]}
            />
          </div>
          {tab === 'trafic' && <TimeSeriesChart pick={(h) => h.inNetwork} name="Voyageurs dans le réseau" format={(v) => `${Math.round(v / 1000)}k`} height={150} />}
          {tab === 'lignes' && <LineSaturationChart height={330} />}
          {tab === 'stations' && <StationRanking />}
          {tab === 'retards' && (
            <DualSeriesChart a={{ pick: (h) => h.avgDelay / 60, name: 'Retard moyen' }} b={{ pick: (h) => h.avgWait / 60, name: 'Attente moyenne' }} format={(v) => v.toFixed(1)} height={170} />
          )}
          <p className="mt-1 text-[10px] text-faint">Analyse détaillée dans l&apos;onglet Statistiques.</p>
        </div>
      )}
    </section>
  );
}

function ManualClosures() {
  const network = loadNetwork().network!;
  const reg = useSimulation((s) => s.snapshot?.regulation);
  if (!reg || (reg.closedStations.length === 0 && reg.disabledSegments.length === 0)) return null;
  return (
    <Card title="Fermetures" icon={<Lock size={12} />}>
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
    </Card>
  );
}
