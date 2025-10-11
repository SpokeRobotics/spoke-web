/**
 * SystemScene - Manages THREE.js scene with objects from store
 */

import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react'
import * as THREE from 'three'

/**
 * SystemScene component
 * Creates and manages a THREE.js scene with models from the store
 * @param {Object} props
 * @param {Array} props.models - Array of { $id, object, position, rotation }
 * @param {Function} props.onSceneReady - Callback when scene is ready
 */
export const SystemScene = forwardRef(function SystemScene(
  { models = [], onSceneReady },
  ref
) {
  const sceneRef = useRef(null)
  const modelsMapRef = useRef(new Map()) // Track which models are in scene
  
  // Initialize scene
  useEffect(() => {
    if (!sceneRef.current) {
      sceneRef.current = new THREE.Scene()
      sceneRef.current.name = 'SystemScene'
      
      if (onSceneReady) {
        onSceneReady(sceneRef.current)
      }
    }
  }, [onSceneReady])
  
  // Update scene when models change
  useEffect(() => {
    if (!sceneRef.current) return
    
    const scene = sceneRef.current
    const currentMap = modelsMapRef.current
    const newModelIds = new Set(models.map(m => m.$id))
    
    // Remove models that are no longer in the list
    for (const [id, obj] of currentMap.entries()) {
      if (!newModelIds.has(id)) {
        scene.remove(obj)
        currentMap.delete(id)
      }
    }
    
    // Add or update models
    for (const modelData of models) {
      const { $id, object } = modelData
      
      if (!object) continue
      
      // If already in scene, update position/rotation
      if (currentMap.has($id)) {
        const existing = currentMap.get($id)
        if (existing !== object) {
          // Object reference changed, replace it
          scene.remove(existing)
          scene.add(object)
          currentMap.set($id, object)
        }
      } else {
        // New object, add to scene
        scene.add(object)
        currentMap.set($id, object)
      }
    }
  }, [models])
  
  // Expose scene via ref
  useImperativeHandle(ref, () => ({
    getScene: () => sceneRef.current,
    getModels: () => models,
    getModelById: ($id) => models.find(m => m.$id === $id),
  }))
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sceneRef.current) {
        // Clean up scene objects
        const scene = sceneRef.current
        while (scene.children.length > 0) {
          const obj = scene.children[0]
          scene.remove(obj)
        }
        sceneRef.current = null
        modelsMapRef.current.clear()
      }
    }
  }, [])
  
  return null // This component doesn't render DOM
})

export default SystemScene
