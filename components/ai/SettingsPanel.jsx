'use client'

import { useEffect, useState } from 'react'
import { Box, Flex, Text, TextField, Button, Select, TextArea, Badge, Separator, Checkbox } from '@radix-ui/themes'
import { Providers, getDefaultCapabilities } from '@/lib/ai/providers/base'
import { getToken, setToken, removeToken } from '@/lib/ai/token-store'
import { getOpenAIDefaultModels, validateModel as openaiValidateModel } from '@/lib/ai/providers/openai'
import { listModels as ollamaListModels, validateModel as ollamaValidateModel, listRunningModels as ollamaListRunning } from '@/lib/ai/providers/ollama'
import { getHuggingFaceDefaultModels, listModels as hfListModels, validateModel as hfValidateModel } from '@/lib/ai/providers/huggingface'
import { mergeModelsWithPrefs, loadValidatedModels } from '@/lib/ai/model-prefs'
import ModelManager from './ModelManager'

export default function SettingsPanel({ provider, setProvider, model, setModel, systemPrompt, setSystemPrompt, onCapabilities, renderMarkdown, setRenderMarkdown, onRestoreDefault }) {
  const [token, setTokenState] = useState('')
  const [masked, setMasked] = useState(false)
  const [models, setModels] = useState([])
  const [caps, setCaps] = useState(getDefaultCapabilities(provider))
  const [validating, setValidating] = useState(false)
  const [validationMsg, setValidationMsg] = useState('')
  const [showManager, setShowManager] = useState(false)
  const [validatedIds, setValidatedIds] = useState([])
  const [runningIds, setRunningIds] = useState([])

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
    async function refresh() {
      if (provider === Providers.OPENAI) {
        const base = getOpenAIDefaultModels()
        setModels(mergeModelsWithPrefs(provider, base))
        setValidatedIds(loadValidatedModels(provider))
        setRunningIds([])
      } else if (provider === Providers.OLLAMA) {
        try {
          const base = await ollamaListModels()
          setModels(mergeModelsWithPrefs(provider, base))
        } catch {
          setModels(mergeModelsWithPrefs(provider, []))
        }
        setValidatedIds(loadValidatedModels(provider))
        try {
          const running = await ollamaListRunning()
          setRunningIds(Array.isArray(running) ? running : [])
        } catch {
          setRunningIds([])
        }
      } else if (provider === Providers.HUGGINGFACE) {
        const base = getHuggingFaceDefaultModels()
        try {
          const listed = await hfListModels({ limit: 30 })
          setModels(mergeModelsWithPrefs(provider, [...base, ...listed]))
        } catch {
          setModels(mergeModelsWithPrefs(provider, base))
        }
        setValidatedIds(loadValidatedModels(provider))
        setRunningIds([])
      } else {
        setModels(mergeModelsWithPrefs(provider, []))
        setValidatedIds(loadValidatedModels(provider))
        setRunningIds([])
      }
    }
    refresh()
  }, [provider])

  // React to external validation updates (e.g., after a successful chat)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = () => setValidatedIds(loadValidatedModels(provider))
    window.addEventListener('ai:models:validated:changed', handler)
    return () => {
      window.removeEventListener('ai:models:validated:changed', handler)
    }
  }, [provider])

  // React to external running status updates from ModelManager
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (provider !== Providers.OLLAMA) return
    const handler = async () => {
      try {
        const running = await ollamaListRunning()
        setRunningIds(Array.isArray(running) ? running : [])
      } catch {
        setRunningIds([])
      }
    }
    window.addEventListener('ai:models:running:changed', handler)
    return () => {
      window.removeEventListener('ai:models:running:changed', handler)
    }
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
      } else if (provider === Providers.HUGGINGFACE) {
        await hfValidateModel(model)
      } else {
        throw new Error('Validation not implemented for this provider')
      }
      setValidationMsg('Model is available for your token.')
    } catch (e) {
      const msg = `Validation failed: ${e.message}`
      setValidationMsg(msg)
      try { if (typeof window !== 'undefined') alert(msg) } catch {}
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
              <Select.Item value={Providers.HUGGINGFACE}>Hugging Face</Select.Item>
            </Select.Content>
          </Select.Root>
        </Box>
        <Box style={{ flex: 2, minWidth: 280 }}>
          <Text size="2" weight="bold">Model</Text>
          <Flex gap="2" align={{ initial: 'stretch', sm: 'end' }} direction={{ initial: 'column', sm: 'row' }}>
            <Box style={{ flex: 1 }}>
              {models.length > 0 ? (
                <Select.Root
                  value={model}
                  onValueChange={setModel}
                  onOpenChange={async (open) => {
                    if (!open) return
                    if (provider !== Providers.OLLAMA) return
                    try {
                      const running = await ollamaListRunning()
                      setRunningIds(Array.isArray(running) ? running : [])
                    } catch {
                      setRunningIds([])
                    }
                  }}
                >
                  <Select.Trigger style={{ width: '100%' }} />
                  <Select.Content>
                    {models.map(m => {
                      const isValidated = validatedIds.includes(m.id)
                      const isRunning = provider === Providers.OLLAMA && runningIds.includes(m.id)
                      // Use simple glyphs so they also appear in the closed trigger
                      const glyphs = `${isRunning ? '🟢 ' : ''}${isValidated ? '✓ ' : ''}`
                      const labelText = `${m.label} ${glyphs}`.trim()
                      return (
                        <Select.Item key={m.id} value={m.id} style={{ color: isValidated ? undefined : 'var(--gray-8)' }}>
                          {labelText}
                        </Select.Item>
                      )
                    })}
                  </Select.Content>
                </Select.Root>
              ) : (
                <TextField.Root value={model} onChange={e => setModel(e.target.value)} placeholder="Enter model id" style={{ width: '100%' }} />
              )}
            </Box>
            <Button onClick={async () => {
              if (provider === Providers.OLLAMA) {
                try {
                  const running = await ollamaListRunning()
                  setRunningIds(Array.isArray(running) ? running : [])
                } catch {
                  setRunningIds([])
                }
              }
              setShowManager(true)
            }}>Manage…</Button>
          </Flex>
        </Box>
      </Flex>

      <Separator my="3" size="4" />

      {showManager && (
        <ModelManager
          provider={provider}
          onClose={() => setShowManager(false)}
          onChanged={() => {
            // refresh models after changes
            if (provider === Providers.OPENAI) {
              const base = getOpenAIDefaultModels()
              setModels(mergeModelsWithPrefs(provider, base))
              setValidatedIds(loadValidatedModels(provider))
              setRunningIds([])
            } else if (provider === Providers.OLLAMA) {
              ;(async () => {
                try {
                  const base = await ollamaListModels()
                  setModels(mergeModelsWithPrefs(provider, base))
                } catch {
                  setModels(mergeModelsWithPrefs(provider, []))
                }
                setValidatedIds(loadValidatedModels(provider))
                try {
                  const running = await ollamaListRunning()
                  setRunningIds(Array.isArray(running) ? running : [])
                } catch {
                  setRunningIds([])
                }
              })()
            } else if (provider === Providers.HUGGINGFACE) {
              const base = getHuggingFaceDefaultModels()
              ;(async () => {
                try {
                  const listed = await hfListModels({ limit: 30 })
                  setModels(mergeModelsWithPrefs(provider, [...base, ...listed]))
                } catch {
                  setModels(mergeModelsWithPrefs(provider, base))
                }
                setValidatedIds(loadValidatedModels(provider))
                setRunningIds([])
              })()
            }
          }}
        />
      )}

      <Text size="2" weight="bold">System Prompt</Text>
      <TextArea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} rows={4} placeholder="You are a helpful AI..." />
      <Flex gap="2" mt="2">
        <Button variant="soft" onClick={() => onRestoreDefault && onRestoreDefault()}>Restore default</Button>
      </Flex>

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

      <Separator my="3" size="4" />

      <Text size="2" weight="bold">Rendering</Text>
      <Flex align="center" gap="2" mt="2">
        <Checkbox checked={!!renderMarkdown} onCheckedChange={(v) => setRenderMarkdown(Boolean(v))} />
        <Text size="2">Render Markdown in assistant messages</Text>
      </Flex>
    </Box>
  )
}
