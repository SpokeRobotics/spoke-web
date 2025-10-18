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
          <Heading size="6" mb="3">Example 1: Instance (Real Assembly)</Heading>
          <Text as="p" mb="3">
            Render the actual core robot instance with all its parts positioned via slot templates:
          </Text>
          
          <SystemViewer 
            objects={["spoke://instances/2l5nGL-4bTZ5y"]}
            height={520}
          />
        </Box>

        <Separator my="5" size="4" />

        <Box mb="5">
          <Heading size="6" mb="3">Example 2: Type Preview (Auto-Instantiate)</Heading>
          <Text as="p" mb="3">
            Preview a type by auto-instantiating it with templates. System creates temporary instances:
          </Text>
          
          <SystemViewer 
            objects={["spoke://types/segment/core-robot"]}
            height={520}
          />
        </Box>

        <Separator my="5" size="4" />

        <Box mb="5">
          <Heading size="6" mb="3">Example 3: Manual Composition (Types + Locations)</Heading>
          <Text as="p" mb="3">
            Manually compose a scene using types with custom positions. Great for documentation:
          </Text>
          
          <SystemViewer 
            objects={[
              { id: "spoke://types/structure/frame-96x64x32", location: { dx: 0, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://types/power/cell-18650", location: { dx: 20, dy: 0, dz: 0, rx: 0, ry: 0, rz: 0 } },
              { id: "spoke://types/power/cell-18650", location: { dx: -20, dy: 0, dz: 0, rx: 180, ry: 0, rz: 0 } },
              { id: "spoke://types/controller/esp32-controller", location: { dx: 0, dy: 14, dz: 0, rx: 180, ry: 0, rz: 0 } }
            ]}
            height={420}
          />
        </Box>

        <Separator my="5" size="4" />

        <Box>
          <Heading size="5" mb="3">Key Features</Heading>
          <ul style={{ marginTop: 8, lineHeight: 1.8 }}>
            <li><strong>Type/Instance Support:</strong> Render instances or auto-instantiate types with templates</li>
            <li><strong>Flexible Input:</strong> Instance IDs, type IDs, or manual type+location arrays</li>
            <li><strong>Slot Templates:</strong> Automatic child positioning via type slot templates</li>
            <li><strong>Type Inheritance:</strong> Hierarchical type chains with slot merging</li>
            <li><strong>Live Updates:</strong> Changes to store objects automatically update the viewer</li>
            <li><strong>3D Controls:</strong> Full ThreeCadViewer controls (rotate, zoom, pan, explode)</li>
          </ul>
        </Box>

        <Separator my="5" size="4" />

        <Box>
          <Heading size="5" mb="3">Object Model</Heading>
          <Text as="p" mb="2">
            <strong>Type Definition:</strong> Reusable template with slot definitions
          </Text>
          <pre style={{ 
            background: 'var(--gray-3)', 
            padding: 16, 
            borderRadius: 6,
            overflow: 'auto',
            fontSize: 13,
            lineHeight: 1.6,
            marginBottom: 16
          }}>
{`{
  "id": "spoke://types/power/cell-18650",
  "name": "18650 Cell",
  "slots": {},
  "model": {
    "url": "/models/18650Li-IonCell_1.3mf",
    "offset": [0, 0, -33],
    "rotation": [90, 0, 0]
  }
}`}
          </pre>
          <Text as="p" mb="2">
            <strong>Instance:</strong> Concrete object with type reference and specific properties
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
  "id": "spoke://instances/cell-left",
  "type": "spoke://types/power/cell-18650",
  "name": "Cell Left",
  "parent": "spoke://instances/my-robot",
  "parentSlot": "cells",
  "location": "-20,0,0,180,0,0"
}`}
          </pre>
        </Box>
      </Box>
    </Section>
  )
}
