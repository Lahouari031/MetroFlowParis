'use client';

import { ArrowDownRight, ArrowUpRight, Info } from 'lucide-react';
import { fmtInt, fmtMin, fmtPct, relDelta } from '@/lib/metrics';
import { useSimulation } from '@/store/simulationStore';
import type { KPIs } from '@/types/simulation';
import { cx, InfoTip } from '../ui/primitives';

interface KpiDef {
  key: keyof KPIs;
  label: string;
  unit: string;
  explanation: string;
  format: (v: number) => string;
  /** Une hausse est-elle favorable ? */
  higherIsBetter: boolean;
}

export const KPI_DEFS: KpiDef[] = [
  { key: 'inNetwork', label: 'Voyageurs dans le réseau', unit: 'voy.', format: fmtInt, higherIsBetter: true, explanation: 'Voyageurs simulés présents (à quai, à bord ou en correspondance) à cet instant.' },
  { key: 'waiting', label: 'En attente', unit: 'voy.', format: fmtInt, higherIsBetter: false, explanation: 'Voyageurs sur les quais, y compris ceux refusés à l’embarquement faute de place.' },
  { key: 'avgSaturation', label: 'Saturation moyenne', unit: '%', format: (v) => fmtPct(v), higherIsBetter: false, explanation: 'Moyenne, sur les tronçons ouverts, du rapport demande / capacité (sens le plus chargé).' },
  { key: 'saturatedSegments', label: 'Tronçons saturés', unit: 'tronçons', format: fmtInt, higherIsBetter: false, explanation: 'Tronçons dont la saturation dépasse 85 % (seuil d’alerte du moteur).' },
  { key: 'activeIncidents', label: 'Incidents actifs', unit: '', format: fmtInt, higherIsBetter: false, explanation: 'Perturbations en cours (hors programmées, suspendues ou levées).' },
  { key: 'avgDelay', label: 'Retard moyen', unit: 'min', format: (v) => fmtMin(v), higherIsBetter: false, explanation: 'Retard des trajets terminés sur les 10 dernières minutes (moyenne pondérée), par rapport au trajet de référence en conditions nominales.' },
  { key: 'avgWait', label: 'Attente moyenne', unit: 'min', format: (v) => fmtMin(v), higherIsBetter: false, explanation: 'Attente à quai avant embarquement (½ intervalle + refus éventuels), moyenne glissante 10 min.' },
  { key: 'affectedTotal', label: 'Voyageurs affectés', unit: 'voy.', format: fmtInt, higherIsBetter: false, explanation: 'Cumul des voyageurs ayant subi un incident : itinéraire modifié, tronçon ou station perturbés, report vers une autre station.' },
  { key: 'entriesPerHour', label: 'Fréquentation', unit: 'entrées/h', format: fmtInt, higherIsBetter: true, explanation: 'Entrées dans le réseau par heure (moyenne glissante 5 min). Demande synthétique.' },
  { key: 'availableCapacity', label: 'Capacité disponible', unit: '%', format: (v) => fmtPct(v), higherIsBetter: true, explanation: 'Part de la capacité totale offerte (tous tronçons, deux sens) non utilisée par les flux actuels.' },
  { key: 'serviceQuality', label: 'Qualité de service', unit: '/100', format: (v) => fmtInt(v), higherIsBetter: true, explanation: '100 − 50×min(1, retard/10 min) − 30×min(1, 3×part de tronçons saturés) − 20×min(1, attente/10 min).' },
  { key: 'operatingCost', label: 'Coût opérationnel', unit: 'k€ fictifs', format: (v) => fmtInt(v), higherIsBetter: false, explanation: 'Coût fictif cumulé : rames en service × coût horaire + mobilisation de rames de réserve. Sert au score économique.' },
];

export function KPIGrid({ compact = false }: { compact?: boolean }) {
  const kpis = useSimulation((s) => s.snapshot?.kpis);
  const ref = useSimulation((s) => s.refSnapshot?.kpis);
  const first = useSimulation((s) => s.history[0]);
  if (!kpis) return null;
  const defs = compact ? KPI_DEFS.filter((d) => d.key !== 'operatingCost' && d.key !== 'availableCapacity') : KPI_DEFS;
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {defs.map((d) => {
        const v = kpis[d.key];
        const r = ref?.[d.key];
        const start = first ? (first as unknown as Record<string, number>)[d.key] : undefined;
        const delta = relDelta(v, r);
        const good = delta === null ? null : Math.abs(delta) < 0.02 ? null : (delta > 0) === d.higherIsBetter;
        return (
          <div key={d.key} className="rounded-md border border-edge bg-panel-3/60 px-2 py-1.5">
            <div className="flex items-center justify-between gap-1 text-[10px] text-muted">
              <span className="truncate">{d.label}</span>
              <InfoTip text={d.explanation + ' (Valeur simulée.)'}>
                <Info size={10} className="shrink-0 text-faint" />
              </InfoTip>
            </div>
            <div className="flex items-baseline gap-1">
              <span className="tabular text-[15px] font-semibold">{d.format(v)}</span>
              {d.unit && d.unit !== '%' && <span className="text-[9px] text-faint">{d.unit === 'min' ? '' : d.unit}</span>}
            </div>
            <div className="flex items-center gap-1 text-[9px] text-faint">
              {delta !== null && (
                <span className={cx('flex items-center', good === null ? 'text-muted' : good ? 'text-emerald-600' : 'text-red-600')} title="Écart avec la simulation de référence (même scénario sans vos interventions)">
                  {delta > 0 ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
                  {fmtPct(Math.abs(delta))} vs réf.
                </span>
              )}
              {start !== undefined && delta === null && <span title="Valeur au début du scénario">début : {d.format(start)}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
