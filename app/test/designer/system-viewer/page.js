import { Section, Box, Heading, Text, Separator, Flex } from '@radix-ui/themes'
import SystemViewer from '@/components/designer/SystemViewer.jsx'
import ResetStoreButton from '@/components/designer/ResetStoreButton'

export default function SystemViewerPage() {
  return (
    <Section size="4">
      <Box className="container">
        <Flex mb="5" justify="between" align="start" gap="3">
          <Box>
            <Heading size="8">Designer: SystemViewer</Heading>
            <Text as="p" color="gray" size="4">
              Display and manipulate robot parts from the store with 3D visualization.
              Unlike ModelViewer which uses static files, SystemViewer sources objects from the designer store.
            </Text>
          </Box>
          <ResetStoreButton size="1" />
        </Flex>

        <Separator my="5" size="4" />

        <Box mb="5">
          <Heading size="6" mb="3">Complete Robot with Electronics</Heading>
          <Text as="p" mb="3">
            Body structure plus electronic components loaded from the designer store:
          </Text>
          
          <SystemViewer 
            objects={[
              { id: "spoke://docs/part-frame", location: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-panel-64x32", location: { dx: 0, dy: 0, dz: 48, rx: 90, ry: 0, rz: 90 } },
              { id: "spoke://docs/part-panel-64x32", location: { dx: 0, dy: 0, dz: -48, rx: -90, ry: 0, rz: 90 } },
              { id: "spoke://docs/part-top-panel", location: { dx: 0, dy: 16, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-bottom-panel", location: { dx: 0, dy: -16, dz: 0, rx: 180, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-bottom-panel-door", location: { dx: 0, dy: -16, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-panel-96x32", location: { dx: 32, dy: 0, dz: 0, rx: 0, ry: 0, rz: -90 } },
              { id: "spoke://docs/part-panel-96x32", location: { dx: -32, dy: 0, dz: 0, rx: 0, ry: 0, rz: 90 } },
              { id: "spoke://docs/part-battery", location: { dx: 20, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-battery", location: { dx: -20, dy: 0, dz: 0, rx: 180, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-charger", location: { dx: -12, dy: -13, dz: -18, rx: 0, ry: 0, rz: -90 } },
              { id: "spoke://docs/part-wpc-board", location: { dx: -13, dy: -13, dz: -22, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-wpc-coil", location: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-controller", location: { dx: 0, dy: 14, dz: 0, rx: 180, ry: 0, rz: 0 } },
              { id: "spoke://docs/part-mag-connector", location: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } }
            ]}
            height={520}
          />
        </Box>

        <Separator my="5" size="4" />

        <Box>
          <Heading size="5" mb="3">Key Features</Heading>
          <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
            <li><strong>Store Integration:</strong> Objects defined in store with <code>model</code> section</li>
            <li><strong>Type Inheritance:</strong> Instances can reference type definitions via <code>$type</code></li>
            <li><strong>Live Updates:</strong> Changes to store objects automatically update the viewer</li>
            <li><strong>Flexible Input:</strong> Accept object IDs via props or markdown table</li>
            <li><strong>3D Controls:</strong> Full ThreeCadViewer controls (rotate, zoom, pan)</li>
            <li><strong>Auto-positioning:</strong> Objects positioned using model offset/rotation</li>
          </ul>
        </Box>

        <Separator my="5" size="4" />

        <Box>
          <Heading size="5" mb="3">Store Object Structure</Heading>
          <Text as="p" mb="2">
            Store objects for SystemViewer should have this structure:
          </Text>
          <pre style={{ 
            background: 'var(--gray-3)', 
            padding: 16, 
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6
          }}>
{`{
  "$id": "spoke://docs/part-frame",
  "$type": "spoke/part/frame",
  "title": "Frame 96x64x32",
  "model": {
    "url": "/models/Cuboid_96x_64_32_4mm_Frame.3mf",
    "offset": [0, 0, 0],
    "rotation": [0, 0, 0]
  },
  "meta": {
    "origin": "site"
  }
}`}
          </pre>
        </Box>
      </Box>
    </Section>
  )
}
