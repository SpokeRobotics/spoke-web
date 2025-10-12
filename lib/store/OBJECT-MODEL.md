# Spoke Object Model

## Overview

The Spoke object model is a simple, flexible system for defining reusable component types and creating instances with specific configurations. It supports type inheritance, slot-based composition, and automatic parent-child relationship management.

## Core Concepts

### 1. Types (Templates)

Types define reusable structures that can be instantiated. They live in the `spoke://types/*` namespace.

**Example: Leaf Type (No Children)**
```json
{
  "id": "spoke://types/battery-18650",
  "name": "18650 Battery",
  "slots": {},
  "model": {
    "url": "/models/18650Li-IonCell_1.3mf",
    "offset": [0, 0, -33],
    "rotation": [90, 0, 0]
  }
}
```

**Example: Composite Type (Has Slots)**
```json
{
  "id": "spoke://types/robot-base",
  "name": "Basic Robot",
  "slots": {
    "frame": {
      "type": "spoke://types/frame",
      "required": true
    },
    "batteries": {
      "type": "spoke://types/battery-18650",
      "array": true
    },
    "controller": {
      "type": "spoke://types/controller"
    }
  }
}
```

### 2. Instances (Actual Objects)

Instances are concrete objects created from types. They live in the `spoke://instances/*` namespace.

**Example: Leaf Instance**
```json
{
  "id": "spoke://instances/battery-left",
  "type": "spoke://types/battery-18650",
  "name": "Battery Left",
  "parent": "spoke://instances/my-robot",
  "parentSlot": "batteries",
  "location": "-20,0,0,180,0,0"
}
```

**Example: Composite Instance**
```json
{
  "id": "spoke://instances/my-robot",
  "type": "spoke://types/robot-base",
  "name": "My Custom Robot",
  "parent": null,
  "frame": "spoke://instances/main-frame",
  "batteries": [
    "spoke://instances/battery-left",
    "spoke://instances/battery-right"
  ],
  "controller": "spoke://instances/esp32-1"
}
```

### 3. Slots

Slots are named properties defined by types that hold references to child instances. Slots define:
- **type**: What type of instance can fill this slot
- **array**: Whether the slot holds multiple instances (optional)
- **required**: Whether the slot must be filled (optional)
- **template**: Default properties for instances in this slot (optional)

### 4. Templates

Templates provide default values for instances created in a slot. They solve the positioning problem - each robot instance gets its own batteries at the correct relative positions.

**Single Slot Template:**
```json
{
  "frame": {
    "type": "spoke://types/frame-96x64x32",
    "template": { "name": "Frame", "location": "0,0,0,0,0,0" }
  }
}
```

**Array Slot Template:**
```json
{
  "batteries": {
    "type": "spoke://types/battery-18650",
    "array": true,
    "template": [
      { "name": "Battery Right", "location": "20,0,0,0,0,0" },
      { "name": "Battery Left", "location": "-20,0,0,180,0,0" }
    ]
  }
}
```

Templates are applied **at instance creation time**. Each robot gets its own battery instances with the template values.

### 5. Type Inheritance

Types can inherit from other types. Child types inherit parent slots and can:
- Add new slots
- Override/refine existing slots

**Example: Type Inheritance**
```json
// Base type
{
  "id": "spoke://types/robot-base",
  "slots": {
    "frame": { "type": "spoke://types/frame" },
    "battery": { "type": "spoke://types/battery" }
  }
}

// Derived type (adds sensors, refines battery)
{
  "id": "spoke://types/robot-advanced",
  "type": "spoke://types/robot-base",
  "slots": {
    "sensors": { "type": "spoke://types/sensor", "array": true },
    "battery": { "type": "spoke://types/super-battery", "required": true }
  }
}

// Effective slots = { frame, battery (refined), sensors }
```

### 6. Parent Links

Each instance maintains explicit parent references:
- **parent**: ID of the parent instance
- **parentSlot**: Name of the slot in the parent that holds this instance

These are automatically maintained by the `putInstance()` function.

## Document Structure

### Type Document
```json
{
  "id": "spoke://types/{type-name}",
  "type": "spoke://types/{parent-type}",  // optional, for inheritance
  "name": "Human Readable Name",
  "slots": {
    "slotName": {
      "type": "spoke://types/{allowed-type}",
      "array": true,      // optional
      "required": true    // optional
    }
  },
  "model": {              // optional, for 3D rendering
    "url": "/models/file.3mf",
    "offset": [x, y, z],
    "rotation": [rx, ry, rz]
  }
}
```

### Instance Document
```json
{
  "id": "spoke://instances/{instance-name}",
  "type": "spoke://types/{type-name}",
  "name": "Human Readable Name",
  "parent": "spoke://instances/{parent-id}",  // null for root
  "parentSlot": "slotName",                   // null if no parent
  "location": "dx,dy,dz,rx,ry,rz",           // optional, for placement
  "slotName": "spoke://instances/{child-id}", // slot values
  "customField": "any value"                  // duck-typed extras allowed
}
```

## API Usage

### Import
```javascript
import {
  getTypeChain,
  getEffectiveSlots,
  putInstance,
  validateParentLinks,
  repairParentLinks,
  validateInstance,
  getInstancesOfType,
  createInstanceFromType,
  instantiateSlot
} from '@/lib/store/type-system'
```

### Get Effective Slots
```javascript
// Get all slots for a type (including inherited)
const slots = await getEffectiveSlots('spoke://types/robot-advanced')

// Returns: { frame: {...}, battery: {...}, sensors: {...} }
```

### Create Instance
```javascript
const instance = {
  id: 'spoke://instances/my-robot',
  type: 'spoke://types/robot-base',
  name: 'My Robot',
  parent: null,
  frame: 'spoke://instances/frame-1',
  batteries: [
    'spoke://instances/battery-1',
    'spoke://instances/battery-2'
  ]
}

// Automatically updates parent links on all children
await putInstance(instance)
```

### Validate Parent Links
```javascript
// Check all instances for consistency
const errors = await validateParentLinks()

if (errors.length > 0) {
  console.log('Found issues:', errors)
  // [{ instance: 'spoke://instances/...', error: 'missing_parent', message: '...' }]
}
```

### Repair Parent Links
```javascript
// Fix broken parent links
const stats = await repairParentLinks()
console.log(`Fixed: ${stats.fixed}, Orphaned: ${stats.orphaned}`)
```

### Validate Instance
```javascript
const instance = await store.getDoc('spoke://instances/my-robot')
const errors = await validateInstance(instance)

if (errors.length > 0) {
  console.log('Validation errors:', errors)
  // [{ field: 'batteries', error: 'Required slot is empty' }]
}
```

### Get Instances of Type
```javascript
// Find all robots
const robots = await getInstancesOfType('spoke://types/robot-base')
console.log(`Found ${robots.length} robots`)
```

### Create Instance from Type with Templates
```javascript
// Automatically creates all child instances using templates
const robot = await createInstanceFromType(
  'spoke://instances/my-new-robot',
  'spoke://types/core-robot',
  { name: 'My Custom Robot' }
)

// robot now has:
// - batteries: ['spoke://instances/my-new-robot-batteries-0', 'spoke://instances/my-new-robot-batteries-1']
// - Each battery instance has the template's name and location
```

### Instantiate a Single Slot
```javascript
// Create instances for a specific slot
const slots = await getEffectiveSlots('spoke://types/core-robot')
const batteryIds = await instantiateSlot(
  'spoke://instances/my-robot',
  'batteries',
  slots.batteries
)
// Returns: ['spoke://instances/my-robot-batteries-0', 'spoke://instances/my-robot-batteries-1']
```

## Complete Example

```javascript
import { store } from '@/lib/store/adapter'
import { putInstance, getEffectiveSlots, validateInstance } from '@/lib/store/type-system'

// 1. Create type definitions
await store.putDoc({
  id: 'spoke://types/battery',
  name: 'Battery',
  slots: {},
  model: { url: '/models/battery.3mf', offset: [0,0,0], rotation: [0,0,0] }
})

await store.putDoc({
  id: 'spoke://types/robot',
  name: 'Robot',
  slots: {
    batteries: { type: 'spoke://types/battery', array: true, required: true }
  }
})

// 2. Create instances
const battery1 = {
  id: 'spoke://instances/bat-1',
  type: 'spoke://types/battery',
  name: 'Battery 1',
  location: '10,0,0,0,0,0'
}
await store.putDoc(battery1)

const battery2 = {
  id: 'spoke://instances/bat-2',
  type: 'spoke://types/battery',
  name: 'Battery 2',
  location: '-10,0,0,0,0,0'
}
await store.putDoc(battery2)

// 3. Create composite instance (automatically maintains parent links)
await putInstance({
  id: 'spoke://instances/my-robot',
  type: 'spoke://types/robot',
  name: 'My Robot',
  parent: null,
  batteries: ['spoke://instances/bat-1', 'spoke://instances/bat-2']
})

// 4. Validate
const errors = await validateInstance(
  await store.getDoc('spoke://instances/my-robot')
)
console.log('Valid:', errors.length === 0)

// 5. Check parent links
const bat1 = await store.getDoc('spoke://instances/bat-1')
console.log(bat1.parent)      // 'spoke://instances/my-robot'
console.log(bat1.parentSlot)  // 'batteries'
```

## Design Principles

1. **Simplicity**: Only 3 core concepts (type, instance, slot)
2. **No "kind" field**: System determines behavior from structure
3. **AI-Friendly**: Clear, consistent patterns that LLMs can understand
4. **Type Inheritance**: Slots merge through type chain
5. **Duck Typing**: Instances can have extra fields beyond slots
6. **Explicit Parent Links**: Fast navigation, maintained by code
7. **Validation**: Loader checks consistency
8. **Flexibility**: Any object can have slots (no special "assembly" type)

## Migration Notes

### Old Model
```json
{
  "$id": "spoke://docs/part-battery",
  "$type": "spoke/part/battery",
  "title": "Battery"
}
```

### New Model
```json
{
  "id": "spoke://types/battery",
  "name": "Battery",
  "slots": {}
}
```

Key changes:
- `$id` → `id`
- `$type` → `type` (when referencing another doc) or remove for leaf types
- `title` → `name`
- Add `slots` to types
- Add `parent`/`parentSlot` to instances
- Docs are either types or instances (determined by ID namespace)
