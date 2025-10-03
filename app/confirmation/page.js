import { Section, Box, Heading, Text, Button, Flex } from '@radix-ui/themes'
import NextLink from 'next/link'

export const metadata = {
  title: 'Thank You - SPOKE ROBOTICS',
  description: 'Thank you for subscribing to SPOKE ROBOTICS.',
}

export default function ConfirmationPage() {
  return (
    <Section size="4">
      <Box className="container">
        <Flex direction="column" align="center" justify="center" style={{ minHeight: '60vh', textAlign: 'center' }}>
          <Heading size="9" mb="4">Thank you for subscribing!</Heading>
          <Text as="p" size="5" color="gray" mb="6">
            You'll hear from us soon.
          </Text>
          <Button asChild size="3">
            <NextLink href="/">Return to Home</NextLink>
          </Button>
        </Flex>
      </Box>
    </Section>
  )
}
