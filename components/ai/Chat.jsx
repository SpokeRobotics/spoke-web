'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box, Flex, Heading, Text, Card, Avatar, Separator, Button, Badge } from '@radix-ui/themes'
import SettingsPanel from './SettingsPanel'
import Composer from './Composer'
import ToolEvents from './ToolEvents'
import { Providers } from '@/lib/ai/providers/base'
import { streamChat as openaiStream, getCapabilities as openaiCaps } from '@/lib/ai/providers/openai'
import { streamChat as ollamaStream, listRunningModels as ollamaListRunning } from '@/lib/ai/providers/ollama'
import { streamChat as hfStream } from '@/lib/ai/providers/huggingface'
import { loadValidatedModels, saveValidatedModels } from '@/lib/ai/model-prefs'
import MarkdownMessage from './MarkdownMessage'

function MessageBubble({ role, content }) {
  const isUser = role === 'user'
  return (
    <Flex justify={isUser ? 'end' : 'start'} my="2">
      <Card variant="soft" style={{ maxWidth: 800, background: isUser ? 'var(--accent-3)' : undefined }}>
        <Flex gap="3" align="start">
          <Avatar fallback={isUser ? 'U' : 'A'} radius="full" />
          <Box>
            <Text as="p" style={{ whiteSpace: 'pre-wrap' }}>{content}</Text>
          </Box>
        </Flex>
      </Card>
    </Flex>
  )
}

export default function Chat() {
  const [provider, setProvider] = useState(Providers.OPENAI)
  const [model, setModel] = useState('gpt-4o-mini')
  const defaultPrompt = 'You are a helpful assistant. If you need to manipulate the imaginary light, describe a function call {"name":"set_light","arguments":{"state":"on|off"}} in plain text. Do not expose user tokens.'
  const getSeedPrompt = useCallback((prov, mdl) => {
    // Seed sensible defaults per provider/model; can expand as needed
    if (prov === Providers.OPENAI) {
      return defaultPrompt
    }
    if (prov === Providers.OLLAMA) {
      const name = (mdl || '').toLowerCase()
      // Model-specific prompts
      if (name.includes('glm4')) {
        return (
`You are a concise assistant.

Rules:
- Keep answers ≤ 5 sentences by default.
- If asked to control the imaginary light, respond with ONLY this JSON and nothing else:
{"name":"set_light","arguments":{"state":"on|off"}}
- Do not reveal chain-of-thought; provide brief summaries when necessary.
- Images are not processed in this chat.`)
      }
      if (name.includes('gemma')) {
        return (
`You are a clear and pragmatic assistant.

Guidelines:
- Use simple, direct language. Prefer bullet points for steps.
- If asked to control the imaginary light, respond with ONLY:
{"name":"set_light","arguments":{"state":"on|off"}}
- No chain-of-thought; concise factual conclusions.
- Images are not processed here.`)
      }
      if (name.includes('moondream')) {
        return (
`You are a compact vision-oriented assistant operating in text-only mode.

Notes:
- Image analysis is disabled in this chat UI.
- To control the imaginary light, output ONLY this JSON (no extra text):
{"name":"set_light","arguments":{"state":"on|off"}}
- Keep responses short (≤ 4 sentences).`)
      }
      if (name.includes('qwen3')) {
        return (
`You are a capable assistant with precise, concise answers.

Policies:
- Use small examples when helpful.
- Tool use is via JSON. If controlling the light, reply with ONLY:
{"name":"set_light","arguments":{"state":"on|off"}}
- Do not reveal chain-of-thought; add brief 1–2 sentence justifications if needed.
- No image inputs are available.`)
      }
      if (name.includes('qwen2.5vl') || name.includes('qwen2.5-vl')) {
        return (
`You are a multimodal assistant running in text-only mode.

Instructions:
- Ignore/decline image analysis (not supported here).
- If asked to control the imaginary light, respond with ONLY:
{"name":"set_light","arguments":{"state":"on|off"}}
- Keep responses concise; prefer bullet points for multi-step explanations.`)
      }
      if (name.includes('codellama')) {
        return (
`You are a pragmatic coding assistant.

Rules:
- Provide working code first, then a brief explanation (2–4 sentences).
- Use proper fenced code blocks with language tags, e.g. \`\`\`js, \`\`\`python.
- Prefer minimal, correct examples over large boilerplate.
- Avoid destructive commands (rm -rf, sudo, system modifications). If unavoidable, warn and provide a safer alternative.
- If filenames are relevant, show them at the top of the snippet as comments.
- No external tools or package installs are available unless explicitly stated by the user.`)
      }
      if (name.includes('deepseek-r1')) {
        return (
`You are a careful reasoner.

Answer format:
- Provide a concise final answer first.
- Then add a short justification (2–4 sentences) summarizing the key reasons or assumptions.
- Do not reveal step-by-step hidden reasoning or chain-of-thought. Summarize only.
- If information is missing, state what is missing and propose the minimal assumptions required.
- Avoid tool usage; none is available.`)
      }
      if (name.includes('qwen2.5-coder') || name.includes('qwen2.5coder') || name.includes('coder')) {
        return (
`You are a pragmatic coding assistant.

Guidelines:
- Provide working code first, then a short explanation (2–3 sentences).
- Use fenced code blocks with language tags (\`\`\`js, \`\`\`py, etc.).
- Avoid installs or system changes unless asked; propose minimal steps.
- Tool use: if asked to control the imaginary light, return ONLY this JSON (no extra text):
{"name":"set_light","arguments":{"state":"on|off"}}
- Images are not processed in this chat.`)
      }
      if (name.includes('vicuna')) {
        return (
`You are a precise assistant.

Output policy:
- Keep answers concise (≤ 6 sentences unless asked for details).
- If a claim might be uncertain, say “Likely” or “Uncertain” and explain briefly.
- Do not fabricate references or links. Only provide sources if the user asks, and mark them as “Suggested references”.
- Prefer concrete examples over long explanations.
- No tools or browsing are available; work only with what you know.`)
      }
      if (name.includes('smollm2')) {
        return (
`You are a terse, helpful assistant.

Rules:
- Default to 1–2 sentences. Only use bullet points if explicitly asked.
- Use simple words. Avoid jargon unless requested.
- If a question is unclear, ask 1 short clarifying question.
- Never invent facts. If you don’t know, say so briefly.
- No tool usage or external calls are available.`)
      }
      if (name.includes('llama3.2')) {
        return (
`You are a concise assistant. Answer clearly in 1–3 short paragraphs or a few bullet points.

Guidelines:
- If the request is ambiguous, ask up to 1 clarifying question before answering.
- Prefer simple, factual statements. If you’re unsure, say “I’m not sure” and suggest what info is needed.
- Avoid speculation, made‑up references, or long enumerations.
- When listing steps, keep them minimal (3–5).
- Do not assume tool access or external browsing.`)
      }
      // Fallback for unknown Ollama models
      return 'You are a concise assistant. Provide clear, helpful answers. Do not assume tools are available.'
    }
    return defaultPrompt
  }, [])
  const [systemPrompt, setSystemPrompt] = useState(defaultPrompt)
  const [messages, setMessages] = useState([])
  const [toolEvents, setToolEvents] = useState([])
  const [streaming, setStreaming] = useState(false)
  const [caps, setCaps] = useState(openaiCaps())
  const [showTools, setShowTools] = useState(false)
  const [renderMarkdown, setRenderMarkdown] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [headerValidated, setHeaderValidated] = useState(false)
  const [headerRunning, setHeaderRunning] = useState(false)

  const abortRef = useRef(null)
  const viewportRef = useRef(null)
  const lastUserTurnRef = useRef(null)
  const hadTextRef = useRef(false)
  const announcedRunningRef = useRef(false)

  // Persist provider and model between runs
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const savedProvider = localStorage.getItem('ai:provider')
      if (savedProvider && (savedProvider === Providers.OPENAI || savedProvider === Providers.OLLAMA)) {
        setProvider(savedProvider)
        const savedModel = localStorage.getItem(`ai:model:${savedProvider}`)
        if (savedModel) setModel(savedModel)
      } else {
        const savedModel = localStorage.getItem(`ai:model:${Providers.OPENAI}`)
        if (savedModel) setModel(savedModel)
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Save provider selection
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { if (provider) localStorage.setItem('ai:provider', provider) } catch {}
  }, [provider])

  // Save model selection per provider
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { if (provider && model) localStorage.setItem(`ai:model:${provider}`, model) } catch {}
  }, [provider, model])

  // Load renderMarkdown preference (per provider+model if available)
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const key = `ai:renderMarkdown:${provider}:${model || 'default'}`
      const v = localStorage.getItem(key)
      if (v === 'true') setRenderMarkdown(true)
      else if (v === 'false') setRenderMarkdown(false)
    } catch {}
  }, [provider, model])

  // Persist renderMarkdown preference on change
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const key = `ai:renderMarkdown:${provider}:${model || 'default'}`
      localStorage.setItem(key, renderMarkdown ? 'true' : 'false')
    } catch {}
  }, [renderMarkdown, provider, model])

  // Persist settings panel open/close
  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const v = localStorage.getItem('ai:settingsOpen')
      if (v === 'true') setShowSettings(true)
      else if (v === 'false') setShowSettings(false)
    } catch {}
  }, [])
  useEffect(() => {
    if (typeof window === 'undefined') return
    try { localStorage.setItem('ai:settingsOpen', showSettings ? 'true' : 'false') } catch {}
  }, [showSettings])

  // Compute compact header glyph states on provider/model changes
  useEffect(() => {
    // Validated glyph
    try {
      const validated = loadValidatedModels(provider)
      setHeaderValidated(!!(model && Array.isArray(validated) && validated.includes(model)))
    } catch {
      setHeaderValidated(false)
    }
    // Running glyph (Ollama only)
    ;(async () => {
      if (provider !== Providers.OLLAMA || !model) { setHeaderRunning(false); return }
      try {
        const running = await ollamaListRunning()
        setHeaderRunning(Array.isArray(running) && running.includes(model))
      } catch {
        setHeaderRunning(false)
      }
    })()
  }, [provider, model])

  // React to external validated/running change events
  useEffect(() => {
    if (typeof window === 'undefined') return
    const onValidated = () => {
      try {
        const validated = loadValidatedModels(provider)
        setHeaderValidated(!!(model && Array.isArray(validated) && validated.includes(model)))
      } catch {}
    }
    const onRunning = async () => {
      if (provider !== Providers.OLLAMA || !model) return
      try {
        const running = await ollamaListRunning()
        setHeaderRunning(Array.isArray(running) && running.includes(model))
      } catch {}
    }
    window.addEventListener('ai:models:validated:changed', onValidated)
    window.addEventListener('ai:models:running:changed', onRunning)
    return () => {
      window.removeEventListener('ai:models:validated:changed', onValidated)
      window.removeEventListener('ai:models:running:changed', onRunning)
    }
  }, [provider, model])

  // Persist system prompt per provider+model and load it on changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `ai:prompt:${provider}:${model}`
    try {
      const saved = localStorage.getItem(key)
      if (typeof saved === 'string' && saved.length > 0) {
        setSystemPrompt(saved)
      } else {
        setSystemPrompt(getSeedPrompt(provider, model))
      }
    } catch {
      setSystemPrompt(getSeedPrompt(provider, model))
    }
  }, [provider, model, getSeedPrompt])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `ai:prompt:${provider}:${model}`
    try { localStorage.setItem(key, systemPrompt || '') } catch {}
  }, [systemPrompt, provider, model])

  // Persist showTools per provider+model and load on changes
  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `ai:toolsOpen:${provider}:${model}`
    try {
      const saved = localStorage.getItem(key)
      if (saved === 'true') setShowTools(true)
      else if (saved === 'false') setShowTools(false)
      else setShowTools(false)
    } catch {
      setShowTools(false)
    }
  }, [provider, model])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `ai:toolsOpen:${provider}:${model}`
    try { localStorage.setItem(key, showTools ? 'true' : 'false') } catch {}
  }, [showTools, provider, model])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { localStorage.setItem('ai:provider', provider) } catch {}
    // When provider changes, try to load a remembered model for that provider
    try {
      const savedModel = localStorage.getItem(`ai:model:${provider}`)
      if (savedModel) setModel(savedModel)
    } catch {}
  }, [provider])

  useEffect(() => {
    if (typeof window === 'undefined') return
    try { localStorage.setItem(`ai:model:${provider}`, model) } catch {}
  }, [model, provider])

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight
    }
  }, [messages])

  const handleCapabilities = useCallback((c) => setCaps(c), [])

  const appendMessage = useCallback((m) => {
    setMessages(prev => [...prev, m])
  }, [])

  const send = useCallback(async ({ text, images }) => {
    const userMsg = { role: 'user', content: text, images }
    lastUserTurnRef.current = userMsg
    appendMessage(userMsg)

    // Start streaming
    setStreaming(true)
    const controller = new AbortController()
    abortRef.current = controller
    hadTextRef.current = false
    announcedRunningRef.current = false

    // Add a placeholder assistant message to stream into
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      let iter
      if (provider === Providers.OPENAI) {
        iter = await openaiStream({ model, systemPrompt, history: [...messages, userMsg], images, signal: controller.signal })
      } else if (provider === Providers.OLLAMA) {
        iter = await ollamaStream({ model, systemPrompt, history: [...messages, userMsg], images, signal: controller.signal })
      } else if (provider === Providers.HUGGINGFACE) {
        iter = await hfStream({ model, systemPrompt, history: [...messages, userMsg], images, signal: controller.signal })
      } else {
        throw new Error('Provider not implemented yet')
      }

      for await (const chunk of iter) {
        if (chunk.type === 'text-delta') {
          hadTextRef.current = true
          // As soon as we see text from Ollama, announce running so UI can show 🟢
          if (!announcedRunningRef.current && provider === Providers.OLLAMA && model) {
            announcedRunningRef.current = true
            try {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('ai:models:running:changed'))
              }
            } catch {}
          }
          setMessages(prev => {
            const copy = prev.slice()
            const last = copy[copy.length - 1]
            if (last && last.role === 'assistant') {
              last.content = (last.content || '') + chunk.text
            }
            return copy
          })
        } else if (chunk.type === 'tool-delta') {
          // Visualize tool deltas
          setToolEvents(prev => [...prev, { type: 'tool', name: chunk.tool?.function?.name, args: chunk.tool?.function?.arguments }])
        }
      }
    } catch (e) {
      setMessages(prev => [...prev, { role: 'assistant', content: `\n[Error: ${e.message}]` }])
    } finally {
      setStreaming(false)
      abortRef.current = null
      // If we received any text for this provider+model, mark it validated
      try {
        if (hadTextRef.current && provider && model) {
          const existing = loadValidatedModels(provider)
          if (!existing.includes(model)) {
            const next = [...existing, model]
            saveValidatedModels(provider, next)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('ai:models:validated:changed'))
            }
          }
        }
      } catch {}
      // After stream completes, inspect the last assistant message for a tool JSON
      setMessages(prev => {
        if (!prev || prev.length === 0) return prev
        const last = prev[prev.length - 1]
        if (last && last.role === 'assistant' && last.content) {
          // Best-effort parse and execute
          tryExecuteToolFromAssistant(last.content)
        }
        return prev
      })
    }
  }, [appendMessage, messages, model, provider, systemPrompt])

  const stop = useCallback(() => {
    if (abortRef.current) abortRef.current.abort()
  }, [])

  const retry = useCallback(() => {
    if (!lastUserTurnRef.current) return
    send({ text: lastUserTurnRef.current.content || '', images: lastUserTurnRef.current.images || [] })
  }, [send])

  // Demo local tool: imaginary light on/off
  const [lightState, setLightState] = useState('off')
  const toggleLight = useCallback((state) => {
    const next = state || (lightState === 'on' ? 'off' : 'on')
    setLightState(next)
    setToolEvents(prev => [...prev, { name: 'set_light', args: { state: next }, result: { ok: true } }])
  }, [lightState])

  // Attempt to parse assistant text for a JSON tool call and execute it
  const tryExecuteToolFromAssistant = useCallback((assistantText) => {
    if (!caps?.tools) return false
    if (!assistantText || typeof assistantText !== 'string') return false

    // Try direct JSON parse
    const tryParse = (s) => { try { return JSON.parse(s) } catch { return null } }

    let obj = tryParse(assistantText.trim())

    // Try code block ```json ... ```
    if (!obj) {
      const m = assistantText.match(/```json\n([\s\S]*?)```/i)
      if (m && m[1]) obj = tryParse(m[1].trim())
    }

    // Try to extract first balanced {...}
    if (!obj) {
      const text = assistantText
      let depth = 0, start = -1
      for (let i = 0; i < text.length; i++) {
        const ch = text[i]
        if (ch === '{') { if (depth === 0) start = i; depth++ }
        else if (ch === '}') {
          depth--
          if (depth === 0 && start >= 0) {
            const candidate = text.slice(start, i + 1)
            obj = tryParse(candidate)
            if (obj) break
          }
        }
      }
    }

    if (!obj || typeof obj !== 'object') return false
    const name = obj.name || obj.tool || obj.function || ''
    const args = obj.arguments || obj.args || {}
    if (String(name) === 'set_light' && args && typeof args.state === 'string') {
      const desired = args.state === 'on' ? 'on' : 'off'
      setToolEvents(prev => [...prev, { name: 'set_light', args: { state: desired }, status: 'executed' }])
      setLightState(desired)
      return true
    }
    return false
  }, [])

  return (
    <Box>
      {/* Header with Provider : Model and tools toggle */}
      <Flex justify="between" align="center" mb="2">
        {!showSettings ? (
          <Text size="2" color="gray">
            {(provider === Providers.OPENAI ? 'OpenAI' : provider === Providers.OLLAMA ? 'Ollama' : provider)} : {model || '—'}{' '}
            {headerRunning ? '🟢 ' : ''}
            {headerValidated ? '✓' : ''}
          </Text>
        ) : (
          <Text size="2" weight="bold">Settings</Text>
        )}
        <Button size="1" variant={showSettings ? 'soft' : 'ghost'} onClick={() => setShowSettings(s => !s)} aria-label={showSettings ? 'Close settings' : 'Open settings'}>
          {showSettings ? '✖ Close' : '⚙️ Tools'}
        </Button>
      </Flex>

      {showSettings && (
        <Box mb="3">
          <SettingsPanel
            provider={provider}
            setProvider={setProvider}
            model={model}
            setModel={setModel}
            systemPrompt={systemPrompt}
            setSystemPrompt={setSystemPrompt}
            onCapabilities={handleCapabilities}
            renderMarkdown={renderMarkdown}
            setRenderMarkdown={setRenderMarkdown}
            onRestoreDefault={() => {
              const seed = getSeedPrompt(provider, model)
              setSystemPrompt(seed)
              try {
                const key = `ai:prompt:${provider}:${model}`
                localStorage.setItem(key, seed)
              } catch {}
            }}
          />
        </Box>
      )}

      <Box mt="3" p="3" style={{ border: '1px solid var(--gray-5)', borderRadius: 8, height: '50vh', overflow: 'auto' }} ref={viewportRef}>
        {messages.length === 0 && (
          <Text color="gray">Start the conversation. The imaginary light is currently <b>{lightState}</b>.</Text>
        )}
        {messages.map((m, i) => {
          const isAssistant = m.role === 'assistant'
          return (
            <Flex key={i} justify={m.role === 'user' ? 'end' : 'start'} my="2">
              <Card variant="soft" style={{ maxWidth: 800, background: m.role === 'user' ? 'var(--accent-3)' : undefined }}>
                <Flex gap="3" align="start">
                  <Avatar fallback={m.role === 'user' ? 'U' : 'A'} radius="full" />
                  <Box style={{ maxWidth: 740 }}>
                    {isAssistant && renderMarkdown ? (
                      <MarkdownMessage text={m.content || ''} />
                    ) : (
                      <Text as="p" style={{ whiteSpace: 'pre-wrap' }}>{m.content}</Text>
                    )}
                  </Box>
                </Flex>
              </Card>
            </Flex>
          )
        })}
      </Box>

      {/* Composer should be directly under the dialog transcript */}
      <Composer onSend={send} onStop={stop} onRetry={retry} disabled={false} supportsImages={!!caps.images} />

      {/* Light status + Tool log under the composer */}
      <Box mt="2">
        <Flex align="center" gap="3" wrap="wrap">
          <Text size="2" color="gray">Imaginary light is currently <b>{lightState}</b>.</Text>
          <Button size="1" variant="soft" onClick={() => toggleLight()}>Toggle</Button>
          {caps?.tools && (
            <Button size="1" variant="ghost" onClick={() => setShowTools(v => !v)}>
              {showTools ? 'Hide tool activity' : 'Show tool activity'}
              {toolEvents?.length > 0 && (
                <Badge color="blue" variant="soft" style={{ marginLeft: 8 }}>{toolEvents.length}</Badge>
              )}
            </Button>
          )}
        </Flex>
        {caps?.tools && showTools && toolEvents?.length > 0 && (
          <ToolEvents events={toolEvents} />
        )}
      </Box>
    </Box>
  )
}
