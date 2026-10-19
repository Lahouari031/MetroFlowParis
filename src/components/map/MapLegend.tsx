'use client';

import { DELAY_STEPS, FLOW_STEPS, fmtInt, LEVEL_COLORS, VARIATION_STEPS } from '@/lib/metrics';
import { useSettings } from '@/store/settingsStore';

/** Légende (ouverte depuis la barre de commandes du plan). Décrit précisément ce qui est affiché. */
export function LegendContent() {
  const metric = useSettings((s) => s.metric);
  const mode = useSettings((s) => s.flowMode);
  const t = useSettings((s) => s.thresholds);
  const pct = (v: number) => `${Math.round(v * 100)} %`;

  let rows: [string, string][] = [];
  let title = '';
  if (mode === 'segments' || mode === 'mixed') {
    if (metric === 'saturation') {
      title = 'Saturation (demande / capacité)';
      rows = [
        [LEVEL_COLORS.low, `< ${pct(t[0])}`],
        [LEVEL_COLORS.moderate, `${pct(t[0])} – ${pct(t[1])}`],
        [LEVEL_COLORS.high, `${pct(t[1])} – ${pct(t[2])}`],
        [LEVEL_COLORS.veryHigh, `${pct(t[2])} – ${pct(t[3])}`],
        [LEVEL_COLORS.over, `> ${pct(t[3])} (clignote)`],
      ];
    } else if (metric === 'flow') {
      title = 'Voyageurs par heure';
      rows = [
        [LEVEL_COLORS.low, `< ${fmtInt(FLOW_STEPS[0])}`],
        [LEVEL_COLORS.moderate, `${fmtInt(FLOW_STEPS[0])} – ${fmtInt(FLOW_STEPS[1])}`],
        [LEVEL_COLORS.high, `${fmtInt(FLOW_STEPS[1])} – ${fmtInt(FLOW_STEPS[2])}`],
        [LEVEL_COLORS.veryHigh, `> ${fmtInt(FLOW_STEPS[2])}`],
      ];
    } else if (metric === 'delay') {
      title = 'Retard estimé';
      rows = [
        [LEVEL_COLORS.low, `< ${DELAY_STEPS[0]} s`],
        [LEVEL_COLORS.moderate, `${DELAY_STEPS[0]} – ${DELAY_STEPS[1]} s`],
        [LEVEL_COLORS.high, `${DELAY_STEPS[1] / 60} – ${DELAY_STEPS[2] / 60} min`],
        [LEVEL_COLORS.veryHigh, `> ${DELAY_STEPS[2] / 60} min`],
      ];
    } else {
      title = 'Variation vs référence (sans vos actions)';
      rows = [
        ['#38bdf8', '≤ −25 %'],
        [LEVEL_COLORS.low, '±10 %'],
        [LEVEL_COLORS.high, `+${VARIATION_STEPS[1] * 100} à +${VARIATION_STEPS[2] * 100} %`],
        [LEVEL_COLORS.veryHigh, `> +${VARIATION_STEPS[2] * 100} %`],
      ];
    }
  }

  return (
    <div className="space-y-2.5">
      {mode === 'plan' && (
        <div>
          <div className="mb-1 font-semibold">Charge des lignes</div>
          <div className="space-y-1">
            <Row swatch={<span className="h-2 w-7 rounded-full bg-[#F59E0B]/50" />} label={`Halo orange : tronçon chargé (≥ ${pct(t[1])})`} />
            <Row swatch={<span className="h-2 w-7 rounded-full bg-[#E5383B]/70" />} label={`Halo rouge : saturé (≥ ${pct(t[2])}), clignote au-delà de ${pct(t[3])}`} />
          </div>
        </div>
      )}
      {rows.length > 0 && (
        <div>
          <div className="mb-1 font-semibold">{title}</div>
          {rows.map(([c, label]) => (
            <Row key={label} swatch={<span className="h-2 w-7 rounded-full" style={{ background: c }} />} label={label} />
          ))}
        </div>
      )}
      {(mode === 'heatmap' || mode === 'mixed') && (
        <p className="text-muted">Affluence : couleur = voyageurs à quai / capacité des quais ; taille = entrées + sorties par heure.</p>
      )}
      <div className="space-y-1 border-t border-edge pt-2">
        <Row
          swatch={
            <svg width="28" height="12">
              <rect x="2" y="2" width="24" height="8" rx="2.5" fill="#FA9ABA" stroke="#1E1E1E" />
              <rect x="3.5" y="3.5" width="12" height="5" fill="#fff" opacity="0.85" />
            </svg>
          }
          label="Rame : la partie blanche = places libres"
        />
        <Row
          swatch={
            <svg width="28" height="12" fill="#2A2A2A">
              <circle cx="6" cy="6" r="2" />
              <circle cx="12" cy="6" r="2" />
              <circle cx="18" cy="6" r="2" />
            </svg>
          }
          label="Voyageurs à quai (1 point ≈ 60 personnes)"
        />
        <Row
          swatch={
            <svg width="28" height="14">
              <circle cx="14" cy="7" r="5.5" fill="none" stroke="#E5383B" strokeWidth="2" />
            </svg>
          }
          label="Cercle rouge clignotant : quais saturés"
        />
        <Row
          swatch={
            <svg width="28" height="12">
              <path d="M14,1 L20,11 L8,11 Z" fill="#ef4444" />
            </svg>
          }
          label="Incident (cliquez pour le gérer)"
        />
        <Row
          swatch={
            <svg width="28" height="8">
              <line x1="2" y1="4" x2="26" y2="4" stroke="#E5383B" strokeWidth="3" strokeDasharray="5 4" />
            </svg>
          }
          label="Tronçon interrompu"
        />
      </div>
      <p className="text-[10px] leading-snug text-faint">
        Rames et voyageurs sont une représentation du modèle (demande synthétique), pas une mesure RATP. Positions des stations approximatives.
      </p>
    </div>
  );
}

function Row({ swatch, label }: { swatch: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex w-8 shrink-0 justify-center">{swatch}</span>
      <span className="text-muted">{label}</span>
    </div>
  );
}
