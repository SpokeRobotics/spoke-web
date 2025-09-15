"use client"

import React, { useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { Box, Card, IconButton, Text, Button } from '@radix-ui/themes'
import { Wrench, Download, Expand, Minimize2 } from 'lucide-react'
import * as THREE from 'three'
import { ThreeCadViewer } from '@/components/cad/ThreeCadViewer'
import { Toolbar } from '@/components/cad/Toolbar'
import { getAssetPath } from '@/lib/paths'
import { saveBlobWithPicker } from '@/components/cad/Exporters'

// Generic model viewer supporting STL, 3MF, GLB/GLTF
// - Infers loader by file extension
// - Uses source materials for 3MF/GLTF and disables CAD adorners/styles automatically
// - Keeps CAD-style controls and recentering for STL geometry
export const ModelViewer = forwardRef(function ModelViewer(
  {
    id = 'modelviewer',
    src,
    // Size
    height = 280,
    expandedHeight = 460,
    // Whether the Tools (wrench) button is available; hidden by default
    toolsEnabled = false,
    // Motion
    spinMode = 'auto', // 'on' | 'off' | 'auto'
    // Visual defaults align with CAD viewer (applied for STL or when not using source materials)
    frameMode = 'HIDE',
    shadingMode = 'GRAY',
    originVisible = false,
    styleMode = 'STUDIO',
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
    name,
  },
  ref
) {
  const noSrc = !src

  const viewerRef = useRef(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  // When true, show the CAD-style appearance toolbar overlay and expand height
  const [viewTools, setViewTools] = useState(false)
  // Explosion support for multi-part non-STL models
  const [hasMultiParts, setHasMultiParts] = useState(false)
  const [isExploded, setIsExploded] = useState(false)

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
  // Recenter support (STL only)
  const [recenterEnabled, setRecenterEnabled] = useState(!!recenter)
  const [isSourceMaterialMode, setIsSourceMaterialMode] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0, z: 0 })
  const originalGeomRef = useRef(null)
  const centeredGeomRef = useRef(null)

  // Resolve URL respecting basePath. Compute on client after mount so routing context is available.
  const [resolvedUrl, setResolvedUrl] = useState('')
  useEffect(() => {
    if (!src) { setResolvedUrl(''); return }
    // Absolute URL or absolute path: return as-is (with basePath for path)
    if (/^https?:\/\//i.test(src)) { setResolvedUrl(src); return }
    if (src.startsWith('/')) { setResolvedUrl(getAssetPath(src)); return }

    // Plain-name inference based on current location
    let basePrefix = '/content/models'
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname
      // - /<basePath?>/docs/<repo>/*           -> /docs-submodules/<repo>/models
      // - /<basePath?>/docs-submodules/<repo>/*-> /docs-submodules/<repo>/models
      // - /<basePath?>/test/*                  -> /docs-test/models
      // - default                              -> /content/models
      // Remove optional basePath prefix from matching by focusing on trailing path segments
      try {
        // Extract the portion starting at '/docs' or '/docs-submodules' or '/test'
        const idx = currentPath.search(/\/(docs|docs-submodules|test)\//i)
        const matchTarget = idx >= 0 ? currentPath.slice(idx) : currentPath
        const docsMatch = matchTarget.match(/^\/docs\/([^/]+)/i)
        if (docsMatch && docsMatch[1]) {
          basePrefix = `/docs-submodules/${docsMatch[1]}/models`
        } else {
          const submod = matchTarget.match(/^\/docs-submodules\/([^/]+)/i)
          if (submod && submod[1]) {
            basePrefix = `/docs-submodules/${submod[1]}/models`
          } else if (/^\/test\//i.test(matchTarget)) {
            basePrefix = '/docs-test/models'
          } else {
            basePrefix = '/content/models'
          }
        }
      } catch {
        basePrefix = '/content/models'
      }
    }
    setResolvedUrl(getAssetPath(`${basePrefix}/${src}`))
  }, [src])

  const ext = useMemo(() => {
    if (!src) return ''
    const m = src.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)
    return m ? m[1] : ''
  }, [src])

  // Load model when url changes
  useEffect(() => {
    if (!resolvedUrl) return
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        // reset explode state on new load
        setIsExploded(false)
        setHasMultiParts(false)
        const e = ext
        if (e === 'stl') {
          const mod = await import('three/examples/jsm/loaders/STLLoader.js')
          const STLLoader = mod.STLLoader || mod.default || mod
          const loader = new STLLoader()
          const geometry = await loader.loadAsync(resolvedUrl)
          if (cancelled) return
          geometry.computeBoundingBox(); geometry.computeBoundingSphere()

          const bb = geometry.boundingBox
          const cx = (bb.min.x + bb.max.x) / 2
          const cy = (bb.min.y + bb.max.y) / 2
          const cz = (bb.min.z + bb.max.z) / 2
          offsetRef.current = { x: cx, y: cy, z: cz }

          const centered = geometry.clone()
          centered.translate(-cx, -cy, -cz)
          centered.computeBoundingBox(); centered.computeBoundingSphere()
          originalGeomRef.current = geometry
          centeredGeomRef.current = centered

          const size = geometry.boundingBox.getSize(new THREE.Vector3())
          const maxDim = Math.max(size.x, size.y, size.z) || 1
          const offsetLen = Math.sqrt(cx*cx + cy*cy + cz*cz)
          const ratio = offsetLen / maxDim
          const threshold = Math.max(0, Number(recenterThreshold) || 0)
          const enableByThreshold = (!!recenter) && (ratio > threshold)
          setRecenterEnabled(enableByThreshold)
          setIsSourceMaterialMode(false)
          setHasMultiParts(false)
          const chosen = enableByThreshold ? centered : geometry
          viewerRef.current?.setGeometry?.(chosen)
          if (autoFitOnLoad) viewerRef.current?.fitView?.()
        } else if (e === '3mf') {
          const mod = await import('three/examples/jsm/loaders/3MFLoader.js')
          const Loader = mod.ThreeMFLoader || mod.default || mod
          const loader = new Loader()
          const object = await loader.loadAsync(resolvedUrl)
          if (cancelled) return
          setIsSourceMaterialMode(true)
          viewerRef.current?.setObject?.(object)
          // detect multi-part: count direct child objects that are Mesh/Group/Object3D
          try {
            const parts = (object?.children || []).filter((c) => c && (c.isMesh || c.isGroup || c.isObject3D))
            setHasMultiParts(parts.length > 1)
          } catch {}
          if (autoFitOnLoad) viewerRef.current?.fitView?.()
        } else if (e === 'glb' || e === 'gltf') {
          const mod = await import('three/examples/jsm/loaders/GLTFLoader.js')
          const GLTFLoader = mod.GLTFLoader || mod.default || mod
          const loader = new GLTFLoader()
          const gltf = await loader.loadAsync(resolvedUrl)
          if (cancelled) return
          const object = gltf.scene || gltf.scenes?.[0]
          if (!object) throw new Error('GLTF has no scene')
          setIsSourceMaterialMode(true)
          viewerRef.current?.setObject?.(object)
          try {
            const parts = (object?.children || []).filter((c) => c && (c.isMesh || c.isGroup || c.isObject3D))
            setHasMultiParts(parts.length > 1)
          } catch {}
          if (autoFitOnLoad) viewerRef.current?.fitView?.()
        } else {
          throw new Error(`Unsupported model extension: .${e}`)
        }
      } catch (e) {
        setError(e?.message || String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [resolvedUrl, ext, autoFitOnLoad, recenter, recenterThreshold])

  // Toggle recenter: swap geometry between original and centered (STL only)
  const toggleRecenter = () => {
    if (isSourceMaterialMode) return
    const next = !recenterEnabled
    setRecenterEnabled(next)
    const geo = next ? (centeredGeomRef.current || originalGeomRef.current) : (originalGeomRef.current || centeredGeomRef.current)
    if (geo) {
      viewerRef.current?.setGeometry?.(geo)
      viewerRef.current?.fitView?.()
    }
  }

  const onCycleAmbientLevel = () => {
    const levels = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
    const cur = Number(vAmbientLevel) || 0
    const idx = levels.findIndex(v => Math.abs(v - cur) < 1e-6)
    setVAmbientLevel(levels[(idx >= 0 ? idx + 1 : 0) % levels.length])
  }
  const onCycleDirectionalLevel = () => {
    const levels = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 4.5, 5.0]
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
    const order = ['GRAY', 'CREAM', 'WHITE', 'DARK', 'BLACK', 'OFF']
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
      let base = 'model'
      try {
        if (/^https?:\/\//i.test(src)) {
          const u = new URL(src)
          base = u.pathname.split('/').pop() || 'model'
        } else {
          base = (src || 'model').toString().split('/').pop() || 'model'
        }
      } catch {
        base = (src || 'model').toString().split('/').pop() || 'model'
      }
      // Sanitize
      let safe = (name || base || 'model').replace(/[^\w.-]+/g, '_').replace(/^\.+/, '')
      await saveBlobWithPicker(safe, blob)
    } catch (e) {
      setError(e?.message || String(e))
    }
  }

  return (
    <Card variant="ghost" className="modelviewer-card">
      <Box p="0" style={{ position: 'relative' }}>
        {noSrc && (
          <Box mb="2"><Text color="red">ModelViewer: missing src</Text></Box>
        )}
        <div className="modelviewer-frame" style={{ position: 'relative', width: '100%', height: viewTools ? expandedHeight : height }}>
          <div style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, display: 'flex', gap: 8 }}>
            <IconButton variant="soft" radius="full" onClick={doDownload} aria-label="Download">
              <Download size={18} />
            </IconButton>
            {isSourceMaterialMode && hasMultiParts && (
              <IconButton
                variant={isExploded ? 'solid' : 'soft'}
                radius="full"
                onClick={() => {
                  const next = !isExploded
                  setIsExploded(next)
                  viewerRef.current?.setExploded?.(next)
                }}
                aria-label={isExploded ? 'Implode' : 'Explode'}
                title={isExploded ? 'Implode' : 'Explode'}
              >
                {isExploded ? <Minimize2 size={18} /> : <Expand size={18} />}
              </IconButton>
            )}
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
            useSourceMaterials={isSourceMaterialMode}
            originOffset={{
              x: (!isSourceMaterialMode && recenterEnabled) ? -(offsetRef.current.x || 0) : 0,
              y: (!isSourceMaterialMode && recenterEnabled) ? -(offsetRef.current.y || 0) : 0,
              z: (!isSourceMaterialMode && recenterEnabled) ? -(offsetRef.current.z || 0) : 0,
            }}
          />
          {viewTools && (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 9, paddingRight: 96 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 96px)' }}>
                <Toolbar
                  spinMode={vSpinMode}
                  frameMode={vFrameMode}
                  shadingMode={vShadingMode}
                  originVisible={vOriginVisible}
                  showCadControls={!isSourceMaterialMode}
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
                  leading={(!isSourceMaterialMode) && (
                    <Button variant="solid" size="2" onClick={toggleRecenter} style={{ whiteSpace: 'nowrap' }}>
                      CENTER: {recenterEnabled ? 'ON' : 'OFF'}
                    </Button>
                  )}
                />
              </div>
              {!isSourceMaterialMode && (
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
              )}
            </div>
          )}
        </div>
        {error && (
          <Box mt="2"><Text color="red" size="2">{error}</Text></Box>
        )}
      </Box>
    </Card>
  )
})

export default ModelViewer
