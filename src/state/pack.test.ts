import { describe, expect, it } from 'vitest';
import { applyActions, curseForgeFile, modrinthFile, packWith, projectInfo } from '../test/fixtures';
import { findConflicts, findDuplicates, orderedMods } from './pack';

describe('packReducer', () => {
  it('adds mods once and records who requires them', () => {
    const lib = projectInfo('modrinth', 'lib');
    const state = applyActions([
      { type: 'addMod', info: projectInfo('modrinth', 'a'), explicit: true, requiredBy: null, pinnedFileId: null },
      { type: 'addMod', info: lib, explicit: false, requiredBy: 'modrinth:a', pinnedFileId: null },
      { type: 'addMod', info: lib, explicit: false, requiredBy: 'modrinth:a', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'b'), explicit: true, requiredBy: null, pinnedFileId: null },
      { type: 'addMod', info: lib, explicit: false, requiredBy: 'modrinth:b', pinnedFileId: null },
    ]);
    expect(state.order).toEqual(['modrinth:a', 'modrinth:lib', 'modrinth:b']);
    expect(state.mods['modrinth:lib']!.requiredBy).toEqual(['modrinth:a', 'modrinth:b']);
    expect(state.mods['modrinth:lib']!.status).toBe('resolving');
  });

  it('removes orphaned dependencies but keeps shared and explicit ones', () => {
    const state = applyActions([
      { type: 'addMod', info: projectInfo('modrinth', 'a'), explicit: true, requiredBy: null, pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'b'), explicit: true, requiredBy: null, pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'only-a'), explicit: false, requiredBy: 'modrinth:a', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'nested'), explicit: false, requiredBy: 'modrinth:only-a', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'shared'), explicit: false, requiredBy: 'modrinth:a', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'shared'), explicit: false, requiredBy: 'modrinth:b', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'picked'), explicit: false, requiredBy: 'modrinth:a', pinnedFileId: null },
      { type: 'addMod', info: projectInfo('modrinth', 'picked'), explicit: true, requiredBy: null, pinnedFileId: null },
      { type: 'removeMods', keys: ['modrinth:a'] },
    ]);
    expect(state.order).toEqual(['modrinth:b', 'modrinth:shared', 'modrinth:picked']);
    expect(state.mods['modrinth:shared']!.requiredBy).toEqual(['modrinth:b']);
    expect(state.mods['modrinth:picked']!.requiredBy).toEqual([]);
  });

  it('keeps only explicit mods when re-validating', () => {
    const state = applyActions(
      [
        { type: 'addMod', info: projectInfo('modrinth', 'dep'), explicit: false, requiredBy: 'modrinth:a', pinnedFileId: 'v9' },
        { type: 'resetForRevalidation' },
      ],
      packWith([{ info: projectInfo('modrinth', 'a'), modrinth: modrinthFile('a'), curseforge: curseForgeFile(1) }]),
    );
    expect(state.order).toEqual(['modrinth:a']);
    expect(state.mods['modrinth:a']).toMatchObject({ status: 'resolving', modrinth: null, curseforge: null, requiredBy: [] });
  });

  it('drops a stale cross-platform match when the native file changes', () => {
    const base = packWith([{ info: projectInfo('modrinth', 'a'), modrinth: modrinthFile('a') }]);
    const matched = applyActions([{ type: 'setCrossRef', key: 'modrinth:a', curseforge: curseForgeFile(1) }], base);
    const sameFile = applyActions(
      [{ type: 'modResolved', key: 'modrinth:a', versionLabel: '1', modrinth: modrinthFile('a'), curseforge: null, declaredIncompatibilities: [] }],
      matched,
    );
    expect(sameFile.mods['modrinth:a']!.curseforge).not.toBeNull();
    const newFile = applyActions(
      [{ type: 'modResolved', key: 'modrinth:a', versionLabel: '2', modrinth: modrinthFile('a', { versionId: 'v2' }), curseforge: null, declaredIncompatibilities: [] }],
      matched,
    );
    expect(newFile.mods['modrinth:a']!.curseforge).toBeNull();
  });
});

describe('selectors', () => {
  it('finds declared incompatibilities that are present in the pack', () => {
    const state = applyActions(
      [
        {
          type: 'modResolved',
          key: 'modrinth:a',
          versionLabel: '1',
          modrinth: modrinthFile('a'),
          curseforge: null,
          declaredIncompatibilities: ['modrinth:b', 'modrinth:not-in-pack'],
        },
      ],
      packWith([
        { info: projectInfo('modrinth', 'a'), modrinth: modrinthFile('a') },
        { info: projectInfo('modrinth', 'b'), modrinth: modrinthFile('b') },
      ]),
    );
    expect(findConflicts(state).map((c) => [c.mod.key, c.other.key])).toEqual([['modrinth:a', 'modrinth:b']]);
  });

  it('detects the same jar added from both platforms', () => {
    const state = packWith([
      { info: projectInfo('modrinth', 'a'), modrinth: modrinthFile('a', { sha1: 'same' }) },
      { info: projectInfo('curseforge', '1'), curseforge: curseForgeFile(1, { sha1: 'same' }) },
      { info: projectInfo('curseforge', '2'), curseforge: curseForgeFile(2) },
    ]);
    expect(findDuplicates(state).map(([a, b]) => [a.key, b.key])).toEqual([['modrinth:a', 'curseforge:1']]);
    expect(orderedMods(state)).toHaveLength(3);
  });
});
