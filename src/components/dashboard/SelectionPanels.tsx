'use client';

import { Crosshair, Lock, Route, Siren, Unlock, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { loadNetwork } from '@/data/network';
import { fmtClock, fmtInt, fmtMin, fmtPct, levelColor, saturationLevel } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSettings } from '@/store/settingsStore';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { NO_INCIDENTS } from '@/store/simulationStore';
import type { Network } from '@/types/network';
import { IncidentDetail } from '../simulation/IncidentList';
import { Button, ConfirmDialog, LineBadge } from '../ui/primitives';
import { CHART } from './charts';

export function SelectionPanel() {
  const selected = useSelection((s) => s.selected);
  const incidents = useSimulation((s) => s.snapshot?.incidents ?? NO_INCIDENTS);
  if (!selected) return null;
  if (selected.kind === 'station') return <StationPanel id={selected.id} />;
  if (selected.kind === 'segment') return <SegmentPanel id={selected.id} />;
  const inc = incidents.find((i) => i.id === selected.id);
  return inc ? <IncidentDetail incident={inc} /> : null;
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded border border-edge bg-panel-3/50 px-2 py-1">
      <div className="text-[9px] uppercase tracking-wide text-faint">{label}</div>
      <div className="tabular text-[13px] font-semibold" style={color ? { color } : undefined}>
        {value}
      </div>
    </div>
  );
}

function StationPanel({ id }: { id: string }) {
  const network = loadNetwork().network!;
  const st = network.stationById.get(id);
  const snapshot = useSimulation((s) => s.snapshot);
  const stationSeries = useSimulation((s) => s.stationSeries);
  const history = useSimulation((s) => s.history);
  const thresholds = useSettings((s) => s.thresholds);
  const route = useSelection((s) => s.route);
  const [confirm, setConfirm] = useState(false);
  const [dest, setDest] = useState('');
  if (!st || !snapshot) return null;
  const open = snapshot.stationOpen[st.index] === 1;
  const manuallyClosed = snapshot.regulation.closedStations.includes(st.id);
  const load = snapshot.stationLoad[st.index];
  const stationIncidents = snapshot.incidents.filter((i) => i.status !== 'resolved' && i.target.kind === 'station' && i.target.stationId === st.id);
  const adjacent = network.segments.filter((s) => s.a === st.id || s.b === st.id);
  const series = history.map((h, i) => ({ time: h.time, v: stationSeries[i]?.[st.index] ?? 0 }));

  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1">
            {st.lines.map((l) => (
              <LineBadge key={l} line={l} size={18} />
            ))}
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-tight">{st.name}</h3>
          <div className="text-[10px] text-muted">
            {open ? 'Ouverte' : 'Fermée'}
            {st.isTerminus ? ' · terminus' : ''}
            {st.isInterchange ? ' · correspondance' : ''}
          </div>
        </div>
        <button type="button" className="rounded p-0.5 text-faint hover:text-ink" aria-label="Fermer le panneau" onClick={() => useSelection.getState().select(null)}>
          <X size={14} />
        </button>
      </div>
      {st.note && <p className="text-[10px] leading-snug text-faint">{st.note}</p>}

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="À quai" value={`${fmtInt(snapshot.stationWaiting[st.index])} voy.`} />
        <Stat label="Occupation des quais" value={fmtPct(load)} color={levelColor(saturationLevel(load, thresholds))} />
        <Stat label="Entrées / h" value={fmtInt(snapshot.stationEntries[st.index])} />
        <Stat label="Sorties / h" value={fmtInt(snapshot.stationExits[st.index])} />
      </div>

      {series.length > 1 && (
        <div>
          <div className="mb-0.5 text-[10px] text-muted">Voyageurs à quai</div>
          <ResponsiveContainer width="100%" height={70}>
            <AreaChart data={series} margin={{ top: 2, right: 2, bottom: 0, left: -24 }}>
              <XAxis dataKey="time" hide type="number" domain={['dataMin', 'dataMax']} />
              <YAxis tick={{ fill: CHART.axis, fontSize: 9 }} tickLine={false} axisLine={false} width={40} />
              <Tooltip
                formatter={(v) => [`${fmtInt(Number(v))} voy.`, 'À quai']}
                labelFormatter={(t) => fmtClock(Number(t))}
                contentStyle={{ background: CHART.tooltipBg, border: '1px solid #e6e1d7', fontSize: 11 }}
              />
              <Area type="monotone" dataKey="v" stroke={CHART.primary} strokeWidth={2} fill={CHART.primary} fillOpacity={0.15} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted">Tronçons adjacents</div>
        <ul className="space-y-0.5">
          {adjacent.map((seg) => {
            const other = network.stationById.get(seg.a === st.id ? seg.b : seg.a)!;
            const sat = snapshot.segmentSaturation[seg.index];
            const available = snapshot.segmentAvailable[seg.index] === 1;
            return (
              <li key={seg.id}>
                <button type="button" className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-panel-3" onClick={() => useSelection.getState().select({ kind: 'segment', id: seg.id })}>
                  <LineBadge line={seg.line} size={14} />
                  <span className="truncate">→ {other.name}</span>
                  <span className="tabular ml-auto" style={{ color: available ? levelColor(saturationLevel(sat, thresholds)) : '#ff2d55' }}>
                    {available ? fmtPct(sat) : 'coupé'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {stationIncidents.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-red-600">Incidents sur la station</div>
          {stationIncidents.map((i) => (
            <button key={i.id} type="button" className="block w-full truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-panel-3" onClick={() => useSelection.getState().select({ kind: 'incident', id: i.id })}>
              {i.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="danger" onClick={() => useSelection.getState().openIncidentForm({ stationId: st.id, line: st.lines.length === 1 ? st.lines[0] : undefined })}>
          <Siren size={11} /> Ajouter une perturbation
        </Button>
        {manuallyClosed ? (
          <Button size="xs" variant="success" onClick={() => controller.dispatch({ type: 'station.open', stationId: st.id })}>
            <Unlock size={11} /> Rouvrir
          </Button>
        ) : (
          <Button size="xs" onClick={() => setConfirm(true)} disabled={!open}>
            <Lock size={11} /> Fermer la station
          </Button>
        )}
        <Button size="xs" variant="ghost" onClick={() => useSelection.getState().focusStation(st.id)}>
          <Crosshair size={11} /> Centrer
        </Button>
      </div>

      <RoutePlanner fromId={st.id} dest={dest} setDest={setDest} network={network} active={route?.from === st.id ? route : null} />

      <ConfirmDialog
        open={confirm}
        title={`Fermer ${st.name} ?`}
        message={
          <>
            La station sera fermée au public (régulation) : plus d&apos;entrée, de sortie ni de correspondance, les trains traversent sans s&apos;arrêter. Les voyageurs à quai seront évacués vers la
            station voisine et les itinéraires recalculés.
          </>
        }
        confirmLabel="Fermer la station"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          controller.dispatch({ type: 'station.close', stationId: st.id });
        }}
      />
    </div>
  );
}

function RoutePlanner({
  fromId,
  dest,
  setDest,
  network,
  active,
}: {
  fromId: string;
  dest: string;
  setDest: (v: string) => void;
  network: Network;
  active: { from: string; to: string; edges: number[]; cost: number } | null;
}) {
  const options = useMemo(() => [...network.stations].sort((a, b) => a.name.localeCompare(b.name, 'fr')), [network]);
  const legs = useMemo(() => {
    if (!active) return [];
    const out: { line: string; from: string; to: string; stops: number }[] = [];
    for (const e of active.edges) {
      const edge = network.edges[e];
      const last = out[out.length - 1];
      if (last && last.line === edge.line && last.to === edge.from) {
        last.to = edge.to;
        last.stops++;
      } else out.push({ line: edge.line, from: edge.from, to: edge.to, stops: 1 });
    }
    return out;
  }, [active, network]);
  return (
    <div className="rounded-md border border-edge p-2">
      <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted">
        <Route size={11} /> Itinéraire conseillé (état actuel)
      </div>
      <div className="flex gap-1.5">
        <select className="min-w-0 flex-1" value={dest} onChange={(e) => setDest(e.target.value)} aria-label="Destination">
          <option value="">Destination…</option>
          {options
            .filter((s) => s.id !== fromId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </select>
        <Button
          size="xs"
          disabled={!dest}
          onClick={async () => {
            const r = await controller.routeBetween(fromId, dest);
            if (!r) useSelection.getState().setRoute(null);
            else useSelection.getState().setRoute({ from: fromId, to: dest, ...r });
            if (!r) alertNoRoute();
          }}
        >
          Calculer
        </Button>
      </div>
      {active && (
        <div className="mt-2 space-y-1 text-[11px]">
          {legs.map((l, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <LineBadge line={l.line} size={14} />
              <span className="truncate">
                {network.stationById.get(l.from)?.name} → {network.stationById.get(l.to)?.name}
              </span>
              <span className="ml-auto shrink-0 text-faint">{l.stops} arr.</span>
            </div>
          ))}
          <div className="flex items-center justify-between pt-1 text-[10px] text-muted">
            <span>Coût généralisé : {fmtMin(active.cost, 0)} (attente et correspondances pondérées)</span>
            <button type="button" className="text-faint hover:text-ink" onClick={() => useSelection.getState().setRoute(null)}>
              effacer
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function alertNoRoute() {
  useSimulation.setState({ notice: { level: 'error', message: 'Aucun itinéraire possible dans l’état actuel du réseau.', id: Date.now() } });
}

function SegmentPanel({ id }: { id: string }) {
  const network = loadNetwork().network!;
  const seg = network.segmentById.get(id);
  const snapshot = useSimulation((s) => s.snapshot);
  const thresholds = useSettings((s) => s.thresholds);
  const [confirm, setConfirm] = useState(false);
  if (!seg || !snapshot) return null;
  const a = network.stationById.get(seg.a)!;
  const b = network.stationById.get(seg.b)!;
  const available = snapshot.segmentAvailable[seg.index] === 1;
  const manuallyDisabled = snapshot.regulation.disabledSegments.includes(seg.id);
  const dirs = [network.edges[seg.index * 2], network.edges[seg.index * 2 + 1]];
  const line = network.lineById.get(seg.line)!;
  return (
    <div className="space-y-3 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5">
            <LineBadge line={seg.line} />
            <span className="text-[10px] text-muted">Tronçon</span>
          </div>
          <h3 className="mt-1 text-sm font-semibold leading-tight">
            {a.name} ↔ {b.name}
          </h3>
          <div className={available ? 'text-[10px] text-muted' : 'text-[10px] text-red-600'}>{available ? 'En service' : 'Interrompu'}</div>
        </div>
        <button type="button" className="rounded p-0.5 text-faint hover:text-ink" aria-label="Fermer le panneau" onClick={() => useSelection.getState().select(null)}>
          <X size={14} />
        </button>
      </div>
      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px]">
        <dt className="text-muted">Temps de référence</dt>
        <dd className="tabular text-right">{Math.round(seg.baseTravelTime)} s</dd>
        <dt className="text-muted">Part de service</dt>
        <dd className="tabular text-right">{fmtPct(seg.serviceShare)}</dd>
        <dt className="text-muted">Fréquence (tronçon)</dt>
        <dd className="tabular text-right">{(snapshot.lineFrequency[seg.line] * seg.serviceShare).toFixed(1)} tr/h</dd>
        <dt className="text-muted">Capacité théorique</dt>
        <dd className="tabular text-right">{fmtInt(snapshot.lineFrequency[seg.line] * seg.serviceShare * line.trainCapacity)} voy./h</dd>
      </dl>
      {dirs.map((e) => {
        const sat = snapshot.edgeSaturation[e.index];
        return (
          <div key={e.index} className="rounded-md border border-edge p-2">
            <div className="mb-1 font-medium">→ {network.stationById.get(e.to)!.name}</div>
            <div className="grid grid-cols-3 gap-1.5">
              <Stat label="Saturation" value={available ? fmtPct(sat) : '—'} color={available ? levelColor(saturationLevel(sat, thresholds)) : undefined} />
              <Stat label="Débit / h" value={fmtInt(snapshot.edgeFlow[e.index])} />
              <Stat label="Capacité / h" value={fmtInt(snapshot.edgeCapacity[e.index])} />
              <Stat label="File" value={`${fmtInt(snapshot.edgeQueue[e.index])} voy.`} />
              <Stat label="Retard est." value={fmtMin(snapshot.edgeDelay[e.index])} />
            </div>
          </div>
        );
      })}
      <div className="flex flex-wrap gap-1.5">
        <Button size="xs" variant="danger" onClick={() => useSelection.getState().openIncidentForm({ segmentId: seg.id, line: seg.line })}>
          <Siren size={11} /> Ajouter une perturbation
        </Button>
        {manuallyDisabled ? (
          <Button size="xs" variant="success" onClick={() => controller.dispatch({ type: 'segment.enable', segmentId: seg.id })}>
            <Unlock size={11} /> Réactiver
          </Button>
        ) : (
          <Button size="xs" onClick={() => setConfirm(true)} disabled={!available}>
            <Lock size={11} /> Désactiver la liaison
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Désactiver cette liaison ?"
        message={`Plus aucun train ne circulera entre ${a.name} et ${b.name} (ligne ${seg.line}). Les itinéraires seront recalculés.`}
        confirmLabel="Désactiver"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          controller.dispatch({ type: 'segment.disable', segmentId: seg.id });
        }}
      />
    </div>
  );
}
