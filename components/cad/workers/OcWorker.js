// Module web worker that owns the OpenCascade runtime and heavy work
// Protocol:
//  - posts { type: 'ready' } after OC init
//  - receives { type: 'build', source: string }
//    -> executes user model code, meshes, returns typed arrays
//  - posts { type: 'buildResult', positions, normals, indices } with transferables
//  - posts { type: 'error', message }

import { loadOc } from '@/components/cad/OcLoader'
import { runBuildModel } from '@/components/cad/OcModelBuilder'

let oc = null
let lastShape = null

function cross(ax, ay, az, bx, by, bz) {
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]
}
function normalize(x, y, z) {
  const len = Math.hypot(x, y, z) || 1
  return [x / len, y / len, z / len]
}

function shapeToBuffers(oc, shape) {
  const mesher = new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false)
  mesher.Perform(new oc.Message_ProgressRange_1())
  if (!mesher.IsDone()) throw new Error('OpenCascade meshing failed in worker')

  const vertices = []
  const indices = []
  const normals = []

  const faceExplorer = new oc.TopExp_Explorer_2(
    shape,
    oc.TopAbs_ShapeEnum.TopAbs_FACE,
    oc.TopAbs_ShapeEnum.TopAbs_SHAPE
  )

  let vertexOffset = 0
  while (faceExplorer.More()) {
    const face = oc.TopoDS.Face_1(faceExplorer.Current())
    const location = new oc.TopLoc_Location_1()
    const purpose = oc.Poly_MeshPurpose?.Poly_MeshPurpose_SHADING ?? oc.Poly_MeshPurpose_SHADING ?? 0
    const triangulation = oc.BRep_Tool.Triangulation(face, location, purpose)

    if (!triangulation.IsNull()) {
      const transform = location.Transformation()
      const tri = triangulation.get()
      const nodeCount = tri.NbNodes()
      const triangleCount = tri.NbTriangles()

      for (let i = 1; i <= nodeCount; i++) {
        const node = tri.Node(i).Transformed(transform)
        vertices.push(node.X(), node.Y(), node.Z())
      }

      const faceOrientation = face.Orientation_1()
      const isReversed = faceOrientation === oc.TopAbs_Orientation.TopAbs_REVERSED

      for (let t = 1; t <= triangleCount; t++) {
        const triangle = tri.Triangle(t)
        const n1 = triangle.Value(1)
        const n2 = triangle.Value(2)
        const n3 = triangle.Value(3)

        const v1 = tri.Node(n1).Transformed(transform)
        const v2 = tri.Node(n2).Transformed(transform)
        const v3 = tri.Node(n3).Transformed(transform)

        const e1x = v2.X() - v1.X(), e1y = v2.Y() - v1.Y(), e1z = v2.Z() - v1.Z()
        const e2x = v3.X() - v1.X(), e2y = v3.Y() - v1.Y(), e2z = v3.Z() - v1.Z()
        let [nx, ny, nz] = cross(e1x, e1y, e1z, e2x, e2y, e2z)
        ;[nx, ny, nz] = normalize(nx, ny, nz)

        if (isReversed) {
          indices.push(
            vertexOffset + n1 - 1,
            vertexOffset + n3 - 1,
            vertexOffset + n2 - 1
          )
        } else {
          indices.push(
            vertexOffset + n1 - 1,
            vertexOffset + n2 - 1,
            vertexOffset + n3 - 1
          )
        }
        // flat normals: duplicate per vertex of triangle
        normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz)
      }

      vertexOffset += nodeCount
    }

    faceExplorer.Next()
  }

  if (vertices.length === 0) throw new Error('No vertices extracted from shape')

  const positions = new Float32Array(vertices)
  const nrm = new Float32Array(normals)
  const idx = new Uint32Array(indices)
  return { positions, normals: nrm, indices: idx }
}

async function ensureOc() {
  if (oc) return oc
  oc = await loadOc()
  // Notify client that worker is ready after first successful load
  self.postMessage({ type: 'ready' })
  return oc
}

self.addEventListener('message', async (ev) => {
  const msg = ev.data || {}
  try {
    if (msg.type === 'init') {
      await ensureOc()
      self.postMessage({ type: 'ready', id: msg.id })
      return
    }
    if (msg.type === 'build') {
      const oc = await ensureOc()
      const shape = runBuildModel(oc, msg.source || '')
      // cache for later exports
      lastShape = shape
      const { positions, normals, indices } = shapeToBuffers(oc, shape)
      self.postMessage(
        { type: 'buildResult', id: msg.id, positions, normals, indices },
        [positions.buffer, normals.buffer, indices.buffer]
      )
      return
    }
    if (msg.type === 'exportStep') {
      const oc = await ensureOc()
      // Reuse lastShape if available; otherwise (or if source provided) rebuild
      let shape = lastShape
      if (!shape || (msg.source && typeof msg.source === 'string')) {
        shape = runBuildModel(oc, msg.source || '')
        lastShape = shape
      }
      if (!shape) throw new Error('No shape available to export. Run build first.')

      const filename = msg.filename || 'model.step'
      // Clean any previous output
      try { oc.FS.unlink(filename) } catch {}

      const writer = new oc.STEPControl_Writer_1()
      const done = oc.IFSelect_ReturnStatus?.IFSelect_RetDone ?? 1
      const isDone = (v) => v === true || v === done
      const modes = [
        oc.STEPControl_StepModelType?.STEPControl_AsIs,
        oc.STEPControl_StepModelType?.STEPControl_ManifoldSolidBrep,
        oc.STEPControl_StepModelType?.STEPControl_FacetedBrep,
      ].filter((v) => typeof v === 'number')
      const progress = new oc.Message_ProgressRange_1()

      let lastStatus = -1
      let lastWrite = -1
      let ok = false
      for (const mode of modes.length ? modes : [0]) {
        try { writer.Model(true) } catch {}
        const st = writer.Transfer(shape, mode, true, progress)
        lastStatus = st
        if (!isDone(st)) continue
        const wr = writer.Write(filename)
        lastWrite = wr
        if (isDone(wr)) { ok = true; break }
      }
      if (!ok) {
        throw new Error(`STEP write failed (transfer=${lastStatus}, write=${lastWrite})`)
      }

      const dataArr = oc.FS.readFile(filename) // Uint8Array
      // Create a standalone ArrayBuffer for transfer
      const buf = dataArr.buffer.slice(dataArr.byteOffset, dataArr.byteOffset + dataArr.byteLength)
      self.postMessage({ type: 'exportStepResult', id: msg.id, filename, data: buf }, [buf])
      return
    }
    if (msg.type === 'loadStep') {
      const oc = await ensureOc()
      if (!msg.data || !(msg.data instanceof ArrayBuffer)) throw new Error('loadStep requires ArrayBuffer in msg.data')
      const filename = msg.filename || 'input.step'
      // write bytes to OC FS
      try { oc.FS.unlink(filename) } catch {}
      const uint8 = new Uint8Array(msg.data)
      oc.FS.writeFile(filename, uint8)
      try { console.log('[OC][worker] loadStep wrote', filename, 'bytes=', uint8.byteLength) } catch {}

      const reader = new oc.STEPControl_Reader_1()
      const IFSelect = oc.IFSelect_ReturnStatus ?? {}
      const RetDone = IFSelect.IFSelect_RetDone ?? 1
      const readStatus = reader.ReadFile(filename)
      const readOk = (readStatus === true) || (readStatus === RetDone) || (readStatus === 1)
      if (!readOk) throw new Error(`STEP read failed: status=${readStatus}`)
      const transferred = reader.TransferRoots(new oc.Message_ProgressRange_1())
      const transferredCount = (typeof transferred === 'number') ? transferred : (transferred === true ? 1 : 0)
      try { console.log('[OC][worker] TransferRoots returned', transferred, '=> count=', transferredCount) } catch {}
      if (transferredCount <= 0) throw new Error(`STEP transfer produced no roots`)
      const shape = reader.OneShape()
      if (!shape || shape.IsNull?.()) throw new Error('STEP yielded no shape')
      // cache for export
      lastShape = shape
      const { positions, normals, indices } = shapeToBuffers(oc, shape)
      if (!positions || positions.length === 0) throw new Error('Meshing produced no vertices')
      try { console.log('[OC][worker] loadStep meshed', { verts: positions.length/3, tris: indices.length/3 }) } catch {}
      self.postMessage(
        { type: 'buildResult', id: msg.id, positions, normals, indices },
        [positions.buffer, normals.buffer, indices.buffer]
      )
      return
    }
  } catch (e) {
    const message = e?.message || String(e)
    self.postMessage({ type: 'error', id: msg.id, message })
  }
})

// Lazy init: OpenCascade will be loaded only when first message is received.
// This prevents mobile browser crashes from eager loading on all pages.
