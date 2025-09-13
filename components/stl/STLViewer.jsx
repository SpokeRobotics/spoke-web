'use client'

import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { Box, Card, IconButton, Text, Button } from '@radix-ui/themes'
import { Wrench, Download } from 'lucide-react'
import * as THREE from 'three'
import { ThreeCadViewer } from '@/components/cad/ThreeCadViewer'
import { Toolbar } from '@/components/cad/Toolbar'
import { getAssetPath } from '@/lib/paths'
import { saveBlobWithPicker } from '@/components/cad/Exporters'

// A lightweight STL viewer with optional view controls and download.
// - No editor, no OpenCascade. Pure Three.js rendering via ThreeCadViewer.
// - Props mirror many of the CAD viewer options with defaults.
// - "Tool" icon reveals compact tool strip under the viewer: View + Download.
// - "View" toggles the CAD Toolbar overlay; clicking again hides all tools.
// - When tools are open, viewer height expands for comfort.
export const STLViewer = forwardRef(function STLViewer(
  {
    id = 'stlviewer',
    src, // STL file path or URL
    // Size
    height = 280,
    expandedHeight = 460,
    // Whether the Tools (wrench) button is available; hidden by default
    toolsEnabled = false,
    // Motion
    spinMode = 'auto', // 'on' | 'off' | 'auto'
    // Visual defaults align with CAD viewer
    frameMode = 'HIDE',
    shadingMode = 'GRAY',
    originVisible = false,
    styleMode = 'BASIC',
    backgroundMode = 'WHITE',
    outlineThreshold = 45,
    outlineScale = 1.02,
    edgesMode = 'AUTO',
    outlineColorMode = 'AUTO',
    edgesLineWidth = 2,
    ambientLevel = 2.0,
    directionalLevel = 2.0,
    // Behavior
    autoFitOnLoad = true,
    recenter = true,
    recenterThreshold = 0.10,
    name, // optional display/export base name
  },
  ref
) {
  const noSrc = !src

  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // When true, show the CAD-style appearance toolbar overlay and expand height
  const [viewTools, setViewTools] = useState(false)

  // Mirror viewer option states so Toolbar can mutate them
  const [vSpinMode, setVSpinMode] = useState(() => (spinMode === 'on' || spinMode === 'off' || spinMode === 'auto') ? spinMode : 'auto')
  const [vFrameMode, setVFrameMode] = useState(frameMode)
  const [vShadingMode, setVShadingMode] = useState(shadingMode)
  const [vOriginVisible, setVOriginVisible] = useState(!!originVisible)
  const [vStyleMode, setVStyleMode] = useState(styleMode)
  const [vBackgroundMode, setVBackgroundMode] = useState(backgroundMode)
  const [vOutlineThreshold, setVOutlineThreshold] = useState(outlineThreshold)
  const [vOutlineScale, setVOutlineScale] = useState(outlineScale)
  const [vEdgesMode, setVEdgesMode] = useState(edgesMode)
  const [vOutlineColorMode, setVOutlineColorMode] = useState(outlineColorMode)
  const [vEdgesLineWidth, setVEdgesLineWidth] = useState(edgesLineWidth)
  const [vAmbientLevel, setVAmbientLevel] = useState(ambientLevel)
  const [vDirectionalLevel, setVDirectionalLevel] = useState(directionalLevel)
  // Recenter support
  const [recenterEnabled, setRecenterEnabled] = useState(!!recenter)
  const offsetRef = useRef({ x: 0, y: 0, z: 0 })
  const originalGeomRef = useRef(null)
  const centeredGeomRef = useRef(null)

  // Resolve URL respecting basePath for local models with context-aware repo detection
  const resolvedUrl = useMemo(() => {
    if (!src) return ''
    if (/^https?:\/\//i.test(src)) return src
    // Direct path to public assets
    if (src.startsWith('/')) return getAssetPath(src)
    
    // For bare filenames, detect repo context from current URL/path
    // This is a heuristic based on the current page URL
    let repoContext = 'spoke-body' // default fallback
    
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname
      // Extract repo name from URLs like /docs-submodules/spoke-body/... or /spoke-body/...
      const repoMatch = currentPath.match(/\/(spoke-[^\/]+)/)
      if (repoMatch) {
        repoContext = repoMatch[1]
      }
    }
    
    // Treat bare filenames as models in public/models/{repo-context}/
    return getAssetPath(`/models/${repoContext}/${src}`)
  }, [src])

  // Load STL once on mount or when src changes
  useEffect(() => {
    if (!resolvedUrl) return
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const mod = await import('three/examples/jsm/loaders/STLLoader.js')
        const STLLoader = mod.STLLoader || mod.default || mod
        const loader = new STLLoader()
        const geometry = await loader.loadAsync(resolvedUrl)
        if (cancelled) return
        geometry.computeBoundingBox()
        geometry.computeBoundingSphere()

        // Compute center of bounding box
        const bb = geometry.boundingBox
        const cx = (bb.min.x + bb.max.x) / 2
        const cy = (bb.min.y + bb.max.y) / 2
        const cz = (bb.min.z + bb.max.z) / 2
        offsetRef.current = { x: cx, y: cy, z: cz }

        // Prepare centered clone (do not mutate original)
        const centered = geometry.clone()
        centered.translate(-cx, -cy, -cz)
        centered.computeBoundingBox()
        centered.computeBoundingSphere()

        originalGeomRef.current = geometry
        centeredGeomRef.current = centered

        // Decide initial recentering based on threshold (10% default)
        const size = geometry.boundingBox.getSize(new THREE.Vector3())
        const maxDim = Math.max(size.x, size.y, size.z) || 1
        const offsetLen = Math.sqrt(cx*cx + cy*cy + cz*cz)
        const ratio = offsetLen / maxDim
        const threshold = Math.max(0, Number(recenterThreshold) || 0)
        const enableByThreshold = (!!recenter) && (ratio > threshold)
        // Update state to reflect decision
        setRecenterEnabled(enableByThreshold)
        const chosen = enableByThreshold ? centered : geometry
        viewerRef.current?.setGeometry?.(chosen)
        if (autoFitOnLoad) viewerRef.current?.fitView?.()
      } catch (e) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [resolvedUrl, autoFitOnLoad])

  // Toggle recenter: swap geometry between original and centered
  const toggleRecenter = () => {
    const next = !recenterEnabled
    setRecenterEnabled(next)
    const geo = next ? (centeredGeomRef.current || originalGeomRef.current) : (originalGeomRef.current || centeredGeomRef.current)
    if (geo) {
      viewerRef.current?.setGeometry?.(geo)
      viewerRef.current?.fitView?.()
    }
  }

  const onCycleAmbientLevel = () => {
    const levels = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    const cur = Number(vAmbientLevel) || 0
    const idx = levels.findIndex(v => Math.abs(v - cur) < 1e-6)
    setVAmbientLevel(levels[(idx >= 0 ? idx + 1 : 0) % levels.length])
  }
  const onCycleDirectionalLevel = () => {
    const levels = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0]
    const cur = Number(vDirectionalLevel) || 0
    const idx = levels.findIndex(v => Math.abs(v - cur) < 1e-6)
    setVDirectionalLevel(levels[(idx >= 0 ? idx + 1 : 0) % levels.length])
  }
  const onCycleStyle = () => {
    const order = ['BASIC', 'STUDIO', 'OUTLINE', 'TOON', 'MATCAP']
    const i = order.indexOf(String(vStyleMode))
    setVStyleMode(order[(i >= 0 ? i + 1 : 0) % order.length])
  }
  const onCycleBackground = () => {
    const order = ['WHITE', 'GRADIENT', 'GRID', 'HORIZON']
    const i = order.indexOf(String(vBackgroundMode))
    setVBackgroundMode(order[(i >= 0 ? i + 1 : 0) % order.length])
  }
  const onCycleEdges = () => {
    const order = ['OFF', 'AUTO', 'BLACK', 'DARK GRAY', 'LIGHT GRAY', 'WHITE']
    const i = order.indexOf(String(vEdgesMode))
    setVEdgesMode(order[(i >= 0 ? i + 1 : 0) % order.length])
  }
  const onCycleOutlineThreshold = () => {
    const vals = [30, 45, 60, 75]
    const i = vals.indexOf(Number(vOutlineThreshold))
    setVOutlineThreshold(vals[(i >= 0 ? i + 1 : 0) % vals.length])
  }
  const onCycleOutlineScale = () => {
    const vals = [1.01, 1.02, 1.03]
    const cur = Number(vOutlineScale) || 1.02
    const i = vals.findIndex(v => Math.abs(v - cur) < 1e-6)
    setVOutlineScale(vals[(i >= 0 ? i + 1 : 0) % vals.length])
  }
  const onCycleEdgesLineWidth = () => {
    const vals = [1.0, 1.35, 1.7, 2.0, 2.5, 3.0]
    const cur = Number(vEdgesLineWidth) || 2
    const i = vals.findIndex(v => Math.abs(v - cur) < 1e-6)
    setVEdgesLineWidth(vals[(i >= 0 ? i + 1 : 0) % vals.length])
  }
  const onCycleOutlineColor = () => {
    const vals = ['AUTO', 'BLACK', 'WHITE']
    const i = vals.indexOf(String(vOutlineColorMode))
    setVOutlineColorMode(vals[(i >= 0 ? i + 1 : 0) % vals.length])
  }
  const onCycleSpin = () => {
    const order = ['off', 'auto', 'on']
    const i = order.indexOf(String(vSpinMode))
    setVSpinMode(order[(i >= 0 ? i + 1 : 0) % order.length])
  }
  const onToggleFrame = () => {
    setVFrameMode(prev => (prev === 'HIDE' ? 'LIGHT' : prev === 'LIGHT' ? 'DARK' : 'HIDE'))
  }
  const onToggleShading = () => {
    const order = ['GRAY', 'WHITE', 'BLACK', 'OFF']
    const i = order.indexOf(String(vShadingMode))
    setVShadingMode(order[(i >= 0 ? i + 1 : 0) % order.length])
  }
  const onToggleOrigin = () => setVOriginVisible(v => !v)

  const doDownload = async () => {
    try {
      const resp = await fetch(resolvedUrl)
      if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)
      const blob = await resp.blob()
      // Derive filename from src by default
      let base = 'model.stl'
      try {
        if (/^https?:\/\//i.test(src)) {
          const u = new URL(src)
          base = u.pathname.split('/').pop() || 'model.stl'
        } else {
          base = (src || 'model.stl').toString().split('/').pop() || 'model.stl'
        }
      } catch {
        base = (src || 'model.stl').toString().split('/').pop() || 'model.stl'
      }
      // Sanitize and enforce .stl
      let safe = (name || base || 'model.stl').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '')
      if (!/\.stl$/i.test(safe)) safe = safe.replace(/\.[^.]*$/g, '') + '.stl'
      await saveBlobWithPicker(safe, blob)
    } catch (e) {
      setError(e?.message || String(e))
    }
  }

  return (
    <Card variant="ghost" className="stlviewer-card">
      <Box p="0" style={{ position: 'relative' }}>
        {/* Missing src message */}
        {noSrc && (
          <Box mb="2"><Text color="red">STLViewer: missing src</Text></Box>
        )}
        {/* Viewer container */}
        <div className="stlviewer-frame" style={{ position: 'relative', width: '100%', height: viewTools ? expandedHeight : height }}>
          {/* Top-right controls: Download (always) + Tools (optional) */}
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8 }}>
            <IconButton variant="soft" radius="full" onClick={doDownload} aria-label="Download STL">
              <Download size={18} />
            </IconButton>
            {toolsEnabled && (
              <IconButton
                variant={viewTools ? 'solid' : 'soft'}
                radius="full"
                onClick={() => setViewTools(v => !v)}
                aria-label={viewTools ? 'Hide Tools' : 'Show Tools'}
              >
                <Wrench size={18} />
              </IconButton>
            )}
          </div>
          {/* Viewer */}
          <ThreeCadViewer
            ref={viewerRef}
            spinMode={vSpinMode}
            frameMode={vFrameMode}
            shadingMode={vShadingMode}
            originVisible={vOriginVisible}
            styleMode={vStyleMode}
            backgroundMode={vBackgroundMode}
            outlineThreshold={vOutlineThreshold}
            outlineScale={vOutlineScale}
            edgesMode={vEdgesMode}
            outlineColorMode={vOutlineColorMode}
            edgesLineWidth={vEdgesLineWidth}
            ambientLevel={vAmbientLevel}
            directionalLevel={vDirectionalLevel}
            // Axes are parented to the model group; when centered, move axes locally to the original origin
            originOffset={{
              x: recenterEnabled ? -(offsetRef.current.x || 0) : 0,
              y: recenterEnabled ? -(offsetRef.current.y || 0) : 0,
              z: recenterEnabled ? -(offsetRef.current.z || 0) : 0,
            }}
          />
          {/* Overlay: CAD toolbar when View is toggled on */}
          {viewTools && (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 9, paddingRight: 96 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 96px)' }}>
                <Toolbar
                  spinMode={vSpinMode}
                  frameMode={vFrameMode}
                  shadingMode={vShadingMode}
                  originVisible={vOriginVisible}
                  onCycleSpin={onCycleSpin}
                  onToggleFrame={onToggleFrame}
                  onToggleShading={onToggleShading}
                  onToggleOrigin={onToggleOrigin}
                  styleMode={vStyleMode}
                  onCycleStyle={onCycleStyle}
                  backgroundMode={vBackgroundMode}
                  onCycleBackground={onCycleBackground}
                  outlineThreshold={vOutlineThreshold}
                  onCycleOutlineThreshold={onCycleOutlineThreshold}
                  outlineScale={vOutlineScale}
                  onCycleOutlineScale={onCycleOutlineScale}
                  edgesMode={vEdgesMode}
                  onCycleEdges={onCycleEdges}
                  outlineColorMode={vOutlineColorMode}
                  onCycleOutlineColor={onCycleOutlineColor}
                  edgesLineWidth={vEdgesLineWidth}
                  onCycleEdgesLineWidth={onCycleEdgesLineWidth}
                  ambientLevel={vAmbientLevel}
                  directionalLevel={vDirectionalLevel}
                  onCycleAmbientLevel={onCycleAmbientLevel}
                  onCycleDirectionalLevel={onCycleDirectionalLevel}
                  leading={(
                    <Button variant="solid" size="2" onClick={toggleRecenter} style={{ whiteSpace: 'nowrap' }}>
                      CENTER: {recenterEnabled ? 'ON' : 'OFF'}
                    </Button>
                  )}
                />
              </div>
              <Box mt="1" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', maxWidth: 'calc(100% - 96px)' }}>
                <Text size="2" color="gray">
                  Offset: (
                  {offsetRef.current.x.toFixed ? offsetRef.current.x.toFixed(2) : String(offsetRef.current.x)},
                  {' '}
                  {offsetRef.current.y.toFixed ? offsetRef.current.y.toFixed(2) : String(offsetRef.current.y)},
                  {' '}
                  {offsetRef.current.z.toFixed ? offsetRef.current.z.toFixed(2) : String(offsetRef.current.z)}
                  )
                </Text>
              </Box>
            </div>
          )}
        </div>
        {/* Optional error surface (brief) */}
        {error && (
          <Box mt="2"><Text color="red" size="2">{error}</Text></Box>
        )}
      </Box>
    </Card>
  )
})

export default STLViewer
