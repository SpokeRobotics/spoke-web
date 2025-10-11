import { Section, Box, Heading, Text, Separator } from '@radix-ui/themes'
import SystemViewer from '@/components/designer/SystemViewer.jsx'

export default function SystemViewerPage() {
  return (
    <Section size="4">
      <Box className="container">
        <Box mb="5">
          <Heading size="8">Designer: SystemViewer</Heading>
          <Text as="p" color="gray" size="4">
            Display and manipulate robot parts from the store with 3D visualization.
            Unlike ModelViewer which uses static files, SystemViewer sources objects from the designer store.
          </Text>
        </Box>

        <Separator my="5" size="4" />

        <Box mb="5">
          <Heading size="6" mb="3">Complete Robot with Electronics</Heading>
          <Text as="p" mb="3">
            Body structure plus electronic components loaded from the designer store:
          </Text>
          
          <SystemViewer 
            objects={[
              "spoke://docs/part-frame",
              "spoke://docs/part-front-panel",
              "spoke://docs/part-rear-panel",
              "spoke://docs/part-top-panel",
              "spoke://docs/part-bottom-panel",
              "spoke://docs/part-bottom-panel-door",
              "spoke://docs/part-left-panel",
              "spoke://docs/part-right-panel",
              "spoke://docs/part-left-battery",
              "spoke://docs/part-right-battery",
              "spoke://docs/part-charger",
              "spoke://docs/part-wpc-board",
              "spoke://docs/part-wpc-coil",
              "spoke://docs/part-controller",
              "spoke://docs/part-mag-connector"
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
