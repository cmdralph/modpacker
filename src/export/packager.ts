import JSZip from 'jszip';
import type { ExportFormat, PackMeta, PackMod, Profile } from '../types';
import { buildCurseForgeManifest, buildCurseForgeModList, buildModrinthIndex } from './manifests';

export interface PackArchive {
  blob: Blob;
  filename: string;
  fileCount: number;
}

export const MRPACK_MIME = 'application/x-modrinth-modpack+zip';

export function archiveFilename(meta: PackMeta, format: ExportFormat): string {
  const base =
    `${meta.name}-${meta.version}`
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '') || 'modpack';
  return `${base}.${format === 'curseforge' ? 'zip' : 'mrpack'}`;
}

/**
 * Compiles the pack into a downloadable archive, entirely in memory.
 * Both formats get an (empty) `overrides/` folder for configs, resource packs, etc.
 */
export async function buildPackArchive(input: {
  format: ExportFormat;
  meta: PackMeta;
  profile: Profile;
  loaderVersion: string;
  mods: PackMod[];
}): Promise<PackArchive> {
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
    });
    fileCount = index.files.length;
    zip.file('modrinth.index.json', JSON.stringify(index, null, 2));
  }
  zip.folder('overrides');

  const blob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
    mimeType: input.format === 'modrinth' ? MRPACK_MIME : 'application/zip',
  });
  return { blob, filename: archiveFilename(input.meta, input.format), fileCount };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke after the click has been handled so the download is not cancelled.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
