'use client';
/**
 * Routeur minimal pour la version autonome (un seul fichier HTML, sans serveur) :
 * remplace next/link et next/navigation par une navigation par ancre (#/statistiques).
 */
import { create } from 'zustand';

const read = () => {
  if (typeof window === 'undefined') return '/';
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
};

export const useRoute = create<{ path: string }>(() => ({ path: read() }));

if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => useRoute.setState({ path: read() }));
}

export function navigate(path: string) {
  if (typeof window !== 'undefined') window.location.hash = path;
  useRoute.setState({ path });
}
