/**
 * Generic 3D model loader utilities
 * Supports STL, 3MF, GLB/GLTF formats with caching
 */

import * as THREE from 'three'
import { getAssetPath } from '@/lib/paths'

// Module-level cache for loaded models (key: full resolved URL, value: Promise<Object3D>)
const modelCache = new Map()

/**
 * Load a model asset from URL with format auto-detection
 * @param {string} url - Full URL to model file
 * @param {string} ext - File extension (stl, 3mf, glb, gltf)
 * @returns {Promise<THREE.Object3D|THREE.Mesh>} Loaded model
 */
async function loadModelAssetUncached(url, ext) {
  if (ext === 'stl') {
    const mod = await import('three/examples/jsm/loaders/STLLoader.js')
    const STLLoader = mod.STLLoader || mod.default || mod
    const loader = new STLLoader()
    const geometry = await loader.loadAsync(url)
    geometry.computeBoundingBox()
    geometry.computeBoundingSphere()
    const material = new THREE.MeshStandardMaterial({ 
      color: 0xe0e0e0, 
      metalness: 0.1, 
      roughness: 0.85 
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.__sourceType = 'geometry'
    return mesh
  }
  
  if (ext === '3mf') {
    const mod = await import('three/examples/jsm/loaders/3MFLoader.js')
    const Loader = mod.ThreeMFLoader || mod.default || mod
    const loader = new Loader()
    const object = await loader.loadAsync(url)
    object.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.transparent = true
        obj.material.opacity = 1
      }
    })
    object.userData.__sourceType = 'object'
    return object
  }
  
  if (ext === 'glb' || ext === 'gltf') {
    const mod = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const GLTFLoader = mod.GLTFLoader || mod.default || mod
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const object = gltf.scene || gltf.scenes?.[0]
    if (!object) throw new Error('GLTF has no scene')
    object.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.transparent = true
        obj.material.opacity = 1
      }
    })
    object.userData.__sourceType = 'object'
    return object
  }
  
  throw new Error(`Unsupported model extension: .${ext}`)
}

/**
 * Load a model asset with caching
 * Subsequent calls with same URL return cloned instances
 * @param {string} url - Full URL to model file
 * @param {string} ext - File extension (stl, 3mf, glb, gltf)
 * @returns {Promise<THREE.Object3D|THREE.Mesh>} Loaded model (cloned if cached)
 */
export async function loadModelAsset(url, ext) {
  // Check cache first
  if (modelCache.has(url)) {
    const cachedPromise = modelCache.get(url)
    const cachedObject = await cachedPromise
    
    // Clone the cached object for this instance
    if (cachedObject.userData.__sourceType === 'geometry') {
      // For STL: clone geometry, create new material and mesh
      const geometry = cachedObject.geometry.clone()
      const material = new THREE.MeshStandardMaterial({ 
        color: 0xe0e0e0, 
        metalness: 0.1, 
        roughness: 0.85 
      })
      const mesh = new THREE.Mesh(geometry, material)
      mesh.userData.__sourceType = 'geometry'
      return mesh
    } else {
      // For 3MF/GLTF: deep clone the object hierarchy
      const cloned = cachedObject.clone(true)
      // Re-apply material settings since clone() may not preserve all properties
      cloned.traverse((obj) => {
        if (obj.isMesh && obj.material) {
          obj.material.transparent = true
          obj.material.opacity = 1
        }
      })
      return cloned
    }
  }
  
  // Cache miss: load and cache the promise
  const loadPromise = loadModelAssetUncached(url, ext)
  modelCache.set(url, loadPromise)
  
  // Wait for load to complete and return the original
  return await loadPromise
}

/**
 * Clone an object for scene use
 * @param {THREE.Object3D} object - Object to clone
 * @returns {THREE.Object3D} Cloned object with independent materials
 */
export function cloneObjectForScene(object) {
  if (!object) return null
  const clone = object.clone ? object.clone(true) : object
  if (clone && clone.traverse) {
    clone.traverse((node) => {
      if (node.isMesh) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => (mat && mat.clone ? mat.clone() : mat))
        } else if (node.material && node.material.clone) {
          node.material = node.material.clone()
        }
      }
    })
  }
  return clone
}

/**
 * Resolve model path with basePath support
 * @param {string} rawPath - Path from model config (relative or absolute)
 * @param {string} basePrefix - Base path prefix for relative paths
 * @returns {string} Resolved absolute URL
 */
export function resolveModelPath(rawPath, basePrefix) {
  if (!rawPath) return ''
  // Absolute URL
  if (/^https?:\/\//i.test(rawPath)) return rawPath
  // Absolute path
  if (rawPath.startsWith('/')) return getAssetPath(rawPath)
  // Relative path
  const base = basePrefix || '/models'
  return getAssetPath(`${base}/${rawPath}`)
}

/**
 * Extract file extension from path or URL
 * @param {string} path - File path or URL
 * @returns {string} Extension without dot (e.g., 'stl', '3mf')
 */
export function getFileExtension(path) {
  if (!path) return ''
  const m = path.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)
  return m ? m[1] : ''
}

/**
 * Clear the model cache (useful for testing or memory management)
 */
export function clearModelCache() {
  modelCache.clear()
}
