import { describe, expect, it, vi } from 'vitest';
import { NoCompatibleVersionError, type ResolvedFile } from '../api/common';
import { curseForgeFile, modrinthFile, projectInfo } from '../test/fixtures';
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
