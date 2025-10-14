/**
 * Hook to load and watch 3D models from store documents
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { store } from '@/lib/store/adapter'
import { batchResolveModels } from '@/lib/store/model-resolver'
import { loadModelAsset, getFileExtension, resolveModelPath } from '@/lib/models/loader'
import { applyTransform } from '@/lib/models/transform'
import { getEffectiveSlots, createInstanceFromType } from '@/lib/store/type-system'
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

      // 2) Build previews for types by using the usual instantiation mechanism (temporary instances)
      const tempInstanceIds = []
      for (const typeId of typeIds) {
        try {
          const base = typeId.split('/').pop()
          const unique = `${Date.now()}-${Math.random().toString(36).slice(2,8)}`
          const tempId = `spoke://instances/__preview-${base}-${unique}`
          // Create a temporary instance using the normal instantiation pipeline
          await createInstanceFromType(tempId, typeId, { name: `(Preview) ${base}` })
          tempInstancesRef.current.add(tempId)
          // Track children for cleanup as well
          try {
            const inst = await store.getDoc(tempId)
            const { byPath } = await getEffectiveSlots(typeId)
            for (const slotPath of Object.keys(byPath || {})) {
              const value = (() => {
                // getNested is in slot-path.js, but avoid an import by direct access
                // instance structure uses dotted path, read manually
                const parts = slotPath.split('.')
                let cur = inst
                for (const p of parts) { cur = cur?.[p]; if (!cur) break }
                return cur
              })()
              if (!value) continue
              const ids = Array.isArray(value) ? value : [value]
              ids.forEach(id => { if (typeof id === 'string') tempInstancesRef.current.add(id) })
            }
          } catch {}
          tempInstanceIds.push(tempId)
        } catch (err) {
          console.warn('[useStoreModels] Failed to instantiate preview for type', typeId, err)
        }
      }
      const resolvedPreviews = tempInstanceIds.length > 0 ? await batchResolveModels(tempInstanceIds) : []

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
      // Delete all temp instances when component unmounts
      tempInstancesRef.current.forEach(async (tempId) => {
        try {
          await store.deleteDoc(tempId)
        } catch (err) {
          // Ignore errors during cleanup
        }
      })
    }
  }, [])
  
  return {
    models,
    loading,
    error,
    reload,
  }
}
