import { describe, expect, it } from 'vitest';
import { curseForgeFingerprint, murmur2, stripWhitespace } from './murmur2';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('murmur2', () => {
  // Vectors produced by Austin Appleby's reference C implementation with seed 1.
  it.each([
    ['', 1540447798],
    ['a', 626045324],
    ['ab', 1692487918],
    ['abc', 1621425345],
    ['abcd', 3376380438],
    ['hello world', 2213174766],
    ['The quick brown fox jumps over the lazy dog', 504383975],
  ])('hashes %j like the reference implementation', (input, expected) => {
    expect(murmur2(bytes(input), 1)).toBe(expected);
  });

  it('handles high bytes without sign errors', () => {
    const data = Uint8Array.from({ length: 256 }, (_, i) => 255 - i);
    expect(murmur2(data, 1)).toBe(969677551);
  });
});

describe('curseForgeFingerprint', () => {
  it('ignores tab, newline, carriage return and space bytes', () => {
    expect(stripWhitespace(bytes('a b\tc\r\nd'))).toEqual(bytes('abcd'));
    expect(curseForgeFingerprint(bytes(' a b\tc\r\nd '))).toBe(curseForgeFingerprint(bytes('abcd')));
    expect(curseForgeFingerprint(bytes('abcd'))).toBe(3376380438);
  });
});
