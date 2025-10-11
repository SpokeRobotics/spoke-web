/**
 * Store model resolver - extracts and resolves 3D model data from store documents
 * Handles type inheritance and model property merging
 */

import { store } from '@/lib/store/adapter'

/**
 * Resolve model information from a store document
 * Handles both direct model definitions and type references
 * @param {Object} doc - Store document
 * @param {number} maxDepth - Maximum recursion depth for type chain
 * @returns {Promise<Object|null>} Resolved model config or null
 */
export async function resolveModelFromDoc(doc, maxDepth = 5) {
  if (!doc || typeof doc !== 'object') return null
  
  // Direct model definition
  if (doc.model && typeof doc.model === 'object') {
    return {
      url: doc.model.url || null,
      offset: Array.isArray(doc.model.offset) ? doc.model.offset : [0, 0, 0],
      rotation: Array.isArray(doc.model.rotation) ? doc.model.rotation : [0, 0, 0],
      scale: Array.isArray(doc.model.scale) ? doc.model.scale : [1, 1, 1],
    }
  }
  
  // Type reference - follow the chain
  if (doc.$type && typeof doc.$type === 'string' && doc.$type.startsWith('spoke://')) {
    if (maxDepth <= 0) {
      console.warn(`[model-resolver] Max depth reached resolving type chain for ${doc.$id}`)
      return null
    }
    
    try {
      const typeDoc = await store.getDoc(doc.$type)
      if (typeDoc) {
        return await resolveModelFromDoc(typeDoc, maxDepth - 1)
      }
    } catch (err) {
      console.warn(`[model-resolver] Failed to resolve type ${doc.$type}:`, err)
    }
  }
  
  return null
}

/**
 * Resolve the complete type chain for a document
 * Returns array of documents from most specific (instance) to most general (base type)
 * @param {Object} doc - Store document
 * @param {number} maxDepth - Maximum chain depth
 * @returns {Promise<Array<Object>>} Array of documents in inheritance chain
 */
export async function resolveTypeChain(doc, maxDepth = 10) {
  if (!doc) return []
  
  const chain = [doc]
  let current = doc
  let depth = 0
  
  while (current.$type && typeof current.$type === 'string' && current.$type.startsWith('spoke://')) {
    if (depth >= maxDepth) {
      console.warn(`[model-resolver] Max depth ${maxDepth} reached in type chain`)
      break
    }
    
    try {
      const typeDoc = await store.getDoc(current.$type)
      if (!typeDoc) break
      chain.push(typeDoc)
      current = typeDoc
      depth++
    } catch (err) {
      console.warn(`[model-resolver] Error traversing type chain:`, err)
      break
    }
  }
  
  return chain
}

/**
 * Get effective model configuration by merging type chain
 * Instance properties override type properties
 * @param {Object} doc - Store document
 * @returns {Promise<Object|null>} Merged model config
 */
export async function getEffectiveModel(doc) {
  if (!doc) return null
  
  const chain = await resolveTypeChain(doc)
  if (chain.length === 0) return null
  
  // Merge from base to specific (later entries override earlier ones)
  let effectiveModel = null
  
  for (const item of chain.reverse()) {
    if (item.model && typeof item.model === 'object') {
      if (!effectiveModel) {
        effectiveModel = {
          url: null,
          offset: [0, 0, 0],
          rotation: [0, 0, 0],
          scale: [1, 1, 1],
        }
      }
      
      if (item.model.url) effectiveModel.url = item.model.url
      if (Array.isArray(item.model.offset)) effectiveModel.offset = [...item.model.offset]
      if (Array.isArray(item.model.rotation)) effectiveModel.rotation = [...item.model.rotation]
      if (Array.isArray(item.model.scale)) effectiveModel.scale = [...item.model.scale]
    }
  }
  
  return effectiveModel
}

/**
 * Get effective position for an instance
 * Combines model offset with instance-specific position
 * @param {Object} doc - Store document
 * @returns {Promise<Array<number>>} Position [x, y, z]
 */
export async function getEffectivePosition(doc) {
  if (!doc) return [0, 0, 0]
  
  // Instance position overrides model offset
  if (Array.isArray(doc.instancePosition)) {
    return [...doc.instancePosition]
  }
  
  const model = await getEffectiveModel(doc)
  if (model && Array.isArray(model.offset)) {
    return [...model.offset]
  }
  
  return [0, 0, 0]
}

/**
 * Get effective rotation for an instance
 * Combines model rotation with instance-specific rotation
 * @param {Object} doc - Store document
 * @returns {Promise<Array<number>>} Rotation [rx, ry, rz] in degrees
 */
export async function getEffectiveRotation(doc) {
  if (!doc) return [0, 0, 0]
  
  // Instance rotation overrides model rotation
  if (Array.isArray(doc.instanceRotation)) {
    return [...doc.instanceRotation]
  }
  
  const model = await getEffectiveModel(doc)
  if (model && Array.isArray(model.rotation)) {
    return [...model.rotation]
  }
  
  return [0, 0, 0]
}

/**
 * Batch resolve models from multiple document IDs
 * @param {Array<string>} docIds - Array of document IDs
 * @returns {Promise<Array<Object>>} Array of { $id, doc, model, position, rotation }
 */
export async function batchResolveModels(docIds) {
  if (!Array.isArray(docIds)) return []
  
  const results = []
  
  for (const $id of docIds) {
    if (!$id || typeof $id !== 'string') continue
    
    try {
      const doc = await store.getDoc($id)
      if (!doc) continue
      
      const model = await getEffectiveModel(doc)
      if (!model || !model.url) continue
      
      const position = await getEffectivePosition(doc)
      const rotation = await getEffectiveRotation(doc)
      
      results.push({
        $id,
        doc,
        model,
        position,
        rotation,
      })
    } catch (err) {
      console.warn(`[model-resolver] Failed to resolve ${$id}:`, err)
    }
  }
  
  return results
}
