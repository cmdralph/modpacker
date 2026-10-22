import type { ProjectInfo } from '../api/common';
import type { ParsedPack } from '../import/parsePack';
import { createStore } from './store';

export type SettingsTab = 'appearance' | 'layout' | 'curseforge';

export interface ImportPreset {
  /** Where the pack came from, for display ("a share link", a file name). */
  name: string;
  pack: ParsedPack;
}

export interface UiState {
  /** Project shown in the details view (the search hit or pack entry it was opened from). */
  details: ProjectInfo | null;
  settingsTab: SettingsTab | null;
  importOpen: boolean;
  /** A pack to preview straight away when the import dialog opens (e.g. from a share link). */
  importPreset: ImportPreset | null;
  packsOpen: boolean;
  shortcutsOpen: boolean;
  /** Mobile workspace drawer. */
  drawerOpen: boolean;
}

export const uiStore = createStore<UiState, Partial<UiState>>((state, patch) => ({ ...state, ...patch }), {
  details: null,
  settingsTab: null,
  importOpen: false,
  importPreset: null,
  packsOpen: false,
  shortcutsOpen: false,
  drawerOpen: false,
});

export const ui = {
  openDetails: (details: ProjectInfo) => uiStore.dispatch({ details }),
  closeDetails: () => uiStore.dispatch({ details: null }),
  openSettings: (tab: SettingsTab = 'appearance') => uiStore.dispatch({ settingsTab: tab }),
  closeSettings: () => uiStore.dispatch({ settingsTab: null }),
  openImport: () => uiStore.dispatch({ importOpen: true, importPreset: null, drawerOpen: false, packsOpen: false }),
  /** Opens the import dialog with a pack already parsed (e.g. from a share link). */
  previewImport: (importPreset: ImportPreset) => uiStore.dispatch({ importOpen: true, importPreset, drawerOpen: false, packsOpen: false }),
  closeImport: () => uiStore.dispatch({ importOpen: false, importPreset: null }),
  setPacks: (packsOpen: boolean) => uiStore.dispatch({ packsOpen, drawerOpen: false }),
  setShortcuts: (shortcutsOpen: boolean) => uiStore.dispatch({ shortcutsOpen }),
  setDrawer: (drawerOpen: boolean) => uiStore.dispatch({ drawerOpen }),
};
