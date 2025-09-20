'use client'

// OpenAI provider adapter (client-side only). Uses Chat Completions API with streaming.
// Note: For prototype use only. Keys are read from localStorage via token-store.

import { getDefaultCapabilities, modelOption, Providers } from './base'
import { getToken } from '../../ai/token-store'

const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions'
const OPENAI_MODELS_URL = 'https://api.openai.com/v1/models'

export function getOpenAIDefaultModels() {
  // Keep generic; user mentioned GPT5/Realtime — we expose stable, low-cost defaults
  // User can type any model id in Settings as well.
  return [
    modelOption('gpt-4o-mini', 'GPT-4o mini (text+vision)', { text: true, images: true, tools: true, audio: false }),
    modelOption('gpt-4o', 'GPT-4o (text+vision)', { text: true, images: true, tools: true, audio: false }),
    modelOption('gpt-4.1-mini', 'GPT-4.1 mini', { text: true, images: false, tools: true, audio: false }),
  ]
}

export function getCapabilities() {
  return getDefaultCapabilities(Providers.OPENAI)
}

function buildMessages(systemPrompt, history, images) {
  const msgs = []
  if (systemPrompt && systemPrompt.trim()) {
    msgs.push({ role: 'system', content: systemPrompt })
  }
  for (const m of history) {
    if (m.role === 'user' && Array.isArray(m.images) && m.images.length > 0) {
      const parts = []
      if (m.content && m.content.trim()) parts.push({ type: 'text', text: m.content })
      for (const img of m.images) {
        parts.push({ type: 'image_url', image_url: { url: img } })
      }
      msgs.push({ role: 'user', content: parts })
    } else {
      msgs.push({ role: m.role, content: m.content })
    }
  }
  // Optionally append additional images for the last user turn
  if (Array.isArray(images) && images.length > 0) {
    const last = history[history.length - 1]
    const text = last && last.role === 'user' ? last.content : ''
    const parts = []
    if (text && text.trim()) parts.push({ type: 'text', text })
    for (const img of images) parts.push({ type: 'image_url', image_url: { url: img } })
    msgs.push({ role: 'user', content: parts })
  }
  return msgs
}

export async function validateModel(model) {
  const token = getToken(Providers.OPENAI)
  if (!token) throw new Error('OpenAI API key not set. Add it in Settings.')
  if (!model || typeof model !== 'string') throw new Error('No model specified')
  const url = `${OPENAI_MODELS_URL}/${encodeURIComponent(model)}`
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Model not available (${res.status}): ${text}`)
  }
  return true
}

export async function streamChat({ model, systemPrompt, history, images, signal }) {
  const token = getToken(Providers.OPENAI)
  if (!token) throw new Error('OpenAI API key not set. Add it in Settings.')

  const messages = buildMessages(systemPrompt, history, images)

  const res = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages,
      stream: true,
      // tool_choice: 'auto', // Reserved for future tool experiments
    }),
    signal,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`OpenAI error ${res.status}: ${text}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')

  async function* iterate() {
    let buffer = ''
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const data = trimmed.substring(5).trim()
        if (data === '[DONE]') {
          return
        }
        try {
          const obj = JSON.parse(data)
          const delta = obj.choices?.[0]?.delta
          if (!delta) continue
          if (delta.role) continue
          if (delta.content) {
            yield { type: 'text-delta', text: delta.content }
          }
          // Tool calls in Chat Completions arrive via delta.tool_calls
          if (delta.tool_calls && delta.tool_calls.length > 0) {
            for (const tc of delta.tool_calls) {
              yield { type: 'tool-delta', tool: tc }
            }
          }
        } catch (e) {
          // ignore parse errors from keepalive lines
        }
      }
    }
  }

  return iterate()
}
