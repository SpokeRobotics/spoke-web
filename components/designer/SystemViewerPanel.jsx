"use client"

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Box, Card, Heading, Text, Flex, Button } from '@radix-ui/themes'
import { Eye, EyeOff } from 'lucide-react'
import { useSelection } from '@/components/designer/SelectionProvider.jsx'
import { SystemViewer } from '@/components/designer/SystemViewer.jsx'
import { getVisualizableIds, getVisualizationInfo } from '@/lib/store/visualization'
import { safeGetDoc } from '@/lib/store/resolver'

/**
 * SystemViewerPanel - Wrapper for SystemViewer that connects to selection system
 * Shows the selected object and all its hierarchical children
 */
export default function SystemViewerPanel({ expectedHeight }) {
  const contentRef = useRef(null)
  const [panelH, setPanelH] = useState(0)
  const { selectedId } = useSelection()
  const [objectIds, setObjectIds] = useState([])
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [vizInfo, setVizInfo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(null)
  
  // Load visualization info and object IDs when selection changes
  useEffect(() => {
    let cancelled = false
    
    async function loadVisualization() {
      if (!selectedId) {
        setObjectIds([])
        setSelectedDoc(null)
        setVizInfo(null)
        setLoadError(null)
        return
      }
      
      try {
        setLoading(true)
        setLoadError(null)
        
        
        
        // Get document and visualization info
        const [doc, info] = await Promise.all([
          safeGetDoc(selectedId),
          getVisualizationInfo(selectedId)
        ])
        
        
        
        if (cancelled) return
        
        setSelectedDoc(doc)
        setVizInfo(info)
        
        if (!info.canVisualize) {
          setObjectIds([])
          return
        }
        
        // Determine visualizable target IDs
        // For types: include the type ID so the viewer hook can auto-instantiate a temporary instance
        // For instances: expand to include all visualizable children
        let ids = []
        const isType = typeof selectedId === 'string' && selectedId.startsWith('spoke://types/')
        if (isType) {
          ids = [selectedId]
        } else {
          ids = await getVisualizableIds(selectedId)
        }
        
        if (cancelled) return
        setObjectIds(ids)
      } catch (err) {
        if (cancelled) return
        console.error('[SystemViewerPanel] Load error:', err)
        setLoadError(err.message || String(err))
        setObjectIds([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    
    loadVisualization()
    
    return () => {
      cancelled = true
    }
  }, [selectedId])

  // Measure available content height for the viewer and pass as explicit px
  useEffect(() => {
    if (!contentRef.current) return
    const ro = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect
      if (!r) return
      const h = Math.max(0, Math.round(r.height))
      setPanelH(h)
    })
    ro.observe(contentRef.current)
    return () => ro.disconnect()
  }, [])
  
  // Listen for store updates to refresh viewer
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const handleStoreChange = (event) => {
      const { $id } = event.detail || {}
      
      // If the selected object or any of its children changed, trigger reload
      if (selectedId && ($id === selectedId || objectIds.includes($id))) {
        // Re-trigger the effect by updating a dummy state
        setObjectIds(prev => [...prev])
      }
    }
    
    window.addEventListener('store:docSaved', handleStoreChange)
    return () => window.removeEventListener('store:docSaved', handleStoreChange)
  }, [selectedId, objectIds])
  
  const showEmpty = !selectedId || !vizInfo?.canVisualize
  const docName = selectedDoc?.name || selectedId || 'Unknown'
  
  return (
    <Card style={{ 
      width: '100%', 
      height: '100%',
      display: 'flex', 
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Minimal header bar */}
      {selectedId && (
        <Flex 
          justify="between" 
          align="center" 
          px="2" 
          py="1"
          style={{ 
            borderBottom: '1px solid var(--gray-6)',
            flexShrink: 0,
            background: 'var(--gray-2)'
          }}
        >
          <Text size="1" color="gray">
            {loading ? 'Loading...' : docName}
          </Text>
          
          {vizInfo && vizInfo.canVisualize && (
            <Text size="1" color="gray">
              {objectIds.length} part{objectIds.length !== 1 ? 's' : ''}
            </Text>
          )}
        </Flex>
      )}
      
      {/* Content */}
      <Box style={{ flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}>
        {showEmpty ? (
          <Flex 
            direction="column" 
            align="center" 
            justify="center" 
            gap="3"
            style={{ height: '100%', padding: '2rem' }}
          >
            <EyeOff size={48} style={{ color: 'var(--gray-8)', opacity: 0.5 }} />
            <Box style={{ textAlign: 'center' }}>
              <Text size="3" weight="medium" color="gray" as="div" mb="1">
                {selectedId ? 'No 3D Model' : 'No Selection'}
              </Text>
              <Text size="2" color="gray" as="div">
                {selectedId 
                  ? `This object has no model or parts to visualize.`
                  : 'Select an object in the explorer to view its 3D model.'
                }
              </Text>
            </Box>
          </Flex>
        ) : loadError ? (
          <Flex 
            direction="column" 
            align="center" 
            justify="center" 
            gap="3"
            style={{ height: '100%', padding: '2rem' }}
          >
            <Text size="3" weight="medium" color="red" as="div" mb="1">
              Error Loading Model
            </Text>
            <Text size="2" color="gray" as="div" style={{ textAlign: 'center' }}>
              {loadError}
            </Text>
          </Flex>
        ) : objectIds.length === 0 ? (
          <Flex 
            direction="column" 
            align="center" 
            justify="center" 
            gap="3"
            style={{ height: '100%', padding: '2rem' }}
          >
            <EyeOff size={48} style={{ color: 'var(--gray-8)', opacity: 0.5 }} />
            <Box style={{ textAlign: 'center' }}>
              <Text size="3" weight="medium" color="gray" as="div" mb="1">
                No Visualizable Objects
              </Text>
              <Text size="2" color="gray" as="div">
                This selection has no 3D models or parts to display.
              </Text>
            </Box>
          </Flex>
        ) : (
          <Box
            ref={contentRef}
            style={{ width: '100%', height: '100%', overflow: 'hidden' }}
          >
            <SystemViewer
              objects={objectIds}
              height={(typeof expectedHeight === 'number' && expectedHeight > 0) ? expectedHeight : (panelH > 0 ? panelH : 420)}
              expandedHeight={(typeof expectedHeight === 'number' && expectedHeight > 0) ? expectedHeight : (panelH > 0 ? panelH : 420)}
              toolsEnabled={true}
              backgroundMode="GRID"
              shadingMode="SOURCE"
              styleMode="STUDIO"
              autoFitOnLoad={true}
            />
          </Box>
        )}
      </Box>
    </Card>
  )
}
