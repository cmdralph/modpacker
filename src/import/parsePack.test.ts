import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildPackArchive } from '../export/packager';
import { sanitizeRelativePath } from '../lib/paths';
import { mergeFiles } from '../state/files';
import { orderedMods } from '../state/pack';
import { curseForgeFile, fakeSha1, modrinthFile, packWith, projectInfo } from '../test/fixtures';
import { PackImportError, parseCurseForgeManifest, parseModrinthIndex, parsePackArchive } from './parsePack';

const meta = { name: 'Round Trip', version: '2.0.0', author: 'Tester', description: 'A pack for tests' };

async function zipOf(files: Record<string, string>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) zip.file(name, content);
  return zip.generateAsync({ type: 'uint8array' });
}

describe('parsePackArchive', () => {
  const mods = orderedMods(
    packWith([
      { info: projectInfo('modrinth', 'sodium'), modrinth: modrinthFile('sodium'), curseforge: curseForgeFile(394468) },
      { info: projectInfo('modrinth', 'lithium'), modrinth: modrinthFile('lithium'), curseforge: curseForgeFile(360438) },
    ]),
  );
  const files = [{ root: 'overrides' as const, path: 'config/sodium-options.json', size: 2, data: new Blob(['{}']) }];

  it('reads back an exported .mrpack, including bundled files', async () => {
    const archive = await buildPackArchive({ format: 'modrinth', meta, profile: { gameVersion: '1.21.1', loader: 'quilt' }, loaderVersion: '0.27.1', mods, files });
    const pack = await parsePackArchive(await archive.blob.arrayBuffer());
    expect(pack).toMatchObject({
      format: 'modrinth',
      meta: { name: 'Round Trip', version: '2.0.0', description: 'A pack for tests' },
      profile: { gameVersion: '1.21.1', loader: 'quilt' },
      loaderVersion: '0.27.1',
      skipped: [],
    });
    expect(pack.entries).toEqual([
      { kind: 'sha1', sha1: fakeSha1('sodium'), path: 'mods/sodium-1.0.0.jar' },
      { kind: 'sha1', sha1: fakeSha1('lithium'), path: 'mods/lithium-1.0.0.jar' },
    ]);
    expect(pack.files.map((f) => [f.root, f.path, f.size])).toEqual([['overrides', 'config/sodium-options.json', 2]]);
    expect(await pack.files[0]!.data.text()).toBe('{}');
  });

  it('reads back an exported CurseForge zip', async () => {
    const archive = await buildPackArchive({ format: 'curseforge', meta, profile: { gameVersion: '1.20.1', loader: 'forge' }, loaderVersion: '47.3.0', mods, files });
    const pack = await parsePackArchive(await archive.blob.arrayBuffer());
    expect(pack).toMatchObject({
      format: 'curseforge',
      meta: { name: 'Round Trip', version: '2.0.0', author: 'Tester' },
      profile: { gameVersion: '1.20.1', loader: 'forge' },
      loaderVersion: '47.3.0',
    });
    expect(pack.entries).toEqual([
      { kind: 'project', source: 'curseforge', projectId: '394468', fileId: '3944680' },
      { kind: 'project', source: 'curseforge', projectId: '360438', fileId: '3604380' },
    ]);
    expect(pack.files).toHaveLength(1);
  });

  it('keeps client/server overrides, skips non-mod files and refuses path traversal', async () => {
    const index = {
      formatVersion: 1,
      name: 'x',
      versionId: '1',
      dependencies: { minecraft: '1.21.1', neoforge: '21.1.77' },
      files: [
        { path: 'mods/a.jar', hashes: { sha1: fakeSha1('a') } },
        { path: 'resourcepacks/pretty.zip', hashes: { sha1: fakeSha1('b') } },
        { path: 'mods/bad.jar', hashes: { sha1: 'not-a-hash' } },
      ],
    };
    const zip = new JSZip();
    zip.file('modrinth.index.json', JSON.stringify(index));
    zip.file('overrides/config/a.toml', 'x=1');
    zip.file('client-overrides/options.txt', 'fov:90');
    zip.file('overrides/../../evil.sh', 'rm -rf');
    zip.file('unrelated/readme.md', 'ignored');
    const pack = await parsePackArchive(await zip.generateAsync({ type: 'uint8array' }));
    expect(pack.profile.loader).toBe('neoforge');
    expect(pack.entries).toHaveLength(1);
    expect(pack.files.map((f) => `${f.root}/${f.path}`).toSorted()).toEqual(['client-overrides/options.txt', 'overrides/config/a.toml']);
    expect(pack.skipped).toEqual(expect.arrayContaining(['resourcepacks/pretty.zip', 'mods/bad.jar']));
    // JSZip already resolves `..` on load and our sanitiser rejects anything left – it is never extracted.
    expect(pack.files.some((f) => f.path.includes('evil') || f.path.includes('..'))).toBe(false);
  });

  it('rejects files that are not modpacks', async () => {
    await expect(parsePackArchive(new TextEncoder().encode('not a zip'))).rejects.toBeInstanceOf(PackImportError);
    await expect(parsePackArchive(await zipOf({ 'readme.txt': 'hi' }))).rejects.toThrow(/No modrinth.index.json or manifest.json/);
    await expect(parsePackArchive(await zipOf({ 'manifest.json': '{oops' }))).rejects.toThrow(/not valid JSON/);
  });
});

describe('manifest validation', () => {
  it('requires a supported loader', () => {
    expect(() => parseModrinthIndex({ formatVersion: 1, dependencies: { minecraft: '1.21.1', liteloader: '1' } })).toThrow(/loader/);
    expect(() =>
      parseCurseForgeManifest({ manifestType: 'minecraftModpack', minecraft: { version: '1.12.2', modLoaders: [{ id: 'liteloader-1.0', primary: true }] } }),
    ).toThrow(/liteloader-1.0/);
  });

  it('picks the primary CurseForge loader and skips malformed entries', () => {
    const pack = parseCurseForgeManifest({
      manifestType: 'minecraftModpack',
      minecraft: { version: '1.21.1', modLoaders: [{ id: 'forge-52.0.1' }, { id: 'neoforge-21.1.77', primary: true }] },
      files: [{ projectID: 1, fileID: 2 }, { projectID: 1.5, fileID: 3 }],
    });
    expect(pack.profile.loader).toBe('neoforge');
    expect(pack.loaderVersion).toBe('21.1.77');
    expect(pack.entries).toHaveLength(1);
    expect(pack.skipped).toHaveLength(1);
  });
});

describe('sanitizeRelativePath', () => {
  it.each([
    ['config/a.toml', 'config/a.toml'],
    ['config\\\\windows\\\\style.json', 'config/windows/style.json'],
    ['./config//a.toml', 'config/a.toml'],
    ['../escape.txt', null],
    ['config/../../escape.txt', null],
    ['/etc/passwd', 'etc/passwd'],
    ['C:/Windows/evil.dll', null],
    ['config/bad|name.txt', null],
    ['config/trailing-dot.', null],
    ['', null],
  ])('%j → %j', (input, expected) => {
    expect(sanitizeRelativePath(input)).toBe(expected);
  });

  it('drops unsafe names and de-duplicates when merging files', () => {
    const blob = new Blob(['x']);
    const { files, rejected } = mergeFiles(
      [{ root: 'overrides', path: 'config/a.toml', size: 1, data: blob }],
      [
        { root: 'overrides', path: 'config\\\\a.toml', size: 9, data: blob },
        { root: 'overrides', path: '../x', size: 1, data: blob },
        { root: 'client-overrides', path: 'config/a.toml', size: 1, data: blob },
      ],
    );
    expect(files.map((f) => `${f.root}/${f.path}:${f.size}`)).toEqual(['client-overrides/config/a.toml:1', 'overrides/config/a.toml:9']);
    expect(rejected).toEqual(['../x']);
  });
});
