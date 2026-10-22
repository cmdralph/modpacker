import { describe, expect, it } from 'vitest';
import { applyActions, curseForgeFile, modrinthFile, packWith, projectInfo } from '../test/fixtures';
import { ShareLinkError, decodeShare, encodeShare, readShareHash, shareUrl } from './shareLink';

const toBase64Url = (text: string) => btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

describe('share links', () => {
  const state = applyActions(
    [
      { type: 'setMeta', patch: { name: 'Friends SMP', description: 'Cosy vibes' } },
      { type: 'setLoaderVersion', version: '0.16.14' },
    ],
    packWith([
      { info: projectInfo('modrinth', 'AANobbMI'), modrinth: modrinthFile('AANobbMI', { versionId: 'abc123' }) },
      { info: projectInfo('curseforge', '238222'), curseforge: curseForgeFile(238222, { fileId: 5_101_366 }) },
    ]),
  );

  it('round-trips a pack with every mod pinned to its current file', async () => {
    const encoded = await encodeShare(state);
    expect(encoded[0]).toBe('z');
    const url = shareUrl(encoded, 'https://cmdralph.github.io/modpacker/#old');
    expect(url.startsWith('https://cmdralph.github.io/modpacker/#pack=z')).toBe(true);

    const pack = await decodeShare(readShareHash(new URL(url).hash)!);
    expect(pack).toMatchObject({
      format: 'link',
      meta: { name: 'Friends SMP', description: 'Cosy vibes' },
      profile: { gameVersion: '1.21.1', loader: 'fabric' },
      loaderVersion: '0.16.14',
      files: [],
    });
    expect(pack.entries).toEqual([
      { kind: 'project', source: 'modrinth', projectId: 'AANobbMI', fileId: 'abc123' },
      { kind: 'project', source: 'curseforge', projectId: '238222', fileId: '5101366' },
    ]);
  });

  it('accepts uncompressed payloads', async () => {
    const payload = { v: 1, n: 'Plain', g: '1.20.1', l: 'forge', m: [[1, '238222', null]] };
    const pack = await decodeShare(`j${toBase64Url(JSON.stringify(payload))}`);
    expect(pack.entries).toEqual([{ kind: 'project', source: 'curseforge', projectId: '238222', fileId: null }]);
    expect(pack.loaderVersion).toBeNull();
  });

  it.each([
    ['garbage prefix', 'xabc'],
    ['broken base64', 'j!!!'],
    ['not json', `j${toBase64Url('{nope')}`],
    ['wrong version', `j${toBase64Url(JSON.stringify({ v: 2, n: 'a', g: '1.21.1', l: 'fabric', m: [] }))}`],
    ['unknown loader', `j${toBase64Url(JSON.stringify({ v: 1, n: 'a', g: '1.21.1', l: 'liteloader', m: [] }))}`],
    ['script in version', `j${toBase64Url(JSON.stringify({ v: 1, n: 'a', g: '<script>', l: 'fabric', m: [] }))}`],
    ['bad CurseForge id', `j${toBase64Url(JSON.stringify({ v: 1, n: 'a', g: '1.21.1', l: 'fabric', m: [[1, 'abc', null]] }))}`],
    ['path in Modrinth id', `j${toBase64Url(JSON.stringify({ v: 1, n: 'a', g: '1.21.1', l: 'fabric', m: [[0, '../x', null]] }))}`],
    ['unknown source', `j${toBase64Url(JSON.stringify({ v: 1, n: 'a', g: '1.21.1', l: 'fabric', m: [[7, 'abc', null]] }))}`],
  ])('rejects %s', async (_label, encoded) => {
    await expect(decodeShare(encoded)).rejects.toBeInstanceOf(ShareLinkError);
  });

  it('refuses oversized links', async () => {
    await expect(decodeShare(`j${'a'.repeat(70_000)}`)).rejects.toThrow(/too large/);
  });

  it('only reads well-formed hashes', () => {
    expect(readShareHash('#pack=z_abc-123')).toBe('z_abc-123');
    expect(readShareHash('#pack=')).toBeNull();
    expect(readShareHash('#other=1')).toBeNull();
    expect(readShareHash('#pack=a b')).toBeNull();
  });
});
