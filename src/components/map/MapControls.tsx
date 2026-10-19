'use client';

import { BookOpen, Expand, Layers, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { controller } from '@/lib/simulationController';
import { mapCommands } from '@/store/mapViewStore';
import { useSettings, type FlowMode, type Layers as LayerSet, type MapMetric } from '@/store/settingsStore';
import { cx, Segmented, Toggle } from '../ui/primitives';
import { LegendContent } from './MapLegend';

const LAYER_LABELS: [keyof LayerSet, string][] = [
  ['trains', 'Rames en circulation'],
  ['crowds', 'Voyageurs en attente'],
  ['labels', 'Noms des stations'],
  ['geography', 'Seine, bois et monuments'],
  ['lineNumbers', 'Numéros de ligne'],
  ['interchanges', 'Correspondances'],
  ['flows', 'Couleurs de charge'],
  ['incidents', 'Incidents'],
  ['routes', 'Itinéraire calculé'],
  ['minimap', 'Mini-carte'],
];

export const METRIC_OPTIONS: { value: MapMetric; label: string; title: string }[] = [
  { value: 'saturation', label: 'Saturation', title: 'Demande (débit + file à résorber en 10 min) / capacité du tronçon' },
  { value: 'flow', label: 'Voyageurs/h', title: 'Voyageurs transportés par heure (moyenne glissante 5 min, sens le plus chargé)' },
  { value: 'delay', label: 'Retard', title: 'Retard estimé : allongement du parcours + attente due à la file' },
  { value: 'variation', label: 'Variation', title: 'Variation du flux par rapport à la simulation de référence (sans intervention)' },
];

/** Barre de commandes du plan (haut, centrée) : mode d'affichage, zoom, couches, légende. */
export function MapControls() {
  const [panel, setPanel] = useState<'layers' | 'legend' | null>(null);
  const layers = useSettings((s) => s.layers);
  const setLayer = useSettings((s) => s.setLayer);
  const flowMode = useSettings((s) => s.flowMode);
  const metric = useSettings((s) => s.metric);
  const heatOpacity = useSettings((s) => s.heatOpacity);
  const referenceEnabled = useSettings((s) => s.referenceEnabled);
  const set = useSettings((s) => s.set);
  const mode: FlowMode = flowMode === 'mixed' ? 'heatmap' : flowMode;

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <div className="pointer-events-auto flex items-center gap-1.5 rounded-xl border border-edge bg-white/95 p-1 shadow-sm backdrop-blur">
        <Segmented<FlowMode>
          value={mode}
          onChange={(v) => set('flowMode', v)}
          options={[
            { value: 'plan', label: 'Plan', title: 'Couleurs des lignes ; halo orange/rouge sur les tronçons chargés' },
            { value: 'segments', label: 'Charge', title: 'Lignes colorées selon l’indicateur choisi' },
            { value: 'heatmap', label: 'Affluence', title: 'Densité de voyageurs autour des stations' },
          ]}
        />
        <span className="mx-0.5 h-5 w-px bg-edge" />
        <IconBtn label="Zoomer" onClick={() => mapCommands.zoomBy(1.4)}>
          <Plus size={15} />
        </IconBtn>
        <IconBtn label="Dézoomer" onClick={() => mapCommands.zoomBy(1 / 1.4)}>
          <Minus size={15} />
        </IconBtn>
        <IconBtn label="Vue complète" onClick={() => mapCommands.fit()}>
          <Expand size={14} />
        </IconBtn>
        <IconBtn label="Couches d'affichage" active={panel === 'layers'} onClick={() => setPanel(panel === 'layers' ? null : 'layers')}>
          <Layers size={14} />
        </IconBtn>
        <IconBtn label="Légende" active={panel === 'legend'} onClick={() => setPanel(panel === 'legend' ? null : 'legend')}>
          <BookOpen size={14} />
        </IconBtn>
      </div>

      {mode === 'segments' && (
        <div className="pointer-events-auto rounded-xl border border-edge bg-white/95 p-1 shadow-sm backdrop-blur">
          <Segmented<MapMetric>
            size="xs"
            value={metric}
            onChange={(v) => {
              if (v === 'variation' && !referenceEnabled) controller.setReferenceEnabled(true);
              set('metric', v);
            }}
            options={METRIC_OPTIONS}
          />
        </div>
      )}
      {mode === 'heatmap' && (
        <label className="pointer-events-auto flex items-center gap-2 rounded-xl border border-edge bg-white/95 px-3 py-1 text-[11px] text-muted shadow-sm">
          Opacité
          <input type="range" min={0.15} max={1} step={0.05} value={heatOpacity} onChange={(e) => set('heatOpacity', Number(e.target.value))} className="w-24" />
          <span className="flex items-center gap-1">
            <input type="checkbox" checked={flowMode === 'mixed'} onChange={(e) => set('flowMode', e.target.checked ? 'mixed' : 'heatmap')} /> + charge des lignes
          </span>
        </label>
      )}

      {panel === 'layers' && (
        <div className="pointer-events-auto w-64 rounded-xl border border-edge bg-white p-3 shadow-lg">
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted">Couches</div>
          {LAYER_LABELS.map(([k, label]) => (
            <Toggle key={k} label={label} checked={layers[k]} onChange={(v) => setLayer(k, v)} />
          ))}
          <div className="mt-2 border-t border-edge pt-2">
            <Toggle label="Simulation de référence" checked={referenceEnabled} onChange={(v) => controller.setReferenceEnabled(v)} />
            <p className="mt-1 text-[10px] leading-snug text-faint">
              Calcule en parallèle le même scénario sans vos interventions, pour comparer. Désactivez-la si l&apos;ordinateur peine.
            </p>
          </div>
        </div>
      )}
      {panel === 'legend' && (
        <div className="pointer-events-auto w-72 rounded-xl border border-edge bg-white p-3 text-[11px] shadow-lg">
          <LegendContent />
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children, active }: { label: string; onClick: () => void; children: React.ReactNode; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      className={cx('flex h-7 w-7 items-center justify-center rounded-md transition-colors', active ? 'bg-ink text-white' : 'text-ink/80 hover:bg-panel-3')}
    >
      {children}
    </button>
  );
}
