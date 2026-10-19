'use client';

/**
 * Graphiques alimentés exclusivement par l'historique du moteur (aucune valeur statique).
 * Conventions : traits de 2 px, une seule échelle par graphique, série « référence » en
 * pointillé gris, infobulle au survol, légende dès deux séries.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { loadNetwork } from '@/data/network';
import { fmtClock, fmtInt, fmtNum, levelColor, saturationLevel } from '@/lib/metrics';
import { useSettings } from '@/store/settingsStore';
import { useSelection, useSimulation } from '@/store/simulationStore';
import type { HistoryPoint } from '@/types/simulation';

export const CHART = {
  primary: '#38bdf8',
  secondary: '#a78bfa',
  reference: '#94a3b8',
  grid: '#1c2940',
  axis: '#5b6b85',
  tooltipBg: '#0b1322',
};

const axisProps = {
  stroke: CHART.axis,
  tick: { fill: CHART.axis, fontSize: 10 },
  tickLine: false,
  axisLine: { stroke: CHART.grid },
};

function TooltipBox({ active, payload, label, format }: { active?: boolean; payload?: { name: string; value: number; color: string; dataKey: string }[]; label?: number | string; format: (v: number, key: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-edge-strong px-2.5 py-1.5 text-[11px] shadow-xl" style={{ background: CHART.tooltipBg }}>
      <div className="mb-0.5 font-semibold text-ink">{typeof label === 'number' ? fmtClock(label) : label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-1.5 text-ink/90">
          <span className="h-0.5 w-3 rounded" style={{ background: p.color }} />
          <span className="text-muted">{p.name}</span>
          <span className="tabular ml-auto pl-3">{Number.isFinite(p.value) ? format(p.value, p.dataKey) : '—'}</span>
        </div>
      ))}
    </div>
  );
}

/** Fusionne l'historique et la référence sur l'axe temporel. */
function merge(history: HistoryPoint[], ref: HistoryPoint[] | null, pick: (h: HistoryPoint) => number) {
  const refMap = new Map((ref ?? []).map((r) => [r.time, pick(r)]));
  return history.map((h) => ({ time: h.time, value: pick(h), ref: refMap.get(h.time) }));
}

export function TimeSeriesChart({
  pick,
  name,
  format,
  height = 150,
  color = CHART.primary,
  yDomain,
  threshold,
}: {
  pick: (h: HistoryPoint) => number;
  name: string;
  format: (v: number) => string;
  height?: number;
  color?: string;
  yDomain?: [number | 'auto', number | 'auto'];
  threshold?: { value: number; label: string };
}) {
  const history = useSimulation((s) => s.history);
  const ref = useSimulation((s) => s.refHistory);
  const data = merge(history, ref, pick);
  if (data.length < 2) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtClock(t)} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => format(v)} domain={yDomain ?? [0, 'auto']} />
        <Tooltip content={<TooltipBox format={(v) => format(v)} />} cursor={{ stroke: '#475569', strokeWidth: 1 }} />
        {threshold && <ReferenceLine y={threshold.value} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.7} label={{ value: threshold.label, fill: '#f87171', fontSize: 9, position: 'insideTopRight' }} />}
        {ref && <Line type="monotone" dataKey="ref" name="Référence (sans intervention)" stroke={CHART.reference} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="value" name={name} stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        {ref && <Legend iconType="plainline" iconSize={12} wrapperStyle={{ fontSize: 10, color: CHART.axis }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Deux mesures de même unité sur un même axe (ex. retard et attente, en minutes). */
export function DualSeriesChart({
  a,
  b,
  format,
  height = 150,
}: {
  a: { pick: (h: HistoryPoint) => number; name: string };
  b: { pick: (h: HistoryPoint) => number; name: string };
  format: (v: number) => string;
  height?: number;
}) {
  const history = useSimulation((s) => s.history);
  const ref = useSimulation((s) => s.refHistory);
  const refMap = new Map((ref ?? []).map((r) => [r.time, a.pick(r)]));
  const data = history.map((h) => ({ time: h.time, a: a.pick(h), b: b.pick(h), ref: refMap.get(h.time) }));
  if (data.length < 2) return <EmptyChart height={height} />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid stroke={CHART.grid} vertical={false} />
        <XAxis dataKey="time" type="number" domain={['dataMin', 'dataMax']} tickFormatter={(t) => fmtClock(t)} {...axisProps} minTickGap={28} />
        <YAxis {...axisProps} width={44} tickFormatter={(v) => format(v)} />
        <Tooltip content={<TooltipBox format={(v) => format(v)} />} cursor={{ stroke: '#475569', strokeWidth: 1 }} />
        {ref && <Line type="monotone" dataKey="ref" name={`${a.name} (réf.)`} stroke={CHART.reference} strokeDasharray="4 3" strokeWidth={1.5} dot={false} isAnimationActive={false} />}
        <Line type="monotone" dataKey="a" name={a.name} stroke={CHART.primary} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Line type="monotone" dataKey="b" name={b.name} stroke={CHART.secondary} strokeWidth={2} dot={false} isAnimationActive={false} />
        <Legend iconType="plainline" iconSize={12} wrapperStyle={{ fontSize: 10, color: CHART.axis }} />
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Saturation moyenne et maximale par ligne (instant présent). */
export function LineSaturationChart({ height = 170 }: { height?: number }) {
  const history = useSimulation((s) => s.history);
  const thresholds = useSettings((s) => s.thresholds);
  const network = loadNetwork().network!;
  const last = history[history.length - 1];
  if (!last) return <EmptyChart height={height} />;
  const data = network.lines.map((l) => ({
    line: `L${l.id}`,
    color: l.color,
    mean: last.lineSaturation[l.id] * 100,
    max: last.lineMaxSaturation[l.id] * 100,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: -18 }} barGap={2}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" domain={[0, (dataMax: number) => Math.max(110, Math.ceil(dataMax / 10) * 10)]} tickFormatter={(v) => `${v} %`} {...axisProps} />
        <YAxis type="category" dataKey="line" {...axisProps} width={44} />
        <Tooltip content={<TooltipBox format={(v) => `${fmtNum(v, 0)} %`} />} cursor={{ fill: '#ffffff08' }} />
        <ReferenceLine x={thresholds[2] * 100} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.6} />
        <Bar dataKey="mean" name="Saturation moyenne" radius={[0, 4, 4, 0]} barSize={7} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.line} fill={d.color} />
          ))}
        </Bar>
        <Bar dataKey="max" name="Tronçon le plus chargé" radius={[0, 4, 4, 0]} barSize={7} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.line} fill={levelColor(saturationLevel(d.max / 100, thresholds))} />
          ))}
        </Bar>
        <Legend
          content={() => (
            <div className="flex justify-center gap-3 text-[10px]" style={{ color: CHART.axis }}>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-slate-400" /> Moyenne (couleur de ligne)</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-orange-500" /> Tronçon le plus chargé (niveau)</span>
            </div>
          )}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Stations les plus chargées (voyageurs à quai). */
export function StationRanking({ count = 8, height = 190 }: { count?: number; height?: number }) {
  const snapshot = useSimulation((s) => s.snapshot);
  const thresholds = useSettings((s) => s.thresholds);
  const network = loadNetwork().network!;
  if (!snapshot) return <EmptyChart height={height} />;
  const data = network.stations
    .map((st) => ({ id: st.id, name: st.name, waiting: snapshot.stationWaiting[st.index], load: snapshot.stationLoad[st.index] }))
    .sort((a, b) => b.waiting - a.waiting)
    .slice(0, count);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={CHART.grid} horizontal={false} />
        <XAxis type="number" tickFormatter={(v) => fmtInt(v)} {...axisProps} />
        <YAxis type="category" dataKey="name" {...axisProps} width={104} tick={{ fill: '#cbd5e1', fontSize: 9.5 }} interval={0} />
        <Tooltip content={<TooltipBox format={(v) => `${fmtInt(v)} voy.`} />} cursor={{ fill: '#ffffff08' }} />
        <Bar
          dataKey="waiting"
          name="Voyageurs à quai"
          radius={[0, 4, 4, 0]}
          barSize={9}
          isAnimationActive={false}
          style={{ cursor: 'pointer' }}
          onClick={(d: { payload?: { id: string } }) => {
            const id = d?.payload?.id;
            if (id) {
              useSelection.getState().select({ kind: 'station', id });
              useSelection.getState().focusStation(id);
            }
          }}
        >
          {data.map((d) => (
            <Cell key={d.id} fill={levelColor(saturationLevel(d.load, thresholds))} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EmptyChart({ height }: { height: number }) {
  return (
    <div className="flex items-center justify-center rounded border border-dashed border-edge text-[11px] text-faint" style={{ height }}>
      Données disponibles après la première minute simulée
    </div>
  );
}
