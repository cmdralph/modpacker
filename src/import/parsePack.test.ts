import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPackArchive } from '../export/packager';
import { orderedMods } from '../state/pack';
import { curseForgeFile, modrinthFile, packWith, projectInfo } from '../test/fixtures';
import { PackImportError, parseCurseForgeManifest, parseModrinthIndex, parsePackArchive } from './parsePack';

const meta = { name: 'Round Trip', version: '2.0.0', author: 'Tester' };

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('parsePackArchive', () => {
  const mods = orderedMods(
    packWith([
      { info: projectInfo('modrinth', 'sodium'), modrinth: modrinthFile('sodium', { sha1: 'ABC123' }), curseforge: curseForgeFile(394468) },
      { info: projectInfo('modrinth', 'lithium'), modrinth: modrinthFile('lithium'), curseforge: curseForgeFile(360438) },
    ]),
  );

  it('reads back an exported .mrpack', async () => {
    const archive = await buildPackArchive({ format: 'modrinth', meta, profile: { gameVersion: '1.21.1', loader: 'quilt' }, loaderVersion: '0.27.1', mods });
    const pack = await parsePackArchive(await archive.blob.arrayBuffer());
    expect(pack).toMatchObject({
      format: 'modrinth',
      meta: { name: 'Round Trip', version: '2.0.0' },
      profile: { gameVersion: '1.21.1', loader: 'quilt' },
      loaderVersion: '0.27.1',
      hasOverrides: false,
      skipped: [],
    });
    expect(pack.entries).toEqual([
      { source: 'modrinth', sha1: 'abc123', path: 'mods/sodium-1.0.0.jar' },
      { source: 'modrinth', sha1: 'sha1-lithium', path: 'mods/lithium-1.0.0.jar' },
    ]);
  });

  it('reads back an exported CurseForge zip', async () => {
    const archive = await buildPackArchive({ format: 'curseforge', meta, profile: { gameVersion: '1.20.1', loader: 'forge' }, loaderVersion: '47.3.0', mods });
    const pack = await parsePackArchive(await archive.blob.arrayBuffer());
    expect(pack).toMatchObject({
      format: 'curseforge',
      meta: { name: 'Round Trip', version: '2.0.0', author: 'Tester' },
      profile: { gameVersion: '1.20.1', loader: 'forge' },
      loaderVersion: '47.3.0',
    });
    expect(pack.entries).toEqual([
      { source: 'curseforge', projectId: '394468', fileId: '3944680' },
      { source: 'curseforge', projectId: '360438', fileId: '3604380' },
    ]);
  });

  it('detects bundled overrides and skips non-mod files', async () => {
    const index = {
      formatVersion: 1,
      name: 'x',
      versionId: '1',
      dependencies: { minecraft: '1.21.1', neoforge: '21.1.77' },
      files: [
        { path: 'mods/a.jar', hashes: { sha1: 'aa' } },
        { path: 'resourcepacks/pretty.zip', hashes: { sha1: 'bb' } },
      ],
    };
    const pack = await parsePackArchive(await zipOf({ 'modrinth.index.json': JSON.stringify(index), 'overrides/config/a.toml': 'x=1' }));
    expect(pack.hasOverrides).toBe(true);
    expect(pack.profile.loader).toBe('neoforge');
    expect(pack.entries).toHaveLength(1);
    expect(pack.skipped).toEqual(['resourcepacks/pretty.zip']);
  });

  it('rejects files that are not modpacks', async () => {
    await expect(parsePackArchive(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(PackImportError);
    await expect(parsePackArchive(await zipOf({ 'readme.txt': 'hi' }))).rejects.toThrow(/No modrinth.index.json or manifest.json/);
    await expect(parsePackArchive(await zipOf({ 'manifest.json': '{oops' }))).rejects.toThrow(/not valid JSON/);
  });
});

describe('manifest validation', () => {
  it('requires a supported loader', () => {
    expect(() => parseModrinthIndex({ formatVersion: 1, dependencies: { minecraft: '1.21.1', 'liteloader': '1' } }, false)).toThrow(/loader/);
    expect(() =>
      parseCurseForgeManifest({ manifestType: 'minecraftModpack', minecraft: { version: '1.12.2', modLoaders: [{ id: 'liteloader-1.0', primary: true }] } }, false),
    ).toThrow(/liteloader-1.0/);
  });

  it('picks the primary CurseForge loader', () => {
    const pack = parseCurseForgeManifest(
      {
        manifestType: 'minecraftModpack',
        minecraft: { version: '1.21.1', modLoaders: [{ id: 'forge-52.0.1' }, { id: 'neoforge-21.1.77', primary: true }] },
        files: [{ projectID: 1, fileID: 2 }],
      },
      false,
    );
    expect(pack.profile.loader).toBe('neoforge');
    expect(pack.loaderVersion).toBe('21.1.77');
  });
});
