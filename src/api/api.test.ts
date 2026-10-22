import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { settingsStore } from '../state/settings';
import { NoCompatibleVersionError } from './common';
import { getCurseForgeAccess } from './curseforgeConfig';
import { listCurseForgeVersionOptions, pickBestFile, resolveCurseForgeFile, searchCurseForge, type CfFile } from './curseforge';
import { ApiError } from './http';
import { neoForgePrefix, pickNeoForgeVersion, pickQuiltVersion } from './loaders';
import { compareGameVersionsDesc, releaseVersions } from './projects';
import { pickBestVersion, resolveModrinthFile, searchModrinth, type MrVersion } from './modrinth';

const fetchMock = vi.fn<typeof fetch>();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  settingsStore.dispatch({ curseforgeApiKey: '', curseforgeProxyUrl: '' });
});

afterEach(() => vi.unstubAllGlobals());

function mrVersion(id: string, type: MrVersion['version_type'], extra: Partial<MrVersion> = {}): MrVersion {
  return {
    id,
    project_id: 'P',
    name: id,
    version_number: id,
    version_type: type,
    game_versions: ['1.21.1'],
    loaders: ['fabric'],
    files: [{ hashes: { sha1: `${id}-sha1`, sha512: `${id}-sha512` }, url: `https://cdn.modrinth.com/${id}.jar`, filename: `${id}.jar`, primary: true, size: 10 }],
    dependencies: [],
    ...extra,
  };
}

describe('Modrinth', () => {
  it('builds the search URL with loader and version facets', async () => {
    fetchMock.mockResolvedValueOnce(
      json({ total_hits: 1, hits: [{ project_id: 'AANobbMI', slug: 'sodium', title: 'Sodium', description: 'Fast', author: 'jellysquid3', icon_url: '', downloads: 5 }] }),
    );
    const page = await searchModrinth({ query: 'sodium', gameVersion: '1.21.1', loader: 'fabric', offset: 0, limit: 20 });

    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(url.origin + url.pathname).toBe('https://api.modrinth.com/v2/search');
    expect(url.searchParams.get('query')).toBe('sodium');
    expect(JSON.parse(url.searchParams.get('facets')!)).toEqual([['categories:fabric'], ['versions:1.21.1'], ['project_type:mod']]);
    expect(page.hits[0]).toMatchObject({ key: 'modrinth:AANobbMI', source: 'modrinth', author: 'jellysquid3', iconUrl: null, pageUrl: 'https://modrinth.com/mod/sodium' });
  });

  it('prefers the newest release over newer betas', () => {
    expect(pickBestVersion([mrVersion('b2', 'beta'), mrVersion('r1', 'release'), mrVersion('r0', 'release')])!.id).toBe('r1');
    expect(pickBestVersion([mrVersion('a1', 'alpha'), mrVersion('b1', 'beta')])!.id).toBe('b1');
    expect(pickBestVersion([])).toBeNull();
  });

  it('resolves the file metadata needed for an .mrpack', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'P', slug: 'p', title: 'P', description: '', icon_url: null, team: 't', client_side: 'required', server_side: 'unsupported' }))
      .mockResolvedValueOnce(
        json([
          mrVersion('v2', 'release', {
            dependencies: [
              { project_id: 'fabric-api', version_id: null, file_name: null, dependency_type: 'required' },
              { project_id: 'opt', version_id: null, file_name: null, dependency_type: 'optional' },
              { project_id: 'bad', version_id: null, file_name: null, dependency_type: 'incompatible' },
            ],
          }),
        ]),
      );
    const result = await resolveModrinthFile('P', { gameVersion: '1.21.1', loader: 'fabric' }, null);

    const versionsUrl = new URL(String(fetchMock.mock.calls[1]![0]));
    expect(JSON.parse(versionsUrl.searchParams.get('loaders')!)).toEqual(['fabric']);
    expect(JSON.parse(versionsUrl.searchParams.get('game_versions')!)).toEqual(['1.21.1']);
    expect(result.modrinth).toEqual({
      projectId: 'P',
      versionId: 'v2',
      versionNumber: 'v2',
      filename: 'v2.jar',
      sha1: 'v2-sha1',
      sha512: 'v2-sha512',
      url: 'https://cdn.modrinth.com/v2.jar',
      size: 10,
      env: { client: 'required', server: 'unsupported' },
    });
    expect(result.requiredDependencies).toEqual([{ source: 'modrinth', projectId: 'fabric-api', pinnedFileId: null }]);
    expect(result.incompatibleProjects.map((d) => d.projectId)).toEqual(['bad']);
  });

  it('reports a missing compatible version', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'P', slug: 'p', title: 'P', description: '', icon_url: null, team: 't', client_side: 'required', server_side: 'required' }))
      .mockResolvedValueOnce(json([]));
    await expect(resolveModrinthFile('P', { gameVersion: '1.21.1', loader: 'forge' }, null)).rejects.toBeInstanceOf(NoCompatibleVersionError);
  });

  it('turns HTTP 429 into a rate-limit error', async () => {
    fetchMock.mockResolvedValueOnce(json({}, 429));
    await expect(searchModrinth({ query: '', gameVersion: '1.21.1', loader: 'fabric', offset: 0, limit: 20 })).rejects.toMatchObject({
      kind: 'rate-limit',
    });
  });
});

function cfFile(id: number, releaseType: 1 | 2 | 3, date: string, extra: Partial<CfFile> = {}): CfFile {
  return {
    id,
    modId: 99,
    displayName: `File ${id}`,
    fileName: `file-${id}.jar`,
    releaseType,
    fileDate: date,
    fileLength: 100,
    downloadUrl: `https://edge.forgecdn.net/${id}.jar`,
    gameVersions: ['1.21.1', 'Fabric'],
    hashes: [
      { value: 'MD5', algo: 2 },
      { value: 'ABCDEF', algo: 1 },
    ],
    dependencies: [],
    fileFingerprint: 1,
    ...extra,
  };
}

describe('CurseForge', () => {
  it('is disabled until a key or proxy is configured', async () => {
    expect(getCurseForgeAccess().mode).toBe('disabled');
    await expect(searchCurseForge({ query: 'jei', gameVersion: '1.21.1', loader: 'forge', offset: 0, limit: 20 })).rejects.toMatchObject({
      kind: 'config',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends x-api-key directly, or nothing through a proxy', async () => {
    settingsStore.dispatch({ curseforgeApiKey: 'secret' });
    fetchMock.mockImplementation(async () => json({ data: [], pagination: { index: 0, pageSize: 20, resultCount: 0, totalCount: 0 } }));
    await searchCurseForge({ query: 'jei', gameVersion: '1.21.1', loader: 'neoforge', offset: 0, limit: 20 });
    const [url, init] = fetchMock.mock.calls[0]!;
    const parsed = new URL(String(url));
    expect(parsed.origin + parsed.pathname).toBe('https://api.curseforge.com/v1/mods/search');
    expect(Object.fromEntries(parsed.searchParams)).toMatchObject({ gameId: '432', classId: '6', gameVersion: '1.21.1', modLoaderType: '6', searchFilter: 'jei' });
    expect((init!.headers as Record<string, string>)['x-api-key']).toBe('secret');

    settingsStore.dispatch({ curseforgeProxyUrl: 'https://proxy.example.com/' });
    await searchCurseForge({ query: 'jei', gameVersion: '1.21.1', loader: 'forge', offset: 0, limit: 20 });
    const [proxyUrl, proxyInit] = fetchMock.mock.calls[1]!;
    expect(String(proxyUrl)).toMatch(/^https:\/\/proxy\.example\.com\/v1\/mods\/search\?/);
    expect((proxyInit!.headers as Record<string, string>)['x-api-key']).toBeUndefined();
  });

  it('picks the newest available release file', () => {
    const files = [
      cfFile(1, 1, '2024-01-01T00:00:00Z'),
      cfFile(2, 2, '2024-03-01T00:00:00Z'),
      cfFile(3, 1, '2024-02-01T00:00:00Z'),
      cfFile(4, 1, '2024-04-01T00:00:00Z', { isServerPack: true }),
    ];
    expect(pickBestFile(files)!.id).toBe(3);
  });

  it('resolves the project and file IDs for a manifest', async () => {
    settingsStore.dispatch({ curseforgeApiKey: 'secret' });
    fetchMock.mockResolvedValueOnce(
      json({
        data: [
          cfFile(10, 1, '2024-01-01T00:00:00Z', { dependencies: [{ modId: 306612, relationType: 3 }, { modId: 5, relationType: 2 }] }),
          cfFile(11, 1, '2024-05-01T00:00:00Z', { gameVersions: ['1.21.1', 'Forge'] }),
        ],
      }),
    );
    const result = await resolveCurseForgeFile('99', { gameVersion: '1.21.1', loader: 'fabric' }, null);
    expect(result.curseforge).toMatchObject({ projectId: 99, fileId: 10, sha1: 'abcdef' });
    expect(result.requiredDependencies).toEqual([{ source: 'curseforge', projectId: '306612', pinnedFileId: null }]);
  });

  it('explains a rejected key', async () => {
    settingsStore.dispatch({ curseforgeApiKey: 'bad' });
    fetchMock.mockResolvedValueOnce(json({}, 403));
    const error = await searchCurseForge({ query: '', gameVersion: '1.21.1', loader: 'fabric', offset: 0, limit: 20 }).catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.message).toContain('403');
  });
});

describe('loader versions', () => {
  it('maps Minecraft versions to NeoForge version prefixes', () => {
    expect(neoForgePrefix('1.21.1')).toBe('21.1.');
    expect(neoForgePrefix('1.21')).toBe('21.0.');
    expect(neoForgePrefix('1.20.4')).toBe('20.4.');
    expect(neoForgePrefix('26.1')).toBe('26.1.');
    expect(neoForgePrefix('1.20.1')).toBeNull();
    expect(neoForgePrefix('1.19.2')).toBeNull();
  });

  it('picks the newest stable NeoForge build', () => {
    const versions = ['21.0.167', '21.1.1-beta', '21.1.65', '21.1.77', '21.1.80-beta', '21.10.1'];
    expect(pickNeoForgeVersion(versions, '1.21.1')).toBe('21.1.77');
    expect(pickNeoForgeVersion(['21.1.1-beta'], '1.21.1')).toBe('21.1.1-beta');
  });
});

describe('Quilt and sorting', () => {
  it('searches Modrinth for Quilt or Fabric mods with the chosen sort', async () => {
    fetchMock.mockImplementation(async () => json({ total_hits: 0, hits: [] }));
    await searchModrinth({ query: 'menu', gameVersion: '1.21.1', loader: 'quilt', offset: 0, limit: 20, sort: 'updated' });
    const url = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(JSON.parse(url.searchParams.get('facets')!)[0]).toEqual(['categories:quilt', 'categories:fabric']);
    expect(url.searchParams.get('index')).toBe('updated');

    await searchModrinth({ query: '', gameVersion: '1.21.1', loader: 'forge', offset: 0, limit: 20, sort: 'relevance' });
    expect(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get('index')).toBe('downloads');
  });

  it('accepts Fabric files for a Quilt profile on Modrinth', async () => {
    fetchMock
      .mockResolvedValueOnce(json({ id: 'P', slug: 'p', title: 'P', description: '', icon_url: null, team: 't', client_side: 'required', server_side: 'required' }))
      .mockResolvedValueOnce(json([mrVersion('fab', 'release')]));
    const result = await resolveModrinthFile('P', { gameVersion: '1.21.1', loader: 'quilt' }, null);
    expect(JSON.parse(new URL(String(fetchMock.mock.calls[1]![0])).searchParams.get('loaders')!)).toEqual(['quilt', 'fabric']);
    expect(result.modrinth!.versionId).toBe('fab');
  });

  it('maps sort options and Quilt for CurseForge', async () => {
    settingsStore.dispatch({ curseforgeApiKey: 'k' });
    fetchMock.mockImplementation(async () => json({ data: [], pagination: { index: 0, pageSize: 20, resultCount: 0, totalCount: 0 } }));
    await searchCurseForge({ query: '', gameVersion: '1.21.1', loader: 'quilt', offset: 0, limit: 20, sort: 'newest' });
    const params = new URL(String(fetchMock.mock.calls[0]![0])).searchParams;
    expect(params.get('modLoaderType')).toBe('4');
    expect(params.get('sortField')).toBe('11');
  });

  it('lists CurseForge files for Quilt without a loader filter and keeps Fabric/Quilt files', async () => {
    settingsStore.dispatch({ curseforgeApiKey: 'k' });
    fetchMock.mockResolvedValueOnce(
      json({
        data: [
          cfFile(1, 1, '2024-01-01T00:00:00Z', { gameVersions: ['1.21.1', 'Fabric'] }),
          cfFile(2, 1, '2024-02-01T00:00:00Z', { gameVersions: ['1.21.1', 'Quilt'] }),
          cfFile(3, 1, '2024-03-01T00:00:00Z', { gameVersions: ['1.21.1', 'Forge'] }),
        ],
      }),
    );
    const options = await listCurseForgeVersionOptions('99', { gameVersion: '1.21.1', loader: 'quilt' });
    expect(new URL(String(fetchMock.mock.calls[0]![0])).searchParams.has('modLoaderType')).toBe(false);
    expect(options.map((o) => [o.id, o.loaders])).toEqual([
      ['2', ['quilt']],
      ['1', ['fabric']],
    ]);
  });

  it('picks the newest stable Quilt loader', () => {
    expect(pickQuiltVersion([{ version: '0.29.2-beta.1' }, { version: '0.29.1' }, { version: '0.28.0' }])).toBe('0.29.1');
  });
});

describe('game version ordering', () => {
  it('sorts numerically, newest first, and drops snapshots', () => {
    expect(releaseVersions(['1.20.1', '1.21.10', '1.21.9', '24w14a', '1.21', '26.1', '1.21-pre1', '1.21.9'])).toEqual([
      '26.1',
      '1.21.10',
      '1.21.9',
      '1.21',
      '1.20.1',
    ]);
    expect(compareGameVersionsDesc('1.21', '1.21.1')).toBeGreaterThan(0);
  });
});
