"use client"

/**
 * SystemViewer - Display and manipulate robot parts from store
 * Similar to ModelViewer but sources objects from the store
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Box, Button, Flex, Text, IconButton } from '@radix-ui/themes';
import { Wrench } from 'lucide-react';
import * as THREE from 'three';
import { ThreeCadViewer } from '@/components/cad/ThreeCadViewer';
import { Toolbar } from '@/components/cad/Toolbar';
import { getDoc } from '@/lib/store/resolver';
import { useStoreModels } from './useStoreModels';

const toArray = React.Children.toArray;

/**
 * Parse table from children to extract object references with locations
 * Format: | type | location |
 * Location format: dx,dy,dz,rx,ry,rz (all optional, default to 0)
 * Multiple rows can reference the same type with different locations (instances)
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
          const objectId = extractCellText(firstCell?.props?.children)
          if (objectId && objectId.startsWith('spoke://')) {
            // Check for location in second column
            let location = null
            if (cells.length > 1) {
              const locationText = extractCellText(cells[1]?.props?.children)
              if (locationText) {
                location = parseLocation(locationText)
              }
            }
            
            objectIds.push({ 
              id: objectId.trim(), 
              location: location || { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 }
            })
          }
        }
      })
    }
  })
  
  const leftover = elements.filter((node) => node !== tableElement)
  
  return { objectIds, leftover }
}

/**
 * Parse location string "dx,dy,dz,rx,ry,rz" into object
 */
function parseLocation(text) {
  const parts = text.split(',').map(s => parseFloat(s.trim()) || 0)
  return {
    dx: parts[0] || 0,
    dy: parts[1] || 0,
    dz: parts[2] || 0,
    rx: parts[3] || 0,
    ry: parts[4] || 0,
    rz: parts[5] || 0,
  }
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
  const [viewTools, setViewTools] = useState(false) // Tools panel visibility
  const [objectOriginVisible, setObjectOriginVisible] = useState(false) // Show object origins
  const [systemOriginVisible, setSystemOriginVisible] = useState(false) // Show system origin
  
  // Parse objects from props or children table
  const { objectIds: parsedIds, leftover: leftoverChildren } = useMemo(
    () => {
      if (objects && Array.isArray(objects)) {
        // Normalize objects array to handle both string and {id, location} format
        const normalized = objects.map(obj => {
          if (typeof obj === 'string') {
            return { id: obj, location: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } }
          }
          return obj
        })
        return { objectIds: normalized, leftover: children }
      }
      return parseObjectTable(children)
    },
    [objects, children]
  )
  
  const objectSpecs = parsedIds // Array of { id, location }
  const objectIds = objectSpecs.map(spec => spec.id) // Extract just IDs for loading
  
  // Load models from store
  const { models, loading, error } = useStoreModels(objectIds, {
    basePrefix: '/models',
    autoLoad: true,
  })
  
  // Attach location data to loaded models
  const modelsWithLocation = useMemo(() => {
    return models.map((model, index) => ({
      ...model,
      location: objectSpecs[index]?.location || { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 }
    }))
  }, [models, objectSpecs])
  
  // Extract unique types from models
  const availableTypes = useMemo(() => {
    const types = new Set()
    modelsWithLocation.forEach(m => {
      if (m.doc.$type) {
        // Extract final part from "spoke/part/electronics" -> "electronics"
        const parts = m.doc.$type.split('/')
        const typeName = parts[parts.length - 1]
        if (typeName) types.add(typeName)
      }
    })
    return Array.from(types).sort()
  }, [modelsWithLocation])
  
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
    if (!viewerRef.current || modelsWithLocation.length === 0 || sceneInitializedRef.current) return
    
    const EXPLODE_SCALE = 2.5 // How much to scale positions in exploded mode
    
    // Build multi-scene definition for ThreeCadViewer
    const sceneDefinition = {
      models: modelsWithLocation.map(m => {
        // Create a wrapper Group to handle the two-level transform hierarchy:
        // - Inner object: Apply To transform (seed offset/rotation) 
        // - Outer group: Apply Tm transform (table location)
        const wrapper = new THREE.Group()
        
        // Apply To transform to the actual model object
        const originPos = new THREE.Vector3(
          m.position?.[0] ?? 0,
          m.position?.[1] ?? 0,
          m.position?.[2] ?? 0
        )
        const originRot = new THREE.Euler(
          THREE.MathUtils.degToRad(m.rotation?.[0] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[1] ?? 0),
          THREE.MathUtils.degToRad(m.rotation?.[2] ?? 0),
          'ZYX'
        )
        m.object.position.copy(originPos)
        m.object.quaternion.setFromEuler(originRot)
        
        // Add model to wrapper
        wrapper.add(m.object)
        
        // Apply Tm transform to the wrapper (this operates in To's frame)
        const locationPos = new THREE.Vector3(
          m.location.dx,
          m.location.dy,
          m.location.dz
        )
        const locationRot = new THREE.Euler(
          THREE.MathUtils.degToRad(m.location.rx),
          THREE.MathUtils.degToRad(m.location.ry),
          THREE.MathUtils.degToRad(m.location.rz),
          'ZYX'
        )
        const locationQuat = new THREE.Quaternion().setFromEuler(locationRot)
        
        // Normal position/rotation for wrapper
        const normalPos = locationPos.clone()
        const normalQuat = locationQuat.clone()
        
        // Exploded position: scale from origin
        const explodedPos = locationPos.clone().multiplyScalar(EXPLODE_SCALE)
        
        // Extract type for visibility filtering - store in userData on wrapper
        const parts = (m.doc.$type || '').split('/')
        const typeName = parts[parts.length - 1] || ''
        wrapper.userData.typeName = typeName
        
        return {
          name: m.doc.title || m.$id,
          object: wrapper,
          states: {
            normal_a: {
              position: normalPos,
              quaternion: normalQuat,
              visible: true,
              opacity: 1,
            },
            normal_b: {
              position: normalPos.clone(),
              quaternion: normalQuat.clone(),
              visible: true,
              opacity: 1,
            },
            exploded_a: {
              position: explodedPos,
              quaternion: normalQuat.clone(),
              visible: true,
              opacity: 1,
            },
            exploded_b: {
              position: explodedPos.clone(),
              quaternion: normalQuat.clone(),
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
  }, [modelsWithLocation, autoFitOnLoad])
  
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
      <div style={{ position: 'relative', width: '100%', height: viewTools ? expandedHeight : height }}>
        <ThreeCadViewer
          ref={viewerRef}
          spinMode="auto"
          backgroundMode={backgroundMode}
          shadingMode={shadingMode}
          styleMode={styleMode}
          useSourceMaterials={true}
          ambientLevel={1.5}
          directionalLevel={1.5}
          originVisible={objectOriginVisible}
          axesHelperVisible={systemOriginVisible}
        />
        
        {/* Wrench Button - Top right */}
        {toolsEnabled && (
          <IconButton
            variant={viewTools ? 'solid' : 'soft'}
            radius="full"
            onClick={() => setViewTools(v => !v)}
            aria-label={viewTools ? 'Hide Tools' : 'Show Tools'}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              zIndex: 11,
            }}
          >
            <Wrench size={18} />
          </IconButton>
        )}
        
        {/* Toolbar - Top left (when tools visible) */}
        {viewTools && (
          <Box
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              zIndex: 10,
              paddingRight: 96,
            }}
          >
            <Toolbar
              spinMode="auto"
              frameMode="HIDE"
              shadingMode={shadingMode}
              originVisible={objectOriginVisible}
              onCycleSpin={() => {}}
              onToggleFrame={() => {}}
              onToggleShading={() => {}}
              onToggleOrigin={() => setObjectOriginVisible(v => !v)}
              systemOriginVisible={systemOriginVisible}
              onToggleSystemOrigin={() => setSystemOriginVisible(v => !v)}
              showCadControls={false}
              styleMode={styleMode}
              onCycleStyle={() => {}}
              backgroundMode={backgroundMode}
              onCycleBackground={() => {}}
              ambientLevel={1.5}
              directionalLevel={1.5}
              onCycleAmbientLevel={() => {}}
              onCycleDirectionalLevel={() => {}}
            />
          </Box>
        )}
        
        {/* Explode Mode Controls & Type Filters - Right side bottom */}
        {!loading && modelsWithLocation.length > 0 && (
          <Box
            style={{
              position: 'absolute',
              right: 12,
              bottom: 12,
              zIndex: 10,
              pointerEvents: 'auto',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-end',
              gap: 8,
            }}
          >
            {/* Normal/Exploded Buttons */}
            <Flex direction="column" gap="2">
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
            </Flex>
            
            {/* Type Filter Controls - below Normal/Exploded with gap */}
            {availableTypes.length > 0 && (
              <Flex gap="2" wrap="wrap" style={{ maxWidth: 200, justifyContent: 'flex-end' }}>
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
            )}
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
        
        {!loading && !error && modelsWithLocation.length === 0 && objectIds.length > 0 && (
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
