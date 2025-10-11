"use client"

/**
 * SystemViewer - Display and manipulate robot parts from store
 * Similar to ModelViewer but sources objects from the store
 */

import React, { useRef, useMemo, useEffect, useState, useCallback } from 'react'
import { Box, Text, Button, Flex } from '@radix-ui/themes'
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
  const [explodeMode, setExplodeMode] = useState('normal') // 'normal' or 'exploded'
  const [visibleTypes, setVisibleTypes] = useState(new Set()) // Set of visible type names
  const sceneInitializedRef = useRef(false) // Track if scene has been set up
  const filterStateToggle = useRef('a') // Toggle between 'a' and 'b' for filter transitions
  
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
  
  // Extract unique types from models
  const availableTypes = useMemo(() => {
    const types = new Set()
    models.forEach(m => {
      if (m.doc.$type) {
        // Extract final part from "spoke/part/electronics" -> "electronics"
        const parts = m.doc.$type.split('/')
        const typeName = parts[parts.length - 1]
        if (typeName) types.add(typeName)
      }
    })
    return Array.from(types).sort()
  }, [models])
  
  // Initialize visible types when models load
  useEffect(() => {
    if (availableTypes.length > 0 && visibleTypes.size === 0) {
      setVisibleTypes(new Set(availableTypes))
    }
  }, [availableTypes])
  
  // Toggle type visibility
  const toggleType = useCallback((typeName) => {
    setVisibleTypes(prev => {
      const next = new Set(prev)
      if (next.has(typeName)) {
        next.delete(typeName)
      } else {
        next.add(typeName)
      }
      return next
    })
  }, [])
  
  // Initialize scene when models first load
  useEffect(() => {
    if (!viewerRef.current || models.length === 0 || sceneInitializedRef.current) return
    
    const EXPLODE_SCALE = 2.5 // How much to scale positions in exploded mode
    
    // Build multi-scene definition for ThreeCadViewer
    const sceneDefinition = {
      models: models.map(m => {
        // Convert position array to Vector3
        const pos = new THREE.Vector3(
          m.position?.[0] ?? 0,
          m.position?.[1] ?? 0,
          m.position?.[2] ?? 0
        )
        
        // Exploded position: scale from origin
        const explodedPos = pos.clone().multiplyScalar(EXPLODE_SCALE)
        
        // Convert rotation (degrees) to quaternion
        // NOTE: Rotation order is ZYX to match ModelViewer multi-scene format
        const rot = new THREE.Euler(
          THREE.MathUtils.degToRad(m.rotation?.[0] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[1] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[2] ?? 0),
          'ZYX'
        )
        const quat = new THREE.Quaternion().setFromEuler(rot)
        
        // Extract type for visibility filtering - store in userData
        const parts = (m.doc.$type || '').split('/')
        const typeName = parts[parts.length - 1] || ''
        m.object.userData.typeName = typeName
        
        return {
          name: m.doc.title || m.$id,
          object: m.object,
          states: {
            normal_a: {
              position: pos,
              quaternion: quat,
              visible: true,
              opacity: 1,
            },
            normal_b: {
              position: pos,
              quaternion: quat,
              visible: true,
              opacity: 1,
            },
            exploded_a: {
              position: explodedPos,
              quaternion: quat,
              visible: true,
              opacity: 1,
            },
            exploded_b: {
              position: explodedPos,
              quaternion: quat,
              visible: true,
              opacity: 1,
            }
          }
        }
      }),
      stateOrder: ['normal_a', 'normal_b', 'exploded_a', 'exploded_b'],
      stateDisplayMap: { 
        normal_a: 'Normal', 
        normal_b: 'Normal',
        exploded_a: 'Exploded',
        exploded_b: 'Exploded'
      },
      transitionMap: {
        normal_a: ['normal_b', 'exploded_a', 'exploded_b'],
        normal_b: ['normal_a', 'exploded_a', 'exploded_b'],
        exploded_a: ['exploded_b', 'normal_a', 'normal_b'],
        exploded_b: ['exploded_a', 'normal_a', 'normal_b']
      },
      initialState: 'normal_a',
    }
    
    viewerRef.current.setMultiScene?.(sceneDefinition)
    sceneInitializedRef.current = true
  }, [models, autoFitOnLoad])
  
  // Update visibility when filters change - use ThreeCadViewer's animation system
  useEffect(() => {
    if (!sceneInitializedRef.current || !viewerRef.current) return
    
    const viewer = viewerRef.current
    const info = viewer.getMultiSceneInfo?.()
    if (!info || !info.models) return
    
    // Determine current state and toggle to opposite filter state
    const currentState = info.currentState || 'normal_a'
    const currentMode = currentState.startsWith('exploded') ? 'exploded' : 'normal'
    const currentToggle = currentState.endsWith('_a') ? 'a' : 'b'
    const nextToggle = currentToggle === 'a' ? 'b' : 'a'
    const targetState = `${currentMode}_${nextToggle}`
    
    // Build state updates for the TARGET state only
    const stateUpdates = {}
    info.models.forEach((container, index) => {
      const modelRoot = container.userData?.__modelRoot
      const typeName = modelRoot?.userData?.typeName || ''
      const shouldBeVisible = visibleTypes.has(typeName)
      
      stateUpdates[index] = {
        visible: shouldBeVisible,
        opacity: shouldBeVisible ? 1 : 0
      }
    })
    
    // First, update the target state's visibility (only update target state, not current)
    viewer.updateStateVisibility?.(stateUpdates, [targetState])
    
    // Then transition to the target state (this animates from current to target)
    viewer.transitionMultiState?.(targetState, 400)
    
    // Update our toggle tracker
    filterStateToggle.current = nextToggle
    
  }, [visibleTypes])
  
  const renderedChildren = useMemo(
    () => leftoverChildren,
    [leftoverChildren]
  )
  
  // Handle explode mode change with smooth animation (no camera movement)
  const handleExplodeModeChange = useCallback((mode) => {
    if (!viewerRef.current || explodeMode === mode) return
    
    setExplodeMode(mode)
    
    // Transition to the new mode with current filter toggle
    const targetState = `${mode}_${filterStateToggle.current}`
    viewerRef.current.transitionMultiState?.(targetState, 900)
  }, [explodeMode])
  
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
        
        {/* Explode Mode Controls - Right side */}
        {!loading && models.length > 0 && (
          <Box
            style={{
              position: 'absolute',
              right: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              zIndex: 10,
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <Button
              variant={explodeMode === 'normal' ? 'solid' : 'surface'}
              disabled={explodeMode === 'normal'}
              onClick={() => handleExplodeModeChange('normal')}
              size="2"
            >
              Normal
            </Button>
            <Button
              variant={explodeMode === 'exploded' ? 'solid' : 'surface'}
              disabled={explodeMode === 'exploded'}
              onClick={() => handleExplodeModeChange('exploded')}
              size="2"
            >
              Exploded
            </Button>
          </Box>
        )}
        
        {/* Type Filter Controls - Top left */}
        {!loading && availableTypes.length > 0 && (
          <Box
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 10,
              pointerEvents: 'auto',
            }}
          >
            <Flex gap="2" wrap="wrap">
              {availableTypes.map(typeName => (
                <Button
                  key={typeName}
                  variant={visibleTypes.has(typeName) ? 'solid' : 'soft'}
                  onClick={() => toggleType(typeName)}
                  size="1"
                  style={{ textTransform: 'capitalize' }}
                >
                  {typeName}
                </Button>
              ))}
            </Flex>
          </Box>
        )}
        
        {/* Status messages */}
        {loading && (
          <Box style={{ position: 'absolute', bottom: 8, left: 8, padding: 8, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <Text size="1">Loading models...</Text>
          </Box>
        )}
        
        {error && (
          <Box style={{ position: 'absolute', bottom: 8, left: 8, padding: 8, background: 'rgba(200,0,0,0.8)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
            <Text size="1">Error: {error}</Text>
          </Box>
        )}
        
        {!loading && !error && models.length === 0 && objectIds.length > 0 && (
          <Box style={{ position: 'absolute', bottom: 8, left: 8, padding: 8, background: 'rgba(0,0,0,0.7)', color: 'white', borderRadius: 4, pointerEvents: 'none', zIndex: 10 }}>
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
