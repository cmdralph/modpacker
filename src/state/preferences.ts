import { createStore } from './store';

export type ThemeId = 'system' | 'dark' | 'midnight' | 'nether' | 'light';
export type AccentId = 'emerald' | 'sky' | 'violet' | 'amber' | 'rose' | 'lime' | 'cyan' | 'fuchsia';
export type Density = 'comfortable' | 'compact';
export type ResultView = 'grid' | 'list';
export type SidebarSide = 'right' | 'left';
export type SearchSort = 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
/** Which side a mod must run on (Modrinth metadata; CurseForge has no equivalent filter). */
export type Environment = 'any' | 'client' | 'server';

export interface Preferences {
  theme: ThemeId;
  accent: AccentId;
  density: Density;
  resultView: ResultView;
  sidebarSide: SidebarSide;
  /** Root font size in percent – scales the whole UI. */
  fontScale: 90 | 100 | 110 | 120;
  infiniteScroll: boolean;
  hideAdded: boolean;
  showDescriptions: boolean;
  sort: SearchSort;
  environment: Environment;
  /** The welcome guide was closed. */
  welcomeDismissed: boolean;
}

export const THEMES: { id: ThemeId; label: string; swatch: string }[] = [
  { id: 'system', label: 'System', swatch: 'linear-gradient(135deg, #0f172a 50%, #f1f5f9 50%)' },
  { id: 'dark', label: 'Dark', swatch: '#0f172a' },
  { id: 'midnight', label: 'Midnight', swatch: '#09090b' },
  { id: 'nether', label: 'Nether', swatch: '#1c1917' },
  { id: 'light', label: 'Light', swatch: '#f1f5f9' },
];

export const ACCENTS: { id: AccentId; label: string; swatch: string }[] = [
  { id: 'emerald', label: 'Emerald', swatch: '#10b981' },
  { id: 'sky', label: 'Sky', swatch: '#0ea5e9' },
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'amber', label: 'Amber', swatch: '#f59e0b' },
  { id: 'rose', label: 'Rose', swatch: '#f43f5e' },
  { id: 'lime', label: 'Lime', swatch: '#84cc16' },
  { id: 'cyan', label: 'Cyan', swatch: '#06b6d4' },
  { id: 'fuchsia', label: 'Fuchsia', swatch: '#d946ef' },
];

export const SORTS: { id: SearchSort; label: string }[] = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'follows', label: 'Popularity' },
  { id: 'newest', label: 'Newest' },
  { id: 'updated', label: 'Recently updated' },
];

export const ENVIRONMENTS: { id: Environment; label: string }[] = [
  { id: 'any', label: 'Client & server' },
  { id: 'client', label: 'Works on clients' },
  { id: 'server', label: 'Works on servers' },
];

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  accent: 'emerald',
  density: 'comfortable',
  resultView: 'grid',
  sidebarSide: 'right',
  fontScale: 100,
  infiniteScroll: true,
  hideAdded: false,
  showDescriptions: true,
  sort: 'relevance',
  environment: 'any',
  welcomeDismissed: false,
};

const STORAGE_KEY = 'modpacker:preferences:v1';

const ALLOWED: { [K in keyof Preferences]: readonly Preferences[K][] } = {
  theme: THEMES.map((t) => t.id),
  accent: ACCENTS.map((a) => a.id),
  density: ['comfortable', 'compact'],
  resultView: ['grid', 'list'],
  sidebarSide: ['right', 'left'],
  fontScale: [90, 100, 110, 120],
  infiniteScroll: [true, false],
  hideAdded: [true, false],
  showDescriptions: [true, false],
  sort: SORTS.map((s) => s.id),
  environment: ENVIRONMENTS.map((e) => e.id),
  welcomeDismissed: [true, false],
};

/** Keeps only known keys with allowed values, so a stale or tampered entry can't break the UI. */
export function sanitizePreferences(raw: unknown): Preferences {
  const result: Preferences = { ...DEFAULT_PREFERENCES };
  if (!raw || typeof raw !== 'object') return result;
  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(ALLOWED) as (keyof Preferences)[]) {
    if ((ALLOWED[key] as readonly unknown[]).includes(record[key])) {
      (result as unknown as Record<string, unknown>)[key] = record[key];
    }
  }
  return result;
}

function load(): Preferences {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? sanitizePreferences(JSON.parse(raw)) : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export const preferencesStore = createStore<Preferences, Partial<Preferences> | 'reset'>(
  (state, patch) => (patch === 'reset' ? DEFAULT_PREFERENCES : { ...state, ...patch }),
  typeof localStorage === 'undefined' ? DEFAULT_PREFERENCES : load(),
);

preferencesStore.subscribe(() => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferencesStore.getState()));
  } catch {
    // Storage unavailable: preferences last for this session only.
  }
});

export const setPreferences = (patch: Partial<Preferences>) => preferencesStore.dispatch(patch);
