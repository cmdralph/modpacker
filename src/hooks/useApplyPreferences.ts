import { useEffect, useSyncExternalStore } from 'react';
import { preferencesStore } from '../state/preferences';
import { useStore } from '../state/store';

const darkQuery = '(prefers-color-scheme: dark)';

function subscribeToScheme(callback: () => void) {
  const media = window.matchMedia(darkQuery);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}

/** Mirrors theme, accent, density and font scale onto <html> so CSS variables pick them up. */
export function useApplyPreferences(): void {
  const prefs = useStore(preferencesStore, (s) => s);
  const systemDark = useSyncExternalStore(subscribeToScheme, () => window.matchMedia(darkQuery).matches, () => true);
  const theme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.dataset.accent = prefs.accent;
    root.dataset.density = prefs.density;
    root.style.fontSize = `${prefs.fontScale}%`;
    root.classList.toggle('dark', theme !== 'light');
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(root).getPropertyValue('--base-950').trim());
  }, [theme, prefs.accent, prefs.density, prefs.fontScale]);
}
