'use client';

import { BarChart3, GitCompareArrows, Loader2, Network as NetworkIcon, Timer, Waves, Wrench } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { loadNetwork } from '@/data/network';
import { SCENARIOS } from '@/data/scenarios';
import { INCIDENT_TYPE_INFO } from '@/engine/incidentManager';
import { SATURATION_ALERT } from '@/engine/simulationEngine';
import type { Variant, VariantResult } from '@/lib/comparison';
import { controller } from '@/lib/simulationController';
import { fmtClock, fmtInt, fmtMin, fmtNum, fmtPct, levelColor, saturationLevel } from '@/lib/metrics';
import { loadRuns } from '@/lib/persistence';
import { useSettings } from '@/store/settingsStore';
import { useSelection, useSimulation } from '@/store/simulationStore';
import { NO_INCIDENTS } from '@/store/simulationStore';
import type { Incident, IncidentType } from '@/types/incident';
import type { LineId } from '@/types/network';
import type { RecordedRun, RunSummary } from '@/types/scenario';
import type { HistoryPoint, SimAction } from '@/types/simulation';
import { Button, cx, LineBadge, Panel } from '../ui/primitives';
import { CHART } from './charts';

const axis = { stroke: CHART.axis, tick: { fill: CHART.axis, fontSize: 10 }, tickLine: false, axisLine: { stroke: CHART.grid } };

export function StatisticsScreen() {
  const network = loadNetwork().network!;
  const history = useSimulation((s) => s.history);
  const refHistory = useSimulation((s) => s.refHistory);
  const segSeries = useSimulation((s) => s.segmentSeries);
  const refSegSeries = useSimulation((s) => s.refSegmentSeries);
  const stSeries = useSimulation((s) => s.stationSeries);
  const incidents = useSimulation((s) => s.snapshot?.incidents ?? NO_INCIDENTS);
  const actions = useSimulation((s) => s.actions);
  const thresholds = useSettings((s) => s.thresholds);

  const [line, setLine] = useState<LineId | 'all'>('all');
  const [incType, setIncType] = useState<IncidentType | 'all'>('all');
  const times = history.map((h) => h.time);
  const [range, setRange] = useState<[number, number] | null>(null);
  const from = range?.[0] ?? times[0] ?? 0;
  const to = range?.[1] ?? times[times.length - 1] ?? 0;
  const idx = useMemo(() => history.map((h, i) => (h.time >= from && h.time <= to ? i : -1)).filter((i) => i >= 0), [history, from, to]);

  const segments = network.segments.filter((s) => line === 'all' || s.line === line);
  const stations = network.stations.filter((s) => line === 'all' || s.lines.includes(line));
  const filteredIncidents = incidents.filter((i) => incType === 'all' || i.type === incType);
  const incidentTypesPresent = [...new Set(incidents.map((i) => i.type))];

  const segmentStats = useMemo(() => {
    return segments
      .map((s) => {
        let max = 0;
        let sum = 0;
        let above = 0;
        let refSum = 0;
        for (const i of idx) {
          const v = segSeries[i]?.[s.index] ?? 0;
          max = Math.max(max, v);
          sum += v;
          if (v >= SATURATION_ALERT) above++;
          refSum += refSegSeries?.[i]?.[s.index] ?? 0;
        }
        const n = Math.max(1, idx.length);
        return { seg: s, max, mean: sum / n, above, refMean: refSegSeries ? refSum / n : null };
      })
      .sort((a, b) => b.above - a.above || b.max - a.max);
  }, [segments, idx, segSeries, refSegSeries]);

  const stationStats = useMemo(() => {
    return stations
      .map((st) => {
        let max = 0;
        let sum = 0;
        let peak = from;
        for (const i of idx) {
          const v = stSeries[i]?.[st.index] ?? 0;
          if (v > max) {
            max = v;
            peak = history[i].time;
          }
          sum += v;
        }
        return { st, max, mean: sum / Math.max(1, idx.length), peak, load: max / st.capacity };
      })
      .sort((a, b) => b.max - a.max);
  }, [stations, idx, stSeries, history, from]);

  const lineStats = useMemo(() => {
    return network.lines
      .filter((l) => line === 'all' || l.id === line)
      .map((l) => {
        let sum = 0;
        let max = 0;
        let refSum = 0;
        for (const i of idx) {
          sum += history[i].lineSaturation[l.id];
          max = Math.max(max, history[i].lineMaxSaturation[l.id]);
          const r = refHistory?.find((x) => x.time === history[i].time);
          refSum += r?.lineSaturation[l.id] ?? 0;
        }
        const n = Math.max(1, idx.length);
        const segs = segmentStats.filter((s) => s.seg.line === l.id);
        return { line: l, mean: sum / n, max, refMean: refHistory ? refSum / n : null, saturatedMinutes: segs.reduce((a, s) => a + s.above, 0) };
      })
      .sort((a, b) => (b.refMean !== null ? b.mean - b.refMean : b.mean) - (a.refMean !== null ? a.mean - a.refMean : a.mean));
  }, [network, line, idx, history, refHistory, segmentStats]);

  // Propagation : nombre de tronçons nettement plus chargés que dans la référence.
  const propagation = useMemo(() => {
    return idx.map((i) => {
      let over = 0;
      for (const s of segments) {
        const v = segSeries[i]?.[s.index] ?? 0;
        const r = refSegSeries?.[i]?.[s.index];
        if (r !== undefined && v > r + 0.15) over++;
      }
      return { time: history[i].time, over, saturated: segments.filter((s) => (segSeries[i]?.[s.index] ?? 0) >= SATURATION_ALERT).length };
    });
  }, [idx, segments, segSeries, refSegSeries, history]);

  if (history.length < 2) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted">
        Lancez la simulation quelques minutes pour alimenter l&apos;analyse.
      </div>
    );
  }

  return (
    <div className="panel-scroll h-full">
      <div className="mx-auto max-w-[1500px] space-y-3 p-4">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-lg font-semibold">
              <BarChart3 size={18} className="text-accent" /> Statistiques et analyse
            </h1>
            <p className="text-xs text-muted">Mode expert — toutes les valeurs sont issues du moteur (demande synthétique). « Réf. » = même scénario sans vos interventions.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-panel-2 p-2 text-xs">
            <label className="flex items-center gap-1">
              <span className="text-muted">Ligne</span>
              <select value={line} onChange={(e) => setLine(e.target.value as LineId | 'all')}>
                <option value="all">Toutes</option>
                {network.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    Ligne {l.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-muted">De</span>
              <select value={from} onChange={(e) => setRange([Number(e.target.value), Math.max(Number(e.target.value), to)])}>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {fmtClock(t)}
                  </option>
                ))}
              </select>
              <span className="text-muted">à</span>
              <select value={to} onChange={(e) => setRange([Math.min(from, Number(e.target.value)), Number(e.target.value)])}>
                {times.map((t) => (
                  <option key={t} value={t}>
                    {fmtClock(t)}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-1">
              <span className="text-muted">Incident</span>
              <select value={incType} onChange={(e) => setIncType(e.target.value as IncidentType | 'all')}>
                <option value="all">Tous types</option>
                {incidentTypesPresent.map((t) => (
                  <option key={t} value={t}>
                    {INCIDENT_TYPE_INFO[t].label}
                  </option>
                ))}
              </select>
            </label>
            <Button size="xs" variant="ghost" onClick={() => setRange(null)}>
              Toute la période
            </Button>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          <Panel title="Stations les plus congestionnées" icon={<NetworkIcon size={12} />} className="xl:col-span-1">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-faint">
                <tr>
                  <th className="py-1">Station</th>
                  <th className="text-right">Max à quai</th>
                  <th className="text-right">Moy.</th>
                  <th className="text-right">Pic</th>
                </tr>
              </thead>
              <tbody>
                {stationStats.slice(0, 10).map((s) => (
                  <tr
                    key={s.st.id}
                    className="cursor-pointer border-t border-edge hover:bg-panel-3"
                    onClick={() => useSelection.getState().select({ kind: 'station', id: s.st.id })}
                  >
                    <td className="py-1">
                      <span className="flex items-center gap-1">
                        {s.st.lines.map((l) => (
                          <LineBadge key={l} line={l} size={13} />
                        ))}
                        <span className="truncate">{s.st.name}</span>
                      </span>
                    </td>
                    <td className="tabular text-right" style={{ color: levelColor(saturationLevel(s.load, thresholds)) }}>
                      {fmtInt(s.max)}
                    </td>
                    <td className="tabular text-right text-muted">{fmtInt(s.mean)}</td>
                    <td className="tabular text-right text-muted">{fmtClock(s.peak)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Tronçons les plus fragiles" icon={<Waves size={12} />} className="xl:col-span-1">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-faint">
                <tr>
                  <th className="py-1">Tronçon</th>
                  <th className="text-right" title="Minutes au-dessus de 85 %">Min ≥ 85 %</th>
                  <th className="text-right">Max</th>
                  <th className="text-right">Moy. (réf.)</th>
                </tr>
              </thead>
              <tbody>
                {segmentStats.slice(0, 10).map((s) => (
                  <tr key={s.seg.id} className="cursor-pointer border-t border-edge hover:bg-panel-3" onClick={() => useSelection.getState().select({ kind: 'segment', id: s.seg.id })}>
                    <td className="py-1">
                      <span className="flex items-center gap-1">
                        <LineBadge line={s.seg.line} size={13} />
                        <span className="truncate">
                          {network.stationById.get(s.seg.a)?.name} ↔ {network.stationById.get(s.seg.b)?.name}
                        </span>
                      </span>
                    </td>
                    <td className="tabular text-right">{s.above}</td>
                    <td className="tabular text-right" style={{ color: levelColor(saturationLevel(s.max, thresholds)) }}>
                      {fmtPct(s.max)}
                    </td>
                    <td className="tabular text-right text-muted">
                      {fmtPct(s.mean)}
                      {s.refMean !== null && <span className="text-faint"> ({fmtPct(s.refMean)})</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel title="Lignes les plus affectées" icon={<BarChart3 size={12} />} className="xl:col-span-1">
            <table className="w-full text-xs">
              <thead className="text-left text-[10px] uppercase text-faint">
                <tr>
                  <th className="py-1">Ligne</th>
                  <th className="text-right">Sat. moy.</th>
                  <th className="text-right">Écart réf.</th>
                  <th className="text-right">Sat. max</th>
                  <th className="text-right" title="Somme des minutes × tronçons au-dessus de 85 %">Min. saturées</th>
                </tr>
              </thead>
              <tbody>
                {lineStats.map((l) => (
                  <tr key={l.line.id} className="border-t border-edge">
                    <td className="py-1">
                      <LineBadge line={l.line.id} size={16} />
                    </td>
                    <td className="tabular text-right">{fmtPct(l.mean)}</td>
                    <td className={cx('tabular text-right', l.refMean !== null && l.mean - l.refMean > 0.02 ? 'text-red-600' : 'text-muted')}>
                      {l.refMean !== null ? `${l.mean - l.refMean >= 0 ? '+' : ''}${fmtNum((l.mean - l.refMean) * 100, 1)} pts` : '—'}
                    </td>
                    <td className="tabular text-right" style={{ color: levelColor(saturationLevel(l.max, thresholds)) }}>
                      {fmtPct(l.max)}
                    </td>
                    <td className="tabular text-right">{l.saturatedMinutes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <Panel title="Propagation des perturbations" icon={<Waves size={12} />}>
            {refSegSeries ? (
              <>
                <p className="mb-1 text-[11px] text-muted">
                  Tronçons{line !== 'all' ? ` de la ligne ${line}` : ''} saturés, et tronçons dont la saturation dépasse la référence de plus de 15 points (effet de vos incidents et décisions ; les incidents du scénario figurent aussi dans la référence). Bandes : incidents{incType !== 'all' ? ` (${INCIDENT_TYPE_INFO[incType].label})` : ''}.
                </p>
                <ResponsiveContainer width="100%" height={190}>
                  <LineChart data={propagation} margin={{ top: 6, right: 10, bottom: 0, left: -16 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtClock(t)} {...axis} minTickGap={30} />
                    <YAxis {...axis} allowDecimals={false} width={40} />
                    <Tooltip formatter={(v, n) => [`${v} tronçon(s)`, n]} labelFormatter={(t) => fmtClock(Number(t))} contentStyle={{ background: CHART.tooltipBg, border: '1px solid #e6e1d7', fontSize: 11 }} />
                    {filteredIncidents.map((inc) => (
                      <ReferenceArea
                        key={inc.id}
                        x1={Math.max(from, inc.startTime)}
                        x2={Math.min(to, inc.endTime ?? (inc.duration !== null ? inc.startTime + inc.duration : to))}
                        fill="#ef4444"
                        fillOpacity={0.12}
                        stroke="#ef4444"
                        strokeOpacity={0.3}
                      />
                    ))}
                    <Line type="stepAfter" dataKey="saturated" stroke={CHART.reference} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} name="Tronçons saturés (≥ 85 %)" />
                    <Line type="stepAfter" dataKey="over" stroke="#f97316" strokeWidth={2} dot={false} isAnimationActive={false} name="Au-dessus de la référence (+15 pts)" />
                    <Legend iconType="plainline" wrapperStyle={{ fontSize: 10, color: CHART.axis }} />
                  </LineChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="text-xs text-muted">Activez la simulation de référence (couches de la carte) pour mesurer la propagation.</p>
            )}
            <IncidentImpactTable incidents={filteredIncidents} history={history} refHistory={refHistory} />
          </Panel>

          <Panel title="Temps d'attente et retards" icon={<Timer size={12} />}>
            <WaitChart history={history.filter((h) => h.time >= from && h.time <= to)} refHistory={refHistory} />
          </Panel>
        </div>

        <Panel title="Performance des mesures de régulation" icon={<Wrench size={12} />}>
          <RegulationPerformance actions={actions} history={history} refHistory={refHistory} />
        </Panel>

        <Panel title="Comparer deux simulations" icon={<GitCompareArrows size={12} />}>
          <ComparisonTool />
        </Panel>
      </div>
    </div>
  );
}

function IncidentImpactTable({ incidents, history, refHistory }: { incidents: Incident[]; history: HistoryPoint[]; refHistory: HistoryPoint[] | null }) {
  if (!incidents.length) return <p className="mt-2 text-[11px] text-faint">Aucun incident pour ce filtre.</p>;
  return (
    <table className="mt-2 w-full text-xs">
      <thead className="text-left text-[10px] uppercase text-faint">
        <tr>
          <th className="py-1">Incident</th>
          <th>Début</th>
          <th>Fin</th>
          <th className="text-right" title="Maximum de tronçons saturés pendant l'incident (référence)">Tronçons sat. max (réf.)</th>
          <th className="text-right" title="Retard moyen maximal pendant l'incident">Retard max</th>
        </tr>
      </thead>
      <tbody>
        {incidents.map((inc) => {
          const end = inc.endTime ?? (inc.duration !== null ? inc.startTime + inc.duration : Infinity);
          const window = history.filter((h) => h.time >= inc.startTime && h.time <= end + 600);
          const satMax = Math.max(0, ...window.map((h) => h.saturatedSegments));
          const refMax = refHistory ? Math.max(0, ...refHistory.filter((h) => h.time >= inc.startTime && h.time <= end + 600).map((h) => h.saturatedSegments)) : null;
          const delayMax = Math.max(0, ...window.map((h) => h.avgDelay));
          return (
            <tr key={inc.id} className="border-t border-edge">
              <td className="py-1">{inc.label}</td>
              <td className="tabular">{fmtClock(inc.startTime)}</td>
              <td className="tabular">{Number.isFinite(end) ? fmtClock(end) : '—'}</td>
              <td className="tabular text-right">
                {satMax}
                {refMax !== null && <span className="text-faint"> ({refMax})</span>}
              </td>
              <td className="tabular text-right">{fmtMin(delayMax)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function WaitChart({ history, refHistory }: { history: HistoryPoint[]; refHistory: HistoryPoint[] | null }) {
  const refMap = new Map((refHistory ?? []).map((r) => [r.time, r]));
  const data = history.map((h) => ({
    time: h.time,
    wait: h.avgWait / 60,
    delay: h.avgDelay / 60,
    refWait: refMap.get(h.time) ? refMap.get(h.time)!.avgWait / 60 : undefined,
    refDelay: refMap.get(h.time) ? refMap.get(h.time)!.avgDelay / 60 : undefined,
  }));
  return (
    <ResponsiveContainer width="100%" height={250}>
      <LineChart data={data} margin={{ top: 6, right: 10, bottom: 0, left: -16 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtClock(t)} {...axis} minTickGap={30} />
        <YAxis {...axis} width={40} tickFormatter={(v) => `${Number(v).toFixed(1)}`} label={{ value: 'min', fill: CHART.axis, fontSize: 10, position: 'insideTopLeft', dx: 16 }} />
        <Tooltip
          formatter={(v, n) => [`${Number(v).toFixed(2)} min`, n]}
          labelFormatter={(t) => fmtClock(Number(t))}
          contentStyle={{ background: CHART.tooltipBg, border: '1px solid #e6e1d7', fontSize: 11 }}
        />
        {refHistory && <Line dataKey="refDelay" name="Retard (réf.)" stroke={CHART.reference} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        {refHistory && <Line dataKey="refWait" name="Attente (réf.)" stroke="#64748b" strokeDasharray="1 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        <Line dataKey="delay" name="Retard moyen" stroke={CHART.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line dataKey="wait" name="Attente moyenne" stroke={CHART.secondary} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Legend iconType="plainline" wrapperStyle={{ fontSize: 10, color: CHART.axis }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

const ACTION_LABEL: Partial<Record<SimAction['type'], string>> = {
  'line.frequency': 'Fréquence de ligne',
  'line.reserve': 'Rames de réserve',
  'global.frequency': 'Fréquence globale',
  'station.close': 'Fermeture de station',
  'station.open': 'Réouverture de station',
  'segment.disable': 'Liaison désactivée',
  'segment.enable': 'Liaison réactivée',
  'incident.resolve': 'Incident levé',
  'incident.create': 'Incident déclenché',
};

function describeAction(a: SimAction): string {
  switch (a.type) {
    case 'line.frequency':
      return `L${a.line} → ${a.frequency} trains/h`;
    case 'line.reserve':
      return `L${a.line} → ${a.count} rame(s)`;
    case 'global.frequency':
      return `${Math.round(a.factor * 100)} %`;
    case 'station.close':
    case 'station.open':
      return loadNetwork().network!.stationById.get(a.stationId)?.name ?? a.stationId;
    case 'incident.create':
      return INCIDENT_TYPE_INFO[a.spec.type].label;
    default:
      return 'segmentId' in a ? a.segmentId : 'incidentId' in a ? a.incidentId : '';
  }
}

function RegulationPerformance({ actions, history, refHistory }: { actions: SimAction[]; history: HistoryPoint[]; refHistory: HistoryPoint[] | null }) {
  if (actions.length === 0) return <p className="text-xs text-faint">Aucune action du joueur pour l&apos;instant. Modifiez une fréquence, mobilisez des rames ou fermez une station pour mesurer l&apos;effet de vos décisions.</p>;
  if (!refHistory) return <p className="text-xs text-muted">Activez la simulation de référence pour mesurer l&apos;effet des décisions.</p>;
  const refMap = new Map(refHistory.map((r) => [r.time, r]));
  const window = 15 * 60;
  return (
    <div>
      <p className="mb-2 text-[11px] text-muted">
        Pour chaque décision : écart moyen avec la référence sur les 15 minutes simulées qui suivent (négatif = mieux que sans intervention). Les effets de décisions rapprochées se cumulent.
      </p>
      <table className="w-full text-xs">
        <thead className="text-left text-[10px] uppercase text-faint">
          <tr>
            <th className="py-1">Heure</th>
            <th>Décision</th>
            <th>Détail</th>
            <th className="text-right">Δ tronçons saturés</th>
            <th className="text-right">Δ retard moyen</th>
            <th className="text-right">Δ attente</th>
            <th className="text-right">Δ coût</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((a, i) => {
            const pts = history.filter((h) => h.time > a.time && h.time <= a.time + window && refMap.has(h.time));
            const n = pts.length;
            const avg = (f: (h: HistoryPoint) => number) => (n ? pts.reduce((s, h) => s + f(h) - f(refMap.get(h.time)!), 0) / n : NaN);
            const dSat = avg((h) => h.saturatedSegments);
            const dDelay = avg((h) => h.avgDelay);
            const dWait = avg((h) => h.avgWait);
            const lastPt = pts[pts.length - 1];
            const dCost = lastPt ? lastPt.operatingCost - refMap.get(lastPt.time)!.operatingCost : NaN;
            const cls = (v: number) => (!Number.isFinite(v) ? 'text-faint' : v < -1e-3 ? 'text-emerald-700' : v > 1e-3 ? 'text-red-600' : 'text-muted');
            return (
              <tr key={i} className="border-t border-edge">
                <td className="tabular py-1">{fmtClock(a.time)}</td>
                <td>{ACTION_LABEL[a.type] ?? a.type}</td>
                <td className="text-muted">{describeAction(a)}</td>
                <td className={cx('tabular text-right', cls(dSat))}>{Number.isFinite(dSat) ? fmtNum(dSat, 1) : 'en cours'}</td>
                <td className={cx('tabular text-right', cls(dDelay))}>{Number.isFinite(dDelay) ? `${fmtNum(dDelay / 60, 2)} min` : '—'}</td>
                <td className={cx('tabular text-right', cls(dWait))}>{Number.isFinite(dWait) ? `${fmtNum(dWait / 60, 2)} min` : '—'}</td>
                <td className={cx('tabular text-right', cls(dCost))}>{Number.isFinite(dCost) ? `${dCost >= 0 ? '+' : ''}${fmtNum(dCost, 0)} k€` : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ comparaison A/B */

type Source = { kind: 'current' } | { kind: 'reference' } | { kind: 'run'; id: string };

const METRICS: { key: keyof HistoryPoint; label: string; fmt: (v: number) => string }[] = [
  { key: 'saturatedSegments', label: 'Tronçons saturés', fmt: (v) => fmtNum(v, 0) },
  { key: 'avgDelay', label: 'Retard moyen', fmt: (v) => fmtMin(v) },
  { key: 'avgWait', label: 'Attente moyenne', fmt: (v) => fmtMin(v) },
  { key: 'waiting', label: 'Voyageurs à quai', fmt: (v) => fmtInt(v) },
  { key: 'affectedTotal', label: 'Voyageurs affectés (cumul)', fmt: (v) => fmtInt(v) },
  { key: 'serviceQuality', label: 'Qualité de service', fmt: (v) => fmtNum(v, 0) },
];

const SUMMARY_ROWS: { key: keyof RunSummary; label: string; fmt: (v: number) => string; lowerIsBetter: boolean }[] = [
  { key: 'avgDelayMean', label: 'Retard moyen', fmt: (v) => fmtMin(v, 2), lowerIsBetter: true },
  { key: 'avgWaitMean', label: 'Attente moyenne', fmt: (v) => fmtMin(v, 2), lowerIsBetter: true },
  { key: 'saturatedShareMean', label: 'Part de tronçons saturés', fmt: (v) => fmtPct(v, 1), lowerIsBetter: true },
  { key: 'maxSaturatedSegments', label: 'Tronçons saturés au pic', fmt: (v) => fmtNum(v, 0), lowerIsBetter: true },
  { key: 'affectedShare', label: 'Voyageurs affectés', fmt: (v) => fmtPct(v, 1), lowerIsBetter: true },
  { key: 'lostTrips', label: 'Voyageurs sans itinéraire', fmt: (v) => fmtInt(v), lowerIsBetter: true },
  { key: 'serviceQualityMean', label: 'Qualité de service moyenne', fmt: (v) => fmtNum(v, 1), lowerIsBetter: false },
  { key: 'operatingCost', label: 'Coût opérationnel (k€ fictifs)', fmt: (v) => fmtInt(v), lowerIsBetter: true },
];

function summaryOf(history: HistoryPoint[]): Partial<RunSummary> {
  const mean = (f: (h: HistoryPoint) => number) => history.reduce((a, h) => a + f(h), 0) / Math.max(1, history.length);
  const last = history[history.length - 1];
  return {
    avgDelayMean: mean((h) => h.avgDelay),
    avgWaitMean: mean((h) => h.avgWait),
    saturatedShareMean: mean((h) => h.saturatedSegments / loadNetwork().network!.segments.length),
    maxSaturatedSegments: Math.max(0, ...history.map((h) => h.saturatedSegments)),
    lostTrips: last?.lostTrips ?? 0,
    serviceQualityMean: mean((h) => h.serviceQuality),
    operatingCost: last?.operatingCost ?? 0,
  };
}

function ComparisonTool() {
  const network = loadNetwork().network!;
  const history = useSimulation((s) => s.history);
  const refHistory = useSimulation((s) => s.refHistory);
  const [runs] = useState<RecordedRun[]>(() => loadRuns().value);
  const [mode, setMode] = useState<'existing' | 'run'>('run');
  const [a, setA] = useState<Source>({ kind: 'reference' });
  const [b, setB] = useState<Source>({ kind: 'current' });
  const [metric, setMetric] = useState<keyof HistoryPoint>('saturatedSegments');
  const [scenarioId, setScenarioId] = useState('malaise-poissonniere');
  const [variantLine, setVariantLine] = useState<LineId>('7');
  const [variantFreq, setVariantFreq] = useState(36);
  const [variantReserve, setVariantReserve] = useState(8);
  const [busy, setBusy] = useState<number | null>(null);
  const [results, setResults] = useState<[VariantResult, VariantResult] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resolve = (s: Source): { label: string; history: HistoryPoint[]; summary: Partial<RunSummary> } | null => {
    if (s.kind === 'current') return { label: 'Partie en cours', history, summary: summaryOf(history) };
    if (s.kind === 'reference') return refHistory ? { label: 'Référence (sans intervention)', history: refHistory, summary: summaryOf(refHistory) } : null;
    const r = runs.find((x) => x.id === s.id);
    return r ? { label: r.name, history: r.history, summary: r.summary } : null;
  };

  const sources: { value: string; label: string; src: Source }[] = [
    { value: 'current', label: 'Partie en cours', src: { kind: 'current' } },
    { value: 'reference', label: 'Référence (sans intervention)', src: { kind: 'reference' } },
    ...runs.map((r) => ({ value: r.id, label: `Enregistrée : ${r.name}`, src: { kind: 'run', id: r.id } as Source })),
  ];
  const key = (s: Source) => (s.kind === 'run' ? s.id : s.kind);

  const pair = mode === 'run' ? results : (() => {
    const ra = resolve(a);
    const rb = resolve(b);
    return ra && rb ? [ra, rb] : null;
  })();

  const launch = async () => {
    setError(null);
    setResults(null);
    const line = network.lineById.get(variantLine)!;
    const A: Variant = { label: 'A : fréquences de référence', frequencies: {}, reserves: {}, globalFactor: 1 };
    const B: Variant = {
      label: `B : L${variantLine} à ${variantFreq} trains/h + ${variantReserve} rame(s)`,
      frequencies: { [variantLine]: Math.min(line.maxFrequency, variantFreq) },
      reserves: { [variantLine]: Math.min(line.reserveFleet, variantReserve) },
      globalFactor: 1,
    };
    try {
      setBusy(0);
      const r = await controller.compare(scenarioId, [A, B], (p) => setBusy(p));
      setResults(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const chartData = pair
    ? (() => {
        const mapB = new Map(pair[1].history.map((h) => [h.time, h[metric] as number]));
        return pair[0].history.map((h) => ({ time: h.time, a: h[metric] as number, b: mapB.get(h.time) }));
      })()
    : [];
  const mfmt = METRICS.find((m) => m.key === metric)!.fmt;

  return (
    <div className="space-y-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant={mode === 'run' ? 'primary' : 'subtle'} size="xs" onClick={() => setMode('run')}>
          Lancer deux variantes
        </Button>
        <Button variant={mode === 'existing' ? 'primary' : 'subtle'} size="xs" onClick={() => setMode('existing')}>
          Comparer des simulations existantes
        </Button>
      </div>
      {mode === 'run' ? (
        <div className="flex flex-wrap items-end gap-2 rounded-md border border-edge p-2">
          <label className="flex flex-col gap-1">
            <span className="text-muted">Scénario</span>
            <select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}>
              {SCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </label>
          <span className="pb-1 text-muted">A : fréquences de référence — B :</span>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Ligne</span>
            <select value={variantLine} onChange={(e) => setVariantLine(e.target.value as LineId)}>
              {network.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  Ligne {l.id}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Trains/h</span>
            <input type="number" className="w-16" value={variantFreq} onChange={(e) => setVariantFreq(Number(e.target.value))} />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-muted">Rames de réserve</span>
            <input type="number" className="w-16" value={variantReserve} onChange={(e) => setVariantReserve(Number(e.target.value))} />
          </label>
          <Button variant="primary" onClick={launch} disabled={busy !== null}>
            {busy !== null ? (
              <>
                <Loader2 size={13} className="animate-spin" /> {Math.round(busy * 100)} %
              </>
            ) : (
              'Lancer la comparaison'
            )}
          </Button>
          <span className="pb-1 text-[10px] text-faint">Même graine pour A et B : seules vos décisions diffèrent.</span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-edge p-2">
          {(['A', 'B'] as const).map((slot) => (
            <label key={slot} className="flex items-center gap-1">
              <span className="font-semibold">{slot}</span>
              <select
                value={key(slot === 'A' ? a : b)}
                onChange={(e) => {
                  const s = sources.find((x) => x.value === e.target.value)!.src;
                  if (slot === 'A') setA(s);
                  else setB(s);
                }}
              >
                {sources.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {runs.length === 0 && <span className="text-[10px] text-faint">Astuce : « Enregistrer pour comparer » (écran Scénarios ou bilan) ajoute des parties à cette liste.</span>}
        </div>
      )}
      {error && <p className="text-red-600">{error}</p>}
      {pair && (
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          <table className="w-full">
            <thead className="text-left text-[10px] uppercase text-faint">
              <tr>
                <th className="py-1">Indicateur</th>
                <th className="text-right">A — {pair[0].label}</th>
                <th className="text-right">B — {pair[1].label}</th>
                <th className="text-right">B − A</th>
              </tr>
            </thead>
            <tbody>
              {SUMMARY_ROWS.map((r) => {
                const va = pair[0].summary[r.key] as number | undefined;
                const vb = pair[1].summary[r.key] as number | undefined;
                if (va === undefined || vb === undefined || va === null || vb === null) return null;
                const d = vb - va;
                const better = Math.abs(d) < 1e-9 ? null : (d < 0) === r.lowerIsBetter;
                return (
                  <tr key={r.key} className="border-t border-edge">
                    <td className="py-1">{r.label}</td>
                    <td className="tabular text-right">{r.fmt(va)}</td>
                    <td className="tabular text-right">{r.fmt(vb)}</td>
                    <td className={cx('tabular text-right', better === null ? 'text-muted' : better ? 'text-emerald-700' : 'text-red-600')}>
                      {d >= 0 ? '+' : '−'}
                      {r.fmt(Math.abs(d))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="text-muted">Courbe</span>
              <select value={metric} onChange={(e) => setMetric(e.target.value as keyof HistoryPoint)}>
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <ResponsiveContainer width="100%" height={210}>
              <LineChart data={chartData} margin={{ top: 6, right: 10, bottom: 0, left: -10 }}>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtClock(t)} {...axis} minTickGap={30} />
                <YAxis {...axis} width={48} tickFormatter={(v) => mfmt(Number(v))} />
                <Tooltip formatter={(v, n) => [mfmt(Number(v)), n]} labelFormatter={(t) => fmtClock(Number(t))} contentStyle={{ background: CHART.tooltipBg, border: '1px solid #e6e1d7', fontSize: 11 }} />
                <Line dataKey="a" name={`A — ${pair[0].label}`} stroke={CHART.reference} strokeWidth={2} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                <Line dataKey="b" name={`B — ${pair[1].label}`} stroke={CHART.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
                <Legend iconType="plainline" wrapperStyle={{ fontSize: 10, color: CHART.axis }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <p className="text-[10px] text-faint">
        Limites : métriques agrégées d&apos;un modèle macroscopique à demande synthétique ; une différence de quelques pourcents peut relever de l&apos;arrondi du modèle. Voir docs/MODEL.md.
      </p>
    </div>
  );
}
