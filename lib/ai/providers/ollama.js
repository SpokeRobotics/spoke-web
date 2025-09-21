'use client'

// Ollama provider adapter (client-side). Talks to local Ollama at http://localhost:11434
// Endpoints used:
// - GET  /api/tags                     -> list available models
// - POST /api/show { name }            -> show model (validate)
// - POST /api/chat { model, messages } -> chat with streaming

import { Providers, getDefaultCapabilities, modelOption } from './base'

const OLLAMA_BASE = 'http://localhost:11434'

export function getCapabilities() {
  // Many Ollama models are text-only; set conservative defaults.
  return getDefaultCapabilities(Providers.OLLAMA)
}

export async function listModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { method: 'GET' })
    if (!res.ok) throw new Error(`Ollama error ${res.status}`)
    const data = await res.json()
    const models = (data?.models || []).map(m => modelOption(m.name, m.name, { text: true, images: false, tools: false, audio: false }))
    return models
  } catch (e) {
    // If Ollama isn't running, return an empty list; UI will allow manual typing
    return []
  }
}

export async function listRunningModels() {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/ps`, { method: 'GET' })
    if (!res.ok) throw new Error(`Ollama error ${res.status}`)
    const data = await res.json()
    const names = Array.isArray(data?.models) ? data.models.map(m => m?.name).filter(Boolean) : []
    return names
  } catch (e) {
    return []
  }
}

export async function validateModel(model) {
  if (!model) throw new Error('No model specified')
  const res = await fetch(`${OLLAMA_BASE}/api/show`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Model not available (${res.status}): ${text}`)
  }
  return true
}

function toOllamaMessages(history) {
  // Map OpenAI-like history to Ollama format
  return history.map(m => ({ role: m.role, content: m.content }))
}

export async function streamChat({ model, systemPrompt, history, images, signal }) {
  // images ignored for now (text-only)
  const messages = []
  if (systemPrompt && systemPrompt.trim()) messages.push({ role: 'system', content: systemPrompt })
  messages.push(...toOllamaMessages(history))

  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'llama3.1', messages, stream: true }),
    signal,
  })
  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    throw new Error(`Ollama error ${res.status}: ${text}`)
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
        if (!trimmed) continue
        try {
          const obj = JSON.parse(trimmed)
          // Format documented by Ollama: each JSON line contains message/content deltas
          const content = obj?.message?.content
          if (typeof content === 'string' && content.length > 0) {
            yield { type: 'text-delta', text: content }
          }
          if (obj?.done) {
            return
          }
        } catch (e) {
          // ignore parse errors if any non-JSON lines present
        }
      }
    }
  }

  return iterate()
}
