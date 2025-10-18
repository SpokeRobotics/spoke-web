// ID generation utilities for instances and previews
// Hybrid scheme: <shortTypeHash>-<timeSortableRandom>

// Simple fast non-crypto hash (djb2) -> unsigned 32-bit
function djb2Hash(input) {
  let hash = 5381 >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash = (((hash << 5) + hash) + input.charCodeAt(i)) >>> 0; // hash * 33 + c
  }
  return hash >>> 0;
}

// Base62 encoding for unsigned integers/byte arrays
const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
function encodeBase62Uint32(n) {
  if (n === 0) return '0';
  let out = '';
  while (n > 0) {
    const r = n % 62;
    out = BASE62[r] + out;
    n = Math.floor(n / 62);
  }
  return out;
}

function randomBase62(len) {
  let s = '';
  while (s.length < len) {
    const n = Math.floor(Math.random() * 62);
    s += BASE62[n];
  }
  return s;
}

// Fixed-width base36 timestamp for lexical time-sort ordering
function encodeTimeBase36(ms) {
  const s = Math.trunc(ms).toString(36);
  return s.padStart(10, '0'); // width 10 is enough for many decades
}

export function shortTypeHash(typeId) {
  try {
    const h = djb2Hash(String(typeId || ''));
    // 5-6 chars base62
    return encodeBase62Uint32(h).slice(0, 6);
  } catch {
    return 'unkwn';
  }
}

export function generateSortableRandomId() {
  const t = encodeTimeBase36(Date.now());
  const rnd = randomBase62(6);
  return `${t}${rnd}`; // fixed-width time prefix keeps lexical sort
}

export function generateInstanceId({ typeId }) {
  const prefix = shortTypeHash(typeId);
  return `spoke://instances/${prefix}-${generateSortableRandomId()}`;
}

export function generatePreviewId(typeId) {
  const prefix = shortTypeHash(typeId);
  return `spoke://instances/_tmp-${prefix}-${generateSortableRandomId()}`;
}



