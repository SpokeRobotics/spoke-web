'use client'

import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js'
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js'
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js'
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js'

const VISIBILITY_EASE_POWER = 1.5

const easeVisibilityOpacity = (fromOpacity, toOpacity, t) => {
  const start = typeof fromOpacity === 'number' ? fromOpacity : 0
  const end = typeof toOpacity === 'number' ? toOpacity : 0
  if (Math.abs(start - end) < 1e-6) return end
  const clampedT = Math.min(1, Math.max(0, t))
  if (start > end) {
    const eased = Math.pow(1 - clampedT, VISIBILITY_EASE_POWER)
    return end + (start - end) * eased
  }
  const eased = Math.pow(clampedT, VISIBILITY_EASE_POWER)
  return start + (end - start) * eased
}

const AXES_WIDGET_COLORS = {
  x: 0xff5555,
  y: 0x55ff55,
  z: 0x5591ff,
}

const AXES_WIDGET_BG_COLOR = 0x111418
const AXES_WIDGET_MARGIN_RATIO = 0.04
const AXES_WIDGET_SIZE_RATIO = 0.26
const AXES_OVERLAY_MIN_SIZE = 96
const AXES_OVERLAY_RATIO = 0.24

const configureArrowHelperMaterials = (arrow, { opacity = 1 } = {}) => {
  if (!arrow) return
  const apply = (obj) => {
    if (!obj || !obj.material) return
    const mat = obj.material
    if (Array.isArray(mat)) {
      mat.forEach((m) => {
        if (!m) return
        m.depthTest = false
        m.depthWrite = false
        m.transparent = opacity < 1 || m.transparent
        if (opacity < 1) m.opacity = opacity
      })
    } else {
      mat.depthTest = false
      mat.depthWrite = false
      if (opacity < 1) {
        mat.transparent = true
        mat.opacity = opacity
      }
    }
  }
  apply(arrow.line)
  apply(arrow.cone)
}

const createLabelSprite = (text, colorHex, disposersRef) => {
  const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null
  let texture
  let material
  if (canvas) {
    const scale = 2
    canvas.width = 128 * scale
    canvas.height = 64 * scale
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = 'rgba(12, 15, 18, 0.7)'
    ctx.fillRect(0, canvas.height / 4, canvas.width, canvas.height / 2)
    ctx.font = `${40 * scale}px "Inter", "Segoe UI", sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = '#ffffff'
    ctx.fillText(text, canvas.width / 2, canvas.height / 2)
    texture = new THREE.CanvasTexture(canvas)
    texture.anisotropy = 4
    texture.needsUpdate = true
    material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false })
  } else {
    material = new THREE.SpriteMaterial({ color: colorHex, depthTest: false, depthWrite: false })
  }
  const sprite = new THREE.Sprite(material)
  sprite.center.set(0.5, 0.5)
  sprite.scale.set(0.75, 0.35, 1)
  if (disposersRef) {
    disposersRef.current.push(() => {
      if (texture) texture.dispose()
      material.dispose?.()
    })
  }
  return sprite
}

const createRotationArc = (axis, colorHex, disposersRef) => {
  const group = new THREE.Group()
  const radius = 0.55
  const arc = Math.PI * 1.35
  const segments = 48
  const points = []
  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments
    const theta = t * arc
    let x = 0
    let y = 0
    let z = 0
    if (axis === 'x') {
      y = Math.cos(theta) * radius
      z = Math.sin(theta) * radius
    } else if (axis === 'y') {
      x = Math.sin(theta) * radius
      z = Math.cos(theta) * radius
    } else {
      x = Math.cos(theta) * radius
      y = Math.sin(theta) * radius
    }
    points.push(new THREE.Vector3(x, y, z))
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points)
  const material = new THREE.LineBasicMaterial({ color: colorHex, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })
  const line = new THREE.Line(geometry, material)
  group.add(line)

  const end = points[points.length - 1].clone()
  const prev = points[points.length - 2].clone()
  const tangent = end.clone().sub(prev).normalize()
  const arrow = new THREE.ArrowHelper(tangent, end, 0.18, colorHex, 0.12, 0.08)
  configureArrowHelperMaterials(arrow, { opacity: 0.95 })
  group.add(arrow)

  if (disposersRef) {
    disposersRef.current.push(() => {
      geometry.dispose()
      material.dispose()
      arrow.line.geometry.dispose?.()
      arrow.line.material.dispose?.()
      arrow.cone.geometry.dispose?.()
      arrow.cone.material.dispose?.()
    })
  }
  return group
}

const createAxesWidget = (disposersRef) => {
  const scene = new THREE.Scene()
  scene.autoUpdate = true
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 10)
  camera.position.set(0, 0, 3)
  camera.lookAt(0, 0, 0)

  const root = new THREE.Group()
  scene.add(root)

  const backgroundMaterial = new THREE.MeshBasicMaterial({ color: AXES_WIDGET_BG_COLOR, transparent: true, opacity: 0.55, depthWrite: false, depthTest: false })
  const background = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), backgroundMaterial)
  background.position.set(0, 0, -0.8)
  root.add(background)
  if (disposersRef) {
    disposersRef.current.push(() => {
      background.geometry.dispose()
      background.material.dispose()
    })
  }

  const origin = new THREE.Vector3(0, 0, 0)
  const axisLength = 0.9
  const headLength = 0.24
  const headWidth = 0.12

  const xArrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), origin, axisLength, AXES_WIDGET_COLORS.x, headLength, headWidth)
  const yArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), origin, axisLength, AXES_WIDGET_COLORS.y, headLength, headWidth)
  const zArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), origin, axisLength, AXES_WIDGET_COLORS.z, headLength, headWidth)
  ;[xArrow, yArrow, zArrow].forEach((arrow) => {
    configureArrowHelperMaterials(arrow)
    root.add(arrow)
    if (disposersRef) {
      disposersRef.current.push(() => {
        arrow.line.geometry.dispose?.()
        arrow.line.material.dispose?.()
        arrow.cone.geometry.dispose?.()
        arrow.cone.material.dispose?.()
      })
    }
  })

  const labelOffset = axisLength + 0.32
  const xLabel = createLabelSprite('+X', '#ffffff', disposersRef)
  xLabel.position.set(labelOffset, 0, 0)
  const yLabel = createLabelSprite('+Y', '#ffffff', disposersRef)
  yLabel.position.set(0, labelOffset, 0)
  const zLabel = createLabelSprite('+Z', '#ffffff', disposersRef)
  zLabel.position.set(0, 0, labelOffset)
  root.add(xLabel)
  root.add(yLabel)
  root.add(zLabel)

  const debugDot = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 24), new THREE.MeshBasicMaterial({ color: 0xff00ff, depthTest: false, depthWrite: false }))
  debugDot.position.set(0, 0, 0)
  root.add(debugDot)
  if (disposersRef) {
    disposersRef.current.push(() => {
      debugDot.geometry.dispose()
      debugDot.material.dispose()
    })
  }

  const rxArc = createRotationArc('x', AXES_WIDGET_COLORS.x, disposersRef)
  const ryArc = createRotationArc('y', AXES_WIDGET_COLORS.y, disposersRef)
  const rzArc = createRotationArc('z', AXES_WIDGET_COLORS.z, disposersRef)
  root.add(rxArc)
  root.add(ryArc)
  root.add(rzArc)

  const rxLabel = createLabelSprite('+Rx', '#ffffff', disposersRef)
  rxLabel.position.set(0, 0.65, 0.4)
  const ryLabel = createLabelSprite('+Ry', '#ffffff', disposersRef)
  ryLabel.position.set(0.4, 0.65, 0)
  const rzLabel = createLabelSprite('+Rz', '#ffffff', disposersRef)
  rzLabel.position.set(0.65, 0.0, 0.4)
  root.add(rxLabel)
  root.add(ryLabel)
  root.add(rzLabel)

  const ambient = new THREE.AmbientLight(0xffffff, 0.9)
  const directional = new THREE.DirectionalLight(0xffffff, 0.8)
  directional.position.set(2.5, 2, 3.5)
  scene.add(ambient)
  scene.add(directional)

  return { scene, camera, root }
}

const AXES_TMP_BUFFER_SIZE = new THREE.Vector2()
const AXES_TMP_QUAT_MODEL = new THREE.Quaternion()
const AXES_TMP_QUAT_CAMERA = new THREE.Quaternion()
const AXES_TMP_VIEWPORT = new THREE.Vector4()
const AXES_TMP_SCISSOR = new THREE.Vector4()

// frameMode: 'HIDE' | 'LIGHT' | 'DARK'
// shadingMode: 'GRAY' | 'CREAM' | 'WHITE' | 'DARK' | 'BLACK' | 'OFF'
export const ThreeCadViewer = forwardRef(function ThreeCadViewer(
  {
    spinEnabled = true,
    spinMode = 'auto',
    frameMode = 'HIDE',
    shadingMode = 'GRAY',
    originVisible = false,
    axesHelperVisible = false,
    resize,
    styleMode = 'BASIC',
    backgroundMode = 'WHITE',
    outlineThreshold = 45,
    outlineScale = 1.02,
    edgesMode = 'AUTO',
    outlineColorMode = 'AUTO',
    edgesLineWidth = 2,
    ambientLevel = 2.0,
    directionalLevel = 2.0,
    originOffset = { x: 0, y: 0, z: 0 },
    useSourceMaterials = false,
    targetHelperVisible = false,
    boundingBoxesVisible = false,
    modelCenterVisible = false,
    autoCenterTarget = false,
    autoFitOnResize = false,
    frameScreenBias = { x: 0, y: 0 }, // normalized screen fraction offsets, +y moves target up on screen
  },
  ref
) {
  const containerRef = useRef(null)
  const rendererRef = useRef(null)
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const rafRef = useRef(0)
  const isVisibleRef = useRef(true)       // container in viewport (IntersectionObserver)
  const isDocVisibleRef = useRef(true)    // page/tab visibility
  const isActiveRef = useRef(true)        // derived: should we render/animate?
  const modelGroupRef = useRef(null) // holds polygon model (single-mode root)
  const wireframeRef = useRef(null)  // holds wireframe overlay
  const edgesRef = useRef(null)      // holds edges/outline overlay
  const outlineRef = useRef(null)    // holds silhouette backface meshes
  const spinRef = useRef(spinEnabled)
  const spinModeRef = useRef(spinMode || (spinEnabled ? 'on' : 'off'))
  const pauseUntilRef = useRef(0)
  const pauseTimerRef = useRef(null)
  const axesRef = useRef(null) // origin axes helper
  const systemOriginAxesRef = useRef(null) // large system origin crosshair
  const axesWidgetRef = useRef(null)
  const axesWidgetCameraRef = useRef(null)
  const axesWidgetResourcesRef = useRef({ current: [] })
  const axesVisibilityRef = useRef(!!axesHelperVisible)
  const axesRendererRef = useRef(null)
  const axesCanvasRef = useRef(null)
  const overlayCenterRef = useRef(null) // DOM crosshair at viewport center
  const overlayTargetRef = useRef(null) // DOM dot at projected controls.target
  const overlayHelperRef = useRef(null) // DOM dot at projected helper position
  const lastDebugLogRef = useRef(0) // throttle debug logs

  // Helper: print canvas/camera metrics to console
  const logMetrics = (tag = 'tick') => {
    try {
      const container = containerRef.current
      const renderer = rendererRef.current
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!container || !renderer || !camera || !controls) return
      const elem = renderer.domElement
      const rect = elem?.getBoundingClientRect?.() || { width: 0, height: 0, left: 0, top: 0 }
      const cw = elem?.clientWidth || 0
      const ch = elem?.clientHeight || 0
      const attrW = elem?.width || 0
      const attrH = elem?.height || 0
      const contW = container?.clientWidth || 0
      const contH = container?.clientHeight || 0
      const pr = renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1)
      const dpr = (window.devicePixelRatio || 1)
      const db = (renderer.getDrawingBufferSize ? renderer.getDrawingBufferSize(AXES_TMP_BUFFER_SIZE) : { x: 0, y: 0 })
      const camAspect = camera.aspect
      const domAspect = (cw && ch) ? (cw / ch) : 0
      const ndc = controls.target.clone().project(camera)
      const px = (ndc.x * 0.5 + 0.5) * (cw || contW || 1)
      const py = (-ndc.y * 0.5 + 0.5) * (ch || contH || 1)
      console.log('[ThreeCadViewer] metrics', tag, {
        container: { w: contW, h: contH },
        canvasClient: { w: cw, h: ch },
        canvasAttr: { w: attrW, h: attrH },
        canvasRect: { w: Math.round(rect.width), h: Math.round(rect.height), left: Math.round(rect.left), top: Math.round(rect.top) },
        drawingBuffer: { w: db?.x || 0, h: db?.y || 0 },
        pixelRatio: pr, devicePixelRatio: dpr,
        aspect: { camera: Number(camAspect.toFixed(5)), dom: Number(domAspect.toFixed(5)) },
        target: { world: controls.target.clone(), ndc: ndc.clone(), px: Math.round(px), py: Math.round(py) },
      })
    } catch {}
  }
  const boundingBoxesVisibleRef = useRef(!!boundingBoxesVisible)
  const boundingBoxesRef = useRef([])
  const boundingBoxesDirtyRef = useRef(false)
  const autoCenterTargetRef = useRef(!!autoCenterTarget)
  const lastSizeRef = useRef({ w: 0, h: 0 })
  const debounceRef = useRef(0)
  const envRTRef = useRef(null)      // environment render target (PMREM)
  const pmremRef = useRef(null)      // PMREMGenerator
  const lightRigRef = useRef([])     // style-managed lights
  const toonTexRef = useRef(null)    // gradient map for toon
  const matcapTexRef = useRef(null)  // generated matcap
  const composerRef = useRef(null)   // post-processing composer
  const smaaPassRef = useRef(null)   // SMAA pass
  const initializedRef = useRef(false) // guard against double-init in StrictMode/HMR
  const lineResolutionRef = useRef(new THREE.Vector2(1, 1)) // for LineMaterial
  const bgRef = useRef({})           // background resources for cleanup
  const useSourceMaterialsRef = useRef(!!useSourceMaterials)
  const explodedRef = useRef(false)
  const multiSceneRef = useRef({ active: false, sceneGroup: null, models: [], states: {}, displayNames: {}, transitionMap: {}, currentState: null, stateOrder: [] })
  const animationRef = useRef({ playing: false, start: 0, duration: 0, fromState: null, toState: null, mixers: [], onComplete: null })
  const userInteractedRef = useRef(false)
  const pendingReframeRef = useRef(false)
  // Helper visibility and meshes
  const targetHelperVisibleRef = useRef(!!targetHelperVisible)
  const modelCenterVisibleRef = useRef(!!modelCenterVisible)
  const targetHelperMeshRef = useRef(null)
  const centerHelperMeshRef = useRef(null)

  const resetAnimation = () => {
    const anim = animationRef.current
    anim.playing = false
    anim.start = 0
    anim.duration = 0
    anim.fromState = null
    anim.toState = null
    anim.mixers = []
    anim.onComplete = null
  }

  const ensureQuaternion = (obj) => {
    if (!obj.quaternion) obj.quaternion = new THREE.Quaternion()
    return obj.quaternion
  }

  // Compute bounding box for the base model meshes only (exclude adorners and axes)
  const getModelBounds = () => {
    const group = modelGroupRef.current
    if (!group) return new THREE.Box3()
    const wireG = wireframeRef.current
    const edgesG = edgesRef.current
    const outlineG = outlineRef.current
    const axesG = axesRef.current
    const box = new THREE.Box3()
    group.traverse((obj) => {
      if (!obj.isMesh) return
      // Exclude adorners and axes by checking ancestry
      let p = obj.parent
      while (p) {
        if (p === wireG || p === edgesG || p === outlineG || p === axesG) return
        p = p.parent
      }
      box.expandByObject(obj)
    })
    return box
  }

  const createTargetHelper = () => {
    // World-space sprite anchored at controls.target for robust visibility
    const material = new THREE.SpriteMaterial({ color: 0xff00ff, depthTest: false, depthWrite: false, opacity: 0.95, transparent: true })
    const sprite = new THREE.Sprite(material)
    sprite.userData.__isTargetHelper = true
    sprite.center.set(0.5, 0.5)
    sprite.renderOrder = 10
    // start with unit scale; we will scale per-frame to maintain screen size
    sprite.scale.set(1, 1, 1)
    return sprite
  }

  const createModelCenterHelper = () => {
    const sphereGeo = new THREE.SphereGeometry(0.5, 16, 16)
    const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffd400, transparent: true, opacity: 0.85, depthTest: false, depthWrite: false })
    const mesh = new THREE.Mesh(sphereGeo, sphereMat)
    mesh.renderOrder = 9
    mesh.userData.__isModelCenterHelper = true
    mesh.raycast = () => {}
    return mesh
  }

  const createBoundingBoxHelper = (object, color = 0x00fff5) => {
    if (!object) return null
    const helper = new THREE.BoxHelper(object, color)
    helper.material.transparent = true
    helper.material.opacity = 0.7
    helper.material.depthTest = false
    helper.material.depthWrite = false
    helper.userData.__isBoundingBoxHelper = true
    return helper
  }

  const clearBoundingBoxes = () => {
    const boxes = boundingBoxesRef.current || []
    boxes.forEach((helper) => {
      if (!helper) return
      if (helper.parent) helper.parent.remove(helper)
      if (Array.isArray(helper.material)) helper.material.forEach((m) => m?.dispose?.())
      else helper.material?.dispose?.()
      helper.geometry?.dispose?.()
    })
    boundingBoxesRef.current = []
    boundingBoxesDirtyRef.current = false
  }

  const markBoundingBoxesDirty = () => {
    boundingBoxesDirtyRef.current = true
  }

  const rebuildBoundingBoxes = () => {
    boundingBoxesDirtyRef.current = false
    clearBoundingBoxes()
    if (!boundingBoxesVisibleRef.current) return
    const scene = sceneRef.current
    if (!scene) return
    const boxes = []
    const multi = multiSceneRef.current
    if (multi?.active) {
      (multi.models || []).forEach((container) => {
        if (!container || container.visible === false) return
        const target = container.userData?.__modelRoot || container
        if (!target) return
        const helper = createBoundingBoxHelper(target)
        if (!helper) return
        helper.userData.__target = target
        // Attach to scene root to avoid inheriting transforms (double-rotation)
        scene.add(helper)
        helper.matrixAutoUpdate = true
        helper.update(target)
        boxes.push(helper)
      })
    } else {
      const group = modelGroupRef.current
      if (group) {
        const wireG = wireframeRef.current
        const edgesG = edgesRef.current
        const outlineG = outlineRef.current
        const axesG = axesRef.current
        group.children.forEach((child) => {
          if (child === wireG || child === edgesG || child === outlineG || child === axesG) return
          const helper = createBoundingBoxHelper(child)
          if (!helper) return
          helper.userData.__target = child
          // Attach to scene root to avoid inheriting transforms
          scene.add(helper)
          helper.matrixAutoUpdate = true
          helper.update(child)
          boxes.push(helper)
        })
      }
    }
    boundingBoxesRef.current = boxes
  }

  const rebuildMultiSceneBounds = () => {
    const multi = multiSceneRef.current
    const models = multi?.models || []
    // console.log('[ThreeCadViewer] rebuildMultiSceneBounds - models count:', models.length)
    const padded = new THREE.Box3()
    const rotatedCenter = new THREE.Vector3()
    let initialized = false
    
    // If scroll animation is enabled, use only the target state for bounds
    const scrollConfig = multi?.scrollAnimationConfig
    const useTargetStateOnly = scrollConfig?.enabled && scrollConfig?.targetState
    
    models.forEach((container, idx) => {
      if (!container) return
      const states = container.userData?.__states || {}
      const localCenter = container.userData?.__localBoundCenter || new THREE.Vector3()
      const localRadius = container.userData?.__localBoundRadius ?? 50
      const stateKeys = Object.keys(states)
      console.log('[ThreeCadViewer] Model', idx, 'has', stateKeys.length, 'states:', stateKeys, 'localRadius:', localRadius)
      
      if (useTargetStateOnly) {
        // For scroll animation: only use objects that are visible (opacity > 0) in the target state
        const targetState = states[scrollConfig.targetState]
        if (!targetState) {
          console.warn('[rebuildMultiSceneBounds] No state found for:', scrollConfig.targetState, 'Available:', Object.keys(states))
          return
        }
        // Check if object is visible in target state (opacity > 0)
        const opacity = typeof targetState.opacity === 'number' ? targetState.opacity : 1
        if (opacity <= 0.001) {
          return // Skip invisible objects
        }
        // Use target state position
        rotatedCenter.copy(localCenter).applyQuaternion(targetState.quaternion).add(targetState.position)
        const radius = Math.max(localRadius, 0.0001)
        const min = new THREE.Vector3(rotatedCenter.x - radius, rotatedCenter.y - radius, rotatedCenter.z - radius)
        const max = new THREE.Vector3(rotatedCenter.x + radius, rotatedCenter.y + radius, rotatedCenter.z + radius)
        if (!initialized) {
          padded.min.copy(min)
          padded.max.copy(max)
          initialized = true
        } else {
          padded.min.min(min)
          padded.max.max(max)
        }
      } else {
        // Normal mode: use all states
        Object.values(states).forEach((state) => {
          if (!state) return
          rotatedCenter.copy(localCenter).applyQuaternion(state.quaternion).add(state.position)
          const radius = Math.max(localRadius, 0.0001)
          const min = new THREE.Vector3(rotatedCenter.x - radius, rotatedCenter.y - radius, rotatedCenter.z - radius)
          const max = new THREE.Vector3(rotatedCenter.x + radius, rotatedCenter.y + radius, rotatedCenter.z + radius)
          if (!initialized) {
            padded.min.copy(min)
            padded.max.copy(max)
            initialized = true
          } else {
            padded.min.min(min)
            padded.max.max(max)
          }
        })
      }
    })
    if (!initialized) {
      // No objects: use 100mm cube to ensure proper camera positioning
      // console.warn('[ThreeCadViewer] rebuildMultiSceneBounds - no objects initialized, using fallback')
      padded.setFromCenterAndSize(new THREE.Vector3(0, 0, 0), new THREE.Vector3(100, 100, 100))
    }
    // Store the computed bounds directly without any padding manipulation
    if (multi) {
      const size = padded.getSize(new THREE.Vector3())
      const center = padded.getCenter(new THREE.Vector3())
      // console.log('[ThreeCadViewer] rebuildMultiSceneBounds - final bounds size:', size, 'center:', center)
      multi.paddedBounds = padded.clone()
      multi.paddedCenter = center
      multi.paddedSphere = new THREE.Sphere(center.clone(), size.length() / 2)
    }
    return padded
  }

  const computeMultiSceneBounds = () => {
    const multi = multiSceneRef.current
    if (multi?.paddedBounds) return multi.paddedBounds.clone()
    return rebuildMultiSceneBounds().clone()
  }

  const refreshCurrentMultiBounds = () => {
    const multi = multiSceneRef.current
    if (!multi?.active) return null
    
    const models = multi.models || []
    const sceneGroup = multi.sceneGroup
    sceneGroup?.updateMatrixWorld(true)
    const box = new THREE.Box3()
    const tempBox = new THREE.Box3()
    let initialized = false
    
    // Check if scroll animation is enabled to filter by opacity
    const scrollConfig = multi?.scrollAnimationConfig
    const filterByOpacity = scrollConfig?.enabled && scrollConfig?.targetState
    
    models.forEach((container) => {
      if (!container) return
      
      // For scroll animations, we need to use target state positions
      if (filterByOpacity) {
        const states = container.userData?.__states || {}
        const targetState = states[scrollConfig.targetState]
        if (!targetState) return
        
        const opacity = typeof targetState.opacity === 'number' ? targetState.opacity : 1
        if (opacity <= 0.001) {
          return // Skip invisible objects
        }
        
        // Use stored local bounds (geometry in its own coordinate system) 
        // and transform to target state absolute position
        const modelRoot = container.userData?.__modelRoot
        if (modelRoot) {
          // Save current transforms
          const savedPosition = container.position.clone()
          const savedQuaternion = container.quaternion.clone()
          const savedScale = container.scale.clone()
          
          // Reset to origin to get local bounds
          container.position.set(0, 0, 0)
          container.quaternion.set(0, 0, 0, 1)
          container.scale.set(1, 1, 1)
          container.updateMatrixWorld(true)
          
          tempBox.makeEmpty()
          tempBox.setFromObject(modelRoot)
          
          // Restore original transforms
          container.position.copy(savedPosition)
          container.quaternion.copy(savedQuaternion)
          container.scale.copy(savedScale)
          container.updateMatrixWorld(true)
          
          // Now transform local bounds to target state absolute position
          const matrix = new THREE.Matrix4()
          matrix.compose(targetState.position, targetState.quaternion, new THREE.Vector3(1, 1, 1))
          tempBox.applyMatrix4(matrix)
        }
      } else {
        // Non-scroll: Use current scene positions
        tempBox.makeEmpty()
        const modelRoot = container.userData?.__modelRoot
        if (modelRoot) {
          modelRoot.updateMatrixWorld(true)
          tempBox.setFromObject(modelRoot)
        } else {
          tempBox.setFromObject(container)
        }
      }
      
      if (tempBox.isEmpty()) return
      if (!initialized) {
        box.copy(tempBox)
        initialized = true
      } else {
        box.union(tempBox)
      }
    })
    if (!initialized) {
      // Fallback: if nothing contributed (e.g., all invisible), use padded/cached bounds
      const padded = computeMultiSceneBounds()
      return padded
    }
    const center = box.getCenter(new THREE.Vector3())
    const radius = box.getSize(new THREE.Vector3()).length() / 2
    multi.currentBounds = box.clone()
    multi.currentCenter = center.clone()
    multi.currentSphere = new THREE.Sphere(center.clone(), radius)
    return box
  }

  const frameMultiScene = () => {
    const multi = multiSceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (!multi?.active || !camera || !controls) return
    const currentBox = refreshCurrentMultiBounds() || computeMultiSceneBounds()
    const boxSize = currentBox.getSize(new THREE.Vector3())
    const center = multi.currentCenter ? multi.currentCenter.clone() : currentBox.getCenter(new THREE.Vector3())
    const sphere = multi.currentSphere || new THREE.Sphere(center.clone(), currentBox.getSize(new THREE.Vector3()).length() / 2)
    try { console.debug('[ThreeCadViewer] frame:start', { size: { x: Number(boxSize.x.toFixed(2)), y: Number(boxSize.y.toFixed(2)), z: Number(boxSize.z.toFixed(2)) }, center: { x: Number(center.x.toFixed(2)), y: Number(center.y.toFixed(2)), z: Number(center.z.toFixed(2)) } }) } catch {}
    
    // Determine viewing direction
    // If the user has interacted, preserve their orientation.
    // Otherwise, adapt elevation to the model's aspect ratio (flatter models => lower elevation).
    let dir
    if (userInteractedRef.current) {
      const prevTarget = controls.target.clone()
      dir = new THREE.Vector3().subVectors(camera.position, prevTarget)
      if (!isFinite(dir.x) || !isFinite(dir.y) || !isFinite(dir.z) || dir.lengthSq() < 1e-8) {
        dir.set(1, 0.8, 1)
      }
      dir.normalize()
    } else {
      const hx = Math.max(1e-6, boxSize.x)
      const hy = Math.max(1e-6, boxSize.y)
      const hz = Math.max(1e-6, boxSize.z)
      const horiz = Math.max(hx, hz)
      let elev = 0.25 + 0.6 * (hy / horiz)
      elev = Math.min(0.85, Math.max(0.25, elev))
      dir = new THREE.Vector3(1, elev, 1).normalize()
    }
    
    // Set target, compute distance, and reposition along preserved direction
    controls.target.copy(center)
    const distance = Math.max(computeFitDistance(currentBox, camera, 0.75), 0.1)
    camera.position.copy(dir.multiplyScalar(distance).add(center))

    // Apply screen-space bias so the projected target lands away from exact center if requested
    try {
      const bias = frameScreenBias || { x: 0, y: 0 }
      const bx = Number(bias.x) || 0
      const by = Number(bias.y) || 0
      if (bx !== 0 || by !== 0) {
        // Build camera basis vectors
        const cam = camera
        const z = new THREE.Vector3().subVectors(cam.position, controls.target).normalize() // view dir
        const x = new THREE.Vector3().crossVectors(cam.up, z).normalize() // screen-right
        const y = new THREE.Vector3().crossVectors(z, x).normalize()      // screen-up
        // Convert normalized screen bias to world units at target depth
        const vFov = THREE.MathUtils.degToRad(cam.fov)
        const halfHeight = Math.tan(vFov / 2) * distance
        const halfWidth = halfHeight * cam.aspect
        const offset = new THREE.Vector3()
        offset.addScaledVector(x, bx * 2 * halfWidth)
        offset.addScaledVector(y, by * 2 * halfHeight)
        controls.target.add(offset)
      }
    } catch {}
    
    // Ensure camera is looking at OrbitControls.target (not a stale center value)
    camera.lookAt(controls.target)
    camera.updateProjectionMatrix()
    controls.update()
    adjustCameraPlanes(currentBox)
    try { console.debug('[ThreeCadViewer] frame:end', { camera: { x: Number(camera.position.x.toFixed(2)), y: Number(camera.position.y.toFixed(2)), z: Number(camera.position.z.toFixed(2)) }, target: { x: Number(controls.target.x.toFixed(2)), y: Number(controls.target.y.toFixed(2)), z: Number(controls.target.z.toFixed(2)) } }) } catch {}
    // Emit per-refit metrics to observe viewport/aspect and target projection after model replacement
    try { logMetrics('refit') } catch {}
  }

  const getActiveBounds = () => {
    const multi = multiSceneRef.current
    if (multi && multi.active) {
      if (multi.currentBounds) return multi.currentBounds.clone()
      return computeMultiSceneBounds()
    }
    return getModelBounds()
  }

  // Loop control helpers are defined inside the init effect where `tick` exists.

  // Compute a camera distance so the model's bounding SPHERE fills ~fillFrac of the viewport.
  // Using a sphere makes the fit invariant to rotation/spin.
  const computeFitDistance = (box, camera, fillFrac = 0.9) => {
    const size = box.getSize(new THREE.Vector3())
    const diag = Math.max(0.0001, size.length())
    const R = diag / 2 // sphere radius
    const vFov = (camera.fov * Math.PI) / 180
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect)
    const frac = Math.max(0.5, Math.min(0.97, fillFrac))
    // For sphere diameter 2R to fit within frac*height or frac*width at depth d:
    // height = 2 d tan(vFov/2); width = 2 d tan(hFov/2)
    // => d >= R / (frac * tan(fov/2)) for each axis.
    const dV = R / (frac * Math.tan(vFov / 2))
    const dH = R / (frac * Math.tan(hFov / 2))
    const distance = Math.max(dV, dH) * 1.01 // minimal padding
    const cameraMinDistance = camera.near * 2
    return Math.max(distance, cameraMinDistance)
  }

  // helper to apply shading to current model group
  const applyShading = (mode) => {
    const group = modelGroupRef.current
    const edgesGroup = edgesRef.current
    const outlineGroup = outlineRef.current
    if (!group) return
    // If using model-provided materials, do not override them
    if (useSourceMaterialsRef.current) {
      // Ensure adorners are hidden when using source materials
      if (edgesGroup) edgesGroup.visible = false
      if (outlineGroup) outlineGroup.visible = false
      // Still ensure base meshes visible
      group.traverse((obj) => { if (obj.isMesh) obj.visible = true })
      return
    }
    // Local helper to check ancestry without relying on outer scope
    const isDescendantOf = (node, ancestor) => {
      if (!node || !ancestor) return false
      let p = node.parent
      while (p) { if (p === ancestor) return true; p = p.parent }
      return false
    }

    // (moved edgesLineWidth effect out of this function; hooks cannot be called here)
    // For OFF: hide only base meshes so adorners can remain visible
    if (mode === 'OFF') {
      // Force outline hidden when shading is OFF
      if (outlineGroup) outlineGroup.visible = false
      group.traverse((obj) => {
        if (obj.isMesh) {
          // Keep silhouette meshes (in outline group) visible if outline is enabled
          if (isDescendantOf(obj, outlineGroup)) return
          // Hide base meshes
          obj.visible = false
        }
      })
      return
    }
    // For normal shaded modes, ensure base meshes visible and set their material
    group.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        // Skip outline backfaces; only update base meshes
        if (isDescendantOf(obj, outlineGroup)) return
        obj.visible = true
        const mat = obj.material
        if (mode === 'BLACK') {
          mat.color.setHex(0x000000)
          mat.opacity = 1
          mat.transparent = false
          // suppress specular/reflections for true black
          if ('metalness' in mat) mat.metalness = 0
          if ('roughness' in mat) mat.roughness = 1
          if ('clearcoat' in mat) mat.clearcoat = 0
          if ('envMapIntensity' in mat) mat.envMapIntensity = 0
        } else if (mode === 'DARK') {
          // Off-black plastic (lighter than true black for detail)
          mat.color.setHex(0x2B2B2B)
          mat.opacity = 1
          mat.transparent = false
          if ('metalness' in mat) mat.metalness = 0
          if ('roughness' in mat) mat.roughness = 0.95
          if ('clearcoat' in mat) mat.clearcoat = 0
          if ('envMapIntensity' in mat) mat.envMapIntensity = 0.1
        } else if (mode === 'WHITE') {
          mat.color.setHex(0xffffff)
          mat.opacity = 1
          mat.transparent = false
        } else if (mode === 'CREAM') {
          // Very light off-white plastic (reduced yellow)
          mat.color.setHex(0xF2F1EC)
          mat.opacity = 1
          mat.transparent = false
          // Slightly reduce metalness and increase roughness for plastic feel
          if ('metalness' in mat) mat.metalness = 0.05
          if ('roughness' in mat) mat.roughness = 0.9
        } else { // GRAY
          mat.color.setHex(0xe0e0e0)
          mat.opacity = 1
          mat.transparent = false
        }
        mat.needsUpdate = true
      }
    })
  }

  // init Three
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    // Prevent double-initialization in React StrictMode/HMR
    if (initializedRef.current) return
    initializedRef.current = true

    // Defensive: clear any existing children/canvas to avoid multiple contexts (HMR/remounts)
    while (container.firstChild) {
      try { container.removeChild(container.firstChild) } catch {}
    }

    const scene = new THREE.Scene()
    // background set in applyStyle + applyBackground

    // Camera setup
    // - We use a single PerspectiveCamera owned by this viewer
    // - The camera's projection matrix (fov/aspect/near/far) is updated on resize and when fit operations occur
    // - IMPORTANT: In the render loop we always call controls.update() first, and then aim the camera at controls.target via camera.lookAt(target)
    //   so that the optical axis passes through OrbitControls.target. Anything rendered exactly at controls.target should project to screen center.
    const camera = new THREE.PerspectiveCamera(60, container.clientWidth / container.clientHeight, 0.05, 5000)
    camera.position.set(6, 6, 6)
    camera.lookAt(0, 0, 0)

    // Create a fresh WebGLRenderer and let Three manage the context (most stable across environments)
    let renderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' })
    } catch (e) {
      // Graceful fallback: show an inline error and abort init to avoid page crash
      const msg = document.createElement('div')
      msg.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:12px;background:var(--red-3, #fee);color:var(--red-11, #b00);font:600 13px/1.4 system-ui, sans-serif;border:1px solid var(--red-6, #fcc)'
      msg.textContent = '3D viewer failed to initialize WebGL on this page.'
      container.appendChild(msg)
      // Allow re-initialization on next render attempt
      initializedRef.current = false
      return () => { try { container.removeChild(msg) } catch {} }
    }
    // Allow higher device pixel ratio to improve visual quality on dense displays
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 3))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    // Size the drawing buffer and CSS style to match container
    renderer.setSize(container.clientWidth, container.clientHeight, true)
    // Insert renderer's canvas into the container
    container.appendChild(renderer.domElement)
    // Force canvas to stretch to container both width and height
    if (renderer.domElement && renderer.domElement.style) {
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      renderer.domElement.style.display = 'block'
      renderer.domElement.style.position = 'absolute'
      // ensure full fill regardless of other CSS
      renderer.domElement.style.inset = '0'
      // override typography rules like .prose canvas { max-width: 900px; margin: 16px auto }
      renderer.domElement.style.maxWidth = 'none'
      renderer.domElement.style.margin = '0'
    }

    // AXES OVERLAY DISABLED: keep references null so overlay renderer is inactive
    axesRendererRef.current = null
    axesCanvasRef.current = null

    // Initialize line resolution immediately to avoid first-frame fat-quad artifacts
    {
      const w = Math.max(1, container.clientWidth)
      const h = Math.max(1, container.clientHeight)
      const pr = renderer.getPixelRatio ? renderer.getPixelRatio() : (window.devicePixelRatio || 1)
      lineResolutionRef.current.set(w * pr, h * pr)
    }

    // Enforce normal block layout and ensure stretching inside flex parents
    container.style.display = 'block'
    container.style.position = 'relative'
    container.style.width = '100%'
    container.style.height = '100%'
    container.style.minWidth = '0'
    container.style.minHeight = '0'
    container.style.flex = '1 1 auto'
    container.style.alignSelf = 'stretch'

    // Debug overlays removed

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.1
    controls.rotateSpeed = 0.8

    // lights created per-style in applyStyle

    // groups
    const modelGroup = new THREE.Group()
    const wireGroup = new THREE.Group()
    const edgesGroup = new THREE.Group()
    const outlineGroup = new THREE.Group()
    scene.add(modelGroup)
    // Parent adorners to the main model group so they follow transforms
    modelGroup.add(wireGroup)
    modelGroup.add(edgesGroup)
    modelGroup.add(outlineGroup)
    const multiSceneGroup = new THREE.Group()
    scene.add(multiSceneGroup)
    // Initial visibility: edges follow edgesMode (hidden when OFF)
    edgesGroup.visible = (edgesMode !== 'OFF')

    // placeholder cube as initial model
    const geom = new THREE.BoxGeometry(2, 2, 2)
    const mat = new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.1, roughness: 0.8 })
    const mesh = new THREE.Mesh(geom, mat)
    modelGroup.add(mesh)

    const wfGeo0 = new THREE.WireframeGeometry(geom)
    const wfSegGeo0 = new LineSegmentsGeometry()
    wfSegGeo0.setPositions(wfGeo0.attributes.position.array)
    const wfMat0 = new LineMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, linewidth: 1.25, depthTest: true, depthWrite: false })
    wfMat0.resolution.copy(lineResolutionRef.current)
    const wire = new LineSegments2(wfSegGeo0, wfMat0)
    wireGroup.add(wire)

    // save refs
    sceneRef.current = scene
    cameraRef.current = camera
    rendererRef.current = renderer
    controlsRef.current = controls
    modelGroupRef.current = modelGroup
    wireframeRef.current = wireGroup
    edgesRef.current = edgesGroup
    outlineRef.current = outlineGroup
    multiSceneRef.current.sceneGroup = multiSceneGroup

    // Origin axes helper attached to model group so it inherits transforms
    // Use unit length; we'll scale to desired world lengths per axis
    const axes = new THREE.AxesHelper(1)
    axes.visible = !!originVisible
    modelGroup.add(axes)
    // Initialize position from originOffset (model-local)
    if (originOffset) {
      const o = originOffset || { x: 0, y: 0, z: 0 }
      axes.position.set(Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0)
    }
    axesRef.current = axes

    // System origin axes - large crosshair at 0,0,0 in the model's coordinate frame
    // Add to multiSceneGroup so it rotates with the model during spin
    const systemOriginAxes = new THREE.AxesHelper(500) // Very long axes
    systemOriginAxes.visible = !!axesHelperVisible
    multiSceneGroup.add(systemOriginAxes)
    systemOriginAxesRef.current = systemOriginAxes

    axesWidgetResourcesRef.current.current = []
    const widget = createAxesWidget(axesWidgetResourcesRef.current)
    if (widget && widget.root) {
      widget.root.visible = !!axesVisibilityRef.current
    }
    axesWidgetRef.current = widget
    axesWidgetCameraRef.current = widget?.camera || null

    // Build initial adorners and apply initial visual style/background before first render
    rebuildAdorners()
    applyStyle(styleMode)
    applyBackground(backgroundMode)

    // ---- Post-processing (SMAA + MSAA when available) ----
    // Prefer MSAA with SMAA in the post-processing pipeline on WebGL2 for crisper lines.
    // Simplify: render directly without post-processing to maximize compatibility
    composerRef.current = null
    smaaPassRef.current = null

    // resize
    const resizeNow = (w, h) => {
      const renderer = rendererRef.current
      const camera = cameraRef.current
      if (!renderer || !camera) return
      // Avoid zero sizes
      if (w <= 0 || h <= 0) return
      // Update drawing buffer and CSS size to match container exactly
      renderer.setSize(w, h, true)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      lastSizeRef.current = { w, h }
      // update line material resolution (pixels)
      const pr = renderer.getPixelRatio ? renderer.getPixelRatio() : 1
      lineResolutionRef.current.set(w * pr, h * pr)
      const applyLineResolution = (root) => {
        root.traverse((obj) => {
          const mat = obj.material
          if (mat && (mat instanceof LineMaterial)) {
            mat.resolution.copy(lineResolutionRef.current)
          }
        })
      }
      const wireG = wireframeRef.current
      const edgesG = edgesRef.current
      if (wireG) applyLineResolution(wireG)
      if (edgesG) applyLineResolution(edgesG)

      // AXES OVERLAY DISABLED: no overlay renderer resize
    }

    const onResize = () => {
      if (!container) return
      const w = container.clientWidth
      const h = container.clientHeight
      resizeNow(w, h)
      // (composer disabled)
      // Optionally re-frame after resize if no user interaction has occurred yet
      try {
        if (autoFitOnResize && multiSceneRef.current?.active && !userInteractedRef.current) {
          frameMultiScene()
        }
      } catch {}
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(container)
    // Ensure we sync size immediately after mount
    onResize()

    // Helpers: simple spheres for target and model center (meshes stored in refs)
    const createHelper = (color = 0xff00aa) => {
      const g = new THREE.SphereGeometry(3, 16, 12)
      const m = new THREE.MeshBasicMaterial({ color, depthTest: false })
      const s = new THREE.Mesh(g, m)
      s.renderOrder = 9999
      return s
    }
    const ensureHelpers = () => {
      const scene = sceneRef.current
      if (!scene) return
      const wantTarget = !!targetHelperVisibleRef.current
      const wantCenter = !!modelCenterVisibleRef.current
      // Target helper
      if (wantTarget) {
        if (!targetHelperMeshRef.current) {
          targetHelperMeshRef.current = createHelper(0xff00aa)
          // Ensure target (magenta) draws on top of center (cyan)
          targetHelperMeshRef.current.renderOrder = 10001
          scene.add(targetHelperMeshRef.current)
        }
      } else if (targetHelperMeshRef.current) {
        try { targetHelperMeshRef.current.geometry.dispose?.(); targetHelperMeshRef.current.material.dispose?.() } catch {}
        try { scene.remove(targetHelperMeshRef.current) } catch {}
        targetHelperMeshRef.current = null
      }
      // Model center helper
      if (wantCenter) {
        if (!centerHelperMeshRef.current) {
          centerHelperMeshRef.current = createHelper(0x00aaff)
          centerHelperMeshRef.current.renderOrder = 10000
          scene.add(centerHelperMeshRef.current)
        }
      } else if (centerHelperMeshRef.current) {
        try { centerHelperMeshRef.current.geometry.dispose?.(); centerHelperMeshRef.current.material.dispose?.() } catch {}
        try { scene.remove(centerHelperMeshRef.current) } catch {}
        centerHelperMeshRef.current = null
      }
    }
    ensureHelpers()

    // Do an immediate first render so the scene is visible even if the loop pauses early
    try {
      const composerNow = composerRef.current
      if (composerNow) composerNow.render()
      else renderer.render(scene, camera)
    } catch {}
    // Emit initial metrics once after first render
    logMetrics('init')

    // Debug helper hook removed

    // interaction handling for auto spin pause
    const INTERACTION_EVENTS = ['pointerdown', 'touchstart']
    const onUserInteracted = () => {
      if (spinModeRef.current !== 'auto') return
      // pause spinning for 80s from last interaction
      const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
      pauseUntilRef.current = now + 80000
      spinRef.current = false
      userInteractedRef.current = true
      if (pauseTimerRef.current) clearTimeout(pauseTimerRef.current)
      const delay = Math.max(0, pauseUntilRef.current - now)
      pauseTimerRef.current = setTimeout(() => {
        // resume if still in auto and pause elapsed
        if (spinModeRef.current === 'auto') {
          spinRef.current = true
        }
      }, delay)
    }
    controls.addEventListener('start', onUserInteracted)
    INTERACTION_EVENTS.forEach((ev) => renderer.domElement.addEventListener(ev, onUserInteracted, { passive: true }))

    // animation loop
    const tick = () => {
      // Auto mode guard: if we are in auto and pause is active, ensure spin is off
      if (spinModeRef.current === 'auto') {
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        if (now < pauseUntilRef.current) {
          spinRef.current = false
        }
      }
      if (spinRef.current && modelGroupRef.current && !multiSceneRef.current.active) {
        const dTheta = 0.00125
        modelGroupRef.current.rotation.y += dTheta
      }
      if (multiSceneRef.current.active) {
        const anim = animationRef.current
        const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
        if (anim.playing) {
          const elapsed = (now - anim.start) / anim.duration
          const t = Math.min(1, Math.max(0, elapsed))
          anim.mixers.forEach((mix) => {
            const { object, from, to, materials = [], fromOpacity = 1, toOpacity = 1 } = mix
            object.position.lerpVectors(from.position, to.position, t)
            object.quaternion.slerpQuaternions(from.quaternion, to.quaternion, t)
            const opacity = easeVisibilityOpacity(fromOpacity, toOpacity, t)
            if (materials.length) {
              materials.forEach((mat) => {
                if (!mat) return
                mat.opacity = opacity
                mat.transparent = opacity < 0.999
                if (opacity <= 0.001) {
                  mat.depthWrite = false
                } else if (mat.depthWrite === false) {
                  mat.depthWrite = true
                }
              })
            }
            object.visible = opacity > 0.001 || toOpacity > 0.001
          })
          if (t >= 1) {
            anim.playing = false
            anim.mixers = []
            anim.onComplete?.()
          }
        }
        if (multiSceneRef.current.sceneGroup && spinRef.current) {
          multiSceneRef.current.sceneGroup.rotation.y += 0.00125
        }
      }
      // Auto-center disabled to allow normal dragging
      //
      // Camera/controls update order per frame:
      // 1) controls.update() applies damping and any user interaction to the camera pose but DOES NOT change controls.target.
      // 2) camera.lookAt(controls.target) explicitly aims the optical axis at OrbitControls.target.
      //    This guarantees that projecting controls.target lands at the exact viewport center (NDC 0,0).
      // 3) Helpers are positioned AFTER the above so they reflect the current camera/target state of this frame.
      controls.update()
      const cameraNow = cameraRef.current
      if (cameraNow) cameraNow.lookAt(controls.target)

      // Target helper handling removed (debug-only)
      // Model-center helper disabled
      // Update simple helpers
      ensureHelpers()
      const th = targetHelperMeshRef.current
      if (th && controlsRef.current) {
        th.position.copy(controlsRef.current.target)
      }
      const ch = centerHelperMeshRef.current
      if (ch) {
        const b = getActiveBounds()
        ch.position.copy(b.getCenter(new THREE.Vector3()))
      }
      if (boundingBoxesVisibleRef.current) {
        if (boundingBoxesDirtyRef.current) {
          rebuildBoundingBoxes()
        }
        const boxes = boundingBoxesRef.current || []
        boxes.forEach((bbox) => {
          if (!bbox) return
          const target = bbox.userData?.__target
          if (!target) return
          target.updateMatrixWorld?.(true)
          bbox.update(target)
        })
      } else if ((boundingBoxesRef.current || []).length) {
        clearBoundingBoxes()
      }
      // Perform any pending reframe after model/state changes once sizes are synced
      if (pendingReframeRef.current) {
        const w = container.clientWidth
        const h = container.clientHeight
        if (w > 0 && h > 0) {
          resizeNow(w, h)
          controls.update()
          try { frameMultiScene() } catch {}
          pendingReframeRef.current = false
        }
      }
      // Do not auto-center target each frame; leave target under user control
      // Enforce viewport/scissor to canvas attribute size (not drawingBuffer) to avoid DPR mismatch
      const canvas = renderer.domElement
      const vw = canvas?.width || 0
      const vh = canvas?.height || 0
      if (vw > 0 && vh > 0) {
        renderer.setViewport(0, 0, vw, vh)
        renderer.setScissor(0, 0, vw, vh)
        try { renderer.getContext()?.viewport(0, 0, vw, vh) } catch {}
      }
      renderer.setScissorTest(false)
      renderer.render(scene, camera)
      const widget = axesWidgetRef.current
      const widgetCamera = axesWidgetCameraRef.current
      const overlayRenderer = axesRendererRef.current
      if (widget && widgetCamera && overlayRenderer && axesVisibilityRef.current) {
        // overlay currently disabled
      }
      // Always schedule next frame to ensure continuous rendering
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    // Loop control helpers (close over tick)
    const startLoop = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(tick)
    }
    const stopLoop = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    const updateActive = () => {
      const active = !!isVisibleRef.current && !!isDocVisibleRef.current
      const was = isActiveRef.current
      isActiveRef.current = active
      if (active && !was) startLoop()
      if (!active && was) stopLoop()
    }

    // Snapshot timers to avoid reading changing refs in cleanup
    const cleanupDebounce = debounceRef.current
    const cleanupPauseTimer = pauseTimerRef.current

    // Visibility management
    let io
    if ('IntersectionObserver' in window && container) {
      io = new IntersectionObserver((entries) => {
        if (entries && entries[0]) {
          isVisibleRef.current = !!entries[0].isIntersecting
          updateActive()
        }
      }, { root: null, threshold: 0.01 })
      io.observe(container)
    }
    const onVisChange = () => {
      isDocVisibleRef.current = (document.visibilityState !== 'hidden')
      updateActive()
    }
    document.addEventListener('visibilitychange', onVisChange)
    // Initialize active state once after mounting
    updateActive()

    return () => {
      cancelAnimationFrame(rafRef.current)
      ro.disconnect()
      if (io) {
        try { io.disconnect() } catch {}
      }
      document.removeEventListener('visibilitychange', onVisChange)
      if (cleanupDebounce) clearTimeout(cleanupDebounce)
      if (cleanupPauseTimer) clearTimeout(cleanupPauseTimer)
      controls.removeEventListener('start', onUserInteracted)
      INTERACTION_EVENTS.forEach((ev) => renderer.domElement.removeEventListener(ev, onUserInteracted))
      controls.dispose()
      // dispose pmrem/env
      if (pmremRef.current) {
        pmremRef.current.dispose?.()
        pmremRef.current = null
      }
      if (envRTRef.current) {
        envRTRef.current.dispose()
        envRTRef.current = null
      }
      // dispose composer
      if (composerRef.current) {
        composerRef.current.passes?.splice(0)
        composerRef.current = null
      }
      renderer.dispose()
      try { if (renderer.domElement && renderer.domElement.parentNode === container) container.removeChild(renderer.domElement) } catch {}
      axesRendererRef.current = null
      const overlayCanvas = axesCanvasRef.current
      if (overlayCanvas && overlayCanvas.parentNode === container) {
        try { container.removeChild(overlayCanvas) } catch {}
      }
      // Remove 2D debug overlays
      const centerEl2 = overlayCenterRef.current
      const targetEl2 = overlayTargetRef.current
      const helperEl2 = overlayHelperRef.current
      try { if (centerEl2 && centerEl2.parentNode === container) container.removeChild(centerEl2) } catch {}
      try { if (targetEl2 && targetEl2.parentNode === container) container.removeChild(targetEl2) } catch {}
      try { if (helperEl2 && helperEl2.parentNode === container) container.removeChild(helperEl2) } catch {}
      overlayCenterRef.current = null
      overlayTargetRef.current = null
      overlayHelperRef.current = null
      clearBoundingBoxes()
      disposeTargetHelperRef()
      disposeModelCenterHelperRef()
      // dispose basic resources
      scene.traverse((obj) => {
        if (obj.isMesh) {
          obj.geometry?.dispose?.()
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
          else obj.material?.dispose?.()
        }
      })
      // allow re-initialization after full cleanup
      initializedRef.current = false
      const widget = axesWidgetRef.current
      axesWidgetRef.current = null
      if (widget && widget.scene) {
        widget.scene.traverse((obj) => {
          if (obj.isMesh) {
            obj.geometry?.dispose?.()
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
            else obj.material?.dispose?.()
          }
        })
      }
      const disposers = axesWidgetResourcesRef.current?.current || []
      disposers.forEach((dispose) => {
        try {
          dispose?.()
        } catch {}
      })
      if (axesWidgetResourcesRef.current) axesWidgetResourcesRef.current.current = []
      axesWidgetCameraRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

// respond to spin inputs: prefer spinMode if provided
useEffect(() => {
  const mode = spinMode || (spinEnabled ? 'on' : 'off')
  spinModeRef.current = mode
  if (mode === 'on') {
    spinRef.current = true
  } else if (mode === 'off') {
    spinRef.current = false
  } else if (mode === 'auto') {
    // start spinning unless paused
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()
    spinRef.current = now >= pauseUntilRef.current
  }
}, [spinEnabled, spinMode])

// respond to frame mode
useEffect(() => {
  const wire = wireframeRef.current
  if (!wire) return
  if (frameMode === 'HIDE') {
    wire.visible = false
  } else {
    wire.visible = true
    wire.traverse((obj) => {
      if (obj.material) {
        const dark = isDarkTheme()
        if (frameMode === 'LIGHT') {
          obj.material.color.setHex(dark ? 0xeeeeee : 0xffffff)
          obj.material.opacity = 0.65
          obj.material.transparent = true
        } else {
          obj.material.color.setHex(dark ? 0x555555 : 0x333333)
          obj.material.opacity = 0.8
          obj.material.transparent = true
        }
        obj.material.needsUpdate = true
      }
    })
  }
}, [frameMode])

  // respond to origin visibility
  useEffect(() => {
    const visible = !!originVisible
    if (axesRef.current) axesRef.current.visible = visible
    const multi = multiSceneRef.current
    ;(multi?.models || []).forEach((container) => {
      const axes = container?.userData?.__axes
      if (axes) axes.visible = visible
    })
    const overlayCanvas = axesCanvasRef.current
    if (overlayCanvas) overlayCanvas.style.display = visible ? 'block' : 'none'
  }, [originVisible])

  useEffect(() => {
    const visible = !!axesHelperVisible
    axesVisibilityRef.current = visible
    const widget = axesWidgetRef.current
    if (widget && widget.root) widget.root.visible = visible
    const overlayCanvas = axesCanvasRef.current
    if (overlayCanvas) overlayCanvas.style.display = visible ? 'block' : 'none'
    // Toggle system origin crosshair
    const systemOriginAxes = systemOriginAxesRef.current
    if (systemOriginAxes) systemOriginAxes.visible = visible
  }, [axesHelperVisible])

  // Helper visibility is controlled by refs; the render loop creates/removes meshes as needed
  useEffect(() => { targetHelperVisibleRef.current = !!targetHelperVisible }, [targetHelperVisible])
  useEffect(() => { modelCenterVisibleRef.current = !!modelCenterVisible }, [modelCenterVisible])

  useEffect(() => {
    boundingBoxesVisibleRef.current = !!boundingBoxesVisible
    if (boundingBoxesVisibleRef.current) {
      markBoundingBoxesDirty()
    } else {
      clearBoundingBoxes()
    }
  }, [boundingBoxesVisible])

  // respond to autoCenterTarget toggle
  useEffect(() => {
    autoCenterTargetRef.current = !!autoCenterTarget
  }, [autoCenterTarget])

  // respond to originOffset (world position for axes)
  useEffect(() => {
    const axes = axesRef.current
    if (!axes) return
    const o = originOffset || { x: 0, y: 0, z: 0 }
    axes.position.set(Number(o.x) || 0, Number(o.y) || 0, Number(o.z) || 0)
  }, [originOffset])

  // respond to shading mode
  useEffect(() => {
    applyShading(shadingMode)
    // Rebuild adorners to update edge/silhouette colors and visibility
    rebuildAdorners()
    // Re-assert visibility rules after shading changes
    const edgesGroup = edgesRef.current
    const outlineGroup = outlineRef.current
    if (edgesGroup) edgesGroup.visible = useSourceMaterialsRef.current ? false : (edgesMode !== 'OFF')
    if (outlineGroup) outlineGroup.visible = useSourceMaterialsRef.current ? false : ((shadingMode === 'OFF') ? false : ((styleMode === 'OUTLINE' || styleMode === 'TOON') && (outlineColorMode !== 'OFF')))
  }, [shadingMode])

  // React to style changes only (do not re-apply style when only background changes)
  useEffect(() => {
    // Apply or switch visual style
    applyStyle(styleMode)
    // Refresh adorners to reflect style-driven changes immediately
    rebuildAdorners()
    // Ensure outline visibility respects outlineColorMode
    const outlineGroup = outlineRef.current
    if (outlineGroup) outlineGroup.visible = useSourceMaterialsRef.current ? false : ((shadingMode === 'OFF') ? false : ((styleMode === 'OUTLINE' || styleMode === 'TOON') && (outlineColorMode !== 'OFF')))
  }, [styleMode])

  // respond to background mode changes
  useEffect(() => {
    applyBackground(backgroundMode)
  }, [backgroundMode])

  // respond to edges mode: affects edges overlay visibility across all styles
  useEffect(() => {
    const edgesGroup = edgesRef.current
    if (!edgesGroup) return
    edgesGroup.visible = useSourceMaterialsRef.current ? false : (edgesMode !== 'OFF')
    // Rebuild to apply color override if not AUTO
    rebuildAdorners()
  }, [edgesMode, useSourceMaterials])

  // respond to outline color mode changes
  useEffect(() => {
    const outlineGroup = outlineRef.current
    if (outlineGroup) outlineGroup.visible = useSourceMaterialsRef.current ? false : ((shadingMode === 'OFF') ? false : ((styleMode === 'OUTLINE' || styleMode === 'TOON') && (outlineColorMode !== 'OFF')))
    rebuildAdorners()
  }, [outlineColorMode, useSourceMaterials])

  // Sync useSourceMaterials prop to ref and enforce adorner visibility accordingly.
  // This ensures that when viewing 3MF/GLTF with native materials, edges/outline/wireframe stay hidden.
  useEffect(() => {
    useSourceMaterialsRef.current = !!useSourceMaterials
    const edgesGroup = edgesRef.current
    const outlineGroup = outlineRef.current
    const wire = wireframeRef.current
    if (useSourceMaterialsRef.current) {
      if (edgesGroup) edgesGroup.visible = false
      if (outlineGroup) outlineGroup.visible = false
      if (wire) wire.visible = false
    } else {
      if (edgesGroup) edgesGroup.visible = (edgesMode !== 'OFF')
      // wireframe visibility follows frameMode
      if (wire) wire.visible = (frameMode !== 'HIDE')
      // outline visibility will be controlled by shading/style/outlineColorMode effects
    }
  }, [useSourceMaterials, edgesMode, frameMode, shadingMode, styleMode, outlineColorMode])

  // respond to outline controls: threshold and scale
  useEffect(() => {
    rebuildAdorners()
  }, [outlineThreshold, outlineScale])

  // React to edgesLineWidth changes by updating existing edge materials
  useEffect(() => {
    const edgesGroup = edgesRef.current
    if (!edgesGroup) return
    const lw = Math.min(3, Math.max(1, Number(edgesLineWidth) || 2))
    edgesGroup.traverse((obj) => {
      const mat = obj.material
      if (mat && (mat instanceof LineMaterial)) {
        mat.linewidth = lw
        mat.needsUpdate = true
      }
    })
  }, [edgesLineWidth])

  // React to lighting level changes by updating current rig intensities
  useEffect(() => {
    const rig = lightRigRef.current || []
    if (!rig.length) return
    rig.forEach((l) => {
      if (!l || !('intensity' in l)) return
      if (l.isAmbientLight) {
        l.intensity = Math.max(0, Number(ambientLevel) || 0)
      } else {
        const base = (l.userData && typeof l.userData.baseIntensity === 'number') ? l.userData.baseIntensity : l.intensity
        // Store base if missing so subsequent updates are stable
        if (!l.userData) l.userData = {}
        if (typeof l.userData.baseIntensity !== 'number') l.userData.baseIntensity = base
        l.intensity = Math.max(0, (Number(directionalLevel) || 0) * base)
      }
    })
  }, [ambientLevel, directionalLevel])

  useImperativeHandle(ref, () => ({
    // Replace the current model geometry with a given BufferGeometry
    // Accepts THREE.BufferGeometry and optional material
    setGeometry: (geometry, material) => {
      multiSceneRef.current.active = false
      resetAnimation()
      const group = modelGroupRef.current
      const wire = wireframeRef.current
      const edgesGroup = edgesRef.current
      const outlineGroup = outlineRef.current
      const multiGroup = multiSceneRef.current.sceneGroup
      if (!group || !wire || !edgesGroup || !outlineGroup) return

      if (multiGroup) {
        while (multiGroup.children.length) {
          const child = multiGroup.children.pop()
          child.traverse?.((obj) => {
            if (obj.geometry) obj.geometry.dispose?.()
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
              else obj.material.dispose?.()
            }
          })
        }
        multiGroup.visible = false
        multiGroup.rotation.set(0, 0, 0)
      }

      // clear previous meshes but keep adorner groups (wire, edges, outline) attached
      for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i]
        if (child.isMesh) {
          group.remove(child)
          child.geometry?.dispose?.()
          if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.())
          else child.material?.dispose?.()
        }
      }

      // clear previous wireframe lines (remove placeholder cube wire)
      for (let i = wire.children.length - 1; i >= 0; i--) {
        const c = wire.children[i]
        wire.remove(c)
        c.geometry?.dispose?.()
        c.material?.dispose?.()
      }

      for (let i = wire.children.length - 1; i >= 0; i--) {
        const child = wire.children[i]
        wire.remove(child)
        if (child.geometry) child.geometry.dispose?.()
        if (child.material) child.material.dispose?.()
      }
      // clear edges overlay from previous geometry
      for (let i = edgesGroup.children.length - 1; i >= 0; i--) {
        const child = edgesGroup.children[i]
        edgesGroup.remove(child)
        child.geometry?.dispose?.()
        child.material?.dispose?.()
      }
      // clear silhouette outline from previous geometry
      for (let i = outlineGroup.children.length - 1; i >= 0; i--) {
        const child = outlineGroup.children[i]
        outlineGroup.remove(child)
        child.geometry?.dispose?.()
        child.material?.dispose?.()
      }

      const mat = material || createStyleMaterial(styleMode)
      const mesh = new THREE.Mesh(geometry, mat)
      group.add(mesh)

      // ensure current shading is applied immediately to the new material
      applyShading(shadingMode)

      const wfGeo = new THREE.WireframeGeometry(geometry)
      const wfSegGeo = new LineSegmentsGeometry()
      wfSegGeo.setPositions(wfGeo.attributes.position.array)
      const wfMat = new LineMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, linewidth: 1.25, depthTest: true, depthWrite: false })
      wfMat.resolution.copy(lineResolutionRef.current)
      const wireMesh = new LineSegments2(wfSegGeo, wfMat)
      wire.add(wireMesh)

      // rebuild edges/silhouette adorners using current controls
      rebuildAdorners()

      // fit view (exclude adorners and axes)
      const box = getModelBounds()
      const sizeVec = box.getSize(new THREE.Vector3())
      const size = sizeVec.length()
      const center = box.getCenter(new THREE.Vector3())
      // Scale axes uniformly to 120% of the max bbox dimension
      if (axesRef.current) {
        const L = Math.max(0.001, sizeVec.x, sizeVec.y, sizeVec.z)
        axesRef.current.scale.setScalar(L * 1.2)
      }
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (camera && controls) {
        controls.target.copy(center)
        const distance = computeFitDistance(box, camera, 0.67)
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
        camera.position.copy(dir.multiplyScalar(distance).add(controls.target))
        camera.near = Math.max(0.01, Math.min(camera.near, size / 100))
        camera.far = Math.max(camera.far, size * 10)
        camera.updateProjectionMatrix()
        controls.update()
      }
      // Resize and re-center the grid to match the new model footprint (if GRID mode is active)
      syncGridToModel()
      // Ensure far plane covers grid/floor
      adjustCameraPlanes()
      markBoundingBoxesDirty()
    },
    setMultiScene: (definition) => {
      const multi = multiSceneRef.current
      const group = modelGroupRef.current
      const wire = wireframeRef.current
      const edgesGroup = edgesRef.current
      const outlineGroup = outlineRef.current
      const axes = axesRef.current
      const multiGroup = multi.sceneGroup
      if (!multiGroup || !group || !wire || !edgesGroup || !outlineGroup || !definition) return

      resetAnimation()
      multi.active = true
      multi.stateDisplayNames = definition.stateDisplayMap || {}
      multi.stateOrder = definition.stateOrder || []
      multi.transitionMap = definition.transitionMap || {}
      multi.currentState = definition.initialState || (multi.stateOrder[0] || 'start')
      multi.scrollAnimationConfig = definition.scrollAnimationConfig || null
      // Clear cached bounds so they're recalculated for new models
      multi.paddedBounds = null
      multi.paddedCenter = null
      multi.paddedSphere = null
      multi.currentBounds = null
      multi.currentCenter = null
      multi.currentSphere = null

      // Clear single-model group
      ;[group, wire, edgesGroup, outlineGroup].forEach((g) => {
        if (!g) return
        while (g.children.length) {
          const child = g.children.pop()
          if (child === axes) continue
          child.traverse?.((obj) => {
            if (obj.geometry) obj.geometry.dispose?.()
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
              else obj.material.dispose?.()
            }
          })
        }
      })
      group.visible = false
      if (wire) wire.visible = false
      if (edgesGroup) edgesGroup.visible = false
      if (outlineGroup) outlineGroup.visible = false
      // console.log('[ThreeCadViewer] setMultiScene - hidden single-model groups. group.visible:', group.visible, 'group.children:', group.children.length)

      // Clear multi group children
      while (multiGroup.children.length) {
        const child = multiGroup.children.pop()
        child.traverse?.((obj) => {
          if (obj.geometry) obj.geometry.dispose?.()
          if (obj.material) {
            if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
            else obj.material.dispose?.()
          }
        })
      }

      const modelEntries = definition.models || []
      const preparedModels = []

      // console.log('[ThreeCadViewer] setMultiScene - processing', modelEntries.length, 'model entries')
      
      modelEntries.forEach((entry, idx) => {
        if (!entry || !entry.object) {
          console.warn('[ThreeCadViewer] Entry', idx, 'is missing object')
          return
        }
        const container = new THREE.Group()
        container.name = entry.name || 'Model'
        const object = entry.object
        container.add(object)
        container.userData.__modelRoot = object
        object.updateMatrixWorld(true)
        
        // console.log('[ThreeCadViewer] Processing model', idx, 'name:', entry.name, 'children count:', object.children.length)
        
        const localBox = new THREE.Box3().setFromObject(object)
        // Check if box is valid (not empty/inverted)
        const boxSize = localBox.getSize(new THREE.Vector3())
        const isValidBox = isFinite(boxSize.x) && isFinite(boxSize.y) && isFinite(boxSize.z) && (boxSize.x > 0 || boxSize.y > 0 || boxSize.z > 0)
        
        let localCenter, localRadius
        if (isValidBox) {
          localCenter = localBox.getCenter(new THREE.Vector3())
          localRadius = boxSize.length() / 2
          try { console.debug('[ThreeCadViewer] bounds:model', { idx, name: entry.name, size: { x: Number(boxSize.x.toFixed(2)), y: Number(boxSize.y.toFixed(2)), z: Number(boxSize.z.toFixed(2)) }, center: { x: Number(localCenter.x.toFixed(2)), y: Number(localCenter.y.toFixed(2)), z: Number(localCenter.z.toFixed(2)) } }) } catch {}
        } else {
          // Model has no geometry - use defaults
          try { console.warn('[ThreeCadViewer] bounds:model-fallback', { idx, name: entry.name }) } catch {}
          localCenter = new THREE.Vector3(0, 0, 0)
          localRadius = 50 // 50mm radius (100mm cube equivalent)
        }
        
        container.userData.__localBoundCenter = localCenter
        container.userData.__localBoundRadius = localRadius
        const faderMaterials = []
        object.traverse((obj) => {
          if (obj.isMesh) {
            ensureQuaternion(obj)
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => { faderMaterials.push(m) })
            } else if (obj.material) {
              faderMaterials.push(obj.material)
            }
            obj.material.transparent = true
          }
        })
        const axesHelper = new THREE.AxesHelper(1)
        axesHelper.userData.__isOriginAxes = true
        axesHelper.visible = !!originVisible
        const modelBox = new THREE.Box3().setFromObject(object)
        const sizeVec = modelBox.getSize(new THREE.Vector3())
        const diag = sizeVec.length()
        const axisScale = Math.max(0.05, diag * 0.12 || 0.5)
        axesHelper.scale.setScalar(axisScale)
        container.add(axesHelper)
        container.userData.__axes = axesHelper
        container.userData.__states = entry.states || {}
        container.userData.__faderMaterials = faderMaterials
        container.userData.__name = entry.name
        ensureQuaternion(container)
        multiGroup.add(container)
        preparedModels.push(container)
      })

      multi.models = preparedModels
      multiGroup.visible = true
      multiGroup.rotation.set(0, 0, 0)
      const scene = sceneRef.current
      console.log('[ThreeCadViewer] setMultiScene - multiGroup visible:', multiGroup.visible, 'children:', multiGroup.children.length)
      console.log('[ThreeCadViewer] setMultiScene - multiGroup in scene:', multiGroup.parent === scene, 'scene children:', scene?.children.map(c => c.name || c.type))

      if (axes) {
        if (axes.parent) axes.parent.remove(axes)
        multiGroup.add(axes)
        axes.position.set(0, 0, 0)
        axes.scale.setScalar(1)
        axes.visible = !!originVisible
      }
      axesRef.current = axes

      // Re-add system origin axes to multiGroup for multi-scene mode
      const systemAxes = systemOriginAxesRef.current
      if (systemAxes) {
        if (systemAxes.parent) systemAxes.parent.remove(systemAxes)
        multiGroup.add(systemAxes)
        systemAxes.position.set(0, 0, 0)
      }

      // console.log('[ThreeCadViewer] setMultiScene - calling rebuildMultiSceneBounds')
      const _b = rebuildMultiSceneBounds()
      try {
        const sz = _b.getSize(new THREE.Vector3())
        const ct = _b.getCenter(new THREE.Vector3())
        console.debug('[ThreeCadViewer] bounds:scene-initial', { size: { x: Number(sz.x.toFixed(2)), y: Number(sz.y.toFixed(2)), z: Number(sz.z.toFixed(2)) }, center: { x: Number(ct.x.toFixed(2)), y: Number(ct.y.toFixed(2)), z: Number(ct.z.toFixed(2)) } })
      } catch {}
      // console.log('[ThreeCadViewer] setMultiScene - applying initial state:', multi.currentState)
      applyMultiState(multi.currentState, true, false)
      resetAnimation()
      userInteractedRef.current = false
      // Schedule a reframe on next RAF after resize sync
      pendingReframeRef.current = true
      markBoundingBoxesDirty()
      // console.log('[ThreeCadViewer] setMultiScene - complete')
    },
    transitionMultiState: (targetState, duration = 900, onComplete) => {
      return startStateTransition(targetState, duration, onComplete)
    },
    getMultiSceneInfo: () => {
      const multi = multiSceneRef.current
      if (!multi.active) return null
      return {
        currentState: multi.currentState,
        stateOrder: multi.stateOrder || [],
        transitionMap: multi.transitionMap || {},
        stateDisplayNames: multi.stateDisplayNames || {},
        models: multi.models || [], // Expose the model containers
      }
    },
    updateStateVisibility: (stateUpdates, targetStates = null) => {
      // Update visibility/opacity in specific states without changing positions
      // stateUpdates: { modelIndex: { visible: true/false, opacity: 0-1 } }
      // targetStates: array of state keys to update, or null for all states
      const multi = multiSceneRef.current
      if (!multi.active || !multi.models) return false
      
      Object.entries(stateUpdates).forEach(([modelIndex, update]) => {
        const container = multi.models[parseInt(modelIndex)]
        if (!container) return
        
        const states = container.userData.__states || {}
        const stateKeys = targetStates || Object.keys(states)
        
        stateKeys.forEach(stateKey => {
          const state = states[stateKey]
          if (!state) return
          if (update.visible !== undefined) {
            state.visible = update.visible
          }
          if (update.opacity !== undefined) {
            state.opacity = update.opacity
          }
        })
      })
      
      return true
    },
    // Public method to re-frame the current multi-scene using current bounds
    frameToCurrent: () => {
      try { frameMultiScene() } catch {}
    },
    // Replace model with an Object3D (e.g., GLTF/3MF) preserving its materials
    setObject: (object3D) => {
      multiSceneRef.current.active = false
      resetAnimation()
      const group = modelGroupRef.current
      const wire = wireframeRef.current
      const edgesGroup = edgesRef.current
      const outlineGroup = outlineRef.current
      const multiGroup = multiSceneRef.current.sceneGroup
      if (!group || !wire || !edgesGroup || !outlineGroup || !object3D) return

      if (multiGroup) {
        while (multiGroup.children.length) {
          const child = multiGroup.children.pop()
          child.traverse?.((obj) => {
            if (obj.geometry) obj.geometry.dispose?.()
            if (obj.material) {
              if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose?.())
              else obj.material.dispose?.()
            }
          })
        }
        multiGroup.visible = false
        multiGroup.rotation.set(0, 0, 0)
      }

      // clear previous meshes but keep adorner groups attached
      for (let i = group.children.length - 1; i >= 0; i--) {
        const child = group.children[i]
        if (child.isMesh || child.isGroup || child.isObject3D) {
          // do not remove the adorner groups
          if (child === wire || child === edgesGroup || child === outlineGroup || child === axesRef.current) continue
          group.remove(child)
          // Dispose only geometry/materials we created previously (best-effort)
          if (child.isMesh) {
            child.geometry?.dispose?.()
            if (Array.isArray(child.material)) child.material.forEach((m) => m.dispose?.())
            else child.material?.dispose?.()
          }
        }
      }

      // Clear adorners completely when using source materials
      for (let i = edgesGroup.children.length - 1; i >= 0; i--) {
        const c = edgesGroup.children[i]
        edgesGroup.remove(c)
        c.geometry?.dispose?.()
        c.material?.dispose?.()
      }
      for (let i = outlineGroup.children.length - 1; i >= 0; i--) {
        const c = outlineGroup.children[i]
        outlineGroup.remove(c)
        c.geometry?.dispose?.()
        c.material?.dispose?.()
      }
      // Hide adorners when using native materials
      edgesGroup.visible = false
      outlineGroup.visible = false
      // also hide wireframe overlay to avoid clutter
      wire.visible = false

      // Add the object
      group.add(object3D)

      // Do not translate the loaded object to origin; preserve authoring coordinates.
      // Axes remain under modelGroup and are positioned via originOffset.

      // Ensure current shading does not override materials
      applyShading(shadingMode)

      // fit view to model-only bounds (after recenter)
      const box = getModelBounds()
      const sizeVec = box.getSize(new THREE.Vector3())
      const size = sizeVec.length()
      const center = box.getCenter(new THREE.Vector3())
      if (axesRef.current) {
        const L = Math.max(0.001, sizeVec.x, sizeVec.y, sizeVec.z)
        axesRef.current.scale.setScalar(L * 1.2)
      }
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (camera && controls) {
        controls.target.copy(center)
        const distance = computeFitDistance(box, camera, 0.67)
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
        camera.position.copy(dir.multiplyScalar(distance).add(controls.target))
        camera.near = Math.max(0.01, Math.min(camera.near, size / 100))
        camera.far = Math.max(camera.far, size * 10)
        camera.updateProjectionMatrix()
        controls.update()
      }
      syncGridToModel()
      adjustCameraPlanes()
      markBoundingBoxesDirty()
    },
    // Toggle exploded view for non-STL multi-part models (applies to Object3D loads)
    setExploded: (exploded) => {
      const group = modelGroupRef.current
      if (!group) return
      // Find the primary model root (exclude adorners and axes)
      let modelRoot = null
      for (const child of group.children) {
        if (child === wireframeRef.current || child === edgesRef.current || child === outlineRef.current || child === axesRef.current) continue
        modelRoot = child
        break
      }
      if (!modelRoot) return
      const parts = (modelRoot.children || []).filter((c) => c && (c.isMesh || c.isGroup || c.isObject3D))
      if (parts.length <= 1) return

      // Compute overall size from model bounds for scaling the explosion distance
      const overallBox = new THREE.Box3().setFromObject(modelRoot)
      const overallSize = overallBox.getSize(new THREE.Vector3())
      // Slightly stronger explode factor
      const mag = Math.max(0.001, overallSize.length()) * 0.25

      // Prepare originals
      parts.forEach((p) => {
        if (!p.userData) p.userData = {}
        if (!p.userData._origPos) p.userData._origPos = p.position.clone()
      })

      if (exploded) {
        parts.forEach((p) => {
          // compute part center
          const pb = new THREE.Box3().setFromObject(p)
          const pc = pb.getCenter(new THREE.Vector3())
          // explode direction from origin to the part center
          const dir = pc.clone()
          if (dir.lengthSq() < 1e-6) {
            // fallback: use object index-based direction on near-zero vectors
            dir.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
          }
          dir.normalize()
          const delta = dir.multiplyScalar(mag)
          // Apply in local space of the parent (assumes no rotation on modelRoot)
          p.position.copy(p.userData._origPos || p.position).add(delta)
        })
      } else {
        // restore
        parts.forEach((p) => {
          if (p.userData && p.userData._origPos) {
            p.position.copy(p.userData._origPos)
          }
        })
      }
      explodedRef.current = !!exploded
      markBoundingBoxesDirty()
    },
    fitView: () => {
      const group = modelGroupRef.current
      if (!group) return
      // Use model-only bounds (exclude adorners and axes)
      const box = getModelBounds()
      const sizeVec = box.getSize(new THREE.Vector3())
      const size = sizeVec.length()
      const center = box.getCenter(new THREE.Vector3())
      // Uniform axes length = 1.2 × max bbox dimension
      if (axesRef.current) {
        const L = Math.max(0.001, sizeVec.x, sizeVec.y, sizeVec.z)
        axesRef.current.scale.setScalar(L * 1.2)
      }
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (camera && controls) {
        controls.target.copy(center)
        const distance = computeFitDistance(box, camera, 0.67)
        const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
        camera.position.copy(dir.multiplyScalar(distance).add(controls.target))
        camera.near = Math.max(0.01, Math.min(camera.near, size / 100))
        camera.far = Math.max(camera.far, size * 10)
        camera.updateProjectionMatrix()
        controls.update()
      }
      // Ensure near/far planes cover the model extents
      adjustCameraPlanes(box)
    },
    reset: () => {
      const group = modelGroupRef.current
      const wire = wireframeRef.current
      const axes = axesRef.current
      if (group) group.rotation.set(0, 0, 0)
      if (wire) wire.rotation.set(0, 0, 0)
      if (axes) axes.rotation.set(0, 0, 0)
      const multi = multiSceneRef.current
      if (multi.sceneGroup) multi.sceneGroup.rotation.set(0, 0, 0)
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (camera && controls) {
        camera.position.set(6, 6, 6)
        controls.target.set(0, 0, 0)
        camera.updateProjectionMatrix()
        controls.update()
      }
    },
    recenterTarget: () => {
      const controls = controlsRef.current
      if (!controls) return
      const center = getModelBounds().getCenter(new THREE.Vector3())
      if (isFinite(center.x) && isFinite(center.y) && isFinite(center.z)) {
        controls.target.copy(center)
        try { console.debug('[ThreeCadViewer] recenterTarget ->', center) } catch {}
        controls.update()
      }
    },
  }))

  // Keep visibility refs in sync with props
  useEffect(() => { targetHelperVisibleRef.current = !!targetHelperVisible }, [targetHelperVisible])
  useEffect(() => { modelCenterVisibleRef.current = !!modelCenterVisible }, [modelCenterVisible])

  const applyMultiState = (stateName, immediate = false, adjustCamera = true) => {
    const multi = multiSceneRef.current
    if (!multi.active) {
      // Single-model fit should continue to recenter around bounding box
      const group = modelGroupRef.current
      const camera = cameraRef.current
      const controls = controlsRef.current
      if (!group || !camera || !controls) return
      const box = getModelBounds()
      const sizeVec = box.getSize(new THREE.Vector3())
      const size = sizeVec.length()
      const center = box.getCenter(new THREE.Vector3())
      controls.target.copy(center)
      const distance = computeFitDistance(box, camera, 0.75)
      const dir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize()
      camera.position.copy(dir.multiplyScalar(distance).add(controls.target))
      camera.near = Math.max(0.01, Math.min(camera.near, size / 100))
      camera.far = Math.max(camera.far, size * 10)
      camera.updateProjectionMatrix()
      controls.update()
      adjustCameraPlanes(box)
      return
    }
    const key = (stateName || '').toLowerCase()
    const models = multi.models || []
    // console.log('[ThreeCadViewer] applyMultiState:', key, 'to', models.length, 'models')
    models.forEach((container, idx) => {
      const states = container.userData.__states || {}
      const state = states[key] || states.start || states['start'] || null
      if (!state) {
        console.warn('[ThreeCadViewer] Model', idx, 'has no state:', key, 'available:', Object.keys(states))
        return
      }
      const targetPos = state.position || new THREE.Vector3()
      const targetQuat = state.quaternion || new THREE.Quaternion()
      container.position.copy(targetPos)
      container.quaternion.copy(targetQuat)
      container.visible = state.visible !== false
      const mats = container.userData.__faderMaterials || []
      mats.forEach((mat) => {
        mat.opacity = state.visible === false ? 0 : 1
        mat.transparent = mat.opacity < 1
        mat.depthWrite = mat.opacity >= 0.999
      })
      const axes = container.userData.__axes
      if (axes) axes.visible = !!originVisible
      // Force matrix update after positioning
      container.updateMatrixWorld(true)
    })
    // console.log('[ThreeCadViewer] applyMultiState - applied to', appliedCount, 'models,', visibleCount, 'visible')
    multi.currentState = key
    const camera = cameraRef.current
    const controls = controlsRef.current
    if (adjustCamera && !immediate && camera && controls && multi.active) {
      frameMultiScene()
    }
    if (immediate) {
      resetAnimation()
    }
  }

  const startStateTransition = (targetState, duration = 900, onComplete) => {
    const multi = multiSceneRef.current
    if (!multi.active) return Promise.resolve(false)
    const fromKey = multi.currentState || 'start'
    const toKey = (targetState || '').toLowerCase()
    if (fromKey === toKey) return Promise.resolve(false)
    const allowed = multi.transitionMap?.[fromKey] || []
    if (!allowed.includes(toKey)) return Promise.resolve(false)
    const models = multi.models || []
    const anim = animationRef.current
    const now = performance.now()
    const mixes = []
    models.forEach((container) => {
      const states = container.userData.__states || {}
      const fromState = states[fromKey] || states.start || states['start']
      const toState = states[toKey] || states.start || states['start']
      if (!fromState || !toState) return
      const object = container
      const from = {
        position: fromState.position.clone(),
        quaternion: fromState.quaternion.clone(),
        visible: fromState.visible !== false,
      }
      const to = {
        position: toState.position.clone(),
        quaternion: toState.quaternion.clone(),
        visible: toState.visible !== false,
      }
      ensureQuaternion(object)
      ensureQuaternion(fromState)
      ensureQuaternion(toState)
      object.visible = from.visible || to.visible
      const materials = container.userData.__faderMaterials || []
      const fromOpacity = from.visible ? 1 : 0
      const toOpacity = to.visible ? 1 : 0
      if (materials.length) {
        materials.forEach((mat) => {
          if (!mat) return
          mat.opacity = fromOpacity
          mat.transparent = fromOpacity < 0.999
          mat.depthWrite = fromOpacity >= 0.999
        })
      }
      mixes.push({ object, from, to, materials, fromOpacity, toOpacity })
    })
    if (!mixes.length) return Promise.resolve(false)

    anim.playing = true
    anim.start = now
    anim.duration = Math.max(100, duration)
    anim.fromState = fromKey
    anim.toState = toKey
    anim.mixers = mixes
    anim.onComplete = () => {
      applyMultiState(toKey, true)
      resetAnimation()
      // Do not reframe camera here; preserve current view across transitions
      onComplete?.()
    }
    multi.currentState = toKey
    return Promise.resolve(true)
  }

  // -------- Style helpers ---------
  const isDarkTheme = () => {
    if (typeof document === 'undefined') return false
    const root = document.documentElement
    const ds = root.getAttribute('data-theme')
    if (ds === 'dark') return true
    if (ds === 'light') return false
    if (root.classList.contains('dark')) return true
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
  }

  // Determine edges color based on edgesMode override, else shading
  const getAdornerColor = (shading, eMode) => {
    // Edges mode override first
    switch ((eMode || 'AUTO').toUpperCase()) {
      case 'OFF':
        // hidden elsewhere; color irrelevant
        return 0x000000
      case 'DK GRAY':
      case 'DARK GRAY': {
        // Theme-aware contrast: slightly lighter than before
        const dark = isDarkTheme()
        return dark ? 0xaaaaaa : 0x6a6a6a
      }
      case 'LGT GRAY':
      case 'LIGHT GRAY':
        return 0xbfbfbf
      case 'WHITE':
        return 0xffffff
      case 'BLACK':
        return 0x000000
      case 'AUTO':
      default:
        break
    }
    // AUTO: derive from shading
    if (shading === 'GRAY') return 0xffffff
    if (shading === 'WHITE' || shading === 'CREAM') return isDarkTheme() ? 0xbfbfbf : 0x7a7a7a
    if (shading === 'BLACK' || shading === 'DARK' || shading === 'OFF') return isDarkTheme() ? 0xbfbfbf : 0x7a7a7a
    return 0x000000
  }

  // Map an explicit outline color mode to a hex color
  const getColorFromMode = (mode) => {
    switch ((mode || 'AUTO').toUpperCase()) {
      case 'DK GRAY':
      case 'DARK GRAY': {
        const dark = isDarkTheme()
        return dark ? 0xaaaaaa : 0x6a6a6a
      }
      case 'LGT GRAY':
      case 'LIGHT GRAY':
        return 0xbfbfbf
      case 'WHITE': return 0xffffff
      case 'BLACK': return 0x000000
      default: return null
    }
  }

  // Determine outline color based on outlineColorMode; AUTO follows edges color
  const getOutlineColor = (shading, eMode, oMode) => {
    const m = (oMode || 'AUTO').toUpperCase()
    if (m === 'OFF') return null
    if (m === 'AUTO') return getAdornerColor(shading, eMode)
    const c = getColorFromMode(m)
    return (c == null) ? getAdornerColor(shading, eMode) : c
  }

  // Build edges and silhouette adorners from current base model meshes
  const rebuildAdorners = () => {
    const group = modelGroupRef.current
    const edgesGroup = edgesRef.current
    const outlineGroup = outlineRef.current
    const wireGroup = wireframeRef.current
    if (!group || !edgesGroup || !outlineGroup) return
    if (useSourceMaterialsRef.current) {
      // When using source materials, keep adorners hidden and do not build them
      edgesGroup.visible = false
      outlineGroup.visible = false
      // Still ensure wireframe hidden to avoid double lines
      if (wireGroup) wireGroup.visible = false
      return
    }
    const edgesColor = getAdornerColor(shadingMode, edgesMode)
    const outlineColor = getOutlineColor(shadingMode, edgesMode, outlineColorMode)
    // clear existing adorners
    for (let i = edgesGroup.children.length - 1; i >= 0; i--) {
      const c = edgesGroup.children[i]
      edgesGroup.remove(c)
      c.geometry?.dispose?.()
      c.material?.dispose?.()
    }
    for (let i = outlineGroup.children.length - 1; i >= 0; i--) {
      const c = outlineGroup.children[i]
      outlineGroup.remove(c)
      c.geometry?.dispose?.()
      c.material?.dispose?.()
    }
    // Helper to test ancestry
    const isUnder = (node, ancestor) => {
      if (!node || !ancestor) return false
      let p = node.parent
      while (p) { if (p === ancestor) return true; p = p.parent }
      return false
    }
    // Collect base meshes first to avoid traversing newly added silhouette meshes
    const baseMeshes = []
    group.traverse((obj) => {
      if (!obj.isMesh || !obj.geometry) return
      if (isUnder(obj, wireGroup) || isUnder(obj, edgesGroup) || isUnder(obj, outlineGroup)) return
      baseMeshes.push(obj)
    })

    // add adorners per collected base mesh
    baseMeshes.forEach((obj) => {
      const geometry = obj.geometry
      // edges
      const edgeGeom = new THREE.EdgesGeometry(geometry, outlineThreshold || 45)
      const edgeSegGeom = new LineSegmentsGeometry()
      edgeSegGeom.setPositions(edgeGeom.attributes.position.array)
      const edgeMat = new LineMaterial({
        color: edgesColor,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        depthTest: true,
        linewidth: Math.min(3, Math.max(1, Number(edgesLineWidth) || 2)),
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      })
      edgeMat.resolution.copy(lineResolutionRef.current)
      const edgeLines = new LineSegments2(edgeSegGeom, edgeMat)
      edgeLines.renderOrder = 2
      edgesGroup.add(edgeLines)
      edgeGeom.dispose?.()
      // silhouette
      const silhouetteMat = new THREE.MeshBasicMaterial({
        color: outlineColor ?? 0x000000,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        transparent: false,
        opacity: 1.0,
      })
      if (outlineColor != null) {
        const silhouette = new THREE.Mesh(geometry.clone(), silhouetteMat)
        silhouette.scale.multiplyScalar(outlineScale || 1.02)
        silhouette.renderOrder = -1
        outlineGroup.add(silhouette)
      }
      // Soft outer silhouette for faux anti-aliasing
      const softMat = new THREE.MeshBasicMaterial({
        color: outlineColor ?? 0x000000,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        transparent: true,
        opacity: 0.25,
      })
      if (outlineColor != null) {
        const soft = new THREE.Mesh(geometry.clone(), softMat)
        const baseScale = (outlineScale || 1.02)
        soft.scale.multiplyScalar(baseScale * 1.004)
        soft.renderOrder = -2
        outlineGroup.add(soft)
      }
    })
  }

  const ensurePMREM = () => {
    const renderer = rendererRef.current
    if (!renderer) return null
    if (!pmremRef.current) pmremRef.current = new THREE.PMREMGenerator(renderer)
    return pmremRef.current
  }

  const clearStyle = () => {
    const scene = sceneRef.current
    if (!scene) return
    // remove lights
    lightRigRef.current.forEach(l => scene.remove(l))
    lightRigRef.current = []
    // clear env
    scene.environment = null
    if (envRTRef.current) {
      envRTRef.current.dispose()
      envRTRef.current = null
    }
    // Do not clear edges/silhouette here; they are rebuilt on geometry changes
  }

  // ---- Background presets ----
  const clearBackground = () => {
    const scene = sceneRef.current
    const r = bgRef.current || {}
    if (!scene) return
    // remove helpers/meshes
    if (r.grid) { scene.remove(r.grid); r.grid.geometry?.dispose?.(); r.grid.material?.dispose?.() }
    if (r.ground) { scene.remove(r.ground); r.ground.geometry?.dispose?.(); r.ground.material?.dispose?.() }
    if (r.sky) { scene.remove(r.sky); r.sky.geometry?.dispose?.(); r.sky.material?.dispose?.() }
    // dispose textures
    if (r.gradientTex) { r.gradientTex.dispose?.() }
    // clear fog
    scene.fog = null
    // clear background to default; applyStyle will set a base, applyBackground will override
    r.grid = r.ground = r.sky = null
    r.gradientTex = null
    bgRef.current = r
  }

  // Match the grid helper to the model's footprint and center in XZ
  const syncGridToModel = () => {
    const scene = sceneRef.current
    const r = bgRef.current || {}
    const grid = r.grid
    const group = modelGroupRef.current
    if (!scene || !grid || !group) return
    const box = new THREE.Box3().setFromObject(group)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const span = Math.max(1, Math.max(size.x, size.z))
    const target = (typeof r.floorSize === 'number' && r.floorSize > 0) ? r.floorSize : span
    const scale = target / 200
    grid.scale.setScalar(scale)
    // Prefer aligning grid just above the background ground plane when present
    let y
    if (r.ground && typeof r.ground.position?.y === 'number') {
      y = r.ground.position.y + 0.05 // slightly above floor plane for visibility
    } else {
      // Fallback: place just under the model's lowest point
      y = (isFinite(box.min.y) ? box.min.y : 0) - 0.001
    }
    grid.position.set(center.x, y, center.z)
  }

  // Ensure camera near/far planes encompass both model and background extents (grid/floor)
  const adjustCameraPlanes = (boxOverride) => {
    const camera = cameraRef.current
    if (!camera) return
    const r = bgRef.current || {}
    const box = boxOverride ? boxOverride.clone() : getActiveBounds()
    const sizeVec = box.getSize(new THREE.Vector3())
    const span = Math.max(1e-3, Math.max(sizeVec.x, sizeVec.y, sizeVec.z))
    const center = box.getCenter(new THREE.Vector3())
    const distance = camera.position.lengthSq() === 0 ? span * 5 : camera.position.distanceTo(center)
    const radius = Math.max(span * Math.sqrt(3) / 2, 1e-3)
    const floorSize = (typeof r.floorSize === 'number' && r.floorSize > 0) ? r.floorSize : 0
    const padding = Math.max(radius * 2, floorSize * 0.5, 10)
    let near = distance - radius * 1.25
    if (!Number.isFinite(near) || near <= 0) near = radius / 100
    near = Math.max(0.01, Math.min(near, radius / 5, 2))
    let far = distance + radius * 3 + padding
    if (!Number.isFinite(far) || far <= near) far = near + Math.max(radius * 10, 50)
    camera.near = near
    camera.far = far
    camera.updateProjectionMatrix()
  }

  const createVerticalGradientTexture = (topHex, bottomHex) => {
    const canvas = document.createElement('canvas')
    canvas.width = 2
    canvas.height = 256
    const ctx = canvas.getContext('2d')
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height)
    const toRGB = (hex) => `rgb(${(hex>>16)&255},${(hex>>8)&255},${hex&255})`
    grad.addColorStop(0, toRGB(topHex))
    grad.addColorStop(1, toRGB(bottomHex))
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.minFilter = THREE.LinearFilter
    tex.magFilter = THREE.LinearFilter
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    return tex
  }

  const applyBackground = (mode) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    if (!scene || !renderer) return
    clearBackground()
    const dark = isDarkTheme()
    const r = bgRef.current || {}
    switch ((mode || 'WHITE').toUpperCase()) {
      case 'WHITE': {
        scene.background = new THREE.Color(0xffffff)
        break
      }
      case 'GRADIENT': {
        const top = dark ? 0x0f0f0f : 0xf6f7fb
        const bottom = dark ? 0x2a2a2e : 0xdfe3ee
        const tex = createVerticalGradientTexture(top, bottom)
        scene.background = tex
        r.gradientTex = tex
        break
      }
      case 'GRID': {
        // Coarser grid helper; keep white-ish background for contrast, no fog
        const grid = new THREE.GridHelper(200, 20, dark ? 0x888888 : 0xeeeeee, dark ? 0x555555 : 0xeeeeee)
        grid.material.opacity = 0.35
        grid.material.transparent = true
        grid.position.y = -100
        scene.add(grid)
        r.grid = grid
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(1000, 1000),
          new THREE.MeshBasicMaterial({ color: dark ? 0x0a0a0a : 0xc0c0c0 })
        )
        ground.rotation.x = -Math.PI / 2
        ground.position.y = -100
        ground.renderOrder = -10
        scene.add(ground)
        r.ground = ground
        // Record floor unit size to scale grid accordingly
        r.floorSize = 1000
        scene.background = new THREE.Color(dark ? 0x080808 : 0xe0e0e0)
        scene.fog = null
        // size/position grid under current model
        syncGridToModel()
        // ensure camera planes cover the floor/grid extents right away
        adjustCameraPlanes()
        break
      }
      case 'HORIZON': {
        const top = dark ? 0x1a2a44 : 0xe0e0e0
        const bottom = dark ? 0x2b2b2b : 0xc0c0c0
        const tex = createVerticalGradientTexture(top, bottom)
        scene.background = tex
        r.gradientTex = tex
        // optional faint ground to anchor horizon
        const ground = new THREE.Mesh(
          new THREE.PlaneGeometry(1000, 1000),
          new THREE.MeshBasicMaterial({ color: bottom })
        )
        ground.rotation.x = -Math.PI / 2
        ground.position.y = -100
        ground.renderOrder = -10
        scene.add(ground)
        r.ground = ground
        scene.fog = new THREE.Fog(bottom, 200, 1000)
        break
      }
      default: {
        scene.background = new THREE.Color(0xffffff)
      }
    }
    bgRef.current = r
  }

  const createToonGradient = (steps = 5, dark = false) => {
    if (toonTexRef.current) return toonTexRef.current
    // Use power-of-two width to avoid internal format/LOD issues across WebGL implementations
    const width = 256
    const height = 1
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // Paint discrete bands across the width
    const bands = Math.max(2, Math.min(16, steps | 0))
    for (let i = 0; i < bands; i++) {
      const t = i / (bands - 1)
      const v = Math.round((dark ? (0.15 + 0.75 * t) : (0.25 + 0.7 * t)) * 255)
      ctx.fillStyle = `rgb(${v},${v},${v})`
      const x0 = Math.floor((i / bands) * width)
      const x1 = Math.floor(((i + 1) / bands) * width)
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height)
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    tex.wrapS = THREE.ClampToEdgeWrapping
    tex.wrapT = THREE.ClampToEdgeWrapping
    tex.minFilter = THREE.NearestFilter
    tex.magFilter = THREE.NearestFilter
    tex.generateMipmaps = false
    toonTexRef.current = tex
    return tex
  }

  const createMatcapTexture = (dark = false) => {
    if (matcapTexRef.current) return matcapTexRef.current
    const size = 256
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = size
    const ctx = canvas.getContext('2d')
    // radial gradient for soft plastic
    const g = ctx.createRadialGradient(size * 0.35, size * 0.35, size * 0.1, size * 0.5, size * 0.5, size * 0.6)
    const base = dark ? 0x262626 : 0xdedede
    const hi = dark ? 0x444444 : 0xffffff
    const lo = dark ? 0x141414 : 0xc8c8c8
    const toRGB = (hex) => `${(hex>>16)&255},${(hex>>8)&255},${hex&255}`
    g.addColorStop(0, `rgb(${toRGB(hi)})`)
    g.addColorStop(0.5, `rgb(${toRGB(base)})`)
    g.addColorStop(1, `rgb(${toRGB(lo)})`)
    ctx.fillStyle = g
    ctx.fillRect(0,0,size,size)
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    matcapTexRef.current = tex
    return tex
  }

  const createStyleMaterial = (mode) => {
    const dark = isDarkTheme()
    switch (mode) {
      case 'STUDIO':
        return new THREE.MeshPhysicalMaterial({
          color: dark ? 0x202020 : 0xe8e8e8,
          metalness: 0.05,
          roughness: 0.5,
          clearcoat: 0.25,
          clearcoatRoughness: 0.75,
        })
      case 'TOON': {
        const grad = createToonGradient(5, dark)
        const m = new THREE.MeshToonMaterial({ color: dark ? 0x2a2a2a : 0xe0e0e0, gradientMap: grad })
        return m
      }
      case 'MATCAP': {
        const matcap = createMatcapTexture(dark)
        return new THREE.MeshMatcapMaterial({ color: 0xffffff, matcap })
      }
      case 'OUTLINE':
        // Base on studio material; outline handled by edges overlay
        return new THREE.MeshPhysicalMaterial({
          color: dark ? 0x202020 : 0xededed,
          metalness: 0.05,
          roughness: 0.5,
          clearcoat: 0.2,
          clearcoatRoughness: 0.75,
        })
      case 'BASIC':
      default:
        return new THREE.MeshStandardMaterial({ color: 0xe0e0e0, metalness: 0.1, roughness: 0.8 })
    }
  }

  const applyStyle = (mode) => {
    const scene = sceneRef.current
    const renderer = rendererRef.current
    const modelGroup = modelGroupRef.current
    const edgesGroup = edgesRef.current
    const outlineGroup = outlineRef.current
    if (!renderer || !scene || !modelGroup || !edgesGroup || !outlineGroup) return

    // base background by theme (pure white for light theme to match prior UI)
    const dark = isDarkTheme()
    scene.background = new THREE.Color(dark ? 0x0b0b0c : 0xffffff)

    // Clear previous style lights/env/edges
    clearStyle()

    // Renderer defaults
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.0
    renderer.shadowMap.enabled = false

    // Lights and environment per style
    if (mode === 'BASIC') {
      // simple ambient + directional, no env (brighter)
      const amb = new THREE.AmbientLight(0xffffff, Math.max(0, Number(ambientLevel) || 0))
      const dir = new THREE.DirectionalLight(0xffffff, 1.0)
      // store baseIntensity so directionalLevel scales it
      dir.userData = { ...(dir.userData||{}), baseIntensity: 1.2 }
      dir.intensity = Math.max(0, (Number(directionalLevel) || 0) * dir.userData.baseIntensity)
      dir.position.set(3, 4, 5)
      scene.add(amb, dir)
      lightRigRef.current = [amb, dir]
      scene.environment = null
      // Slightly boost exposure for BASIC to lift midtones
      renderer.toneMappingExposure = 1.15
      // Do not force-hide edges; let edges visibility be controlled by edgesMode
      // Outline visibility is handled outside based on styleMode and outlineColorMode
    } else if (mode === 'STUDIO' || mode === 'OUTLINE') {
      // three-point light rig + room environment
      const key = new THREE.DirectionalLight(0xffffff, 1.0)
      key.position.set(5, 6, 4)
      const fill = new THREE.DirectionalLight(0xffffff, 0.4)
      fill.position.set(-6, 3, 2)
      const rim = new THREE.DirectionalLight(0xffffff, 0.6)
      rim.position.set(0, 4, -6)
      const amb = new THREE.AmbientLight(0xffffff, Math.max(0, Number(ambientLevel) || 0))
      // record base intensities and apply directionalLevel scale
      key.userData = { ...(key.userData||{}), baseIntensity: 1.0 }
      fill.userData = { ...(fill.userData||{}), baseIntensity: 0.4 }
      rim.userData = { ...(rim.userData||{}), baseIntensity: 0.6 }
      const dlev = Math.max(0, Number(directionalLevel) || 0)
      key.intensity = dlev * key.userData.baseIntensity
      fill.intensity = dlev * fill.userData.baseIntensity
      rim.intensity = dlev * rim.userData.baseIntensity
      scene.add(key, fill, rim, amb)
      lightRigRef.current = [key, fill, rim, amb]
      // Neutral room environment
      const pmrem = ensurePMREM()
      if (pmrem) {
        const env = new RoomEnvironment()
        const rt = pmrem.fromScene(env, 0.04)
        envRTRef.current = rt
        scene.environment = rt.texture
      }
    } else if (mode === 'TOON') {
      // Three-point rig for stronger shape definition; no env for clean banding
      const key = new THREE.DirectionalLight(0xffffff, 1.0)
      key.position.set(5, 6, 4)
      const fill = new THREE.DirectionalLight(0xffffff, 0.35)
      fill.position.set(-5, 2.5, 3)
      const rim = new THREE.DirectionalLight(0xffffff, 0.7)
      rim.position.set(-1, 4, -6)
      const amb = new THREE.AmbientLight(0xffffff, Math.max(0, Number(ambientLevel) || 0))
      // base intensities and scale
      key.userData = { ...(key.userData||{}), baseIntensity: 1.0 }
      fill.userData = { ...(fill.userData||{}), baseIntensity: 0.35 }
      rim.userData = { ...(rim.userData||{}), baseIntensity: 0.7 }
      const dlev2 = Math.max(0, Number(directionalLevel) || 0)
      key.intensity = dlev2 * key.userData.baseIntensity
      fill.intensity = dlev2 * fill.userData.baseIntensity
      rim.intensity = dlev2 * rim.userData.baseIntensity
      scene.add(key, fill, rim, amb)
      lightRigRef.current = [key, fill, rim, amb]
      scene.environment = null
      renderer.toneMapping = THREE.NoToneMapping
      renderer.toneMappingExposure = 1.0
    } else if (mode === 'MATCAP') {
      // no lights, no env (matcap ignores lighting)
      lightRigRef.current = []
      scene.environment = null
      renderer.toneMapping = THREE.NoToneMapping
      renderer.toneMappingExposure = 1.0
    }

    // Apply new base material to model meshes (skip adorners)
    const newMat = createStyleMaterial(mode)
    const wireGroup = wireframeRef.current
    const edgesG = edgesRef.current
    const outlineG = outlineRef.current
    const isUnder = (node, ancestor) => {
      if (!node || !ancestor) return false
      let p = node.parent
      while (p) { if (p === ancestor) return true; p = p.parent }
      return false
    }
    if (!useSourceMaterialsRef.current) {
      modelGroup.traverse((obj) => {
        if (obj.isMesh) {
          if (isUnder(obj, wireGroup) || isUnder(obj, edgesG) || isUnder(obj, outlineG)) return
          if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose?.())
          else obj.material?.dispose?.()
          obj.material = newMat.clone()
        }
      })
      // Reapply current shading choice
      applyShading(shadingMode)
    } else {
      // When using source materials, ensure adorners are hidden
      if (edgesG) edgesG.visible = false
      if (outlineG) outlineG.visible = false
      if (wireGroup) wireGroup.visible = false
    }
    // Ensure outline visibility aligns with style and outlineColorMode when shading not OFF
    if (outlineGroup) outlineGroup.visible = (shadingMode === 'OFF') ? false : ((mode === 'OUTLINE' || mode === 'TOON') && (outlineColorMode !== 'OFF'))
  }

  // Final render output
  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        position: 'relative',
        minWidth: 0,
        minHeight: 0,
        flex: '1 1 auto',
        alignSelf: 'stretch',
      }}
    />
  )
})
