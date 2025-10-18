/**
 * Hook to load and watch 3D models from store documents
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { store } from '@/lib/store/adapter'
import { batchResolveModels } from '@/lib/store/model-resolver'
import { loadModelAsset, getFileExtension, resolveModelPath } from '@/lib/models/loader'
import { applyTransform } from '@/lib/models/transform'
import { getEffectiveSlots, createInstanceFromType } from '@/lib/store/type-system'
import { getNested } from '@/lib/store/slot-path'
import * as THREE from 'three'

/**
 * Custom hook to load 3D models from store
 * @param {Array<string>} objectIds - Array of store document IDs
 * @param {Object} options - Options for loading
 * @returns {Object} { models, loading, error, reload }
 */
export function useStoreModels(objectIds, options = {}) {
  const { basePrefix = '/models', autoLoad = true } = options
  
  const [models, setModels] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [lastLoadKey, setLastLoadKey] = useState('')
  const tempInstancesRef = useRef(new Set()) // Track temp instances for cleanup
  
  const loadModels = useCallback(async () => {
    if (!objectIds || objectIds.length === 0) {
      setModels([])
      setLoading(false)
      return
    }
    
    console.log('[useStoreModels] Loading models for IDs:', objectIds)
    
    try {
      setLoading(true)
      setError(null)
      
      // Separate typeIds and instanceIds
      const typeIds = objectIds.filter(id => typeof id === 'string' && id.startsWith('spoke://types/'))
      const instanceIds = objectIds.filter(id => typeof id === 'string' && id.startsWith('spoke://instances/'))

      // 1) Resolve instances normally via model-resolver
      const resolvedInstances = instanceIds.length > 0 ? await batchResolveModels(instanceIds) : []

      // 2) Build previews for types in-memory using createInstanceFromType() without persisting
      const previewItems = []
      const { resolveModelFromDoc, getEffectivePosition, getEffectiveRotation } = await import('@/lib/store/model-resolver')
      const parseLocationString = (locationStr) => {
        if (!locationStr || typeof locationStr !== 'string') return { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 }
        const parts = String(locationStr).split(',').map(s => parseFloat(s.trim()) || 0)
        return { dx: parts[0]||0, dy: parts[1]||0, dz: parts[2]||0, rx: parts[3]||0, ry: parts[4]||0, rz: parts[5]||0 }
      }
      const composeLocations = (a, b) => ({ dx: (a?.dx||0)+(b?.dx||0), dy: (a?.dy||0)+(b?.dy||0), dz: (a?.dz||0)+(b?.dz||0), rx: (a?.rx||0)+(b?.rx||0), ry: (a?.ry||0)+(b?.ry||0), rz: (a?.rz||0)+(b?.rz||0) })
      for (const typeId of typeIds) {
        try {
          const { generatePreviewId } = await import('@/lib/store/id.js')
          const tempId = generatePreviewId(typeId)
          const typeBase = String(typeId).split('/').pop()
          const { instance, children } = await createInstanceFromType(tempId, typeId, { name: `(Preview) ${typeBase}` }, { transient: true })
          // Build in-memory doc map
          const docsById = new Map()
          docsById.set(instance.id, instance)
          for (const c of children) docsById.set(c.id, c.doc)

          // Ensure all preview docs are flagged as transient
          try {
            for (const [, d] of docsById.entries()) {
              if (!d.meta) d.meta = {}
              d.meta.transient = true
            }
          } catch {}

          // Recursive expansion using in-memory docs to find leaf items
          const expand = async (docId, parentLoc = { dx:0,dy:0,dz:0,rx:0,ry:0,rz:0 }) => {
            const doc = docsById.get(docId)
            if (!doc) return
            const typeRef = doc.type || doc.$type
            if (!typeRef) return
            const { byPath } = await getEffectiveSlots(typeRef)
            let hasChildren = false
            for (const [slotPath] of Object.entries(byPath || {})) {
              const value = getNested(doc, slotPath)
              if (!value) continue
              const ids = Array.isArray(value) ? value : [value]
              for (const childId of ids) {
                const childDoc = docsById.get(childId)
                if (!childDoc) continue
                hasChildren = true
                const childLoc = composeLocations(parentLoc, parseLocationString(childDoc.location))
                await expand(childId, childLoc)
              }
            }
            if (!hasChildren) {
              const model = await resolveModelFromDoc(doc)
              if (!model || !model.url) return
              const position = await getEffectivePosition(doc)
              const rotation = await getEffectiveRotation(doc)
              previewItems.push({ $id: doc.id, doc, model, position, rotation, location: parentLoc })
            }
          }

          await expand(instance.id)
        } catch (err) {
          console.warn('[useStoreModels] Failed to build preview for type', typeId, err)
        }
      }
      const resolvedPreviews = previewItems

      // Combine
      const resolved = [...resolvedInstances, ...resolvedPreviews]
      
      console.log('[useStoreModels] Resolved models:', resolved.length, 'items')
      
      // Load 3D assets
      const loadedModels = []
      for (const item of resolved) {
        const { $id, doc, model, position, rotation, location } = item
        
        if (!model || !model.url) {
          console.warn(`[useStoreModels] No model URL for ${$id}`)
          continue
        }
        
        const ext = getFileExtension(model.url)
        if (!ext) {
          console.warn(`[useStoreModels] No extension for ${model.url}`)
          continue
        }
        
        const url = resolveModelPath(model.url, basePrefix)
        const object3D = await loadModelAsset(url, ext)
        
        // Store the raw object without transforms
        // The caller (SystemViewer) will handle transforms via state definitions
        if (object3D) {
          object3D.name = doc.name || $id
          object3D.userData.$id = $id
          object3D.userData.$type = doc.$type
        }
        
        loadedModels.push({
          $id,
          doc,
          object: object3D,
          model,
          position,
          rotation,
          location, // Pass through location from hierarchical expansion
        })
      }
      
      console.log('[useStoreModels] Loaded models:', loadedModels.length)
      
      setModels(loadedModels)
    } catch (err) {
      console.error('[useStoreModels] Load error:', err)
      setError(err.message || String(err))
    } finally {
      setLoading(false)
    }
  }, [objectIds, basePrefix])
  
  // Auto-load on mount or when objectIds change
  useEffect(() => {
    if (!autoLoad) return
    
    const key = JSON.stringify(objectIds)
    if (key === lastLoadKey) return
    
    setLastLoadKey(key)
    loadModels()
  }, [objectIds, autoLoad, lastLoadKey, loadModels])
  
  // Listen for store updates
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleStoreChange = (event) => {
      const { $id, deleted } = event.detail || {}
      
      // If any of our objects changed, reload
      if (objectIds && objectIds.includes($id)) {
        loadModels()
      }
    }
    
    window.addEventListener('store:docSaved', handleStoreChange)
    return () => window.removeEventListener('store:docSaved', handleStoreChange)
  }, [objectIds, loadModels])
  
  const reload = useCallback(() => {
    loadModels()
  }, [loadModels])
  
  // Cleanup temp instances on unmount
  useEffect(() => {
    return () => {
      // No persisted temp previews
    }
  }, [])
  
  return {
    models,
    loading,
    error,
    reload,
  }
}
