// Generic helpers for working with nested kinds (e.g., children) using dotted slot paths
// Public API is intentionally tiny and generic for reuse across store and UI

/**
 * Split a dotted slot path like "children.cells" into { kind, slot }
 */
export function splitSlotPath(path) {
  if (typeof path !== 'string' || !path.includes('.')) {
    return { kind: null, slot: path || null }
  }
  const [kind, ...rest] = path.split('.')
  return { kind, slot: rest.join('.') || null }
}

/**
 * Get nested property by dotted path. Returns undefined if not found.
 */
export function getNested(obj, path) {
  if (!obj || !path) return undefined
  const parts = path.split('.')
  let cur = obj
  for (const p of parts) {
    if (cur && Object.prototype.hasOwnProperty.call(cur, p)) {
      cur = cur[p]
    } else {
      return undefined
    }
  }
  return cur
}

/**
 * Set nested property by dotted path. Creates intermediate objects.
 */
export function setNested(obj, path, value) {
  const parts = path.split('.')
  let cur = obj
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!cur[p] || typeof cur[p] !== 'object') cur[p] = {}
    cur = cur[p]
  }
  cur[parts[parts.length - 1]] = value
  return obj
}

/**
 * List slot paths from a single type doc with nested kinds under `slots.{kind}.slots.*`.
 * Only reads; merging across type chain is handled by type-system.
 */
export function listSlotPathsFromType(typeDoc) {
  const paths = []
  const kinds = typeDoc?.slots && typeof typeDoc.slots === 'object' ? typeDoc.slots : {}
  for (const [kind, group] of Object.entries(kinds)) {
    const inner = group && typeof group === 'object' ? group.slots : null
    if (!inner || typeof inner !== 'object') continue
    for (const slotName of Object.keys(inner)) {
      paths.push(`${kind}.${slotName}`)
    }
  }
  return paths
}
