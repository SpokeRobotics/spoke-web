import { Section, Box, Heading, Text, Separator } from '@radix-ui/themes'
import SelectionProvider from '@/components/designer/SelectionProvider.jsx'
import DesignerWorkspace from '@/components/designer/DesignerWorkspace.jsx'

export default function DesignerEditorPage() {
  return (
    <>
      <Section size="2" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <Box mb="5">
          <Heading size="8">Designer: Editor</Heading>
          <Text as="p" color="gray" size="4">
            3D System Viewer, Object Explorer, and JSON editor integrated workspace.
          </Text>
        </Box>
        <Separator my="5" size="4" />
      </Section>
      
      <Box style={{ width: '100%', maxWidth: '100vw', padding: '0 1rem' }}>
        <SelectionProvider>
          <DesignerWorkspace />
        </SelectionProvider>
      </Box>
    </>
  )
}
