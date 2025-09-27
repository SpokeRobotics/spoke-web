"use client"

import React, { useCallback, useEffect, useMemo, useRef, useState, forwardRef } from 'react'
import { Box, Card, IconButton, Text, Button, Flex } from '@radix-ui/themes'
import { Wrench, Download, Expand, Minimize2 } from 'lucide-react'
import * as THREE from 'three'
import { ThreeCadViewer } from '@/components/cad/ThreeCadViewer'
import { Toolbar } from '@/components/cad/Toolbar'
import { getAssetPath } from '@/lib/paths'
import { saveBlobWithPicker } from '@/components/cad/Exporters'

const TABLE_TAG = 'table'

const toArray = React.Children.toArray

const degToRad = (deg) => ((Number(deg) || 0) * Math.PI) / 180

const computeModelBasePrefix = () => {
  if (typeof window === 'undefined') return '/content/models'
  const currentPath = window.location.pathname || ''
  let basePrefix = '/content/models'
  try {
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
      }
    }
  } catch {
    basePrefix = '/content/models'
  }
  return basePrefix
}

const isTableElement = (node) => React.isValidElement(node) && typeof node.type === 'string' && node.type.toLowerCase() === TABLE_TAG

const extractCellText = (value) => {
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

const collectTableData = (tableElement) => {
  const headers = []
  const rows = []
  toArray(tableElement?.props?.children).forEach((child) => {
    if (!React.isValidElement(child)) return
    const tag = typeof child.type === 'string' ? child.type.toLowerCase() : ''
    if (tag === 'thead') {
      toArray(child.props?.children).forEach((rowEl) => {
        if (!React.isValidElement(rowEl)) return
        const rowTag = typeof rowEl.type === 'string' ? rowEl.type.toLowerCase() : ''
        if (rowTag !== 'tr') return
        const cells = toArray(rowEl.props?.children).map((cell) => extractCellText(cell?.props?.children))
        if (cells.length) headers.push(...cells)
      })
    }
    if (tag === 'tbody') {
      toArray(child.props?.children).forEach((rowEl) => {
        if (!React.isValidElement(rowEl)) return
        const rowTag = typeof rowEl.type === 'string' ? rowEl.type.toLowerCase() : ''
        if (rowTag !== 'tr') return
        const cells = toArray(rowEl.props?.children).map((cell) => extractCellText(cell?.props?.children))
        if (cells.length) rows.push(cells)
      })
    }
  })
  return { headers, rows }
}

const normalizeStateName = (name) => (name || '').trim()

const parseTransformTuple = (raw, modelName, stateName, errors) => {
  if (raw == null) raw = ''
  const parts = String(raw)
    .split(',')
    .map((p) => p.trim())
  while (parts.length < 7) parts.push('')
  const [x, y, z, ax, ay, az, vis] = parts.slice(0, 7)
  const toNumber = (n, label) => {
    if (n === '') return 0
    const num = Number(n)
    if (!Number.isFinite(num)) {
      errors.push(`Model "${modelName}" state "${stateName}" has invalid ${label} value "${n}"`)
      return 0
    }
    return num
  }
  const vx = toNumber(x, 'x')
  const vy = toNumber(y, 'y')
  const vz = toNumber(z, 'z')
  const vax = toNumber(ax, 'ax')
  const vay = toNumber(ay, 'ay')
  const vaz = toNumber(az, 'az')
  const vVisible = (() => {
    if (vis === '' || vis == null) return 1
    const num = Number(vis)
    if (!Number.isFinite(num)) {
      errors.push(`Model "${modelName}" state "${stateName}" has invalid visibility value "${vis}"`)
      return 1
    }
    return num <= 0 ? 0 : 1
  })()
  const euler = new THREE.Euler(degToRad(vax), degToRad(vay), degToRad(vaz), 'ZYX')
  const quaternion = new THREE.Quaternion().setFromEuler(euler)
  return {
    position: new THREE.Vector3(vx, vy, vz),
    euler,
    quaternion,
    visible: vVisible === 1,
  }
}

const parseSceneTables = (children) => {
  const elements = toArray(children)
  const tableElements = elements.filter((node) => isTableElement(node))
  if (tableElements.length === 0) {
    return {
      sceneDefinition: null,
      transitionMap: null,
      stateOrder: null,
      leftover: children,
      errors: [],
    }
  }

  const errors = []
  const [modelTable, ...restTables] = tableElements
  const transitionTable = restTables.find((tbl) => {
    const data = collectTableData(tbl)
    if (!data.headers.length) return false
    const first = (data.headers[0] || '').toLowerCase()
    return first === 'from' || first === 'state'
  })

  const { headers, rows } = collectTableData(modelTable)
  if (!headers.length) {
    errors.push('Model table is missing headers.')
  }
  const normalizedHeaders = headers.map((h) => h.trim().toLowerCase())
  const nameIdx = normalizedHeaders.indexOf('name')
  const pathIdx = normalizedHeaders.indexOf('path')
  if (nameIdx !== 0) {
    errors.push('Model table must have "name" as the first column header.')
  }
  if (pathIdx !== normalizedHeaders.length - 1) {
    errors.push('Model table must have "path" as the last column header.')
  }
  const stateHeaders = headers.slice(1, headers.length - 1)
  const stateOrder = stateHeaders.map((h) => normalizeStateName(h))
  const stateDisplayOrder = stateHeaders.map((h) => h.trim())
  const stateDisplayMap = {}
  if (!stateOrder.length) {
    errors.push('Model table must include at least one state column (e.g., "start").')
  }
  if (!stateOrder.some((s) => s.toLowerCase() === 'start')) {
    errors.push('Model table must include a "start" state column.')
  }

  const models = []
  rows.forEach((row, idx) => {
    if (!row || row.length < headers.length) {
      errors.push(`Row ${idx + 1} in the model table is missing cells.`)
      return
    }
    const modelName = normalizeStateName(row[nameIdx]) || `Model ${idx + 1}`
    const path = row[pathIdx]?.trim()
    if (!path) {
      errors.push(`Model "${modelName}" is missing a path.`)
      return
    }
    const states = {}
    stateOrder.forEach((stateName, colIdx) => {
      const originalHeader = stateHeaders[colIdx]
      const raw = row[colIdx + 1] ?? ''
      const parsed = parseTransformTuple(raw, modelName, originalHeader, errors)
      const key = stateName.toLowerCase()
      states[key] = parsed
      stateDisplayMap[key] = originalHeader.trim()
    })
    models.push({
      name: modelName,
      path,
      states,
    })
  })

  const transitionMap = {}
  stateOrder.forEach((stateName) => {
    transitionMap[stateName.toLowerCase()] = []
  })

  if (transitionTable) {
    const transData = collectTableData(transitionTable)
    const tHeaders = transData.headers.map((h) => h.trim().toLowerCase())
    if (!tHeaders.length) {
      errors.push('Transition table is missing headers.')
    }
    const firstHeader = tHeaders[0]
    if (firstHeader !== 'from' && firstHeader !== 'state') {
      errors.push('Transition table first column must be "from" or "state".')
    }
    transData.rows.forEach((row, idx) => {
      if (!row.length) return
      const fromNameRaw = normalizeStateName(row[0])
      if (!fromNameRaw) {
        errors.push(`Transition table row ${idx + 1} is missing a source state.`)
        return
      }
      const fromKey = fromNameRaw.toLowerCase()
      if (!transitionMap[fromKey]) {
        transitionMap[fromKey] = []
      }
      const targets = row.slice(1)
      const parsedTargets = []
      targets.forEach((cell) => {
        const text = (cell || '').trim()
        if (!text) return
        text.split(',').forEach((item) => {
          const target = normalizeStateName(item)
          if (!target) return
          const key = target.toLowerCase()
          parsedTargets.push(key)
          if (!transitionMap[key]) transitionMap[key] = []
        })
      })
      transitionMap[fromKey] = Array.from(new Set([...(transitionMap[fromKey] || []), ...parsedTargets]))
    })
  }

  const leftover = elements.filter((node) => !tableElements.includes(node))

  const loweredOrder = stateOrder.map((s) => s.toLowerCase())

  const stateSet = new Set(loweredOrder)
  Object.keys(transitionMap).forEach((key) => {
    const filtered = (transitionMap[key] || []).filter((target) => stateSet.has(target))
    transitionMap[key] = Array.from(new Set(filtered))
  })
  const startKey = loweredOrder[0] || 'start'
  loweredOrder.forEach((state) => {
    if (!Array.isArray(transitionMap[state])) {
      transitionMap[state] = []
    }
    if (state !== startKey && !transitionMap[state].includes(startKey)) {
      transitionMap[state].push(startKey)
    }
    transitionMap[state] = Array.from(new Set(transitionMap[state]))
  })
  if (!transitionMap[startKey]) transitionMap[startKey] = []

  return {
    sceneDefinition: { models, stateOrder: loweredOrder, stateDisplayOrder: stateDisplayOrder.map((s) => s.trim()), stateDisplayMap },
    transitionMap,
    stateOrder: loweredOrder,
    leftover,
    errors,
  }
}

const resolveModelPath = (rawPath, basePrefix) => {
  if (!rawPath) return ''
  if (/^https?:\/\//i.test(rawPath)) return rawPath
  if (rawPath.startsWith('/')) return getAssetPath(rawPath)
  const base = basePrefix || '/content/models'
  return getAssetPath(`${base}/${rawPath}`)
}

const loadModelAsset = async (url, ext) => {
  if (ext === 'stl') {
    const mod = await import('three/examples/jsm/loaders/STLLoader.js')
    const STLLoader = mod.STLLoader || mod.default || mod
    const loader = new STLLoader()
    const geometry = await loader.loadAsync(url)
    geometry.computeBoundingBox(); geometry.computeBoundingSphere()
    const material = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.1, roughness: 0.85 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.userData.__sourceType = 'geometry'
    return mesh
  }
  if (ext === '3mf') {
    const mod = await import('three/examples/jsm/loaders/3MFLoader.js')
    const Loader = mod.ThreeMFLoader || mod.default || mod
    const loader = new Loader()
    const object = await loader.loadAsync(url)
    object.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.transparent = true
        obj.material.opacity = 1
      }
    })
    object.userData.__sourceType = 'object'
    return object
  }
  if (ext === 'glb' || ext === 'gltf') {
    const mod = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const GLTFLoader = mod.GLTFLoader || mod.default || mod
    const loader = new GLTFLoader()
    const gltf = await loader.loadAsync(url)
    const object = gltf.scene || gltf.scenes?.[0]
    if (!object) throw new Error('GLTF has no scene')
    object.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        obj.material.transparent = true
        obj.material.opacity = 1
      }
    })
    object.userData.__sourceType = 'object'
    return object
  }
  throw new Error(`Unsupported model extension: .${ext}`)
}

const cloneObjectForScene = (object) => {
  if (!object) return null
  const clone = object.clone ? object.clone(true) : object
  if (clone && clone.traverse) {
    clone.traverse((node) => {
      if (node.isMesh) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map((mat) => (mat && mat.clone ? mat.clone() : mat))
        } else if (node.material && node.material.clone) {
          node.material = node.material.clone()
        }
      }
    })
  }
  return clone
}

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
    axesVisible = false,
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
    children,
  },
  ref
) {
  const {
    sceneDefinition,
    transitionMap: parsedTransitionMap,
    leftover: leftoverChildren,
    errors: parseErrors,
  } = useMemo(() => parseSceneTables(children), [children])

  const isMultiScene = !!(sceneDefinition && sceneDefinition.models?.length)
  const noSrc = !src && !isMultiScene

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
  const [vAxesVisible, setVAxesVisible] = useState(!!axesVisible)
  const [vStyleMode, setVStyleMode] = useState(styleMode)
  const [vBackgroundMode, setVBackgroundMode] = useState(backgroundMode)
  const [vOutlineThreshold, setVOutlineThreshold] = useState(outlineThreshold)
  const [vOutlineScale, setVOutlineScale] = useState(outlineScale)
  const [vEdgesMode, setVEdgesMode] = useState(edgesMode)
  const [vOutlineColorMode, setVOutlineColorMode] = useState(outlineColorMode)
  const [vEdgesLineWidth, setVEdgesLineWidth] = useState(edgesLineWidth)
  const [vAmbientLevel, setVAmbientLevel] = useState(isMultiScene ? 1.5 : ambientLevel)
  const [vDirectionalLevel, setVDirectionalLevel] = useState(isMultiScene ? 1.5 : directionalLevel)
  // Recenter support (STL only)
  const [recenterEnabled, setRecenterEnabled] = useState(!!recenter)
  const [isSourceMaterialMode, setIsSourceMaterialMode] = useState(false)
  const offsetRef = useRef({ x: 0, y: 0, z: 0 })
  const originalGeomRef = useRef(null)
  const centeredGeomRef = useRef(null)

  const [multiSceneMeta, setMultiSceneMeta] = useState(null)
  const [currentState, setCurrentState] = useState(null)
  const [isTransitioning, setIsTransitioning] = useState(false)

  const renderedChildren = useMemo(
    () => (isMultiScene ? leftoverChildren : children),
    [isMultiScene, leftoverChildren, children]
  )

  const parseErrorsKey = useMemo(
    () => (parseErrors && parseErrors.length ? parseErrors.join('|') : ''),
    [parseErrors]
  )

  useEffect(() => {
    if (!isMultiScene) {
      setMultiSceneMeta(null)
      setCurrentState(null)
      setIsTransitioning(false)
      return
    }
    setRecenterEnabled(false)
  }, [isMultiScene])

  // Resolve URL respecting basePath. Compute on client after mount so routing context is available.
  const [resolvedUrl, setResolvedUrl] = useState('')
  useEffect(() => {
    if (isMultiScene) {
      setResolvedUrl('')
      return
    }
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
  }, [src, isMultiScene])

  const ext = useMemo(() => {
    if (!src) return ''
    const m = src.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)
    return m ? m[1] : ''
  }, [src])

  useEffect(() => {
    if (!isMultiScene) return
    if (!sceneDefinition) return
    if (parseErrors && parseErrors.length) {
      setError(parseErrors.join(' '))
      setLoading(false)
      return
    }
    let cancelled = false
    async function loadScene() {
      try {
        setLoading(true)
        setError(null)
        setIsSourceMaterialMode(true)
        setHasMultiParts(false)
        setIsExploded(false)
        setRecenterEnabled(false)
        const basePrefix = computeModelBasePrefix()
        const loadedModels = []
        for (const modelDef of sceneDefinition.models || []) {
          if (cancelled) return
          const rawPath = modelDef.path || ''
          const extMatch = rawPath.toLowerCase().match(/\.([a-z0-9]+)(?:\?.*)?$/)
          if (!extMatch) {
            throw new Error(`Model "${modelDef.name || 'model'}" path "${rawPath}" is missing an extension.`)
          }
          const assetUrl = resolveModelPath(rawPath, basePrefix)
          const asset = await loadModelAsset(assetUrl, extMatch[1])
          if (cancelled) return
          const clone = cloneObjectForScene(asset) || asset
          const container = new THREE.Group()
          container.name = modelDef.name || 'Model'
          container.add(clone)
          loadedModels.push({
            name: modelDef.name,
            object: container,
            states: modelDef.states || {},
          })
        }
        if (cancelled) return
        const stateOrder = sceneDefinition.stateOrder || []
        const stateDisplayMap = sceneDefinition.stateDisplayMap || {}
        const transitionMap = parsedTransitionMap || {}
        const initialState = (stateOrder[0] || 'start').toLowerCase()
        setMultiSceneMeta({
          stateOrder,
          stateDisplayMap,
          transitionMap,
        })
        setCurrentState(initialState)
        viewerRef.current?.setMultiScene?.({
          models: loadedModels,
          stateOrder,
          stateDisplayMap,
          transitionMap,
          initialState,
        })
      } catch (err) {
        if (!cancelled) setError(err?.message || String(err))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    loadScene()
    return () => { cancelled = true }
  }, [isMultiScene, sceneDefinition, parsedTransitionMap, parseErrorsKey])

  // Load model when url changes
  useEffect(() => {
    if (!resolvedUrl || isMultiScene) return
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
  }, [resolvedUrl, ext, autoFitOnLoad, recenter, recenterThreshold, isMultiScene])

  const stateButtons = useMemo(() => {
    if (!multiSceneMeta?.stateOrder?.length) return []
    const map = multiSceneMeta.transitionMap || {}
    const activeKey = (currentState || multiSceneMeta.stateOrder[0] || 'start').toLowerCase()
    const reachable = new Set([activeKey, ...(map[activeKey] || [])])
    return multiSceneMeta.stateOrder.map((stateKey) => {
      const normalized = stateKey.toLowerCase()
      const label = multiSceneMeta.stateDisplayMap?.[normalized] || multiSceneMeta.stateDisplayMap?.[stateKey] || stateKey
      return {
        key: normalized,
        label,
        isActive: normalized === activeKey,
        isReachable: reachable.has(normalized),
      }
    })
  }, [multiSceneMeta, currentState])

  const currentStateLabel = useMemo(() => {
    if (!multiSceneMeta?.stateOrder?.length) return ''
    const key = (currentState || multiSceneMeta.stateOrder[0] || 'start').toLowerCase()
    return multiSceneMeta.stateDisplayMap?.[key] || key
  }, [multiSceneMeta, currentState])

  const handleStateChange = useCallback((targetKey) => {
    const normalized = (targetKey || '').toLowerCase()
    if (!normalized) return
    if (normalized === (currentState || '').toLowerCase()) return
    const viewer = viewerRef.current
    if (!viewer || typeof viewer.transitionMultiState !== 'function') return
    setIsTransitioning(true)
    const finalize = (started) => {
      if (started) {
        setCurrentState(normalized)
      } else {
        setIsTransitioning(false)
      }
    }
    try {
      const maybePromise = viewer.transitionMultiState(normalized, 900, () => {
        setIsTransitioning(false)
      })
      if (maybePromise && typeof maybePromise.then === 'function') {
        maybePromise.then(finalize).catch(() => {
          setIsTransitioning(false)
        })
      } else {
        finalize(true)
      }
    } catch (err) {
      setIsTransitioning(false)
      setError(err?.message || String(err))
    }
  }, [currentState])

  // Toggle recenter: swap geometry between original and centered (STL only)
  const toggleRecenter = () => {
    if (isSourceMaterialMode || isMultiScene) return
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
  const onToggleAxes = () => setVAxesVisible(v => !v)

  const canDownload = !!resolvedUrl && !isMultiScene

  const doDownload = async () => {
    if (!canDownload) return
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
            {canDownload && (
              <IconButton variant="soft" radius="full" onClick={doDownload} aria-label="Download">
                <Download size={18} />
              </IconButton>
            )}
            {!isMultiScene && isSourceMaterialMode && hasMultiParts && (
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
            axesHelperVisible={vAxesVisible}
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
              x: (!isSourceMaterialMode && !isMultiScene && recenterEnabled) ? -(offsetRef.current.x || 0) : 0,
              y: (!isSourceMaterialMode && !isMultiScene && recenterEnabled) ? -(offsetRef.current.y || 0) : 0,
              z: (!isSourceMaterialMode && !isMultiScene && recenterEnabled) ? -(offsetRef.current.z || 0) : 0,
            }}
          />
          {isMultiScene && multiSceneMeta?.stateOrder?.length > 0 && (
            <Box
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                bottom: 12,
                zIndex: 9,
                pointerEvents: 'auto',
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
              }}
            >
              {stateButtons.map((state) => (
                <Button
                  key={state.key}
                  variant={state.isActive ? 'solid' : state.isReachable ? 'surface' : 'soft'}
                  disabled={!state.isReachable || state.isActive || isTransitioning}
                  onClick={() => handleStateChange(state.key)}
                >
                  {state.label}
                </Button>
              ))}
            </Box>
          )}
          {viewTools && (
            <div style={{ position: 'absolute', top: 8, left: 8, zIndex: 9, paddingRight: 96 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', maxWidth: 'calc(100% - 96px)' }}>
                <Toolbar
                  spinMode={vSpinMode}
                  frameMode={vFrameMode}
                  shadingMode={vShadingMode}
                  originVisible={vOriginVisible}
                  axesVisible={vAxesVisible}
                  showCadControls={!isSourceMaterialMode}
                  onCycleSpin={onCycleSpin}
                  onToggleFrame={onToggleFrame}
                  onToggleShading={onToggleShading}
                  onToggleOrigin={onToggleOrigin}
                  onToggleAxes={onToggleAxes}
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
                  leading={(!isSourceMaterialMode && !isMultiScene) && (
                    <Button variant="solid" size="2" onClick={toggleRecenter} style={{ whiteSpace: 'nowrap' }}>
                      CENTER: {recenterEnabled ? 'ON' : 'OFF'}
                    </Button>
                  )}
                />
              </div>
              {!isSourceMaterialMode && !isMultiScene && (
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
        {renderedChildren && (
          <Box mt="3">{renderedChildren}</Box>
        )}
      </Box>
    </Card>
  )
})

export default ModelViewer
