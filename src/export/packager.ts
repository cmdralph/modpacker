import { loadJSZip } from '../lib/zip';
import type { PackFile } from '../state/files';
import type { ExportFormat, PackMeta, PackMod, Profile } from '../types';
import { buildCurseForgeManifest, buildCurseForgeModList, buildModrinthIndex } from './manifests';

export interface PackArchive {
  blob: Blob;
  filename: string;
  fileCount: number;
  /** Bundled files that this format can't carry (server-only overrides in a CurseForge zip). */
  droppedFiles: number;
}

export const MRPACK_MIME = 'application/x-modrinth-modpack+zip';

export function archiveFilename(meta: Pick<PackMeta, 'name' | 'version'>, format: ExportFormat): string {
  const base =
    `${meta.name}-${meta.version}`
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'modpack';
  return `${base}.${format === 'curseforge' ? 'zip' : 'mrpack'}`;
}

/**
 * Where each bundled file goes. A .mrpack keeps the client/server split; CurseForge packs only
 * have one `overrides/` folder, so client files are merged into it and server-only files dropped.
 */
export function overrideTarget(file: PackFile, format: ExportFormat): string | null {
  if (format === 'modrinth') return `${file.root}/${file.path}`;
  return file.root === 'server-overrides' ? null : `overrides/${file.path}`;
}

/**
 * Compiles the pack into a downloadable archive, entirely in memory.
 * Both formats always get an `overrides/` folder (empty unless files were bundled).
 */
export async function buildPackArchive(input: {
  format: ExportFormat;
  meta: PackMeta;
  profile: Profile;
  loaderVersion: string;
  mods: PackMod[];
  files?: PackFile[];
}): Promise<PackArchive> {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  let fileCount: number;

  if (input.format === 'curseforge') {
    const manifest = buildCurseForgeManifest({
      meta: input.meta,
      profile: input.profile,
      loaderVersion: input.loaderVersion,
      files: input.mods.flatMap((m) => (m.curseforge ? [m.curseforge] : [])),
    });
    fileCount = manifest.files.length;
    zip.file('manifest.json', JSON.stringify(manifest, null, 2));
    zip.file('modlist.html', buildCurseForgeModList(input.mods));
  } else {
    const index = buildModrinthIndex({
      meta: input.meta,
      profile: input.profile,
      loaderVersion: input.loaderVersion,
      files: input.mods.flatMap((m) => (m.modrinth ? [m.modrinth] : [])),
      summary: input.meta.description?.trim() || undefined,
    });
    fileCount = index.files.length;
    zip.file('modrinth.index.json', JSON.stringify(index, null, 2));
  }
  zip.folder('overrides');

  let droppedFiles = 0;
  for (const file of input.files ?? []) {
    const target = overrideTarget(file, input.format);
    if (target) zip.file(target, file.data);
    else droppedFiles += 1;
  }

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: input.format === 'modrinth' ? MRPACK_MIME : 'application/zip',
  });
  return { blob, filename: archiveFilename(input.meta, input.format), fileCount, droppedFiles };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been handled so the download is not cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
