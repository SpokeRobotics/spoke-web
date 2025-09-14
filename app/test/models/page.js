import React from 'react'
import ModelViewer from '@/components/model/ModelViewer'

export const metadata = {
  title: 'Model Viewer (Test)',
  description: 'Generic 3D model viewer (STL, 3MF, GLB/GLTF) with source-material support.',
}

export default function ModelViewerTestPage() {
  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ marginBottom: 8 }}>Model Viewer (Test)</h1>
      <p style={{ color: 'var(--gray-11)', marginBottom: 16 }}>
        A generic Three.js model viewer. It infers the loader by file extension. STL uses the CAD-style shading and tools; 3MF/GLB/GLTF use the models own materials and colors.
      </p>

      <ModelViewer id="model-demo-1" src="CrudeFrame.stl" height={300} expandedHeight={520} name="CrudeFrame" toolsEnabled={true} />

      <div style={{ height: 24 }} />

      <h2 style={{ margin: '8px 0' }}>Larger model</h2>
      <p style={{ color: 'var(--gray-11)', marginBottom: 8 }}>Heavy triangle count sample for stress testing.</p>
      <ModelViewer id="model-demo-2" src="SirayaTechTestModel2021.stl" height={300} expandedHeight={520} name="SirayaTechTestModel2021" toolsEnabled={true} />

      {/* Example placeholders for future formats (place files in public/models/test/stl or appropriate path): */}
      {/* <ModelViewer id="model-demo-3" src="YourMultiColorModel.3mf" height={300} expandedHeight={520} name="YourMultiColorModel" toolsEnabled={true} /> */}
      {/* <ModelViewer id="model-demo-4" src="YourTexturedScene.glb" height={300} expandedHeight={520} name="YourTexturedScene" toolsEnabled={true} /> */}
    </div>
  )
}
