'use client';

import { Expand, Layers, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { controller } from '@/lib/simulationController';
import { mapCommands } from '@/store/mapViewStore';
import { useSettings, type FlowMode, type Layers as LayerSet, type MapMetric } from '@/store/settingsStore';
import { cx, Segmented, Toggle } from '../ui/primitives';

const LAYER_LABELS: [keyof LayerSet, string][] = [
  ['labels', 'Noms des stations'],
  ['lineNumbers', 'Numéros de ligne'],
  ['interchanges', 'Correspondances'],
  ['flows', 'Flux (couleurs)'],
  ['particles', 'Particules animées'],
  ['incidents', 'Incidents'],
  ['routes', 'Itinéraires sélectionnés'],
  ['minimap', 'Mini-carte'],
];

export const METRIC_OPTIONS: { value: MapMetric; label: string; title: string }[] = [
  { value: 'saturation', label: 'Saturation', title: 'Demande (débit + file à résorber en 10 min) / capacité du tronçon' },
  { value: 'flow', label: 'Voyageurs/h', title: 'Voyageurs transportés par heure (moyenne glissante 5 min, sens le plus chargé)' },
  { value: 'delay', label: 'Retard', title: 'Retard estimé : allongement du parcours + attente due à la file' },
  { value: 'variation', label: 'Variation', title: 'Variation du flux par rapport à la simulation de référence (sans intervention)' },
];

export function MapControls() {
  const [open, setOpen] = useState(false);
  const layers = useSettings((s) => s.layers);
  const setLayer = useSettings((s) => s.setLayer);
  const flowMode = useSettings((s) => s.flowMode);
  const metric = useSettings((s) => s.metric);
  const heatOpacity = useSettings((s) => s.heatOpacity);
  const referenceEnabled = useSettings((s) => s.referenceEnabled);
  const set = useSettings((s) => s.set);

  return (
    <>
      <div className="absolute left-3 top-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="rounded-lg border border-edge bg-panel/90 p-1 shadow-lg backdrop-blur">
          <Segmented<FlowMode>
            value={flowMode}
            onChange={(v) => set('flowMode', v)}
            options={[
              { value: 'segments', label: 'Tronçons', title: 'Mode A : couleur des tronçons' },
              { value: 'heatmap', label: 'Densité', title: 'Mode B : densité autour des stations' },
              { value: 'mixed', label: 'Mixte', title: 'Tronçons + densité' },
            ]}
          />
        </div>
        <div className="rounded-lg border border-edge bg-panel/90 p-1 shadow-lg backdrop-blur">
          <Segmented<MapMetric>
            value={metric}
            onChange={(v) => {
              if (v === 'variation' && !referenceEnabled) controller.setReferenceEnabled(true);
              set('metric', v);
            }}
            options={METRIC_OPTIONS}
          />
        </div>
        {flowMode !== 'segments' && (
          <label className="flex items-center gap-2 rounded-lg border border-edge bg-panel/90 px-2 py-1 text-[11px] text-muted shadow-lg backdrop-blur">
            Opacité densité
            <input type="range" min={0.15} max={1} step={0.05} value={heatOpacity} onChange={(e) => set('heatOpacity', Number(e.target.value))} className="w-24" />
          </label>
        )}
      </div>

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-col overflow-hidden rounded-lg border border-edge bg-panel/90 shadow-lg backdrop-blur">
          <CtlButton label="Zoomer" onClick={() => mapCommands.zoomBy(1.4)}>
            <Plus size={15} />
          </CtlButton>
          <CtlButton label="Dézoomer" onClick={() => mapCommands.zoomBy(1 / 1.4)}>
            <Minus size={15} />
          </CtlButton>
          <CtlButton label="Vue complète" onClick={() => mapCommands.fit()}>
            <Expand size={14} />
          </CtlButton>
          <CtlButton label="Couches d'affichage" active={open} onClick={() => setOpen((o) => !o)}>
            <Layers size={14} />
          </CtlButton>
        </div>
        {open && (
          <div className="w-56 rounded-lg border border-edge bg-panel/95 p-3 shadow-xl backdrop-blur">
            <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Couches</div>
            {LAYER_LABELS.map(([k, label]) => (
              <Toggle key={k} label={label} checked={layers[k]} onChange={(v) => setLayer(k, v)} />
            ))}
            <div className="mt-2 border-t border-edge pt-2">
              <Toggle label="Simulation de référence" checked={referenceEnabled} onChange={(v) => controller.setReferenceEnabled(v)} />
              <p className="mt-1 text-[10px] leading-snug text-faint">
                Calcule en parallèle le même scénario sans vos interventions (comparaison avant/après). Désactivez-la pour alléger le calcul.
              </p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function CtlButton({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx('flex h-8 w-8 items-center justify-center border-b border-edge last:border-0 hover:bg-panel-3', active ? 'text-accent' : 'text-ink/85')}
    >
      {children}
    </button>
  );
}
