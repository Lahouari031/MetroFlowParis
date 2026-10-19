'use client';

import { create } from 'zustand';

/** Transformation courante de la carte (partagée avec la mini-carte et les contrôles). */
export interface MapView {
  k: number;
  x: number;
  y: number;
  width: number;
  height: number;
  set: (v: Partial<Omit<MapView, 'set'>>) => void;
}

export const useMapView = create<MapView>((set) => ({
  k: 1,
  x: 0,
  y: 0,
  width: 1,
  height: 1,
  set: (v) => set(v),
}));

/** Commandes de caméra exposées par la carte (zoom, recentrage). */
export const mapCommands: {
  zoomBy: (f: number) => void;
  fit: () => void;
  centerOn: (x: number, y: number, k?: number) => void;
} = {
  zoomBy: () => {},
  fit: () => {},
  centerOn: () => {},
};
