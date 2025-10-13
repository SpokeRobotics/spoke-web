/**
 * Hook to load and watch 3D models from store documents
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { store } from '@/lib/store/adapter'
import { batchResolveModels } from '@/lib/store/model-resolver'
import { loadModelAsset, getFileExtension, resolveModelPath } from '@/lib/models/loader'
import { applyTransform } from '@/lib/models/transform'
import { getEffectiveSlots } from '@/lib/store/type-system'
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

      // 2) Build pure preview for types without persisting
      const resolvedPreviews = []
      for (const typeId of typeIds) {
        try {
          const { byPath } = await getEffectiveSlots(typeId)
          for (const [slotPath, slotDef] of Object.entries(byPath || {})) {
            if (!slotDef?.type) continue
            // Determine templates as array
            let templates = []
            if (Array.isArray(slotDef.template)) templates = slotDef.template
            else if (slotDef.template) templates = [slotDef.template]
            else if (!slotDef.array) templates = [{}]
            // For each template, resolve the child TYPE model
            for (let i = 0; i < templates.length; i++) {
              const t = templates[i] || {}
              const childTypeId = slotDef.type
              // Load child type doc for model info
              const typeDoc = await store.getDoc(childTypeId)
              if (!typeDoc) continue
              const model = typeDoc.model || null
              if (!model || !model.url) continue
              // Parse location string if present
              const locStr = t.location || '0,0,0,0,0,0'
              const parts = String(locStr).split(',').map(s => parseFloat(s.trim()) || 0)
              const location = { dx: parts[0]||0, dy: parts[1]||0, dz: parts[2]||0, rx: parts[3]||0, ry: parts[4]||0, rz: parts[5]||0 }
              // Synthesize an id for this preview item (not persisted)
              const slotName = slotPath.split('.').pop()
              const $id = `spoke://preview/${typeId.split('/').pop()}-${slotName}-${i}`
              resolvedPreviews.push({
                $id,
                doc: { ...typeDoc, id: childTypeId, name: t.name || typeDoc.name, $type: childTypeId },
                model,
                position: typeDoc.model?.offset || [0,0,0],
                rotation: typeDoc.model?.rotation || [0,0,0],
                location,
              })
            }
          }
        } catch (err) {
          console.warn('[useStoreModels] Failed to build preview for type', typeId, err)
        }
      }

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
