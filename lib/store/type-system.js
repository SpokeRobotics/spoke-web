/**
 * Type System Utilities
 * 
 * Handles type inheritance, slot resolution, and instance validation
 * for the Spoke object model.
 */

import { store } from './adapter.js'
import { getNested, setNested, listSlotPathsFromType } from './slot-path.js'

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
    return { byPath: {}, byKind: {} }
  }

  const chain = await getTypeChain(typeId)

  // Merge by kind, then by slot within kind (child overrides parent)
  const byKind = {}
  for (const typeDoc of chain) {
    const kinds = typeDoc?.slots && typeof typeDoc.slots === 'object' ? typeDoc.slots : {}
    for (const [kind, group] of Object.entries(kinds)) {
      const inner = group && typeof group === 'object' ? group.slots : null
      if (!inner || typeof inner !== 'object') continue
      if (!byKind[kind]) byKind[kind] = { slots: {} }
      Object.assign(byKind[kind].slots, inner)
    }
  }

  // Build byPath index (e.g., children.frame)
  const byPath = {}
  for (const [kind, group] of Object.entries(byKind)) {
    for (const [slotName, slotDef] of Object.entries(group.slots || {})) {
      byPath[`${kind}.${slotName}`] = slotDef
    }
  }

  return { byPath, byKind }
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
  
  // Get effective slots (byPath) to know which fields are child references
  const { byPath: effectiveSlots } = await getEffectiveSlots(instance.type)
  
  // Update parent links for all children in slots
  for (const [slotPath, slotDef] of Object.entries(effectiveSlots)) {
    const value = getNested(instance, slotPath)
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
          if (child.parent !== instance.id || child.parentSlot !== slotPath) {
            child.parent = instance.id
            child.parentSlot = slotPath
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
        const slotValue = getNested(parent, instance.parentSlot)
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
 * Get child references for an instance as a map of dotted slotPath -> ids
 * @param {Object} instance - Instance document
 * @returns {Promise<Object>} e.g., { 'children.cells': ['spoke://instances/a', ...], 'children.frame': 'spoke://instances/x' }
 */
export async function getChildRefs(instance) {
  if (!instance || !instance.type) return {}
  const { byPath: slots } = await getEffectiveSlots(instance.type)
  const out = {}
  for (const slotPath of Object.keys(slots)) {
    const value = getNested(instance, slotPath)
    if (value == null) continue
    out[slotPath] = value
  }
  return out
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
      
      const { byPath: slots } = await getEffectiveSlots(doc.type)
      
      for (const [slotPath, slotDef] of Object.entries(slots)) {
        const value = getNested(doc, slotPath)
        if (!value) continue
        
        const childIds = Array.isArray(value) ? value : [value]
        
        for (const childId of childIds) {
          if (typeof childId === 'string' && childId.startsWith('spoke://instances/')) {
            parentIndex.set(childId, { parent: doc.id, slot: slotPath })
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
export async function instantiateSlot(parentId, slotPath, slotDef, count = null) {
  if (!slotDef.type) {
    throw new Error('Slot definition must have a type')
  }
  
  const created = [] // array of { id, doc }
  
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
  
  // Create each instance (in-memory only)
  for (let i = 0; i < templates.length; i++) {
    const template = templates[i]
    const slotName = String(slotPath).split('.').pop()
    const instanceId = `${parentId}-${slotName}-${i}`
    
    const instance = {
      id: instanceId,
      type: slotDef.type,
      parent: parentId,
      parentSlot: slotPath,
      ...template, // Apply template properties
      meta: {
        origin: 'user',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1
      }
    }
    
    created.push({ id: instanceId, doc: instance })
  }
  
  return created
}

/**
 * Create a complete instance from a type, instantiating all slots with templates
 * @param {string} instanceId - ID for the new instance
 * @param {string} typeId - Type to instantiate from
 * @param {Object} overrides - Property overrides for the instance
 * @returns {Promise<Object>} Created instance document
 */
export async function createInstanceFromType(instanceId, typeId, overrides = {}, options = {}) {
  const { byPath: slots } = await getEffectiveSlots(typeId)
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

  const createdChildren = [] // array of { id, doc }
  
  // Instantiate each slot with a template (in-memory only)
  for (const [slotPath, slotDef] of Object.entries(slots)) {
    if (slotDef.template) {
      const created = await instantiateSlot(instanceId, slotPath, slotDef)
      const childIds = created.map(c => c.id)
      createdChildren.push(...created)
      
      if (slotDef.array) {
        // write into nested structure, e.g., children.cells
        setNested(instance, slotPath, childIds)
      } else {
        setNested(instance, slotPath, childIds[0] || null)
      }
    }
  }
  
  // Mark as transient if requested
  if (options && options.transient) {
    try {
      if (!instance.meta) instance.meta = {}
      instance.meta.transient = true
      for (const c of createdChildren) {
        if (!c.doc.meta) c.doc.meta = {}
        c.doc.meta.transient = true
      }
    } catch {}
  }

  // Do NOT persist here. Return the constructed documents so the caller decides persistence.
  return { instance, children: createdChildren }
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
  
  const { byPath: slots } = await getEffectiveSlots(instance.type)
  
  // Check each slot definition
  for (const [slotPath, slotDef] of Object.entries(slots)) {
    const value = getNested(instance, slotPath)
    
    // Check required
    if (slotDef.required && !value) {
      errors.push({ field: slotPath, error: 'Required slot is empty' })
      continue
    }
    
    if (!value) continue
    
    // Check array constraint
    if (slotDef.array && !Array.isArray(value)) {
      errors.push({ field: slotPath, error: 'Slot must be an array' })
      continue
    }
    
    if (!slotDef.array && Array.isArray(value)) {
      errors.push({ field: slotPath, error: 'Slot must not be an array' })
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
              field: slotPath,
              error: `Expected type ${slotDef.type}, got ${child.type}`
            })
          }
        } catch (err) {
          errors.push({ field: slotPath, error: `Failed to load ${childId}` })
        }
      }
    }
  }
  
  return errors
}
