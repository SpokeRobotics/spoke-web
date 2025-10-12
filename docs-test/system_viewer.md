---
title: SystemViewer Examples
description: Examples of using SystemViewer to display robot parts from the store
---

<Flex justify="between" align="center" mb="4">
<Box>

# SystemViewer Test Data

</Box>
<ResetStoreButton size="1" />
</Flex>

This file contains test examples for the SystemViewer component, which displays 3D models from store objects.

**Note:** SystemViewer supports three input modes:
- **Instance IDs** - Render actual assembly instances (`spoke://instances/*`)
- **Type IDs** - Auto-instantiate and preview types (`spoke://types/*`)
- **Type+Location** - Manual composition with custom positions

## Real Instance

The actual core assembly with all parts positioned via slot templates:

<SystemViewer height={480}>

| type | location |
|--------|----------|
| spoke://instances/core-assembly | 0,0,0,0,0,0 |

</SystemViewer>

## Type Preview

Auto-instantiate the core robot type to preview it:

<SystemViewer height={480}>

| type | location |
|--------|----------|
| spoke://types/core-robot | 0,0,0,0,0,0 |

</SystemViewer>

## Body Assembly (Manual Composition)

All structural panels assembled using types with manual positions:

<SystemViewer height={480}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/panel-64x32 | 0,0,48,90,0,90 |
| spoke://types/panel-64x32 | 0,0,-48,-90,0,90 |
| spoke://types/top-panel-96x64 | 0,16,0,0,0,0 |
| spoke://types/bottom-panel-96x64 | 0,-16,0,180,0,0 |
| spoke://types/bottom-panel-door | 0,-16,0,0,0,0 |
| spoke://types/panel-96x32 | 32,0,0,0,0,-90 |
| spoke://types/panel-96x32 | -32,0,0,0,0,90 |

</SystemViewer>

## Complete System (Manual Composition)

All parts assembled using types with manual positions (tools enabled by default):

<SystemViewer height={420} expandedHeight={620}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/panel-64x32 | 0,0,48,90,0,90 |
| spoke://types/panel-64x32 | 0,0,-48,-90,0,90 |
| spoke://types/top-panel-96x64 | 0,16,0,0,0,0 |
| spoke://types/bottom-panel-96x64 | 0,-16,0,180,0,0 |
| spoke://types/bottom-panel-door | 0,-16,0,0,0,0 |
| spoke://types/panel-96x32 | 32,0,0,0,0,-90 |
| spoke://types/panel-96x32 | -32,0,0,0,0,90 |
| spoke://types/cell-18650 | 20,0,0,0,0,0 |
| spoke://types/cell-18650 | -20,0,0,180,0,0 |
| spoke://types/spoke-charger | 0,-14,12,0,0,0 |
| spoke://types/wpc-board | 0,-14,-30,0,0,0 |
| spoke://types/wpc-coil | 0,-16,0,180,0,0 |
| spoke://types/esp32-controller | 0,14,0,180,0,0 |
| spoke://types/mag-connector-8mm | -21,-17,-33,180,0,0 |

</SystemViewer>

## Single Parts

### Front Panel Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://types/panel-64x32 | 0,0,0,0,0,0 |

</SystemViewer>

### Controller Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://types/esp32-controller | 0,0,0,0,0,0 |

</SystemViewer>

### Cell Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://types/cell-18650 | 0,0,0,0,0,0 |

</SystemViewer>

### Charger with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/spoke-charger | 0,0,0,0,0,0 |

</SystemViewer>

### WPC Board with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/wpc-board | 0,0,0,0,0,0 |

</SystemViewer>

### Controller with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/esp32-controller | 0,0,0,0,0,0 |

</SystemViewer>

### WPC Coil with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/wpc-coil | 0,0,0,0,0,0 |

</SystemViewer>

### Mag Connector with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://types/frame-96x64x32 | 0,0,0,0,0,0 |
| spoke://types/mag-connector-8mm | 0,0,0,0,0,0 |

</SystemViewer>

## Notes

- **Type vs Instance**: Use `spoke://types/*` for type previews or `spoke://instances/*` for real assemblies
- **Auto-instantiation**: Types are automatically instantiated with templates when referenced
- **Manual Composition**: Specify type+location for custom scenes (great for documentation)
- **Slot Templates**: Instance assemblies use slot templates for automatic positioning
- **Type Inheritance**: Types can inherit from other types, slots merge through the chain
- Objects can be modified in the Designer and changes will reflect in the viewer
- The model resolver walks the type chain to find the `model` definition
