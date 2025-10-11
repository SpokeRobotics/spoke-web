---
title: SystemViewer Examples
description: Examples of using SystemViewer to display robot parts from the store
---

# SystemViewer Test Data

This file contains test examples for the SystemViewer component, which displays 3D models from store objects.

## Basic Frame

<SystemViewer height={380}>

| object |
|--------|
| spoke://docs/part-frame |

</SystemViewer>

## Frame with Batteries

<SystemViewer height={420}>

| object |
|--------|
| spoke://docs/part-frame |
| spoke://docs/part-left-battery |
| spoke://docs/part-right-battery |

</SystemViewer>

## Body Assembly

All structural panels assembled:

<SystemViewer height={480}>

| object |
|--------|
| spoke://docs/part-frame |
| spoke://docs/part-front-panel |
| spoke://docs/part-rear-panel |
| spoke://docs/part-top-panel |
| spoke://docs/part-bottom-panel |
| spoke://docs/part-left-panel |
| spoke://docs/part-right-panel |

</SystemViewer>

## Power System

Frame, batteries, and power electronics:

<SystemViewer height={480}>

| object |
|--------|
| spoke://docs/part-frame |
| spoke://docs/part-left-battery |
| spoke://docs/part-right-battery |
| spoke://docs/part-charger |
| spoke://docs/part-mag-connector |

</SystemViewer>

## Wireless Power

Complete wireless power system:

<SystemViewer height={480}>

| object |
|--------|
| spoke://docs/part-frame |
| spoke://docs/part-left-battery |
| spoke://docs/part-right-battery |
| spoke://docs/part-charger |
| spoke://docs/part-wpc-board |
| spoke://docs/part-wpc-coil |
| spoke://docs/part-mag-connector |

</SystemViewer>

## Complete System

All parts assembled:

<SystemViewer height={520} toolsEnabled={true}>

| object |
|--------|
| spoke://docs/part-frame |
| spoke://docs/part-front-panel |
| spoke://docs/part-rear-panel |
| spoke://docs/part-top-panel |
| spoke://docs/part-bottom-panel-door |
| spoke://docs/part-left-panel |
| spoke://docs/part-right-panel |
| spoke://docs/part-left-battery |
| spoke://docs/part-right-battery |
| spoke://docs/part-charger |
| spoke://docs/part-wpc-board |
| spoke://docs/part-wpc-coil |
| spoke://docs/part-controller |
| spoke://docs/part-mag-connector |

</SystemViewer>

## Single Parts

### Front Panel Only

<SystemViewer height={320}>

| object |
|--------|
| spoke://docs/part-front-panel |

</SystemViewer>

### Controller Only

<SystemViewer height={320}>

| object |
|--------|
| spoke://docs/part-controller |

</SystemViewer>

### Battery Only

<SystemViewer height={320}>

| object |
|--------|
| spoke://docs/part-left-battery |

</SystemViewer>

## Notes

- All models use the "start" positions from the multi-model-viewers.md table
- Models are positioned relative to the SystemViewer origin (0, 0, 0)
- Each object is a store document with a `model` section containing URL and offset/rotation
- Objects can be modified in the Designer and changes will reflect in the viewer
- Type inheritance is supported - instances can reference type definitions
