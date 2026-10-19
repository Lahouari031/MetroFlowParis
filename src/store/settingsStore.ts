'use client';

import { create } from 'zustand';
import { loadSettings, saveSettings } from '@/lib/persistence';

export type FlowMode = 'segments' | 'heatmap' | 'mixed';
export type MapMetric = 'saturation' | 'flow' | 'delay' | 'variation';

export interface Layers {
  labels: boolean;
  lineNumbers: boolean;
  interchanges: boolean;
  flows: boolean;
  incidents: boolean;
  routes: boolean;
  particles: boolean;
  minimap: boolean;
}

export interface Settings {
  layers: Layers;
  flowMode: FlowMode;
  metric: MapMetric;
  heatOpacity: number;
  /** Seuils de couleur de saturation : vert < t0 ≤ jaune < t1 ≤ orange < t2 ≤ rouge < t3 ≤ rouge intense. */
  thresholds: [number, number, number, number];
  /** Calcule en parallèle la simulation de référence (sans intervention) pour la comparaison. */
  referenceEnabled: boolean;
  lastScenarioId: string;
}

export const DEFAULT_SETTINGS: Settings = {
  layers: {
    labels: true,
    lineNumbers: true,
    interchanges: true,
    flows: true,
    incidents: true,
    routes: true,
    particles: true,
    minimap: true,
  },
  flowMode: 'segments',
  metric: 'saturation',
  heatOpacity: 0.55,
  thresholds: [0.4, 0.65, 0.85, 1],
  referenceEnabled: true,
  lastScenarioId: 'malaise-poissonniere',
};

interface SettingsStore extends Settings {
  hydrated: boolean;
  storageError: string | null;
  hydrate: () => void;
  setLayer: (k: keyof Layers, v: boolean) => void;
  set: <K extends keyof Settings>(k: K, v: Settings[K]) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...DEFAULT_SETTINGS,
  hydrated: false,
  storageError: null,
  hydrate: () => {
    if (get().hydrated) return;
    const { value, error } = loadSettings(DEFAULT_SETTINGS);
    set({ ...value, layers: { ...DEFAULT_SETTINGS.layers, ...value.layers }, hydrated: true, storageError: error });
  },
  setLayer: (k, v) => {
    set({ layers: { ...get().layers, [k]: v } });
    persist();
  },
  set: (k, v) => {
    set({ [k]: v } as Partial<SettingsStore>);
    persist();
  },
  reset: () => {
    set({ ...DEFAULT_SETTINGS });
    persist();
  },
}));

function persist() {
  const s = useSettings.getState();
  const value: Settings = {
    layers: s.layers,
    flowMode: s.flowMode,
    metric: s.metric,
    heatOpacity: s.heatOpacity,
    thresholds: s.thresholds,
    referenceEnabled: s.referenceEnabled,
    lastScenarioId: s.lastScenarioId,
  };
  const err = saveSettings(value);
  if (err) useSettings.setState({ storageError: err });
}
