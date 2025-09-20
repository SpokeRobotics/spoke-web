'use client'

import { useState, useRef } from 'react'
import { Box, Flex, TextArea, Button, IconButton, Text } from '@radix-ui/themes'
import { Image, Square, RefreshCw, Send } from 'lucide-react'

export default function Composer({ onSend, onStop, onRetry, disabled, supportsImages }) {
  const [input, setInput] = useState('')
  const [files, setFiles] = useState([])
  const fileRef = useRef(null)

  function handleImagePick(e) {
    const f = Array.from(e.target.files || [])
    setFiles(f)
  }

  async function filesToDataUrls(fl) {
    const results = []
    for (const file of fl) {
      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      results.push(data)
    }
    return results
  }

  async function handleSend() {
    if (!input.trim() && files.length === 0) return
    const images = supportsImages ? await filesToDataUrls(files) : []
    onSend({ text: input, images })
    setInput('')
    setFiles([])
    if (fileRef.current) fileRef.current.value = ''
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <Box p="3" style={{ borderTop: '1px solid var(--gray-5)' }}>
      {files.length > 0 && (
        <Text size="2" color="gray">{files.length} image(s) attached</Text>
      )}
      <Flex align="center" gap="2" mt="2">
        <TextArea
          placeholder="Type a message..."
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          style={{ flex: 1 }}
          rows={3}
        />
        {supportsImages && (
          <>
            <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleImagePick} />
            <IconButton variant="soft" color="gray" onClick={() => fileRef.current && fileRef.current.click()} disabled={disabled}>
              <Image size={18} />
            </IconButton>
          </>
        )}
        <IconButton variant="soft" color="red" onClick={onStop} disabled={disabled} title="Stop">
          <Square size={18} />
        </IconButton>
        <IconButton variant="soft" color="gray" onClick={onRetry} disabled={disabled} title="Retry last">
          <RefreshCw size={18} />
        </IconButton>
        <Button onClick={handleSend} disabled={disabled}>
          <Send size={16} />
          Send
        </Button>
      </Flex>
    </Box>
  )
}
