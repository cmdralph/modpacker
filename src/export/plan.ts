import { orderedMods, type PackState } from '../state/pack';
import type { CurseForgeFileRef, ExportFormat, ModrinthFileRef, PackMod } from '../types';

export interface ExportPlan {
  format: ExportFormat;
  /** Mods that will be written to the manifest. */
  included: PackMod[];
  /**
   * Ready mods that have no file on the target platform – Modrinth-only mods
   * for a CurseForge export, or CurseForge-only mods for a .mrpack.
   */
  crossPlatform: PackMod[];
  /** Mods without a compatible file (incompatible/error) – always left out. */
  unavailable: PackMod[];
  /** Mods still resolving – export must wait. */
  pending: PackMod[];
  /** Mods the user chose to omit from this export. */
  omitted: PackMod[];
  /** CurseForge files whose authors disabled third-party downloads (launchers may need a manual download). */
  restricted: PackMod[];
}

export function fileForFormat(mod: PackMod, format: 'curseforge'): CurseForgeFileRef | null;
export function fileForFormat(mod: PackMod, format: 'modrinth'): ModrinthFileRef | null;
export function fileForFormat(mod: PackMod, format: ExportFormat) {
  return format === 'curseforge' ? mod.curseforge : mod.modrinth;
}

export function planExport(state: PackState, format: ExportFormat, omittedKeys: ReadonlySet<string>): ExportPlan {
  const plan: ExportPlan = {
    format,
    included: [],
    crossPlatform: [],
    unavailable: [],
    pending: [],
    omitted: [],
    restricted: [],
  };

  for (const mod of orderedMods(state)) {
    if (mod.status === 'resolving') plan.pending.push(mod);
    else if (mod.status !== 'ready') plan.unavailable.push(mod);
    else if (omittedKeys.has(mod.key)) plan.omitted.push(mod);
    else if (format === 'curseforge' ? !mod.curseforge : !mod.modrinth) plan.crossPlatform.push(mod);
    else {
      plan.included.push(mod);
      if (format === 'curseforge' && mod.curseforge && !mod.curseforge.downloadUrl) plan.restricted.push(mod);
    }
  }
  return plan;
}

export function otherFormat(format: ExportFormat): ExportFormat {
  return format === 'curseforge' ? 'modrinth' : 'curseforge';
}
