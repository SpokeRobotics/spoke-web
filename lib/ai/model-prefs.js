'use client'

// Local storage helpers for managing custom and hidden model lists per provider
// Stored keys:
// - ai:models:<provider>:custom -> JSON array [{ id, label }]
// - ai:models:<provider>:hidden -> JSON array [id]
// - ai:models:<provider>:validated -> JSON array [id]

export function loadCustomModels(provider) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`ai:models:${provider}:custom`)
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) return arr.filter(m => m && typeof m.id === 'string')
  } catch {}
  return []
}

export function saveCustomModels(provider, models) {
  if (typeof window === 'undefined') return
  try {
    const clean = Array.isArray(models) ? models.map(m => ({ id: String(m.id), label: m.label || String(m.id) })) : []
    localStorage.setItem(`ai:models:${provider}:custom`, JSON.stringify(clean))
  } catch {}
}

export function loadHiddenModels(provider) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`ai:models:${provider}:hidden`)
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) return arr.filter(id => typeof id === 'string')
  } catch {}
  return []
}

export function saveHiddenModels(provider, ids) {
  if (typeof window === 'undefined') return
  try {
    const clean = Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
    localStorage.setItem(`ai:models:${provider}:hidden`, JSON.stringify(clean))
  } catch {}
}

export function loadValidatedModels(provider) {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`ai:models:${provider}:validated`)
    const arr = JSON.parse(raw || '[]')
    if (Array.isArray(arr)) return arr.filter(id => typeof id === 'string')
  } catch {}
  return []
}

export function saveValidatedModels(provider, ids) {
  if (typeof window === 'undefined') return
  try {
    const clean = Array.isArray(ids) ? ids.filter(id => typeof id === 'string') : []
    localStorage.setItem(`ai:models:${provider}:validated`, JSON.stringify(clean))
  } catch {}
}

export function mergeModelsWithPrefs(provider, baseModels) {
  const customs = loadCustomModels(provider)
  const hidden = new Set(loadHiddenModels(provider))
  // baseModels and customs share shape {id,label,capabilities?}
  const mergedMap = new Map()
  for (const m of (Array.isArray(baseModels) ? baseModels : [])) {
    if (m && typeof m.id === 'string') mergedMap.set(m.id, m)
  }
  for (const m of customs) {
    if (m && typeof m.id === 'string') mergedMap.set(m.id, { ...m, capabilities: m.capabilities })
  }
  // filter hidden
  const list = Array.from(mergedMap.values()).filter(m => !hidden.has(m.id))
  // stable sort by label then id
  list.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))
  return list
}
