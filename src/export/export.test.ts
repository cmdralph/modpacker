import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { curseForgeFile, fakeSha1, modrinthFile, packWith, projectInfo } from '../test/fixtures';
import { orderedMods } from '../state/pack';
import { buildCurseForgeManifest, buildModrinthIndex } from './manifests';
import { archiveFilename, buildPackArchive } from './packager';
import { planExport } from './plan';

const meta = { name: 'Test Pack', version: '1.2.3', author: 'Tester', description: '' };
const fabric = { gameVersion: '1.21.1', loader: 'fabric' as const };

describe('buildCurseForgeManifest', () => {
  it('follows the CurseForge manifest schema', () => {
    const manifest = buildCurseForgeManifest({
      meta,
      profile: fabric,
      loaderVersion: '0.16.5',
      files: [curseForgeFile(12345, { fileId: 67890 }), curseForgeFile(222)],
    });
    expect(manifest).toEqual({
      minecraft: { version: '1.21.1', modLoaders: [{ id: 'fabric-0.16.5', primary: true }] },
      manifestType: 'minecraftModpack',
      manifestVersion: 1,
      name: 'Test Pack',
      version: '1.2.3',
      author: 'Tester',
      files: [
        { projectID: 12345, fileID: 67890, required: true },
        { projectID: 222, fileID: 2220, required: true },
      ],
      overrides: 'overrides',
    });
  });

  it('lists each project once', () => {
    const manifest = buildCurseForgeManifest({
      meta,
      profile: { gameVersion: '1.20.1', loader: 'forge' },
      loaderVersion: '47.3.0',
      files: [curseForgeFile(1), curseForgeFile(1)],
    });
    expect(manifest.files).toHaveLength(1);
    expect(manifest.minecraft.modLoaders[0]!.id).toBe('forge-47.3.0');
  });
});

describe('buildModrinthIndex', () => {
  it('follows the Modrinth index format v1', () => {
    const index = buildModrinthIndex({
      meta,
      profile: fabric,
      loaderVersion: '0.16.5',
      files: [modrinthFile('AANobbMI', { env: { client: 'required', server: 'unsupported' } })],
    });
    expect(index).toEqual({
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.2.3',
      name: 'Test Pack',
      files: [
        {
          path: 'mods/AANobbMI-1.0.0.jar',
          hashes: { sha1: fakeSha1('AANobbMI'), sha512: 'sha512-AANobbMI' },
          env: { client: 'required', server: 'unsupported' },
          downloads: ['https://cdn.modrinth.com/data/AANobbMI/versions/v1/AANobbMI-1.0.0.jar'],
          fileSize: 1024,
        },
      ],
      dependencies: { minecraft: '1.21.1', 'fabric-loader': '0.16.5' },
    });
  });

  it('uses the spec dependency keys for each loader', () => {
    const forge = buildModrinthIndex({ meta, profile: { gameVersion: '1.20.1', loader: 'forge' }, loaderVersion: '47.3.0', files: [] });
    const neo = buildModrinthIndex({ meta, profile: { gameVersion: '1.21.1', loader: 'neoforge' }, loaderVersion: '21.1.77', files: [] });
    expect(forge.dependencies).toEqual({ minecraft: '1.20.1', forge: '47.3.0' });
    expect(neo.dependencies).toEqual({ minecraft: '1.21.1', neoforge: '21.1.77' });
  });

  it('de-duplicates identical files and keeps paths unique', () => {
    const index = buildModrinthIndex({
      meta,
      profile: fabric,
      loaderVersion: '0.16.5',
      files: [
        modrinthFile('a', { filename: 'lib.jar' }),
        modrinthFile('a', { filename: 'lib.jar' }),
        modrinthFile('b', { filename: 'lib.jar' }),
      ],
    });
    expect(index.files.map((f) => f.path)).toEqual(['mods/lib.jar', 'mods/lib-2.jar']);
  });
});

describe('planExport', () => {
  const state = packWith([
    { info: projectInfo('modrinth', 'mr-only'), modrinth: modrinthFile('mr-only') },
    { info: projectInfo('modrinth', 'mr-both'), modrinth: modrinthFile('mr-both'), curseforge: curseForgeFile(5) },
    { info: projectInfo('curseforge', '7'), curseforge: curseForgeFile(7, { downloadUrl: null }) },
    { info: projectInfo('modrinth', 'broken'), status: 'incompatible' },
  ]);

  it('flags Modrinth-only mods for a CurseForge export', () => {
    const plan = planExport(state, 'curseforge', new Set());
    expect(plan.included.map((m) => m.key)).toEqual(['modrinth:mr-both', 'curseforge:7']);
    expect(plan.crossPlatform.map((m) => m.key)).toEqual(['modrinth:mr-only']);
    expect(plan.unavailable.map((m) => m.key)).toEqual(['modrinth:broken']);
    expect(plan.restricted.map((m) => m.key)).toEqual(['curseforge:7']);
  });

  it('flags CurseForge-only mods for a Modrinth export', () => {
    const plan = planExport(state, 'modrinth', new Set());
    expect(plan.included.map((m) => m.key)).toEqual(['modrinth:mr-only', 'modrinth:mr-both']);
    expect(plan.crossPlatform.map((m) => m.key)).toEqual(['curseforge:7']);
  });

  it('moves omitted mods out of the way', () => {
    const plan = planExport(state, 'curseforge', new Set(['modrinth:mr-only']));
    expect(plan.crossPlatform).toEqual([]);
    expect(plan.omitted.map((m) => m.key)).toEqual(['modrinth:mr-only']);
  });
});

async function open(blob: Blob) {
  return JSZip.loadAsync(await blob.arrayBuffer());
}

describe('buildPackArchive', () => {
  const state = packWith([
    { info: projectInfo('modrinth', 'sodium', 'Sodium'), modrinth: modrinthFile('sodium'), curseforge: curseForgeFile(394468) },
  ]);
  const mods = orderedMods(state);


  it('creates a CurseForge zip with manifest.json and an empty overrides/ folder', async () => {
    const archive = await buildPackArchive({ format: 'curseforge', meta, profile: fabric, loaderVersion: '0.16.5', mods });
    expect(archive.filename).toBe('Test-Pack-1.2.3.zip');
    const zip = await open(archive.blob);
    expect(Object.keys(zip.files).toSorted()).toEqual(['manifest.json', 'modlist.html', 'overrides/']);
    expect(zip.files['overrides/']!.dir).toBe(true);
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string'));
    expect(manifest.files).toEqual([{ projectID: 394468, fileID: 3944680, required: true }]);
  });

  it('creates an .mrpack with modrinth.index.json and an empty overrides/ folder', async () => {
    const archive = await buildPackArchive({ format: 'modrinth', meta, profile: fabric, loaderVersion: '0.16.5', mods });
    expect(archive.filename).toBe('Test-Pack-1.2.3.mrpack');
    expect(archive.fileCount).toBe(1);
    const zip = await open(archive.blob);
    expect(Object.keys(zip.files).toSorted()).toEqual(['modrinth.index.json', 'overrides/']);
    const index = JSON.parse(await zip.file('modrinth.index.json')!.async('string'));
    expect(index.formatVersion).toBe(1);
    expect(index.files[0].path).toBe('mods/sodium-1.0.0.jar');
  });

  it('sanitises archive names', () => {
    expect(archiveFilename({ name: 'Ünïcode / Pack!!', version: '2.0' }, 'modrinth')).toBe('Unicode-Pack-2.0.mrpack');
    expect(archiveFilename({ name: '///', version: '' }, 'curseforge')).toBe('modpack.zip');
  });
});

describe('bundled files', () => {
  const mods = orderedMods(packWith([{ info: projectInfo('modrinth', 'a'), modrinth: modrinthFile('a'), curseforge: curseForgeFile(1) }]));
  const files = [
    { root: 'overrides' as const, path: 'config/a.toml', size: 3, data: new Blob(['a=1']) },
    { root: 'client-overrides' as const, path: 'options.txt', size: 2, data: new Blob(['ok']) },
    { root: 'server-overrides' as const, path: 'server.properties', size: 4, data: new Blob(['pvp=']) },
  ];

  it('keeps the client/server split in a .mrpack', async () => {
    const archive = await buildPackArchive({ format: 'modrinth', meta: { ...meta, description: 'Cosy pack' }, profile: fabric, loaderVersion: '0.16.5', mods, files });
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    expect(await zip.file('overrides/config/a.toml')!.async('string')).toBe('a=1');
    expect(zip.file('client-overrides/options.txt')).not.toBeNull();
    expect(zip.file('server-overrides/server.properties')).not.toBeNull();
    expect(JSON.parse(await zip.file('modrinth.index.json')!.async('string')).summary).toBe('Cosy pack');
    expect(archive.droppedFiles).toBe(0);
  });

  it('merges client files into overrides and drops server-only files for CurseForge', async () => {
    const archive = await buildPackArchive({ format: 'curseforge', meta, profile: fabric, loaderVersion: '0.16.5', mods, files });
    const zip = await JSZip.loadAsync(await archive.blob.arrayBuffer());
    expect(zip.file('overrides/config/a.toml')).not.toBeNull();
    expect(zip.file('overrides/options.txt')).not.toBeNull();
    expect(zip.file('overrides/server.properties')).toBeNull();
    expect(archive.droppedFiles).toBe(1);
  });
});
