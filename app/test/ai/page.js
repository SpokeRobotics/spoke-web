'use client'

import NextLink from 'next/link'
import { Section, Box, Heading, Text, Separator, Button } from '@radix-ui/themes'
import Chat from '@/components/ai/Chat'

export default function AIPage() {
  return (
    <>
      <Section size="4">
        <Box className="container">
          <Box mb="5">
            <Heading size="8">AI Experiments</Heading>
            <Text as="p" color="gray" size="3">Client-only chat with provider token storage, streaming, images, system prompt, and basic tool visualization.</Text>
          </Box>

          <Box mb="4">
            <Button asChild variant="soft">
              <NextLink href="/test">Back to Test</NextLink>
            </Button>
          </Box>

          <Chat />
        </Box>
      </Section>
    </>
  )
}
