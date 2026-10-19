'use client';
import { navigate, useRoute } from './router';

export function usePathname(): string {
  return useRoute((s) => s.path);
}

export function useRouter() {
  return { push: navigate, replace: navigate, back: () => window.history.back() };
}
