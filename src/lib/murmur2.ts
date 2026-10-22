/** Bytes CurseForge strips before hashing: tab, LF, CR and space. */
const WHITESPACE = new Set([9, 10, 13, 32]);

export function stripWhitespace(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let length = 0;
  for (const byte of bytes) {
    if (!WHITESPACE.has(byte)) out[length++] = byte;
  }
  return out.subarray(0, length);
}

/** 32-bit MurmurHash2, returned as an unsigned integer. */
export function murmur2(data: Uint8Array, seed: number): number {
  const m = 0x5bd1e995;
  let length = data.length;
  let h = (seed ^ length) >>> 0;
  let i = 0;

  while (length >= 4) {
    let k = (data[i]! | (data[i + 1]! << 8) | (data[i + 2]! << 16) | (data[i + 3]! << 24)) >>> 0;
    k = Math.imul(k, m);
    k ^= k >>> 24;
    k = Math.imul(k, m);
    h = Math.imul(h, m) ^ k;
    i += 4;
    length -= 4;
  }

  // Tail bytes (the classic implementation's fall-through switch).
  if (length >= 3) h ^= data[i + 2]! << 16;
  if (length >= 2) h ^= data[i + 1]! << 8;
  if (length >= 1) {
    h ^= data[i]!;
    h = Math.imul(h, m);
  }

  h ^= h >>> 13;
  h = Math.imul(h, m);
  h ^= h >>> 15;
  return h >>> 0;
}

/** The fingerprint CurseForge uses to identify files: MurmurHash2 (seed 1) of the whitespace-stripped bytes. */
export function curseForgeFingerprint(bytes: Uint8Array): number {
  return murmur2(stripWhitespace(bytes), 1);
}
