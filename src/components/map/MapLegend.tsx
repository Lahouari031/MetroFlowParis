'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { DELAY_STEPS, FLOW_STEPS, fmtInt, LEVEL_COLORS, VARIATION_STEPS } from '@/lib/metrics';
import { useSettings } from '@/store/settingsStore';

/** Légende toujours accessible (repliable) : décrit précisément l'indicateur affiché. */
export function MapLegend() {
  const [open, setOpen] = useState(false);
  const metric = useSettings((s) => s.metric);
  const mode = useSettings((s) => s.flowMode);
  const t = useSettings((s) => s.thresholds);
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  let title = '';
  let desc = '';
  let rows: [string, string][] = [];
  if (metric === 'saturation') {
    title = 'Taux de saturation des tronçons';
    desc = 'Demande / capacité sur l’intervalle : (débit lissé 5 min + file d’attente à résorber en 10 min) ÷ capacité (trains/h × capacité d’une rame).';
    rows = [
      [LEVEL_COLORS.low, `< ${pct(t[0])}`],
      [LEVEL_COLORS.moderate, `${pct(t[0])} – ${pct(t[1])}`],
      [LEVEL_COLORS.high, `${pct(t[1])} – ${pct(t[2])}`],
      [LEVEL_COLORS.veryHigh, `${pct(t[2])} – ${pct(t[3])}`],
      [LEVEL_COLORS.over, `> ${pct(t[3])} (clignote)`],
    ];
  } else if (metric === 'flow') {
    title = 'Voyageurs par heure (sens le plus chargé)';
    desc = 'Débit transporté sur le tronçon, moyenne glissante sur 5 minutes simulées.';
    rows = [
      [LEVEL_COLORS.low, `< ${fmtInt(FLOW_STEPS[0])}`],
      [LEVEL_COLORS.moderate, `${fmtInt(FLOW_STEPS[0])} – ${fmtInt(FLOW_STEPS[1])}`],
      [LEVEL_COLORS.high, `${fmtInt(FLOW_STEPS[1])} – ${fmtInt(FLOW_STEPS[2])}`],
      [LEVEL_COLORS.veryHigh, `${fmtInt(FLOW_STEPS[2])} – ${fmtInt(FLOW_STEPS[3])}`],
      [LEVEL_COLORS.over, `> ${fmtInt(FLOW_STEPS[3])}`],
    ];
  } else if (metric === 'delay') {
    title = 'Retard estimé par tronçon';
    desc = 'Allongement du temps de parcours (incidents) + attente supplémentaire due à la file des voyageurs refusés.';
    rows = [
      [LEVEL_COLORS.low, `< ${DELAY_STEPS[0]} s`],
      [LEVEL_COLORS.moderate, `${DELAY_STEPS[0]} – ${DELAY_STEPS[1]} s`],
      [LEVEL_COLORS.high, `${DELAY_STEPS[1] / 60} – ${DELAY_STEPS[2] / 60} min`],
      [LEVEL_COLORS.veryHigh, `${DELAY_STEPS[2] / 60} – ${DELAY_STEPS[3] / 60} min`],
      [LEVEL_COLORS.over, `> ${DELAY_STEPS[3] / 60} min`],
    ];
  } else {
    title = 'Variation vs simulation de référence';
    desc = 'Flux actuel comparé au même scénario simulé sans vos interventions (même graine).';
    rows = [
      ['#38bdf8', '≤ −25 %'],
      [LEVEL_COLORS.low, '±10 %'],
      [LEVEL_COLORS.moderate, `+${VARIATION_STEPS[0] * 100} à +${VARIATION_STEPS[1] * 100} %`],
      [LEVEL_COLORS.high, `+${VARIATION_STEPS[1] * 100} à +${VARIATION_STEPS[2] * 100} %`],
      [LEVEL_COLORS.veryHigh, `> +${VARIATION_STEPS[2] * 100} %`],
    ];
  }

  return (
    <div className="absolute bottom-3 left-3 w-60 rounded-lg border border-edge bg-panel/90 text-[11px] shadow-lg backdrop-blur" onClick={(e) => e.stopPropagation()}>
      <button type="button" className="flex w-full items-center justify-between px-3 py-2 font-semibold" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        Légende {open ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
      </button>
      {open && (
        <div className="space-y-2 border-t border-edge px-3 pb-3 pt-2">
          {mode !== 'heatmap' && (
            <div>
              <div className="mb-1 font-medium text-ink/90">{title}</div>
              <div className="space-y-0.5">
                {rows.map(([c, label]) => (
                  <div key={label} className="flex items-center gap-2">
                    <span className="h-2 w-6 rounded-full" style={{ background: c }} />
                    <span className="tabular text-muted">{label}</span>
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] leading-snug text-faint">{desc}</p>
            </div>
          )}
          {mode !== 'segments' && (
            <div>
              <div className="mb-1 font-medium text-ink/90">Densité autour des stations</div>
              <p className="text-[10px] leading-snug text-faint">
                Couleur : voyageurs à quai / capacité des quais (mêmes seuils). Taille : entrées + sorties par heure.
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 gap-x-2 gap-y-1 border-t border-edge pt-2 text-[10px] text-muted">
            <span className="flex items-center gap-1">
              <svg width="14" height="12" viewBox="-7 -6 14 12"><path d="M0,-5 L6,4 L-6,4 Z" fill="#ef4444" /></svg> Incident actif
            </span>
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="-6 -6 12 12"><circle r="5" fill="#ef4444" /><path d="M-2.5,-2.5 L2.5,2.5 M-2.5,2.5 L2.5,-2.5" stroke="#fff" strokeWidth="1.6" /></svg> Station fermée
            </span>
            <span className="flex items-center gap-1">
              <svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke="#ff2d55" strokeWidth="3" strokeDasharray="4 3" /></svg> Interruption
            </span>
            <span className="flex items-center gap-1">
              <svg width="18" height="8"><line x1="1" y1="4" x2="17" y2="4" stroke="#fbbf24" strokeWidth="1.5" strokeDasharray="2 3" /></svg> Ralentissement
            </span>
          </div>
          <p className="text-[9px] leading-snug text-faint">Valeurs simulées (demande synthétique) — pas des mesures RATP.</p>
        </div>
      )}
    </div>
  );
}
