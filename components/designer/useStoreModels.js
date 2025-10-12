/**
 * Hook to load and watch 3D models from store documents
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { store } from '@/lib/store/adapter'
import { batchResolveModels } from '@/lib/store/model-resolver'
import { loadModelAsset, getFileExtension, resolveModelPath } from '@/lib/models/loader'
import { applyTransform } from '@/lib/models/transform'
import { createInstanceFromType, getEffectiveSlots } from '@/lib/store/type-system'
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
    
    try {
      setLoading(true)
      setError(null)
      
      // Process object IDs - auto-instantiate types
      const processedIds = []
      const newTempInstances = new Set()
      
      for (const id of objectIds) {
        if (typeof id === 'string' && id.startsWith('spoke://types/')) {
          // Auto-instantiate from type
          const tempId = `spoke://temp/preview-${id.split('/').pop()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
          
          try {
            await createInstanceFromType(tempId, id, { 
              name: `Preview: ${id.split('/').pop()}` 
            })
            newTempInstances.add(tempId)
            processedIds.push(tempId)
          } catch (err) {
            console.warn(`[useStoreModels] Failed to instantiate type ${id}:`, err)
            // Continue with other objects
          }
        } else {
          processedIds.push(id)
        }
      }
      
      // Update temp instances ref
      tempInstancesRef.current = newTempInstances
      
      // Resolve model configs from store
      const resolved = await batchResolveModels(processedIds)
      
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
