'use client'

import { useEffect, useState } from 'react'
import { Box, Flex, Text, TextField, Button, Select, TextArea, Badge, Separator } from '@radix-ui/themes'
import { Providers, getDefaultCapabilities } from '@/lib/ai/providers/base'
import { getToken, setToken, removeToken } from '@/lib/ai/token-store'
import { getOpenAIDefaultModels, validateModel as openaiValidateModel } from '@/lib/ai/providers/openai'
import { listModels as ollamaListModels, validateModel as ollamaValidateModel } from '@/lib/ai/providers/ollama'

export default function SettingsPanel({ provider, setProvider, model, setModel, systemPrompt, setSystemPrompt, onCapabilities }) {
  const [token, setTokenState] = useState('')
  const [masked, setMasked] = useState(false)
  const [models, setModels] = useState([])
  const [caps, setCaps] = useState(getDefaultCapabilities(provider))
  const [validating, setValidating] = useState(false)
  const [validationMsg, setValidationMsg] = useState('')

  // Load token from storage on mount/provider change
  useEffect(() => {
    const t = getToken(provider)
    if (t) {
      setMasked(true)
      setTokenState('••••••••••••••••')
    } else {
      setMasked(false)
      setTokenState('')
    }
  }, [provider])

  useEffect(() => {
    let m = []
    if (provider === Providers.OPENAI) {
      m = getOpenAIDefaultModels()
    } else if (provider === Providers.OLLAMA) {
      // fetch models from local Ollama; ignore errors and fall back to manual input
      ;(async () => {
        try {
          const list = await ollamaListModels()
          setModels(list)
        } catch {
          setModels([])
        }
      })()
      return
    }
    setModels(m)
  }, [provider])

  useEffect(() => {
    const c = getDefaultCapabilities(provider)
    setCaps(c)
    if (onCapabilities) onCapabilities(c)
  }, [provider, onCapabilities])

  function handleSaveToken() {
    const value = masked ? getToken(provider) : token
    if (!value) return
    setToken(provider, value)
    setMasked(true)
    setTokenState('••••••••••••••••')
  }

  function handleRemoveToken() {
    removeToken(provider)
    setMasked(false)
    setTokenState('')
  }

  function handleTokenInputChange(v) {
    setMasked(false)
    setTokenState(v)
  }

  async function handleValidateModel() {
    setValidationMsg('')
    setValidating(true)
    try {
      if (provider === Providers.OPENAI) {
        await openaiValidateModel(model)
      } else if (provider === Providers.OLLAMA) {
        await ollamaValidateModel(model)
      } else {
        throw new Error('Validation not implemented for this provider')
      }
      setValidationMsg('Model is available for your token.')
    } catch (e) {
      setValidationMsg(`Validation failed: ${e.message}`)
    } finally {
      setValidating(false)
    }
  }

  return (
    <Box p="3" style={{ border: '1px solid var(--gray-5)', borderRadius: 8 }}>
      <Flex gap="4" direction={{ initial: 'column', sm: 'row' }}>
        <Box style={{ flex: 1, minWidth: 220 }}>
          <Text size="2" weight="bold">Provider</Text>
          <Select.Root value={provider} onValueChange={setProvider}>
            <Select.Trigger style={{ width: '100%' }} />
            <Select.Content>
              <Select.Item value={Providers.OPENAI}>OpenAI</Select.Item>
              <Select.Item value={Providers.OLLAMA}>Ollama</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
        <Box style={{ flex: 2, minWidth: 280 }}>
          <Text size="2" weight="bold">Model</Text>
          <Flex gap="2" align={{ initial: 'stretch', sm: 'end' }} direction={{ initial: 'column', sm: 'row' }}>
            <Box style={{ flex: 1 }}>
              {models.length > 0 ? (
                <Select.Root value={model} onValueChange={setModel}>
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    {models.map(m => (
                      <Select.Item key={m.id} value={m.id}>{m.label}</Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              ) : (
                <TextField.Root value={model} onChange={e => setModel(e.target.value)} placeholder="Enter model id" style={{ width: '100%' }} />
              )}
            </Box>
            <Button size="1" variant="soft" disabled={validating || !model} onClick={handleValidateModel}>
              {validating ? 'Validating…' : 'Validate model'}
            </Button>
          </Flex>
          <Box mt="1" style={{ minHeight: 18 }}>
            {validationMsg && (
              <Text size="1" color={validationMsg.startsWith('Validation failed') ? 'red' : 'green'}>{validationMsg}</Text>
            )}
          </Box>
        </Box>
      </Flex>

      <Separator my="3" size="4" />

      <Text size="2" weight="bold">System Prompt</Text>
      <TextArea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={4} placeholder="You are a helpful AI..." />

      <Separator my="3" size="4" />

      <Text size="2" weight="bold">Token & Privacy</Text>
      <Flex gap="2" align="center" mt="2">
        <TextField.Root
          value={token}
          onChange={e => handleTokenInputChange(e.target.value)}
          type="password"
          placeholder={masked ? 'Token saved' : 'Enter API token'}
          style={{ flex: 1 }}
        />
        <Button onClick={handleSaveToken}>Save</Button>
        <Button color="red" variant="soft" onClick={handleRemoveToken}>Remove</Button>
      </Flex>
      <Text size="1" color="gray">Stored locally in your browser for this provider. Prototype only.</Text>

      <Separator my="3" size="4" />

      <Text size="2" weight="bold">Capabilities</Text>
      <Flex gap="2" mt="2" wrap="wrap">
        <Badge color={caps.text ? 'green' : 'gray'}>Text</Badge>
        <Badge color={caps.images ? 'green' : 'gray'}>Images</Badge>
        <Badge color={caps.tools ? 'green' : 'gray'}>Tools</Badge>
        <Badge color={caps.audio ? 'green' : 'gray'}>Audio</Badge>
      </Flex>
    </Box>
  )
}
