import { describe, expect, it, vi } from 'vitest';
import { NoCompatibleVersionError, type ResolvedFile } from '../api/common';
import { curseForgeFile, fakeSha1, modrinthFile, projectInfo } from '../test/fixtures';
import { curseForgeFingerprint } from '../lib/murmur2';
import { initialPackState, packReducer } from './pack';
import { createPackController, type PackApi } from './packController';
import { createStore } from './store';

function resolved(partial: Partial<ResolvedFile>): ResolvedFile {
  return { versionLabel: '1.0.0', modrinth: null, curseforge: null, requiredDependencies: [], incompatibleProjects: [], ...partial };
}

function setup(api: Partial<PackApi>) {
  const store = createStore(packReducer, initialPackState());
  const notify = vi.fn();
  const fullApi: PackApi = {
    resolve: vi.fn(),
    projectInfos: vi.fn<PackApi['projectInfos']>(async (source, ids) => ids.map((id) => projectInfo(source, id))),
    modrinthBySha1: vi.fn(async () => new Map()),
    curseForgeByFingerprint: vi.fn(async () => new Map()),
    downloadBytes: vi.fn(),
    ...api,
  };
  return { store, notify, api: fullApi, controller: createPackController(store, fullApi, notify) };
}

describe('packController', () => {
  it('resolves a mod and pulls in its required dependencies recursively', async () => {
    const { store, controller } = setup({
      resolve: vi.fn(async (_source, id) => {
        if (id === 'app') {
          return resolved({ modrinth: modrinthFile('app'), requiredDependencies: [{ source: 'modrinth', projectId: 'lib', pinnedFileId: null }] });
        }
        if (id === 'lib') {
          return resolved({ modrinth: modrinthFile('lib'), requiredDependencies: [{ source: 'modrinth', projectId: 'core', pinnedFileId: 'core-v7' }] });
        }
        return resolved({ modrinth: modrinthFile(id) });
      }),
    });

    await controller.addMod(projectInfo('modrinth', 'app'), { explicit: true });

    const { mods, order } = store.getState();
    expect(order).toEqual(['modrinth:app', 'modrinth:lib', 'modrinth:core']);
    expect(Object.values(mods).every((m) => m.status === 'ready')).toBe(true);
    expect(mods['modrinth:lib']).toMatchObject({ explicit: false, requiredBy: ['modrinth:app'] });
    expect(mods['modrinth:core']).toMatchObject({ requiredBy: ['modrinth:lib'], pinnedFileId: 'core-v7' });
  });

  it('marks mods without a compatible file as incompatible and other failures as errors', async () => {
    const { store, controller } = setup({
      resolve: vi.fn(async (_s, id) => {
        if (id === 'old') throw new NoCompatibleVersionError('No Fabric build for Minecraft 1.21.1 on Modrinth.');
        throw new Error('boom');
      }),
    });
    await controller.addMod(projectInfo('modrinth', 'old'), { explicit: true });
    await controller.addMod(projectInfo('modrinth', 'flaky'), { explicit: true });
    expect(store.getState().mods['modrinth:old']).toMatchObject({ status: 'incompatible' });
    expect(store.getState().mods['modrinth:flaky']).toMatchObject({ status: 'error', error: 'boom' });
  });

  it('cross-references CurseForge files to Modrinth by SHA-1', async () => {
    const match = modrinthFile('sodium');
    const { store, controller, api } = setup({
      resolve: vi.fn(async () => resolved({ curseforge: curseForgeFile(394468, { sha1: 'abc' }) })),
      modrinthBySha1: vi.fn(async () => new Map([['abc', match]])),
    });
    await controller.addMod(projectInfo('curseforge', '394468'), { explicit: true });
    expect(api.modrinthBySha1).toHaveBeenCalledWith(['abc'], expect.anything());
    expect(store.getState().mods['curseforge:394468']!.modrinth).toEqual(match);
  });

  it('matches Modrinth jars on CurseForge via murmur2 fingerprints', async () => {
    const jar = new TextEncoder().encode('fake jar bytes');
    const cfMatch = curseForgeFile(42);
    const { store, controller } = setup({
      resolve: vi.fn(async (_s, id) => resolved({ modrinth: modrinthFile(id) })),
      downloadBytes: vi.fn(async () => jar),
      curseForgeByFingerprint: vi.fn(async (fps: number[]) => new Map(fps.map((fp) => [fp, cfMatch]))),
    });
    await controller.addMod(projectInfo('modrinth', 'mod'), { explicit: true });
    const progress = vi.fn();
    const found = await controller.findCurseForgeMatches(['modrinth:mod'], progress);
    expect(found).toBe(1);
    expect(store.getState().mods['modrinth:mod']!.curseforge).toEqual(cfMatch);
    expect(progress).toHaveBeenLastCalledWith(1, 1);
    expect(curseForgeFingerprint(jar)).toBeGreaterThan(0);
  });

  it('re-validates explicit mods against a new profile', async () => {
    const { store, controller, notify } = setup({
      resolve: vi.fn(async (_s, id, profile) => {
        if (profile.gameVersion === '1.20.1' && id === 'new-only') throw new NoCompatibleVersionError('none');
        return resolved({
          modrinth: modrinthFile(id, { versionId: `${id}@${profile.gameVersion}` }),
          requiredDependencies: id === 'app' && profile.gameVersion === '1.21.1' ? [{ source: 'modrinth', projectId: 'lib', pinnedFileId: null }] : [],
        });
      }),
    });
    await controller.addMod(projectInfo('modrinth', 'app'), { explicit: true });
    await controller.addMod(projectInfo('modrinth', 'new-only'), { explicit: true });
    expect(store.getState().order).toContain('modrinth:lib');

    await controller.changeProfile({ gameVersion: '1.20.1', loader: 'fabric' }, 'revalidate');

    const state = store.getState();
    expect(state.profile.gameVersion).toBe('1.20.1');
    expect(state.order).toEqual(['modrinth:app', 'modrinth:new-only']);
    expect(state.mods['modrinth:app']!.modrinth!.versionId).toBe('app@1.20.1');
    expect(state.mods['modrinth:new-only']!.status).toBe('incompatible');
    expect(notify).toHaveBeenCalledWith('warning', expect.stringContaining('1 mod'));
  });

  it('can clear the pack when the profile changes', async () => {
    const { store, controller } = setup({ resolve: vi.fn(async (_s, id) => resolved({ modrinth: modrinthFile(id) })) });
    await controller.addMod(projectInfo('modrinth', 'a'), { explicit: true });
    await controller.changeProfile({ gameVersion: '1.21.1', loader: 'neoforge' }, 'clear');
    expect(store.getState().order).toEqual([]);
    expect(store.getState().profile.loader).toBe('neoforge');
  });
});

describe('version pinning and import', () => {
  it('re-resolves with a pinned version and can unpin again', async () => {
    const resolve = vi.fn(async (_s: string, id: string, _p: unknown, pinned: string | null) =>
      resolved({ modrinth: modrinthFile(id, { versionId: pinned ?? 'latest' }) }),
    );
    const { store, controller } = setup({ resolve: resolve as PackApi['resolve'] });
    await controller.addMod(projectInfo('modrinth', 'a'), { explicit: true });
    expect(store.getState().mods['modrinth:a']!.modrinth!.versionId).toBe('latest');

    await controller.setVersion('modrinth:a', 'old-v');
    expect(store.getState().mods['modrinth:a']).toMatchObject({ pinnedFileId: 'old-v', modrinth: { versionId: 'old-v' } });

    await controller.setVersion('modrinth:a', null);
    expect(store.getState().mods['modrinth:a']!.modrinth!.versionId).toBe('latest');
  });

  it('applies an explicit pin to a mod that was already pulled in as a dependency', async () => {
    const resolve = vi.fn(async (_s: string, id: string, _p: unknown, pinned: string | null) =>
      resolved({
        modrinth: modrinthFile(id, { versionId: pinned ?? 'latest' }),
        requiredDependencies: id === 'app' ? [{ source: 'modrinth', projectId: 'lib', pinnedFileId: null }] : [],
      }),
    );
    const { store, controller } = setup({ resolve: resolve as PackApi['resolve'] });
    await controller.addMod(projectInfo('modrinth', 'app'), { explicit: true });
    await controller.addMod(projectInfo('modrinth', 'lib'), { explicit: true, pinnedFileId: 'lib-v3' });
    expect(store.getState().mods['modrinth:lib']).toMatchObject({ explicit: true, pinnedFileId: 'lib-v3', modrinth: { versionId: 'lib-v3' } });
  });

  it('imports a .mrpack: profile, metadata, pinned files and unmatched entries', async () => {
    const { store, controller } = setup({
      resolve: vi.fn(async (_s, id, _p, pinned) => resolved({ modrinth: modrinthFile(id, { versionId: pinned ?? 'latest' }) })),
      modrinthBySha1: vi.fn(async () => new Map([[fakeSha1('a'), modrinthFile('sodium', { versionId: 'sodium-v9', sha1: fakeSha1('a') })]])),
    });
    await controller.addMod(projectInfo('modrinth', 'old'), { explicit: true });

    const summary = await controller.importPack({
      format: 'modrinth',
      meta: { name: 'Imported', version: '3.1.0' },
      profile: { gameVersion: '1.20.1', loader: 'fabric' },
      loaderVersion: '0.15.11',
      entries: [
        { kind: 'sha1', sha1: fakeSha1('a'), path: 'mods/sodium.jar' },
        { kind: 'sha1', sha1: fakeSha1('z'), path: 'mods/private.jar' },
      ],
      skipped: [],
      files: [],
    });

    const state = store.getState();
    expect(summary).toEqual({ added: 1, unmatched: ['private.jar'], skipped: [] });
    expect(state.profile).toEqual({ gameVersion: '1.20.1', loader: 'fabric' });
    expect(state.loaderVersion).toBe('0.15.11');
    expect(state.meta).toMatchObject({ name: 'Imported', version: '3.1.0', author: 'Web Builder' });
    expect(state.order).toEqual(['modrinth:sodium']);
    expect(state.mods['modrinth:sodium']).toMatchObject({ pinnedFileId: 'sodium-v9', status: 'ready' });
  });

  it('leaves the current pack untouched when import lookups fail', async () => {
    const { store, controller } = setup({
      resolve: vi.fn(async (_s, id) => resolved({ modrinth: modrinthFile(id) })),
      projectInfos: vi.fn(async () => {
        throw new Error('CurseForge is not configured.');
      }),
    });
    store.dispatch({ type: 'addMod', info: projectInfo('modrinth', 'keep'), explicit: true, requiredBy: null, pinnedFileId: null });
    await expect(
      controller.importPack({
        format: 'curseforge',
        meta: {},
        profile: { gameVersion: '1.20.1', loader: 'forge' },
        loaderVersion: null,
        entries: [{ kind: 'project', source: 'curseforge', projectId: '1', fileId: '2' }],
        skipped: [],
        files: [],
      }),
    ).rejects.toThrow(/not configured/);
    expect(store.getState().order).toEqual(['modrinth:keep']);
    expect(store.getState().profile.gameVersion).toBe('1.21.1');
  });

  it('undoes a removal', async () => {
    const { store, controller } = setup({ resolve: vi.fn(async (_s, id) => resolved({ modrinth: modrinthFile(id) })) });
    await controller.addMod(projectInfo('modrinth', 'a'), { explicit: true });
    const undo = controller.removeMods(['modrinth:a']);
    expect(store.getState().order).toEqual([]);
    undo();
    expect(store.getState().mods['modrinth:a']!.status).toBe('ready');
  });
});

describe('starter kits and updates', () => {
  it('adds a kit and drops projects without a build for the profile', async () => {
    const { store, controller } = setup({
      projectInfos: vi.fn<PackApi['projectInfos']>(async (_s, ids) => ids.filter((id) => id !== 'missing').map((id) => projectInfo('modrinth', id))),
      resolve: vi.fn(async (_s, id) => {
        if (id === 'old-only') throw new NoCompatibleVersionError('none');
        return resolved({ modrinth: modrinthFile(id) });
      }),
    });
    await controller.addMod(projectInfo('modrinth', 'have'), { explicit: true });

    const result = await controller.addKit(['have', 'fresh', 'old-only', 'missing']);
    expect(result).toEqual({ added: ['fresh'], alreadyThere: ['have'], unavailable: ['old-only'] });
    expect(store.getState().order).toEqual(['modrinth:have', 'modrinth:fresh']);
  });

  it('reports which mods moved to a newer version and leaves pinned ones alone', async () => {
    let release = '1.0';
    const resolve = vi.fn(async (_s: string, id: string, _p: unknown, pinned: string | null) =>
      resolved({ versionLabel: pinned ? 'pinned' : `${id} ${release}`, modrinth: modrinthFile(id, { versionId: pinned ?? `${id}-${release}` }) }),
    );
    const { controller } = setup({ resolve: resolve as PackApi['resolve'] });
    await controller.addMod(projectInfo('modrinth', 'a'), { explicit: true });
    await controller.addMod(projectInfo('modrinth', 'b'), { explicit: true, pinnedFileId: 'b-old' });

    release = '2.0';
    resolve.mockClear();
    const result = await controller.refreshAll();
    expect(result.updated).toEqual([{ title: 'a', from: 'a 1.0', to: 'a 2.0' }]);
    expect(resolve).toHaveBeenCalledTimes(1);
  });
});
