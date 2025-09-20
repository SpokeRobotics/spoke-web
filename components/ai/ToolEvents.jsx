'use client'

import { Box, Text, Code, Badge, Flex } from '@radix-ui/themes'

export default function ToolEvents({ events }) {
  if (!events || events.length === 0) return null
  return (
    <Box mt="2">
      <Text size="2" color="gray">Tool activity</Text>
      {events.map((ev, idx) => (
        <Box key={idx} mt="2" p="3" style={{ border: '1px solid var(--gray-5)', borderRadius: 8 }}>
          <Flex align="center" gap="2" mb="2">
            <Badge color="blue" variant="soft">{ev.name || ev.type || 'tool'}</Badge>
            <Text size="2" color="gray">{ev.status || 'observed'}</Text>
          </Flex>
          {ev.args && (
            <Box>
              <Text size="2">Args:</Text>
              <pre style={{ whiteSpace: 'pre-wrap' }}><Code>{JSON.stringify(ev.args, null, 2)}</Code></pre>
            </Box>
          )}
          {ev.result && (
            <Box mt="2">
              <Text size="2">Result:</Text>
              <pre style={{ whiteSpace: 'pre-wrap' }}><Code>{JSON.stringify(ev.result, null, 2)}</Code></pre>
            </Box>
          )}
        </Box>
      ))}
    </Box>
  )
}
