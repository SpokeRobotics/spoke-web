/**
 * 3D transform utilities for position and rotation
 */

import * as THREE from 'three'

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
export function degToRad(deg) {
  return ((Number(deg) || 0) * Math.PI) / 180
}

/**
 * Parse position array [x, y, z]
 * @param {Array<number>} arr - Position array
 * @returns {THREE.Vector3} THREE.js Vector3
 */
export function parsePositionArray(arr) {
  if (!Array.isArray(arr)) return new THREE.Vector3(0, 0, 0)
  const [x = 0, y = 0, z = 0] = arr
  return new THREE.Vector3(
    Number(x) || 0,
    Number(y) || 0,
    Number(z) || 0
  )
}

/**
 * Parse rotation array [rx, ry, rz] in degrees
 * @param {Array<number>} arr - Rotation array in degrees
 * @returns {THREE.Euler} THREE.js Euler rotation
 */
export function parseRotationArray(arr) {
  if (!Array.isArray(arr)) return new THREE.Euler(0, 0, 0, 'ZYX')
  const [rx = 0, ry = 0, rz = 0] = arr
  return new THREE.Euler(
    degToRad(rx),
    degToRad(ry),
    degToRad(rz),
    'ZYX'
  )
}

/**
 * Parse transform tuple [x, y, z, rx, ry, rz] used in ModelViewer
 * @param {string} raw - Comma-separated transform string
 * @returns {Object} Transform with position, euler, quaternion
 */
export function parseTransformTuple(raw) {
  if (raw == null) raw = ''
  const parts = String(raw)
    .split(',')
    .map((p) => p.trim())
  
  while (parts.length < 6) parts.push('0')
  
  const [x, y, z, ax, ay, az] = parts.slice(0, 6)
  
  const position = new THREE.Vector3(
    Number(x) || 0,
    Number(y) || 0,
    Number(z) || 0
  )
  
  const euler = new THREE.Euler(
    degToRad(Number(ax) || 0),
    degToRad(Number(ay) || 0),
    degToRad(Number(az) || 0),
    'ZYX'
  )
  
  const quaternion = new THREE.Quaternion().setFromEuler(euler)
  
  return { position, euler, quaternion }
}

/**
 * Apply position and rotation to a THREE.js Object3D
 * @param {THREE.Object3D} object - Object to transform
 * @param {Array<number>|THREE.Vector3} position - Position [x,y,z] or Vector3
 * @param {Array<number>|THREE.Euler} rotation - Rotation [rx,ry,rz] in degrees or Euler
 */
export function applyTransform(object, position, rotation) {
  if (!object) return
  
  // Apply position
  if (Array.isArray(position)) {
    const pos = parsePositionArray(position)
    object.position.copy(pos)
  } else if (position && position.isVector3) {
    object.position.copy(position)
  }
  
  // Apply rotation
  if (Array.isArray(rotation)) {
    const rot = parseRotationArray(rotation)
    object.rotation.copy(rot)
  } else if (rotation && rotation.isEuler) {
    object.rotation.copy(rotation)
  } else if (rotation && rotation.isQuaternion) {
    object.quaternion.copy(rotation)
  }
}

/**
 * Apply model offset to position an object at a viewer origin
 * @param {THREE.Object3D} object - Object to offset
 * @param {Array<number>} offset - Offset [x, y, z]
 * @param {Array<number>} rotation - Rotation [rx, ry, rz] in degrees
 */
export function applyModelOffset(object, offset, rotation) {
  if (!object) return
  
  const pos = Array.isArray(offset) ? offset : [0, 0, 0]
  const rot = Array.isArray(rotation) ? rotation : [0, 0, 0]
  
  applyTransform(object, pos, rot)
}

/**
 * Create a transform matrix from position and rotation
 * @param {Array<number>} position - Position [x, y, z]
 * @param {Array<number>} rotation - Rotation [rx, ry, rz] in degrees
 * @returns {THREE.Matrix4} Transform matrix
 */
export function createTransformMatrix(position, rotation) {
  const pos = parsePositionArray(position)
  const rot = parseRotationArray(rotation)
  const quat = new THREE.Quaternion().setFromEuler(rot)
  
  const matrix = new THREE.Matrix4()
  matrix.compose(pos, quat, new THREE.Vector3(1, 1, 1))
  
  return matrix
}
