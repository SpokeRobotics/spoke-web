'use client'

import { useEffect, useMemo, useState } from 'react'
import { Box, Flex, Text, TextField, Button, Checkbox, Separator, Badge, Card, IconButton } from '@radix-ui/themes'
import { Providers } from '@/lib/ai/providers/base'
import { getOpenAIDefaultModels } from '@/lib/ai/providers/openai'
import { listModels as ollamaListModels, listRunningModels as ollamaListRunning } from '@/lib/ai/providers/ollama'
import { getHuggingFaceDefaultModels, listModels as hfListModels, validateModel as hfValidateModel } from '@/lib/ai/providers/huggingface'
import {
  loadCustomModels,
  saveCustomModels,
  loadHiddenModels,
  saveHiddenModels,
  loadValidatedModels,
  saveValidatedModels,
} from '@/lib/ai/model-prefs'
import { validateModel as openaiValidateModel } from '@/lib/ai/providers/openai'
import { validateModel as ollamaValidateModel } from '@/lib/ai/providers/ollama'

export default function ModelManager({ provider, onClose, onChanged }) {
  const [base, setBase] = useState([])
  const [customs, setCustoms] = useState([])
  const [hidden, setHidden] = useState([])
  const [validated, setValidated] = useState([])
  const [running, setRunning] = useState([])
  const [newId, setNewId] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [validatingId, setValidatingId] = useState('')
  const [statusMsg, setStatusMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [lastRunningAt, setLastRunningAt] = useState(null)
  const [tokenRequired, setTokenRequired] = useState([]) // HF only, ids that failed due to missing token

  // Load provider base list + prefs
  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        if (provider === Providers.OPENAI) {
          const baseList = getOpenAIDefaultModels()
          if (mounted) setBase(baseList)
        } else if (provider === Providers.OLLAMA) {
          try {
            const baseList = await ollamaListModels()
            if (mounted) setBase(baseList)
          } catch {
            if (mounted) setBase([])
          }
        } else if (provider === Providers.HUGGINGFACE) {
          try {
            const defaults = getHuggingFaceDefaultModels()
            let listed = []
            try { listed = await hfListModels({ limit: 30 }) } catch {}
            if (mounted) setBase([...(defaults || []), ...(listed || [])])
          } catch {
            if (mounted) setBase([])
          }
        } else {
          if (mounted) setBase([])
        }
      } finally {
        if (mounted) {
          setCustoms(loadCustomModels(provider))
          setHidden(loadHiddenModels(provider))
          setValidated(loadValidatedModels(provider))
          if (provider === Providers.OLLAMA) {
            try {
              const r = await ollamaListRunning()
              if (mounted) setRunning(Array.isArray(r) ? r : [])
              if (mounted) setLastRunningAt(new Date())
            } catch {
              if (mounted) setRunning([])
            }
          } else {
            setRunning([])
          }
        }
      }
    }
    load()
    return () => { mounted = false }
  }, [provider])

  // React to external running status updates (e.g., when a chat starts streaming on Ollama)
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (provider !== Providers.OLLAMA) return
    const handler = async () => {
      try {
        const r = await ollamaListRunning()
        setRunning(Array.isArray(r) ? r : [])
        setLastRunningAt(new Date())
      } catch {
        setRunning([])
      }
    }
    window.addEventListener('ai:models:running:changed', handler)
    return () => {
      window.removeEventListener('ai:models:running:changed', handler)
    }
  }, [provider])

  const hiddenSet = useMemo(() => new Set(hidden), [hidden])

  const merged = useMemo(() => {
    const map = new Map()
    for (const m of base) if (m && m.id) map.set(m.id, m)
    for (const m of customs) if (m && m.id) map.set(m.id, { id: m.id, label: m.label || m.id })
    const list = Array.from(map.values())
    list.sort((a, b) => (a.label || a.id).localeCompare(b.label || b.id))
    return list
  }, [base, customs])

  function toggleHidden(id) {
    setHidden(prev => {
      const s = new Set(prev)
      if (s.has(id)) s.delete(id)
      else s.add(id)
      return Array.from(s)
    })
  }

  function removeCustom(id) {
    setCustoms(prev => prev.filter(m => m.id !== id))
    // If it was hidden, also unhide implicitly
    setHidden(prev => prev.filter(x => x !== id))
    // Also remove validated flag so dropdown reflects state
    setValidated(prev => prev.filter(x => x !== id))
  }

  function addCustom() {
    const id = (newId || '').trim()
    if (!id) return
    const label = (newLabel || '').trim() || id
    // Prevent dupes
    const exists = customs.some(m => m.id === id) || base.some(m => m.id === id)
    if (exists) {
      // If exists in base, just unhide if hidden
      setHidden(prev => prev.filter(x => x !== id))
      setNewId('')
      setNewLabel('')
      return
    }
    setCustoms(prev => [...prev, { id, label }])
    setNewId('')
    setNewLabel('')
  }

  async function validateOne(id) {
    if (!id) return
    setValidatingId(id)
    try {
      if (provider === Providers.OPENAI) {
        await openaiValidateModel(id)
      } else if (provider === Providers.OLLAMA) {
        await ollamaValidateModel(id)
      } else if (provider === Providers.HUGGINGFACE) {
        await hfValidateModel(id)
      }
      setValidated(prev => {
        const next = Array.from(new Set([...prev, id]))
        // Persist immediately so dropdowns reflect ✓ without needing Save
        try { saveValidatedModels(provider, next) } catch {}
        try { if (typeof window !== 'undefined') window.dispatchEvent(new Event('ai:models:validated:changed')) } catch {}
        return next
      })
      // Clear token-required badge if present
      setTokenRequired(prev => prev.filter(x => x !== id))
      setStatusMsg(`Validated: ${id}`)
      setTimeout(() => setStatusMsg(''), 2000)
    } catch (e) {
      const msg = `Validation failed for ${id}: ${e.message}`
      setErrorMsg(msg)
      if (provider === Providers.HUGGINGFACE && /requires a Hugging Face API token/i.test(String(e?.message || ''))) {
        setTokenRequired(prev => Array.from(new Set([...prev, id])))
      }
      setTimeout(() => setErrorMsg(''), 3000)
    } finally {
      setValidatingId('')
    }
  }

  async function validateAllVisible() {
    const visible = merged.filter(m => !hiddenSet.has(m.id)).map(m => m.id)
    setBusy(true)
    try {
      for (const id of visible) {
        // eslint-disable-next-line no-await-in-loop
        await validateOne(id)
      }
    } finally {
      setBusy(false)
    }
  }

  async function refreshRunning() {
    if (provider !== Providers.OLLAMA) return
    try {
      const r = await ollamaListRunning()
      setRunning(Array.isArray(r) ? r : [])
      setLastRunningAt(new Date())
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('ai:models:running:changed'))
      }
    } catch {
      setRunning([])
    }
  }

  function save() {
    setBusy(true)
    try {
      saveCustomModels(provider, customs)
      saveHiddenModels(provider, hidden)
      saveValidatedModels(provider, validated)
      if (onChanged) onChanged()
      if (onClose) onClose()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card variant="surface" style={{ marginBottom: 16, border: '1px solid var(--gray-5)' }}>
      <Box p="3">
        <Flex align="center" justify="between" wrap="wrap">
          <Box>
            <Text size="3" weight="bold">Manage Models</Text>
            <Text as="p" color="gray" size="2">Provider: <b>{provider}</b></Text>
            {provider === Providers.OLLAMA && lastRunningAt && (
              <Text as="p" color="gray" size="1">Running status as of {lastRunningAt.toLocaleTimeString()}</Text>
            )}
            {!!statusMsg && (
              <Text as="p" color="green" size="1">{statusMsg}</Text>
            )}
            {!!errorMsg && (
              <Text as="p" color="red" size="1">{errorMsg}</Text>
            )}
          </Box>
          <Flex gap="2">
            {provider === Providers.OLLAMA && (
              <Button variant="soft" onClick={refreshRunning}>Refresh Running</Button>
            )}
            <Button onClick={validateAllVisible} disabled={busy || merged.length === 0}>Validate All Visible</Button>
          </Flex>
        </Flex>

        <Separator my="3" size="4" />

        <Text size="2" weight="bold">Visible / Hidden</Text>
        <Box mt="2" style={{ maxHeight: 220, overflow: 'auto', border: '1px solid var(--gray-5)', borderRadius: 8 }}>
          {merged.length === 0 && (
            <Box p="3"><Text color="gray" size="2">No models found. Add a custom model below.</Text></Box>
          )}
          {merged.map(m => {
            const isValidated = validated.includes(m.id)
            const isRunning = provider === Providers.OLLAMA && running.includes(m.id)
            const needsToken = provider === Providers.HUGGINGFACE && tokenRequired.includes(m.id)
            return (
              <Flex key={m.id} align="center" justify="between" p="2" style={{ borderBottom: '1px solid var(--gray-3)' }}>
                <Flex direction="column">
                  <Text size="2" style={{ color: isValidated ? undefined : 'var(--gray-8)' }}>
                    {m.label || m.id} {isRunning ? '🟢' : ''} {isValidated ? '✓' : ''} {needsToken && <Badge color="amber" variant="soft">requires token</Badge>}
                  </Text>
                  {m.label && m.label !== m.id && (
                    <Text size="1" color="gray">{m.id}</Text>
                  )}
                </Flex>
                <Flex align="center" gap="3">
                  {customs.some(c => c.id === m.id) && (
                    <Badge color="blue" variant="soft">custom</Badge>
                  )}
                  <Flex align="center" gap="2">
                    <Checkbox checked={!hiddenSet.has(m.id)} onCheckedChange={() => toggleHidden(m.id)} />
                    <Text size="2">Visible</Text>
                  </Flex>
                  <Button size="1" variant="soft" onClick={() => validateOne(m.id)} disabled={!!validatingId && validatingId !== m.id}>
                    {validatingId === m.id ? 'Validating…' : (isValidated ? 'Revalidate' : 'Validate')}
                  </Button>
                  {isValidated && (
                    <Button size="1" variant="ghost" color="amber" onClick={() => setValidated(prev => prev.filter(x => x !== m.id))}>Unmark</Button>
                  )}
                  {customs.some(c => c.id === m.id) && (
                    <Button size="1" variant="ghost" color="red" onClick={() => removeCustom(m.id)}>Remove</Button>
                  )}
                </Flex>
              </Flex>
            )
          })}
        </Box>

        <Separator my="3" size="4" />

        <Text size="2" weight="bold">Add Custom Model</Text>
        <Flex gap="2" mt="2" direction={{ initial: 'column', sm: 'row' }}>
          <TextField.Root placeholder="model id (e.g., gpt-4o-mini, llama3.1)" value={newId} onChange={e => setNewId(e.target.value)} style={{ flex: 2 }} />
          <TextField.Root placeholder="Label (optional)" value={newLabel} onChange={e => setNewLabel(e.target.value)} style={{ flex: 2 }} />
          <Button onClick={addCustom}>Add</Button>
        </Flex>
        <Text size="1" color="gray">Custom entries appear in the dropdown and can be hidden later.</Text>

        <Separator my="3" size="4" />

        <Flex gap="2" justify="end">
          <Button variant="soft" onClick={onClose}>Close</Button>
          <Button onClick={save} disabled={busy}>Save changes</Button>
        </Flex>
      </Box>
    </Card>
  )
}
