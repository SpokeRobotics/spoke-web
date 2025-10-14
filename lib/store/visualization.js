/**
 * Visualization utilities for determining which store objects can be displayed in 3D
 */

import { safeGetDoc } from './resolver'

/**
 * Check if a document has a 3D model that can be visualized
 * @param {Object} doc - Store document
 * @returns {boolean} - True if document has a displayable model
 */
export function isVisualizable(doc) {
  if (!doc || typeof doc !== 'object') return false
  
  // Direct model reference
  if (doc.model && doc.model.url) return true
  
  // Type reference that might have a model (we'll need to resolve)
  if (doc.type && typeof doc.type === 'string') return true
  if (doc.$type && typeof doc.$type === 'string') return true
  
  // Composite object with child references (any array or string field that looks like a reference)
  for (const [key, value] of Object.entries(doc)) {
    // Skip metadata and special fields
    if (key.startsWith('$') || key === 'meta' || key === 'id' || key === 'name' || key === 'parent') continue
    
    // Check for array of references
    if (Array.isArray(value) && value.length > 0) {
      if (value.some(v => typeof v === 'string' && v.startsWith('spoke://'))) return true
    }
    
    // Check for single reference
    if (typeof value === 'string' && value.startsWith('spoke://')) return true
  }
  
  return false
}

/**
 * Get all object IDs that should be displayed for a given document
 * Recursively expands all child references to get full visualization tree
 * @param {string} docId - Document ID to visualize
 * @param {Object} options - Options for expansion
 * @returns {Promise<string[]>} - Array of document IDs to display
 */
export async function getVisualizableIds(docId, options = {}) {
  const { maxDepth = 10, visited = new Set() } = options
  
  if (!docId || visited.has(docId) || visited.size > 100) return []
  visited.add(docId)
  
  const doc = await safeGetDoc(docId)
  if (!doc) return []
  
  const ids = []
  
  // Only add if this is an instance (not a type) and it has a model or type reference
  // Types (spoke://types/*) should not be added - they'll be resolved via instance.type
  const isType = docId.startsWith('spoke://types/')
  if (!isType && (doc.model?.url || doc.type || doc.$type)) {
    ids.push(docId)
  }
  
  // Recursively expand all child references
  if (maxDepth > 0) {
    for (const [key, value] of Object.entries(doc)) {
      // Skip metadata and special fields
      if (key.startsWith('$') || key === 'meta' || key === 'id' || key === 'name' || key === 'parent' || key === 'type') continue
      
      // Handle array of references
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string' && item.startsWith('spoke://')) {
            const childIds = await getVisualizableIds(item, {
              maxDepth: maxDepth - 1,
              visited
            })
            ids.push(...childIds)
          }
        }
      }
      
      // Handle single reference
      if (typeof value === 'string' && value.startsWith('spoke://')) {
        const childIds = await getVisualizableIds(value, {
          maxDepth: maxDepth - 1,
          visited
        })
        ids.push(...childIds)
      }
    }
  }
  
  return ids
}

/**
 * Get metadata about what can be visualized for a document
 * @param {string} docId - Document ID
 * @returns {Promise<Object>} - Visualization metadata
 */
export async function getVisualizationInfo(docId) {
  if (!docId) return { canVisualize: false, reason: 'No document ID' }
  
  const doc = await safeGetDoc(docId)
  if (!doc) return { canVisualize: false, reason: 'Document not found' }
  
  const isTypeDoc = typeof docId === 'string' && docId.startsWith('spoke://types/')
  const hasModel = !!(doc.model?.url)
  // Consider type documents visualizable even without parent type ref, since we can instantiate from templates
  const hasType = isTypeDoc || !!((doc.type && typeof doc.type === 'string') || (doc.$type && typeof doc.$type === 'string'))
  
  // Count child references
  let childCount = 0
  for (const [key, value] of Object.entries(doc)) {
    if (key.startsWith('$') || key === 'meta' || key === 'id' || key === 'name' || key === 'parent') continue
    
    if (Array.isArray(value)) {
      childCount += value.filter(v => typeof v === 'string' && v.startsWith('spoke://')).length
    } else if (typeof value === 'string' && value.startsWith('spoke://')) {
      childCount++
    }
  }
  
  // Also consider nested slot definitions in types as having children
  const hasNestedSlots = !!(doc?.slots && doc.slots.children && doc.slots.children.slots && Object.keys(doc.slots.children.slots).length > 0)
  const hasChildren = childCount > 0 || (isTypeDoc && hasNestedSlots)
  const canVisualize = hasModel || hasType || hasChildren
  
  let reason = ''
  if (!canVisualize) {
    reason = 'No model, type, or children defined'
  } else if (hasModel) {
    reason = 'Direct model reference'
  } else if (hasType) {
    reason = 'Type-based model'
  } else if (hasChildren) {
    reason = 'Composite with children'
  }
  
  return {
    canVisualize,
    reason,
    hasModel,
    hasType,
    hasChildren,
    childCount
  }
}
