// Utilities to remap legacy store-seed instance IDs to a shorter hybrid scheme

import { shortTypeHash } from './id.js'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
function djb2Hash(input) {
  let hash = 5381 >>> 0
  for (let i = 0; i < input.length; i++) { hash = (((hash << 5) + hash) + input.charCodeAt(i)) >>> 0 }
  return hash >>> 0
}
function encodeBase62Uint32(n) {
  if (n === 0) return '0'
  let out = ''
  while (n > 0) { const r = n % 62; out = BASE62[r] + out; n = Math.floor(n / 62) }
  return out
}

function isInstanceId(id) {
  return typeof id === 'string' && id.startsWith('spoke://instances/')
}

// Deterministic short ID derived from old id + type id (stable across runs)
export function generateDeterministicInstanceId(oldId, typeId) {
  try {
    const prefix = shortTypeHash(typeId)
    const h = djb2Hash(String(oldId || '') + '|' + String(typeId || ''))
    const tail = encodeBase62Uint32(h).padStart(6, '0')
    return `spoke://instances/${prefix}-${tail}`
  } catch {
    return oldId
  }
}

function deepReplace(obj, mapping) {
  if (obj == null) return obj
  if (typeof obj === 'string') {
    return mapping[obj] || obj
  }
  if (Array.isArray(obj)) {
    return obj.map((v) => deepReplace(v, mapping))
  }
  if (typeof obj === 'object') {
    const next = {}
    for (const [k, v] of Object.entries(obj)) {
      next[k] = deepReplace(v, mapping)
    }
    return next
  }
  return obj
}

export function remapSeedDocs(docs) {
  // pass 1: build mapping for instances
  const map = {}
  for (const doc of docs) {
    const id = doc?.id
    if (isInstanceId(id)) {
      const typeId = doc?.type
      const newId = generateDeterministicInstanceId(id, typeId)
      if (newId && newId !== id) map[id] = newId
    }
  }
  if (Object.keys(map).length === 0) return docs
  // pass 2: apply mapping deeply
  const out = docs.map((doc) => deepReplace(doc, map))
  return out
}



