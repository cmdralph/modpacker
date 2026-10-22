import type { ProjectInfo } from '../api/common';
import { createStore } from './store';

export type SettingsTab = 'appearance' | 'layout' | 'curseforge';

export interface UiState {
  /** Project shown in the details view (the search hit or pack entry it was opened from). */
  details: ProjectInfo | null;
  settingsTab: SettingsTab | null;
  importOpen: boolean;
  /** Mobile workspace drawer. */
  drawerOpen: boolean;
}

export const uiStore = createStore<UiState, Partial<UiState>>((state, patch) => ({ ...state, ...patch }), {
  details: null,
  settingsTab: null,
  importOpen: false,
  drawerOpen: false,
});

export const ui = {
  openDetails: (details: ProjectInfo) => uiStore.dispatch({ details }),
  closeDetails: () => uiStore.dispatch({ details: null }),
  openSettings: (tab: SettingsTab = 'appearance') => uiStore.dispatch({ settingsTab: tab }),
  closeSettings: () => uiStore.dispatch({ settingsTab: null }),
  openImport: () => uiStore.dispatch({ importOpen: true, drawerOpen: false }),
  closeImport: () => uiStore.dispatch({ importOpen: false }),
  setDrawer: (drawerOpen: boolean) => uiStore.dispatch({ drawerOpen }),
};
