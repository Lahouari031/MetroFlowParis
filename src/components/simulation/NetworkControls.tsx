'use client';

import { ChevronDown, ChevronRight, Minus, Plus, TrainFront } from 'lucide-react';
import { useState } from 'react';
import { loadNetwork } from '@/data/network';
import { referenceFleet } from '@/engine/networkState';
import { fmtInt, fmtNum } from '@/lib/metrics';
import { controller } from '@/lib/simulationController';
import { useSimulation } from '@/store/simulationStore';
import type { LineId } from '@/types/network';
import { Button, cx, InfoTip, LineBadge, SliderField } from '../ui/primitives';

/** Régulation : fréquences (globale et par ligne) et mobilisation de rames de réserve. */
export function NetworkControls() {
  const network = loadNetwork().network!;
  const regulation = useSimulation((s) => s.snapshot?.regulation);
  const freq = useSimulation((s) => s.snapshot?.lineFrequency);
  const cap = useSimulation((s) => s.snapshot?.lineCapacity);
  const trains = useSimulation((s) => s.snapshot?.lineTrains);
  const fleetLimit = useSimulation((s) => s.snapshot?.lineFleetLimit);
  const [open, setOpen] = useState<LineId | null>(null);
  if (!regulation || !freq || !cap || !trains || !fleetLimit) return null;

  return (
    <div className="space-y-2.5">
      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-muted">Fréquence globale</span>
          <InfoTip text="Multiplie la fréquence programmée de toutes les lignes (50 % à 130 %). Limitée par la signalisation et la flotte disponible.">
            <span className="tabular text-ink">{Math.round(regulation.globalFrequencyFactor * 100)} %</span>
          </InfoTip>
        </div>
        <SliderField
          value={Math.round(regulation.globalFrequencyFactor * 100)}
          min={50}
          max={130}
          step={5}
          unit="%"
          onCommit={(v) => controller.dispatch({ type: 'global.frequency', factor: v / 100 })}
        />
      </div>
      <ul className="space-y-1">
        {network.lines.map((l) => {
          const ctl = regulation.lines[l.id];
          const isOpen = open === l.id;
          const baseFleet = referenceFleet(network, l);
          const programmed = Math.min(l.maxFrequency, ctl.frequency * regulation.globalFrequencyFactor);
          const limitedByFleet = fleetLimit[l.id] < programmed - 0.05;
          return (
            <li key={l.id} className="rounded-md border border-edge bg-panel-3/40">
              <button type="button" className="flex w-full items-center gap-2 px-2 py-1.5" onClick={() => setOpen(isOpen ? null : l.id)} aria-expanded={isOpen}>
                <LineBadge line={l.id} />
                <span className="tabular text-[11px]">{fmtNum(freq[l.id], 1)} trains/h</span>
                <span className={cx('tabular ml-auto text-[10px]', limitedByFleet ? 'text-amber-700' : 'text-faint')}>{fmtInt(cap[l.id] / 1000)}k voy./h</span>
                {isOpen ? <ChevronDown size={12} className="text-faint" /> : <ChevronRight size={12} className="text-faint" />}
              </button>
              {isOpen && (
                <div className="space-y-2 border-t border-edge px-2 pb-2 pt-1.5 text-[11px]">
                  <div>
                    <div className="mb-0.5 flex justify-between text-muted">
                      <span>Fréquence programmée</span>
                      <span className="text-faint">réf. {l.baseFrequency} · max {l.maxFrequency}</span>
                    </div>
                    <SliderField value={ctl.frequency} min={1} max={l.maxFrequency} unit="tr/h" onCommit={(v) => controller.dispatch({ type: 'line.frequency', line: l.id, frequency: v })} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1 text-muted">
                      <TrainFront size={12} /> Réserve mobilisée
                    </span>
                    <div className="flex items-center gap-1">
                      <Button size="xs" variant="ghost" aria-label="Retirer une rame" disabled={ctl.reserveMobilized <= 0} onClick={() => controller.dispatch({ type: 'line.reserve', line: l.id, count: ctl.reserveMobilized - 1 })}>
                        <Minus size={11} />
                      </Button>
                      <span className="tabular w-10 text-center">
                        {ctl.reserveMobilized}/{l.reserveFleet}
                      </span>
                      <Button
                        size="xs"
                        variant="ghost"
                        aria-label="Ajouter une rame"
                        disabled={ctl.reserveMobilized >= l.reserveFleet}
                        onClick={() => controller.dispatch({ type: 'line.reserve', line: l.id, count: ctl.reserveMobilized + 1 })}
                      >
                        <Plus size={11} />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] text-muted">
                    <span>Rames en service</span>
                    <span className="tabular text-right text-ink">
                      {trains[l.id]} / {baseFleet + ctl.reserveMobilized}
                    </span>
                    <span>Fréquence max. (flotte)</span>
                    <span className="tabular text-right text-ink">{fmtNum(fleetLimit[l.id], 1)} tr/h</span>
                    <span>Capacité / sens</span>
                    <span className="tabular text-right text-ink">{fmtInt(cap[l.id])} voy./h</span>
                    <span>Rame</span>
                    <span className="tabular text-right text-ink">{l.trainCapacity} places</span>
                  </div>
                  {limitedByFleet && (
                    <p className="text-[10px] leading-snug text-amber-700">
                      La flotte limite la fréquence : mobilisez des rames de réserve pour atteindre la fréquence programmée.
                    </p>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] leading-snug text-faint">
        Plus de trains = plus de capacité et moins d&apos;attente, mais un coût opérationnel fictif plus élevé (0,6 k€/rame/h ; 4 k€ par rame de réserve mobilisée).
      </p>
    </div>
  );
}
