'use client'

// Hugging Face provider adapter (client-side). Uses the Inference API.
// Notes:
// - Some models may be accessible without a token, but many require an API key.
// - We attempt anonymous access when no token is provided and surface a helpful error on 401/403.
// - Streaming is not standardized across all hosted models; we implement a simple non-streaming adapter.

import { Providers, getDefaultCapabilities, modelOption } from './base'
import { getToken } from '../../ai/token-store'

const HF_MODELS_API = 'https://huggingface.co/api/models'
const HF_INFERENCE_API = 'https://api-inference.huggingface.co/models'

export function getCapabilities() {
  return getDefaultCapabilities(Providers.HUGGINGFACE)
}

export function getHuggingFaceDefaultModels() {
  // Curated, lightweight defaults that commonly exist on HF
  return [
    modelOption('tiiuae/falcon-7b-instruct', 'Falcon 7B Instruct', { text: true, images: false, tools: false, audio: false }),
    modelOption('mistralai/Mistral-7B-Instruct-v0.2', 'Mistral 7B Instruct', { text: true, images: false, tools: false, audio: false }),
    modelOption('google/gemma-2b-it', 'Gemma 2B IT', { text: true, images: false, tools: false, audio: false }),
    modelOption('meta-llama/Llama-3.1-8B-Instruct', 'Llama 3.1 8B Instruct', { text: true, images: false, tools: false, audio: false }),
  ]
}

export async function listModels({ limit = 20 } = {}) {
  // Query public models tagged for text generation
  try {
    const res = await fetch(`${HF_MODELS_API}?filter=text-generation&limit=${limit}`, { method: 'GET' })
    if (!res.ok) throw new Error(`HF list error ${res.status}`)
    const data = await res.json()
    const out = (Array.isArray(data) ? data : []).map(m => modelOption(m.modelId || m.id, m.modelId || m.id, { text: true, images: false, tools: false, audio: false }))
    return out
  } catch (e) {
    return []
  }
}

export async function validateModel(model) {
  if (!model || typeof model !== 'string') throw new Error('No model specified')
  // First, probe model existence (public metadata)
  const meta = await fetch(`${HF_MODELS_API}/${encodeURIComponent(model)}`, { method: 'GET' })
  if (!meta.ok) {
    const text = await meta.text().catch(() => '')
    throw new Error(`Model not available (${meta.status}): ${text}`)
  }
  // Second, attempt a minimal inference call to detect token requirement
  const token = getToken(Providers.HUGGINGFACE)
  const url = `${HF_INFERENCE_API}/${encodeURIComponent(model)}`
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const body = JSON.stringify({ inputs: 'healthcheck', options: { wait_for_model: false } })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8000)
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: controller.signal })
    if (res.status === 401 || res.status === 403) {
      throw new Error('Model requires a Hugging Face API token (401/403). Please add a token in Settings.')
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Inference probe failed (${res.status}): ${text}`)
    }
  } finally {
    clearTimeout(timeout)
  }
  return true
}

function buildInputs(systemPrompt, history) {
  // Simple prompt builder: prepend system instruction, then history
  // Many HF text-gen models accept just a single string; we join with newlines.
  const lines = []
  if (systemPrompt && systemPrompt.trim()) {
    lines.push(`[System]\n${systemPrompt.trim()}`)
  }
  for (const m of history || []) {
    if (!m || !m.role) continue
    const role = m.role === 'user' ? 'User' : 'Assistant'
    lines.push(`[${role}]\n${m.content || ''}`)
  }
  return lines.join('\n\n')
}

export async function streamChat({ model, systemPrompt, history, images, signal }) {
  const token = getToken(Providers.HUGGINGFACE)
  const url = `${HF_INFERENCE_API}/${encodeURIComponent(model || '')}`
  const input = buildInputs(systemPrompt, history)
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const body = JSON.stringify({ inputs: input, options: { wait_for_model: true } })

  const res = await fetch(url, { method: 'POST', headers, body, signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    let hint = ''
    if (res.status === 401 || res.status === 403) hint = ' (model likely requires an API key)'
    throw new Error(`Hugging Face error ${res.status}${hint}: ${text}`)
  }
  const data = await res.json()
  let text = ''
  // HF returns either { generated_text } or an array with generated_text
  if (Array.isArray(data) && data[0]?.generated_text) text = String(data[0].generated_text)
  else if (typeof data?.generated_text === 'string') text = data.generated_text
  else if (typeof data === 'string') text = data
  else text = JSON.stringify(data)

  async function* iterate() {
    if (text && text.length > 0) {
      yield { type: 'text-delta', text }
    }
  }
  return iterate()
}
