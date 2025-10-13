"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Heading, Text } from '@radix-ui/themes'
import SystemViewerPanel from '@/components/designer/SystemViewerPanel.jsx'
import ExplorerEditorSplit from '@/components/designer/ExplorerEditorSplit.jsx'

/**
 * DesignerWorkspace - Main layout for Designer with 3D Viewer + Explorer + Editor
 * Features horizontal split between SystemViewer (top) and Explorer/Editor (bottom)
 */
export default function DesignerWorkspace() {
  const containerRef = useRef(null)
  const [topHeight, setTopHeight] = useState(80) // Start collapsed (minimal height)
  const [dragging, setDragging] = useState(false)
  const [containerHeight, setContainerHeight] = useState(800)
  
  const minTopHeight = 60 // Collapsed state
  const maxTopHeightPercent = 0.8 // 80% of container
  
  const onMouseDown = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
  }, [])
  
  // Load/save persisted height
  useEffect(() => {
    try {
      const saved = localStorage.getItem('store:viewerHeight')
      if (saved) {
        const height = parseInt(saved, 10)
        if (height >= minTopHeight) {
          setTopHeight(height)
        }
      }
    } catch {}
  }, [])
  
  useEffect(() => {
    try {
      localStorage.setItem('store:viewerHeight', String(topHeight))
    } catch {}
  }, [topHeight])
  
  // Update container height on mount and resize
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerHeight(rect.height)
      }
    }
    
    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])
  
  // Handle drag
  useEffect(() => {
    if (!dragging) return
    
    const onMove = (e) => {
      if (!containerRef.current) return
      
      const rect = containerRef.current.getBoundingClientRect()
      const clientY = e.touches ? e.touches[0].clientY : e.clientY
      const y = clientY - rect.top // position within container
      
      // Calculate constraints
      const maxTopHeight = Math.floor(rect.height * maxTopHeightPercent)
      const minBottomHeight = 300 // Minimum space for explorer/editor
      const effectiveMax = Math.min(maxTopHeight, rect.height - minBottomHeight)
      
      const clamped = Math.max(minTopHeight, Math.min(effectiveMax, y))
      setTopHeight(clamped)
    }
    
    const onUp = () => setDragging(false)
    
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onUp)
    
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [dragging])
  
  // Calculate if viewer is collapsed
  const isCollapsed = topHeight <= 100
  
  return (
    <section>
      <Box
        ref={containerRef}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 700,
          height: 'calc(100vh - 200px)',
          maxHeight: 1200,
          position: 'relative'
        }}
        className="designer-workspace-container"
      >
        <style>{`
          .designer-workspace-container {
            border: 1px solid var(--gray-6);
            borderRadius: 8px;
            overflow: hidden;
          }
          .viewer-pane {
            flex: 0 0 var(--top-height);
            height: var(--top-height);
            min-height: ${minTopHeight}px;
            overflow: hidden;
            background: var(--color-panel-solid);
          }
          .bottom-pane {
            flex: 1 1 auto;
            min-height: 300px;
            overflow: hidden;
            display: flex;
            flexDirection: column;
          }
          .horizontal-divider {
            height: 8px;
            cursor: row-resize;
            background: transparent;
            transition: background 0.2s;
            flex-shrink: 0;
            position: relative;
            z-index: 20;
          }
          .horizontal-divider:hover,
          .horizontal-divider.dragging {
            background: var(--gray-4);
          }
          .horizontal-divider .grip {
            position: absolute;
            left: 50%;
            top: 50%;
            transform: translate(-50%, -50%);
            width: 48px;
            height: 3px;
            background: var(--gray-8);
            borderRadius: 2px;
            opacity: 0.9;
          }
          .horizontal-divider:hover .grip,
          .horizontal-divider.dragging .grip {
            background: var(--gray-11);
          }
        `}</style>
        
        {/* Top: SystemViewer */}
        <Box
          className="viewer-pane"
          style={{
            '--top-height': `${topHeight}px`,
          }}
        >
          <SystemViewerPanel expectedHeight={topHeight} />
        </Box>
        
        {/* Horizontal Draggable Divider */}
        <Box
          aria-label="Resize viewer"
          role="separator"
          aria-orientation="horizontal"
          className={`horizontal-divider ${dragging ? 'dragging' : ''}`}
          onMouseDown={onMouseDown}
          onTouchStart={onMouseDown}
        >
          <span className="grip" />
        </Box>
        
        {/* Bottom: Explorer + Editor */}
        <Box className="bottom-pane">
          <ExplorerEditorSplit />
        </Box>
      </Box>
    </section>
  )
}
