'use client';

import { Activity, AlertTriangle, BarChart3, MousePointerClick } from 'lucide-react';
import { useState } from 'react';
import { fmtClock, fmtInt, fmtMin, fmtPct } from '@/lib/metrics';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { DualSeriesChart, LineSaturationChart, StationRanking, TimeSeriesChart } from '../dashboard/charts';
import { KPIGrid } from '../dashboard/KPIGrid';
import { SelectionPanel } from '../dashboard/SelectionPanels';
import { Panel, Segmented } from '../ui/primitives';

type ChartTab = 'trafic' | 'lignes' | 'stations' | 'retards' | 'affectes';

export function RightSidebar() {
  const selected = useSelection((s) => s.selected);
  return (
    <aside className="panel-scroll flex w-[312px] shrink-0 flex-col gap-2 border-l border-edge bg-panel p-2" aria-label="Indicateurs et détails">
      {selected ? (
        <Panel title={selected.kind === 'station' ? 'Station sélectionnée' : selected.kind === 'segment' ? 'Tronçon sélectionné' : 'Perturbation'} icon={<MousePointerClick size={12} />}>
          <SelectionPanel />
        </Panel>
      ) : (
        <Panel title="Indicateurs (simulés)" icon={<Activity size={12} />}>
          <KPIGrid compact />
        </Panel>
      )}
      <ChartsPanel />
      {selected && (
        <Panel title="Indicateurs (simulés)" icon={<Activity size={12} />}>
          <KPIGrid compact />
        </Panel>
      )}
      <AlertsPanel />
    </aside>
  );
}

function ChartsPanel() {
  const [tab, setTab] = useState<ChartTab>('trafic');
  return (
    <Panel title="Graphiques" icon={<BarChart3 size={12} />} bodyClassName="p-2">
      <div className="mb-2 overflow-x-auto">
        <Segmented<ChartTab>
          size="xs"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'trafic', label: 'Trafic' },
            { value: 'lignes', label: 'Lignes' },
            { value: 'stations', label: 'Stations' },
            { value: 'retards', label: 'Retards' },
            { value: 'affectes', label: 'Affectés' },
          ]}
        />
      </div>
      {tab === 'trafic' && (
        <>
          <div className="mb-0.5 text-[10px] text-muted">Voyageurs dans le réseau</div>
          <TimeSeriesChart pick={(h) => h.inNetwork} name="Voyageurs dans le réseau" format={(v) => `${Math.round(v / 1000)}k`} height={140} />
          <div className="mb-0.5 mt-2 text-[10px] text-muted">Entrées par heure (fréquentation)</div>
          <TimeSeriesChart pick={(h) => h.entriesPerHour} name="Entrées / h" format={(v) => `${Math.round(v / 1000)}k`} height={110} color="#2dd4bf" />
        </>
      )}
      {tab === 'lignes' && (
        <>
          <div className="mb-0.5 text-[10px] text-muted">Saturation par ligne (instant présent)</div>
          <LineSaturationChart />
          <div className="mb-0.5 mt-2 text-[10px] text-muted">Tronçons saturés (≥ 85 %)</div>
          <TimeSeriesChart pick={(h) => h.saturatedSegments} name="Tronçons saturés" format={(v) => fmtInt(v)} height={110} color="#f97316" />
        </>
      )}
      {tab === 'stations' && (
        <>
          <div className="mb-0.5 text-[10px] text-muted">Stations les plus chargées (voyageurs à quai) — cliquez pour localiser</div>
          <StationRanking />
        </>
      )}
      {tab === 'retards' && (
        <>
          <div className="mb-0.5 text-[10px] text-muted">Retard et attente moyens estimés (min)</div>
          <DualSeriesChart a={{ pick: (h) => h.avgDelay / 60, name: 'Retard moyen' }} b={{ pick: (h) => h.avgWait / 60, name: 'Attente moyenne' }} format={(v) => v.toFixed(1)} height={170} />
        </>
      )}
      {tab === 'affectes' && (
        <>
          <div className="mb-0.5 text-[10px] text-muted">Voyageurs affectés par les incidents (cumul)</div>
          <TimeSeriesChart pick={(h) => h.affectedTotal} name="Affectés (cumul)" format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmtInt(v))} height={130} color="#f87171" />
          <div className="mb-0.5 mt-2 text-[10px] text-muted">Affectés actuellement dans le réseau</div>
          <TimeSeriesChart pick={(h) => h.affectedNow} name="Affectés en circulation" format={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : fmtInt(v))} height={110} color="#fb7185" />
        </>
      )}
    </Panel>
  );
}

function AlertsPanel() {
  const events = useSimulation((s) => s.events);
  const alerts = events.filter((e) => e.level === 'warning' || e.level === 'critical').slice(-8).reverse();
  const kpis = useSimulation((s) => s.snapshot?.kpis);
  return (
    <Panel title="Alertes" icon={<AlertTriangle size={12} />}>
      {kpis && (
        <div className="mb-2 text-[10px] text-muted">
          Retard moyen {fmtMin(kpis.avgDelay)} · saturation moyenne {fmtPct(kpis.avgSaturation)} · {fmtInt(kpis.lostTrips)} voyageur(s) sans itinéraire
        </div>
      )}
      {alerts.length === 0 && <p className="text-[11px] text-faint">Aucune alerte.</p>}
      <ul className="space-y-1">
        {alerts.map((ev) => (
          <li key={ev.id}>
            <button
              type="button"
              className="flex w-full items-start gap-1.5 text-left text-[11px] hover:text-ink"
              onClick={() => {
                const sel = useSelection.getState();
                if (ev.incidentId) sel.select({ kind: 'incident', id: ev.incidentId });
                else if (ev.stationId) {
                  sel.select({ kind: 'station', id: ev.stationId });
                  sel.focusStation(ev.stationId);
                } else if (ev.segmentId) sel.select({ kind: 'segment', id: ev.segmentId });
              }}
            >
              <span className={ev.level === 'critical' ? 'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500' : 'mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-400'} />
              <span className="tabular shrink-0 text-faint">{fmtClock(ev.time)}</span>
              <span className="text-ink/85">{ev.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
