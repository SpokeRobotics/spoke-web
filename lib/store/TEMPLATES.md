# Slot Templates System

## Overview

Slot templates solve the positioning problem: each robot instance needs its own batteries at the correct relative positions, not shared references to the same battery instances.

## How It Works

### 1. Type Defines Templates

```json
{
  "id": "spoke://types/core-robot",
  "slots": {
    "children": { "slots": {
      "batteries": {
        "type": "spoke://types/battery-18650",
        "array": true,
        "template": [
          { "name": "Battery Right", "location": "20,0,0,0,0,0" },
          { "name": "Battery Left", "location": "-20,0,0,180,0,0" }
        ]
      }
    }}
  }
}
```

### 2. Create Instance Using Template

```javascript
import { createInstanceFromType } from '@/lib/store/type-system'

// One function call creates the robot AND all its parts
const robot = await createInstanceFromType(
  'spoke://instances/robot-1',
  'spoke://types/core-robot',
  { name: 'Robot 1' }
)

// Result: robot-1 has its own battery instances
// spoke://instances/robot-1-batteries-0 (Battery Right at 20,0,0)
// spoke://instances/robot-1-batteries-1 (Battery Left at -20,0,0)
```

### 3. Each Robot Gets Unique Parts

```javascript
// Create a second robot
const robot2 = await createInstanceFromType(
  'spoke://instances/robot-2',
  'spoke://types/core-robot',
  { name: 'Robot 2' }
)

// robot-2 has DIFFERENT battery instances
// spoke://instances/robot-2-batteries-0 (Battery Right at 20,0,0)
// spoke://instances/robot-2-batteries-1 (Battery Left at -20,0,0)

// Both robots have batteries at the same RELATIVE position
// but they are separate instances that can be modified independently
```

## Template Rules

### Single Slot

```json
{
  "children": { "slots": {
    "frame": {
      "type": "spoke://types/frame-96x64x32",
      "template": { "name": "Frame", "location": "0,0,0,0,0,0" }
    }
  }}
}
```

Creates one instance with the template properties applied.

### Array Slot with Multiple Templates

```json
{
  "children": { "slots": {
    "batteries": {
      "type": "spoke://types/battery-18650",
      "array": true,
      "template": [
        { "name": "Battery Right", "location": "20,0,0,0,0,0" },
        { "name": "Battery Left", "location": "-20,0,0,180,0,0" }
      ]
    }
  }}
}
```

Creates one instance per template object, applying properties in order.

### Array Slot with Single Template

```json
{
  "children": { "slots": {
    "sensors": {
      "type": "spoke://types/sensor",
      "array": true,
      "template": { "sensitivity": 0.8 }
    }
  }}
}
```

When calling `instantiateSlot()`, specify count and use dotted path:
```javascript
await instantiateSlot('parent-id', 'children.sensors', slotDef, 5)
// Creates 5 instances, all with sensitivity: 0.8
```

## Instance Naming

Generated instances use this ID pattern:
```
{parentId}-{slotName}-{index}
```

Examples:
- `spoke://instances/robot-1-batteries-0`
- `spoke://instances/robot-1-batteries-1`
- `spoke://instances/robot-1-frame-0`

## Modifying Instances After Creation

Instances created from templates are normal instances - you can modify them:

```javascript
// Get a specific battery
const battery = await store.getDoc('spoke://instances/robot-1-batteries-0')

// Modify it
battery.customProperty = 'special'
battery.location = '25,0,0,0,0,0'  // Move it

await store.putDoc(battery)
```

## Parent Links

All created instances automatically have parent links:

```json
{
  "id": "spoke://instances/robot-1-batteries-0",
  "type": "spoke://types/battery-18650",
  "parent": "spoke://instances/robot-1",
  "parentSlot": "children.batteries",
  "name": "Battery Right",
  "location": "20,0,0,0,0,0"
}
```

## Advantages

✅ **DRY**: Define positions once in type template  
✅ **Automatic**: One call creates entire hierarchy  
✅ **Independent**: Each parent has its own child instances  
✅ **Modifiable**: Child instances can be changed after creation  
✅ **Trackable**: Parent links maintained automatically  
✅ **Composable**: Types can inherit and override templates  

## Use Cases

### Manufacturing Variants

```javascript
// Standard robot
await createInstanceFromType(
  'spoke://instances/robot-standard-001',
  'spoke://types/core-robot',
  { name: 'Standard Robot 001' }
)

// Create a custom variant - same template, then modify
const custom = await createInstanceFromType(
  'spoke://instances/robot-custom-001',
  'spoke://types/core-robot',
  { name: 'Custom Robot 001' }
)

// Modify one of its batteries
const battery = await store.getDoc('spoke://instances/robot-custom-001-batteries-0')
battery.name = 'High Capacity Battery'
battery.customSpec = 'XL-5000'
await store.putDoc(battery)
```

### Template Inheritance

```javascript
// Advanced robot type can override templates
{
  "id": "spoke://types/robot-advanced",
  "type": "spoke://types/core-robot",  // Inherits base slots
  "slots": {
    "batteries": {
      "type": "spoke://types/super-battery",  // Different type
      "array": true,
      "template": [
        { "name": "Super Battery Right", "location": "20,0,0,0,0,0", "capacity": 5000 },
        { "name": "Super Battery Left", "location": "-20,0,0,180,0,0", "capacity": 5000 }
      ]
    }
  }
}
```

## API Reference

### `createInstanceFromType(instanceId, typeId, overrides)`
Creates a complete instance with all slots instantiated from templates.

### `instantiateSlot(parentId, slotPath, slotDef, count)`
Creates instances for a single slot where `slotPath` is dotted (e.g., `children.cells`).

### `getEffectiveSlots(typeId)`
Gets merged slot definitions including templates from type chain. Returns `{ byPath, byKind }`.

## Migration Note

Old instances-core-parts.json approach created explicit instance documents. New approach generates them on-demand from templates. Both can coexist - the system supports manually created instances alongside template-generated ones.
