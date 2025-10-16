"use client"

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Box, Heading, Text, Tabs } from '@radix-ui/themes'
import SystemViewerPanel from '@/components/designer/SystemViewerPanel.jsx'
import ObjectExplorerPanel from '@/components/designer/ObjectExplorerPanel.jsx'
import JsonEditor from '@/components/designer/JsonEditor.jsx'
import { useResponsiveLayout } from '@/components/common/hooks/useResponsiveLayout.js'

/**
 * DesignerWorkspace - Main layout for Designer with 3D Viewer + Explorer + Editor
 * Features horizontal split between SystemViewer (top) and Explorer/Editor (bottom)
 */
export default function DesignerWorkspace() {
  const { layoutMode } = useResponsiveLayout()
  const containerRef = useRef(null)
  const tabsHeaderRef = useRef(null)
  const [topHeight, setTopHeight] = useState(80) // Start collapsed (minimal height)
  const [dragging, setDragging] = useState(false)
  const [containerHeight, setContainerHeight] = useState(800)
  const [compactContentHeight, setCompactContentHeight] = useState(600)
  // Bottom row: explorer/editor vertical split
  const [leftWidth, setLeftWidth] = useState(320)
  const [draggingV, setDraggingV] = useState(false)
  
  const minTopHeight = 60 // Collapsed state
  const maxTopHeightPercent = 0.8 // 80% of container
  const minW = 220
  const maxW = 520
  
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

  // Load/save persisted explorer width
  useEffect(() => {
    try {
      const saved = localStorage.getItem('store:explorerWidth')
      if (saved) setLeftWidth(Math.max(minW, Math.min(maxW, parseInt(saved, 10) || 320)))
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem('store:explorerWidth', String(leftWidth)) } catch {}
  }, [leftWidth])
  
  useEffect(() => {
    try {
      localStorage.setItem('store:viewerHeight', String(topHeight))
    } catch {}
  }, [topHeight])
  
  // Update container height on mount and resize to fit viewport
  useEffect(() => {
    const updateHeight = () => {
      const el = containerRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      const viewportH = (window.visualViewport && window.visualViewport.height) || window.innerHeight || document.documentElement.clientHeight || 0
      const available = Math.max(360, Math.floor(viewportH - rect.top))
      setContainerHeight(available)
      // Also compute compact content height (container minus tabs header)
      const headerH = (tabsHeaderRef.current && tabsHeaderRef.current.offsetHeight) ? tabsHeaderRef.current.offsetHeight : 0
      const contentH = Math.max(200, available - headerH)
      setCompactContentHeight(contentH)
    }
    
    updateHeight()
    window.addEventListener('resize', updateHeight)
    if (window.visualViewport) window.visualViewport.addEventListener('resize', updateHeight)
    return () => {
      window.removeEventListener('resize', updateHeight)
      if (window.visualViewport) window.visualViewport.removeEventListener('resize', updateHeight)
    }
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

  // Handle vertical drag (explorer/editor)
  const onMouseDownV = useCallback((e) => {
    e.preventDefault()
    setDraggingV(true)
  }, [])
  useEffect(() => {
    if (!draggingV) return
    const onMove = (e) => {
      const el = containerRef.current
      if (!el) return
      // bottom row starts after top viewer + divider; measure within bottom row box
      const row = el.querySelector('.bottom-row')
      if (!row) return
      const rect = row.getBoundingClientRect()
      const clientX = e.touches ? e.touches[0].clientX : e.clientX
      const x = clientX - rect.left
      const clamped = Math.max(minW, Math.min(maxW, x))
      setLeftWidth(clamped)
    }
    const onUp = () => setDraggingV(false)
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
  }, [draggingV])

  // Re-clamp explorer width on resize
  useEffect(() => {
    const onResize = () => {
      const el = containerRef.current
      if (!el) return
      const row = el.querySelector('.bottom-row')
      if (!row) return
      const rect = row.getBoundingClientRect()
      const maxAllowed = Math.min(maxW, Math.max(minW, Math.floor(rect.width * 0.6)))
      setLeftWidth((w) => Math.min(w, maxAllowed))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  
  // Calculate if viewer is collapsed
  const isCollapsed = topHeight <= 100
  
  if (layoutMode === 'compact') {
    return (
      <section>
        <Box
          ref={containerRef}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            height: containerHeight,
            maxHeight: 'none',
            position: 'relative'
          }}
          className="designer-workspace-container"
        >
          <style>{`
            .designer-workspace-container {
              border: 1px solid var(--gray-6);
              border-radius: 8px;
              overflow: hidden;
            }
          `}</style>
          <Tabs.Root defaultValue="editor" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <Tabs.List ref={tabsHeaderRef} size="2" style={{ display: 'flex', gap: 8, padding: '8px 8px 0 8px' }}>
              <Tabs.Trigger value="viewer">Viewer</Tabs.Trigger>
              <Tabs.Trigger value="explorer">Explorer</Tabs.Trigger>
              <Tabs.Trigger value="editor">Editor</Tabs.Trigger>
            </Tabs.List>
            <Tabs.Content value="viewer" style={{ minHeight: 0, height: compactContentHeight, overflow: 'hidden' }}>
              <Box style={{ height: '100%', minHeight: 0, display: 'flex', flex: 1 }}>
                <SystemViewerPanel expectedHeight={compactContentHeight} />
              </Box>
            </Tabs.Content>
            <Tabs.Content value="explorer" style={{ minHeight: 0, height: compactContentHeight, overflow: 'hidden' }}>
              <Box style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <ObjectExplorerPanel />
              </Box>
            </Tabs.Content>
            <Tabs.Content value="editor" style={{ minHeight: 0, height: compactContentHeight, overflow: 'hidden' }}>
              <Box style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column', flex: 1 }}>
                <Box style={{ flex: 1, minHeight: 0 }}>
                  <JsonEditor />
                </Box>
              </Box>
            </Tabs.Content>
          </Tabs.Root>
        </Box>
      </section>
    )
  }

  return (
    <section>
      <Box
        ref={containerRef}
        style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          height: containerHeight,
          maxHeight: 'none',
          position: 'relative'
        }}
        className="designer-workspace-container"
      >
        <style>{`
          .designer-workspace-container {
            border: 1px solid var(--gray-6);
            border-radius: 8px;
            overflow: hidden;
          }
          .viewer-pane {
            flex: 0 0 var(--top-height);
            height: var(--top-height);
            min-height: ${minTopHeight}px;
            overflow: hidden;
            background: var(--color-panel-solid);
          }
          .bottom-row { flex: 1 1 auto; min-height: 0; overflow: hidden; display: flex; flex-direction: row; align-items: stretch; }
          .explorer-pane { flex: 0 0 var(--left-width); width: var(--left-width); min-width: ${minW}px; max-width: ${maxW}px; overflow: hidden; }
          .editor-pane { flex: 1 1 auto; min-width: 0; display: flex; }
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
            border-radius: 2px;
            opacity: 0.9;
          }
          .horizontal-divider:hover .grip,
          .horizontal-divider.dragging .grip {
            background: var(--gray-11);
          }
          @media (pointer: coarse) { .horizontal-divider { display: none; } }
          .vertical-divider { width: 8px; cursor: col-resize; background: transparent; transition: background 0.2s; height: auto; align-self: stretch; position: relative; display: block; }
          .vertical-divider .grip { position: absolute; left: 50%; top: 20%; bottom: 20%; width: 2px; transform: translateX(-50%); background: var(--gray-8); border-radius: 1px; opacity: 0.9; }
          @media (pointer: coarse) { .vertical-divider { display: none; } }
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
        
        {/* Bottom: Explorer + Editor, managed here */}
        <Box className="bottom-row" style={{ '--left-width': `${leftWidth}px` }}>
          <Box className="explorer-pane" style={{ display: 'flex' }}>
            <ObjectExplorerPanel />
          </Box>
          <Box
            aria-label="Resize explorer"
            role="separator"
            aria-orientation="vertical"
            className={`vertical-divider ${draggingV ? 'dragging' : ''}`}
            onMouseDown={onMouseDownV}
            onTouchStart={onMouseDownV}
          >
            <span className="grip" />
          </Box>
          <Box className="editor-pane">
            <Box style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
              <Box style={{ flex: 1, minHeight: 0 }}>
                <JsonEditor />
              </Box>
            </Box>
          </Box>
        </Box>
      </Box>
    </section>
  )
}
