"use client"

/**
 * SystemViewer - Display and manipulate robot parts from store
 * Similar to ModelViewer but sources objects from the store
 */

import React, { useRef, useMemo, useEffect } from 'react'
import { Box, Text } from '@radix-ui/themes'
import * as THREE from 'three'
import { ThreeCadViewer } from '@/components/cad/ThreeCadViewer'
import { useStoreModels } from '@/components/designer/useStoreModels'

const toArray = React.Children.toArray

/**
 * Extract object IDs from markdown table
 * Table format:
 * | object |
 * |--------|
 * | spoke://docs/part-frame |
 */
function parseObjectTable(children) {
  const elements = toArray(children)
  const tableElement = elements.find(
    (node) => React.isValidElement(node) && 
    typeof node.type === 'string' && 
    node.type.toLowerCase() === 'table'
  )
  
  if (!tableElement) return { objectIds: [], leftover: children }
  
  const objectIds = []
  
  // Extract table data
  toArray(tableElement.props?.children).forEach((child) => {
    if (!React.isValidElement(child)) return
    const tag = typeof child.type === 'string' ? child.type.toLowerCase() : ''
    
    if (tag === 'tbody') {
      toArray(child.props?.children).forEach((rowEl) => {
        if (!React.isValidElement(rowEl)) return
        const rowTag = typeof rowEl.type === 'string' ? rowEl.type.toLowerCase() : ''
        if (rowTag !== 'tr') return
        
        const cells = toArray(rowEl.props?.children)
        if (cells.length > 0) {
          const firstCell = cells[0]
          const text = extractCellText(firstCell?.props?.children)
          if (text && text.startsWith('spoke://')) {
            objectIds.push(text.trim())
          }
        }
      })
    }
  })
  
  const leftover = elements.filter((node) => node !== tableElement)
  
  return { objectIds, leftover }
}

function extractCellText(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number') return String(value).trim()
  if (Array.isArray(value)) {
    return value.map((v) => extractCellText(v)).filter(Boolean).join(' ').trim()
  }
  if (React.isValidElement(value)) {
    return extractCellText(value.props?.children)
  }
  return ''
}

/**
 * SystemViewer component
 * Displays 3D models from store documents
 */
export function SystemViewer({
  // Object specification
  objects = null, // Array of store IDs or null to use children table
  // Size
  height = 420,
  expandedHeight = 620,
  // Tools
  toolsEnabled = true,
  // Visual
  backgroundMode = 'GRID',
  shadingMode = 'SOURCE',
  styleMode = 'STUDIO',
  // Behavior
  autoFitOnLoad = true,
  // Children (for markdown table)
  children,
}) {
  const viewerRef = useRef(null)
  
  // Parse objects from props or children table
  const { objectIds: parsedIds, leftover: leftoverChildren } = useMemo(
    () => {
      if (objects && Array.isArray(objects)) {
        return { objectIds: objects, leftover: children }
      }
      return parseObjectTable(children)
    },
    [objects, children]
  )
  
  const objectIds = objects && Array.isArray(objects) ? objects : parsedIds
  
  // Load models from store
  const { models, loading, error } = useStoreModels(objectIds, {
    basePrefix: '/models',
    autoLoad: true,
  })
  
  // Set models in viewer when they load
  useEffect(() => {
    if (!viewerRef.current || models.length === 0) return
    
    // Build multi-scene definition for ThreeCadViewer
    const sceneDefinition = {
      models: models.map(m => {
        // Convert position array to Vector3
        const pos = new THREE.Vector3(
          m.position?.[0] ?? 0,
          m.position?.[1] ?? 0,
          m.position?.[2] ?? 0
        )
        
        // Convert rotation (degrees) to quaternion
        // NOTE: Rotation order is ZYX to match ModelViewer multi-scene format
        const rot = new THREE.Euler(
          THREE.MathUtils.degToRad(m.rotation?.[0] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[1] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[2] ?? 0),
          'ZYX'
        )
        const quat = new THREE.Quaternion().setFromEuler(rot)
        
        return {
          name: m.doc.title || m.$id,
          object: m.object,
          states: {
            default: {
              position: pos,
              quaternion: quat,
              visible: true,
            }
          }
        }
      }),
      stateOrder: ['default'],
      stateDisplayMap: { default: 'Default' },
      transitionMap: { default: [] },
      initialState: 'default',
    }
    
    viewerRef.current.setMultiScene?.(sceneDefinition)
  }, [models, autoFitOnLoad])
  
  const renderedChildren = useMemo(
    () => leftoverChildren,
    [leftoverChildren]
  )
  
  return (
    <Box p="0" style={{ position: 'relative' }}>
      {/* 3D Viewer Container */}
      <div style={{ position: 'relative', width: '100%', height: height }}>
        <ThreeCadViewer
          ref={viewerRef}
          spinMode="auto"
          backgroundMode={backgroundMode}
          shadingMode={shadingMode}
          styleMode={styleMode}
          useSourceMaterials={true}
          ambientLevel={1.5}
          directionalLevel={1.5}
          originVisible={false}
          axesHelperVisible={false}
        />
        
        {/* Status messages */}
        {loading && (
          <Box style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <Text size="1">Loading models...</Text>
          </Box>
        )}
        
        {error && (
          <Box style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: 'rgba(200,0,0,0.8)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <Text size="1">Error: {error}</Text>
          </Box>
        )}
        
        {!loading && !error && models.length === 0 && objectIds.length > 0 && (
          <Box style={{ position: 'absolute', top: 8, left: 8, padding: 8, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <Text size="1">No models found</Text>
          </Box>
        )}
      </div>
      
      {/* Render any leftover content below viewer */}
      {renderedChildren && renderedChildren.length > 0 && (
        <Box mt="3">
          {renderedChildren}
        </Box>
      )}
    </Box>
  )
}

export default SystemViewer
