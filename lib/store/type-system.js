/**
 * Type System Utilities
 * 
 * Handles type inheritance, slot resolution, and instance validation
 * for the Spoke object model.
 */

import { store } from './adapter.js'

/**
 * Walk up the type chain and collect all type documents
 * @param {string} typeId - Starting type ID
 * @param {number} maxDepth - Maximum chain depth
 * @returns {Promise<Array>} Array of type documents (parent first, child last)
 */
export async function getTypeChain(typeId, maxDepth = 10) {
  const chain = []
  let current = typeId
  let depth = 0
  
  while (current && current.startsWith('spoke://types/') && depth < maxDepth) {
    const typeDoc = await store.getDoc(current)
    if (!typeDoc) break
    
    chain.unshift(typeDoc) // prepend so parent is first
    current = typeDoc.type
    depth++
  }
  
  return chain
}

/**
 * Get effective slots by merging all slots from the type chain
 * Child slots override parent slots with the same name
 * @param {string} typeId - Type ID to resolve slots for
 * @returns {Promise<Object>} Merged slot definitions
 */
export async function getEffectiveSlots(typeId) {
  if (!typeId || !typeId.startsWith('spoke://types/')) {
    return {}
  }
  
  const chain = await getTypeChain(typeId)
  
  // Merge slots from parent to child (child overrides parent)
  const merged = {}
  for (const typeDoc of chain) {
    if (typeDoc.slots && typeof typeDoc.slots === 'object') {
      Object.assign(merged, typeDoc.slots)
    }
  }
  
  return merged
}

/**
 * Update an instance and maintain parent links for all child instances
 * @param {Object} instance - Instance document to save
 * @returns {Promise<void>}
 */
export async function putInstance(instance) {
  if (!instance || !instance.id) {
    throw new Error('putInstance: instance.id required')
  }
  
  // Get effective slots to know which fields are child references
  const effectiveSlots = await getEffectiveSlots(instance.type)
  
  // Update parent links for all children in slots
  for (const [slotName, slotDef] of Object.entries(effectiveSlots)) {
    const value = instance[slotName]
    if (!value) continue
    
    // Handle both single references and arrays
    const childIds = Array.isArray(value) ? value : [value]
    
    for (const childId of childIds) {
      if (typeof childId !== 'string' || !childId.startsWith('spoke://instances/')) {
        continue
      }
      
      try {
        const child = await store.getDoc(childId)
        if (child) {
          // Update child's parent reference
          if (child.parent !== instance.id || child.parentSlot !== slotName) {
            child.parent = instance.id
            child.parentSlot = slotName
            await store.putDoc(child)
          }
        }
      } catch (err) {
        console.warn(`[type-system] Failed to update parent link for ${childId}:`, err)
      }
    }
  }
  
  // Save the instance
  await store.putDoc(instance)
}

/**
 * Validate all parent links in the store
 * @returns {Promise<Array>} Array of error messages (empty if valid)
 */
export async function validateParentLinks() {
  const errors = []
  const headers = await store.listDocHeaders()
  
  for (const header of headers) {
    if (!header.id || !header.id.startsWith('spoke://instances/')) continue
    
    try {
      const instance = await store.getDoc(header.id)
      if (!instance) continue
      
      // Check parent link if present
      if (instance.parent) {
        const parent = await store.getDoc(instance.parent)
        
        if (!parent) {
          errors.push({
            instance: instance.id,
            error: 'missing_parent',
            message: `Parent ${instance.parent} not found`
          })
          continue
        }
        
        // Verify parent actually references this instance
        const slotValue = parent[instance.parentSlot]
        let isInSlot = false
        
        if (Array.isArray(slotValue)) {
          isInSlot = slotValue.includes(instance.id)
        } else {
          isInSlot = slotValue === instance.id
        }
        
        if (!isInSlot) {
          errors.push({
            instance: instance.id,
            error: 'parent_mismatch',
            message: `Parent ${parent.id}.${instance.parentSlot} doesn't reference this instance`
          })
        }
      }
    } catch (err) {
      errors.push({
        instance: header.id,
        error: 'validation_error',
        message: err.message
      })
    }
  }
  
  return errors
}

/**
 * Repair broken parent links by scanning all instances
 * @returns {Promise<Object>} Stats about repairs made
 */
export async function repairParentLinks() {
  const stats = { fixed: 0, orphaned: 0, errors: 0 }
  
  // Build index of actual parent relationships
  const parentIndex = new Map() // childId → { parent, slot }
  const headers = await store.listDocHeaders()
  
  for (const header of headers) {
    try {
      const doc = await store.getDoc(header.id)
      if (!doc || !doc.type) continue
      
      const slots = await getEffectiveSlots(doc.type)
      
      for (const [slotName, slotDef] of Object.entries(slots)) {
        const value = doc[slotName]
        if (!value) continue
        
        const childIds = Array.isArray(value) ? value : [value]
        
        for (const childId of childIds) {
          if (typeof childId === 'string' && childId.startsWith('spoke://instances/')) {
            parentIndex.set(childId, { parent: doc.id, slot: slotName })
          }
        }
      }
    } catch (err) {
      stats.errors++
    }
  }
  
  // Update instances to match actual parent relationships
  for (const header of headers) {
    if (!header.id || !header.id.startsWith('spoke://instances/')) continue
    
    try {
      const instance = await store.getDoc(header.id)
      if (!instance) continue
      
      const actualParent = parentIndex.get(header.id)
      
      if (actualParent) {
        // Update if different
        if (instance.parent !== actualParent.parent || instance.parentSlot !== actualParent.slot) {
          instance.parent = actualParent.parent
          instance.parentSlot = actualParent.slot
          await store.putDoc(instance)
          stats.fixed++
        }
      } else {
        // Remove orphaned parent refs
        if (instance.parent) {
          delete instance.parent
          delete instance.parentSlot
          await store.putDoc(instance)
          stats.orphaned++
        }
      }
    } catch (err) {
      stats.errors++
    }
  }
  
  return stats
}

/**
 * Get all instances of a given type
 * @param {string} typeId - Type ID to search for
 * @returns {Promise<Array>} Array of instance documents
 */
export async function getInstancesOfType(typeId) {
  const instances = []
  const headers = await store.listDocHeaders()
  
  for (const header of headers) {
    if (!header.id || !header.id.startsWith('spoke://instances/')) continue
    
    try {
      const instance = await store.getDoc(header.id)
      if (instance && instance.type === typeId) {
        instances.push(instance)
      }
    } catch (err) {
      console.warn(`[type-system] Failed to load instance ${header.id}:`, err)
    }
  }
  
  return instances
}

/**
 * Create instances for a slot using its template
 * @param {string} parentId - Parent instance ID
 * @param {string} slotName - Slot name
 * @param {Object} slotDef - Slot definition with template
 * @param {number} count - Number of instances to create (for arrays)
 * @returns {Promise<Array<string>>} Array of created instance IDs
 */
export async function instantiateSlot(parentId, slotName, slotDef, count = null) {
  if (!slotDef.type) {
    throw new Error('Slot definition must have a type')
  }
  
  const instanceIds = []
  
  // Determine how many instances to create
  let templates = []
  if (slotDef.array) {
    if (Array.isArray(slotDef.template)) {
      templates = slotDef.template
    } else if (slotDef.template) {
      // Single template for array - use count times
      const repeatCount = count || 1
      templates = Array(repeatCount).fill(slotDef.template)
    } else {
      // No template - create count empty instances
      const repeatCount = count || 0
      templates = Array(repeatCount).fill({})
    }
  } else {
    // Single slot
    templates = [slotDef.template || {}]
  }
  
  // Create each instance
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]
    const instanceId = `${parentId}-${slotName}-${i}`
    
    const instance = {
      id: instanceId,
      type: slotDef.type,
      parent: parentId,
      parentSlot: slotName,
      ...template, // Apply template properties
      meta: {
        origin: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      }
    }
    
    await store.putDoc(instance)
    instanceIds.push(instanceId)
  }
  
  return instanceIds
}

/**
 * Create a complete instance from a type, instantiating all slots with templates
 * @param {string} instanceId - ID for the new instance
 * @param {string} typeId - Type to instantiate from
 * @param {Object} overrides - Property overrides for the instance
 * @returns {Promise<Object>} Created instance document
 */
export async function createInstanceFromType(instanceId, typeId, overrides = {}) {
  const slots = await getEffectiveSlots(typeId)
  const instance = {
    id: instanceId,
    type: typeId,
    parent: null,
    name: overrides.name || `Instance of ${typeId}`,
    ...overrides,
    meta: {
      origin: 'user',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1
    }
  }
  
  // Instantiate each slot with a template
  for (const [slotName, slotDef] of Object.entries(slots)) {
    if (slotDef.template) {
      const childIds = await instantiateSlot(instanceId, slotName, slotDef)
      
      if (slotDef.array) {
        instance[slotName] = childIds
      } else {
        instance[slotName] = childIds[0] || null
      }
    }
  }
  
  await store.putDoc(instance)
  return instance
}

/**
 * Validate an instance against its type's slot definitions
 * @param {Object} instance - Instance to validate
 * @returns {Promise<Array>} Array of validation errors
 */
export async function validateInstance(instance) {
  const errors = []
  
  if (!instance.type) {
    errors.push({ field: 'type', error: 'Type reference required' })
    return errors
  }
  
  const slots = await getEffectiveSlots(instance.type)
  
  // Check each slot definition
  for (const [slotName, slotDef] of Object.entries(slots)) {
    const value = instance[slotName]
    
    // Check required
    if (slotDef.required && !value) {
      errors.push({ field: slotName, error: 'Required slot is empty' })
      continue
    }
    
    if (!value) continue
    
    // Check array constraint
    if (slotDef.array && !Array.isArray(value)) {
      errors.push({ field: slotName, error: 'Slot must be an array' })
      continue
    }
    
    if (!slotDef.array && Array.isArray(value)) {
      errors.push({ field: slotName, error: 'Slot must not be an array' })
      continue
    }
    
    // Check type constraint (if specified)
    if (slotDef.type) {
      const childIds = Array.isArray(value) ? value : [value]
      
      for (const childId of childIds) {
        if (typeof childId !== 'string') continue
        
        try {
          const child = await store.getDoc(childId)
          if (child && child.type !== slotDef.type) {
            errors.push({
              field: slotName,
              error: `Expected type ${slotDef.type}, got ${child.type}`
            })
          }
        } catch (err) {
          errors.push({ field: slotName, error: `Failed to load ${childId}` })
        }
      }
    }
  }
  
  return errors
}
