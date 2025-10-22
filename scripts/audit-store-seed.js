import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const cwd = process.cwd()
const seedDir = process.argv[2] ? path.resolve(process.argv[2]) : path.join(cwd, 'public', 'store-seed')

function toArray(x) {
  if (Array.isArray(x)) return x
  if (x == null) return []
  return [x]
}

async function readJson(p) {
  const txt = await fs.readFile(p, 'utf8')
  try {
    return JSON.parse(txt)
  } catch (e) {
    throw new Error(`Invalid JSON: ${p}: ${e.message}`)
  }
}

async function main() {
  const errors = []
  const warnings = []

  const indexPath = path.join(seedDir, 'index.json')
  let index
  try {
    index = await readJson(indexPath)
  } catch (e) {
    console.error(e.message)
    process.exit(1)
  }

  const docs = toArray(index.docs)
  const typeMap = new Map()
  const typeFiles = new Map()
  const instanceMap = new Map()
  const instanceFiles = new Map()

  for (const doc of docs) {
    const p = path.join(seedDir, doc.path)
    try {
      const data = await readJson(p)
      if (doc.array) {
        if (!Array.isArray(data)) {
          errors.push(`Expected array in ${doc.path}`)
          continue
        }
        for (const obj of data) {
          if (!obj || typeof obj !== 'object') {
            errors.push(`Invalid entry in ${doc.path}`)
            continue
          }
          const id = obj.id
          if (typeof id !== 'string') {
            errors.push(`Missing id in entry from ${doc.path}`)
            continue
          }
          if (instanceMap.has(id)) {
            errors.push(`Duplicate instance id ${id} in ${doc.path} and ${instanceFiles.get(id)}`)
          } else {
            instanceMap.set(id, obj)
            instanceFiles.set(id, doc.path)
          }
        }
      } else {
        if (!data || typeof data !== 'object') {
          errors.push(`Invalid JSON object in ${doc.path}`)
          continue
        }
        const id = data.id
        if (typeof id !== 'string') {
          errors.push(`Missing id in ${doc.path}`)
          continue
        }
        if (id.startsWith('spoke://types/')) {
          if (typeMap.has(id)) {
            errors.push(`Duplicate type id ${id} in ${doc.path} and ${typeFiles.get(id)}`)
          } else {
            typeMap.set(id, data)
            typeFiles.set(id, doc.path)
          }
        } else if (id.startsWith('spoke://instances/')) {
          if (instanceMap.has(id)) {
            errors.push(`Duplicate instance id ${id} in ${doc.path} and ${instanceFiles.get(id)}`)
          } else {
            instanceMap.set(id, data)
            instanceFiles.set(id, doc.path)
          }
        } else {
          warnings.push(`Unrecognized id scheme ${id} in ${doc.path}`)
        }
      }
    } catch (e) {
      errors.push(`Failed to read ${doc.path}: ${e.message}`)
    }
  }

  // Validate that type slot definitions reference existing types and are well-formed
  for (const [tid, tdoc] of typeMap) {
    const slotsRoot = tdoc?.slots?.children?.slots || {}
    for (const [slotName, slotDef] of Object.entries(slotsRoot)) {
      if (!slotDef || typeof slotDef !== 'object') {
        errors.push(`Type ${tid} has invalid slot definition for children.${slotName} (${typeFiles.get(tid)})`)
        continue
      }
      const st = slotDef.type
      if (typeof st !== 'string') {
        errors.push(`Type ${tid} slot children.${slotName} missing type (${typeFiles.get(tid)})`)
        continue
      }
      if (!typeMap.has(st)) {
        errors.push(`Type ${tid} slot children.${slotName} references missing type ${st} (${typeFiles.get(tid)})`)
      }
      if (slotDef.array != null && typeof slotDef.array !== 'boolean') {
        warnings.push(`Type ${tid} slot children.${slotName} has non-boolean 'array' (${typeFiles.get(tid)})`)
      }
      if (slotDef.required != null && typeof slotDef.required !== 'boolean') {
        warnings.push(`Type ${tid} slot children.${slotName} has non-boolean 'required' (${typeFiles.get(tid)})`)
      }
      if (slotDef.model) {
        const modelPath = path.join(seedDir, slotDef.model)
        try {
          await fs.access(modelPath)
        } catch (e) {
          errors.push(`Type ${tid} slot children.${slotName} references missing model file ${slotDef.model} (${typeFiles.get(tid)})`)
        }
        try {
          const modelData = await readJson(modelPath)
          if (!modelData.url) {
            errors.push(`Type ${tid} slot children.${slotName} model file ${slotDef.model} is missing 'url' field (${typeFiles.get(tid)})`)
          }
          if (modelData.offset && !Array.isArray(modelData.offset)) {
            errors.push(`Type ${tid} slot children.${slotName} model file ${slotDef.model} 'offset' field is not an array (${typeFiles.get(tid)})`)
          }
          if (modelData.rotation && !Array.isArray(modelData.rotation)) {
            errors.push(`Type ${tid} slot children.${slotName} model file ${slotDef.model} 'rotation' field is not an array (${typeFiles.get(tid)})`)
          }
        } catch (e) {
          errors.push(`Type ${tid} slot children.${slotName} model file ${slotDef.model} is invalid JSON (${typeFiles.get(tid)})`)
        }
      }
    }
  }

  for (const [iid, inst] of instanceMap) {
    const t = inst.type
    if (typeof t !== 'string') {
      errors.push(`Instance ${iid} missing type in ${instanceFiles.get(iid)}`)
      continue
    }
    if (!typeMap.has(t)) {
      errors.push(`Instance ${iid} references missing type ${t} (${instanceFiles.get(iid)})`)
    }
  }

  for (const [iid, inst] of instanceMap) {
    const parentId = inst.parent
    const parentSlot = inst.parentSlot
    if (parentId == null && parentSlot == null) continue
    if (typeof parentId !== 'string') {
      errors.push(`Instance ${iid} has invalid parent in ${instanceFiles.get(iid)}`)
      continue
    }
    const parent = instanceMap.get(parentId)
    if (!parent) {
      errors.push(`Instance ${iid} references missing parent ${parentId} (${instanceFiles.get(iid)})`)
      continue
    }
    if (typeof parentSlot !== 'string' || !parentSlot.includes('.')) {
      errors.push(`Instance ${iid} has invalid parentSlot ${parentSlot} in ${instanceFiles.get(iid)}`)
      continue
    }
    const parts = parentSlot.split('.')
    if (parts[0] !== 'children') {
      errors.push(`Instance ${iid} parentSlot must start with children. (${parentSlot}) (${instanceFiles.get(iid)})`)
      continue
    }
    const slotName = parts.slice(1).join('.')
    const children = parent.children || {}
    const v = children[slotName]
    if (Array.isArray(v)) {
      if (!v.includes(iid)) {
        errors.push(`Parent ${parentId} children.${slotName} does not include ${iid} (${instanceFiles.get(parentId)})`)
      }
      const s = new Set()
      for (const x of v) {
        if (s.has(x)) warnings.push(`Duplicate child ${x} in parent ${parentId} children.${slotName} (${instanceFiles.get(parentId)})`)
        s.add(x)
      }
    } else if (typeof v === 'string') {
      if (v !== iid) {
        errors.push(`Parent ${parentId} children.${slotName} is ${v} not ${iid} (${instanceFiles.get(parentId)})`)
      }
    } else {
      errors.push(`Parent ${parentId} missing children.${slotName} for ${iid} (${instanceFiles.get(parentId)})`)
    }

    const parentTypeId = parent.type
    if (typeof parentTypeId !== 'string' || !typeMap.has(parentTypeId)) {
      errors.push(`Parent ${parentId} has missing or invalid type ${parentTypeId} (${instanceFiles.get(parentId)})`)
      continue
    }
    const parentType = typeMap.get(parentTypeId)
    const slotsRoot = parentType?.slots?.children?.slots || {}
    const slotDef = slotsRoot[slotName]
    if (!slotDef) {
      errors.push(`Type ${parentTypeId} has no slot children.${slotName} for instance ${iid} (${typeFiles.get(parentTypeId)})`)
      continue
    }
    const expectedType = slotDef.type
    const actualType = inst.type
    if (typeof expectedType !== 'string') {
      errors.push(`Type ${parentTypeId} slot children.${slotName} missing type (${typeFiles.get(parentTypeId)})`)
      continue
    }
    if (expectedType !== actualType) {
      errors.push(`Instance ${iid} type ${actualType} does not match slot children.${slotName} type ${expectedType} in parent type ${parentTypeId} (${instanceFiles.get(iid)})`)
    }
    if (slotDef.array === true && !Array.isArray(v)) {
      errors.push(`Parent ${parentId} children.${slotName} should be an array (${instanceFiles.get(parentId)})`)
    }
    if (slotDef.array !== true && Array.isArray(v)) {
      errors.push(`Parent ${parentId} children.${slotName} should not be an array (${instanceFiles.get(parentId)})`)
    }
  }

  // Parent perspective: validate required slots and child back-references; detect multi-parent references
  const childToParent = new Map()
  for (const [pid, parent] of instanceMap) {
    const parentTypeId = parent.type
    if (typeof parentTypeId !== 'string' || !typeMap.has(parentTypeId)) continue
    const parentType = typeMap.get(parentTypeId)
    const slotsRoot = parentType?.slots?.children?.slots || {}
    const children = parent.children || {}

    // required slots
    for (const [slotName, slotDef] of Object.entries(slotsRoot)) {
      if (slotDef?.required === true) {
        const v = children[slotName]
        if (slotDef.array === true) {
          if (!Array.isArray(v) || v.length === 0) {
            errors.push(`Parent ${pid} missing required children.${slotName} array (${instanceFiles.get(pid)})`)
          }
        } else {
          if (typeof v !== 'string' || v.length === 0) {
            errors.push(`Parent ${pid} missing required children.${slotName} (${instanceFiles.get(pid)})`)
          }
        }
      }
    }

    // back-references and multi-parent
    for (const [slotName, v] of Object.entries(children)) {
      const slotDef = slotsRoot[slotName]
      if (!slotDef) {
        errors.push(`Parent ${pid} references unknown slot children.${slotName} for type ${parentTypeId} (${instanceFiles.get(pid)})`)
        continue
      }
      const ensureChild = (cid) => {
        const child = instanceMap.get(cid)
        if (!child) {
          errors.push(`Parent ${pid} children.${slotName} references missing child ${cid} (${instanceFiles.get(pid)})`)
          return
        }
        if (child.parent !== pid) {
          errors.push(`Child ${cid} has parent ${child.parent} not ${pid} (${instanceFiles.get(cid)})`)
        }
        if (child.parentSlot !== `children.${slotName}`) {
          errors.push(`Child ${cid} parentSlot is ${child.parentSlot} not children.${slotName} (${instanceFiles.get(cid)})`)
        }
        if (child.type !== slotDef.type) {
          errors.push(`Child ${cid} type ${child.type} does not match slot children.${slotName} type ${slotDef.type} (${instanceFiles.get(cid)})`)
        }
        if (childToParent.has(cid) && childToParent.get(cid) !== pid) {
          errors.push(`Child ${cid} is referenced by multiple parents: ${childToParent.get(cid)} and ${pid}`)
        } else {
          childToParent.set(cid, pid)
        }
      }
      if (Array.isArray(v)) {
        if (slotDef.array !== true) {
          errors.push(`Parent ${pid} children.${slotName} should not be an array (${instanceFiles.get(pid)})`)
        }
        v.forEach(ensureChild)
      } else if (typeof v === 'string') {
        if (slotDef.array === true) {
          errors.push(`Parent ${pid} children.${slotName} should be an array (${instanceFiles.get(pid)})`)
        }
        ensureChild(v)
      } else {
        errors.push(`Parent ${pid} children.${slotName} invalid value (${instanceFiles.get(pid)})`)
      }
    }
  }

  const summary = []
  summary.push(`Types: ${typeMap.size}`)
  summary.push(`Instances: ${instanceMap.size}`)
  if (warnings.length) console.warn(`Warnings: ${warnings.length}`)
  for (const w of warnings) console.warn(`- ${w}`)
  if (errors.length) {
    console.error(`Errors: ${errors.length}`)
    for (const e of errors) console.error(`- ${e}`)
    console.log(summary.join(' | '))
    process.exit(1)
  } else {
    console.log('Store seed audit passed')
    console.log(summary.join(' | '))
    process.exit(0)
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
