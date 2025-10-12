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

## Body Assembly

All structural panels assembled:

<SystemViewer height={480}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-panel-64x32 | 0,0,48,90,0,90 |
| spoke://docs/part-panel-64x32 | 0,0,-48,-90,0,90 |
| spoke://docs/part-top-panel | 0,16,0,0,0,0 |
| spoke://docs/part-bottom-panel | 0,-16,0,180,0,0 |
| spoke://docs/part-bottom-panel-door | 0,-16,0,0,0,0 |
| spoke://docs/part-panel-96x32 | 32,0,0,0,0,-90 |
| spoke://docs/part-panel-96x32 | -32,0,0,0,0,90 |

</SystemViewer>

## Complete System

All parts assembled (tools enabled by default):

<SystemViewer height={420} expandedHeight={620}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-panel-64x32 | 0,0,48,90,0,90 |
| spoke://docs/part-panel-64x32 | 0,0,-48,-90,0,90 |
| spoke://docs/part-top-panel | 0,16,0,0,0,0 |
| spoke://docs/part-bottom-panel | 0,-16,0,180,0,0 |
| spoke://docs/part-bottom-panel-door | 0,-16,0,0,0,0 |
| spoke://docs/part-panel-96x32 | 32,0,0,0,0,-90 |
| spoke://docs/part-panel-96x32 | -32,0,0,0,0,90 |
| spoke://docs/part-battery | 20,0,0,0,0,0 |
| spoke://docs/part-battery | -20,0,0,180,0,0 |
| spoke://docs/part-charger | 0,-14,12,0,0,0 |
| spoke://docs/part-wpc-board | 0,-14,-30,0,0,0 |
| spoke://docs/part-wpc-coil | 0,-16,0,180,0,0 |
| spoke://docs/part-controller | 0,14,0,180,0,0 |
| spoke://docs/part-mag-connector | 0,0,0,0,0,0 |

</SystemViewer>

## Single Parts

### Front Panel Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://docs/part-panel-64x32 | 0,0,0,0,0,0 |

</SystemViewer>

### Controller Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://docs/part-controller | 0,0,0,0,0,0 |

</SystemViewer>

### Battery Only

<SystemViewer height={320}>

| type | location |
|--------|----------|
| spoke://docs/part-battery | 0,0,0,0,0,0 |

</SystemViewer>

### Charger with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-charger | 0,0,0,0,0,0 |

</SystemViewer>

### WPC Board with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-wpc-board | 0,0,0,0,0,0 |

</SystemViewer>

### Controller with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-controller | 0,0,0,0,0,0 |

</SystemViewer>

### WPC Coil with Frame

<SystemViewer height={380}>

| type | location |
|--------|----------|
| spoke://docs/part-frame | 0,0,0,0,0,0 |
| spoke://docs/part-wpc-coil | 0,0,0,0,0,0 |

</SystemViewer>


## Notes

- All models use the "start" positions from the multi-model-viewers.md table
- Models are positioned relative to the SystemViewer origin (0, 0, 0)
- Each object is a store document with a `model` section containing URL and offset/rotation
- Objects can be modified in the Designer and changes will reflect in the viewer
- Type inheritance is supported - instances can reference type definitions
