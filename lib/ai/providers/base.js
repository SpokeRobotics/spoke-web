// Base provider interface and helpers (JS only)

export const Providers = {
  OPENAI: 'openai',
  OLLAMA: 'ollama', // placeholder for future
  HUGGINGFACE: 'huggingface',
};

export function getDefaultCapabilities(provider) {
  switch (provider) {
    case Providers.OPENAI:
      return { text: true, images: true, tools: true, audio: false };
    case Providers.OLLAMA:
      return { text: true, images: false, tools: false, audio: false };
    case Providers.HUGGINGFACE:
      // Conservative defaults: text only; streaming varies per model/backend
      return { text: true, images: false, tools: false, audio: false };
    default:
      return { text: true, images: false, tools: false, audio: false };
  }
}

export function createAbortController() {
  return new AbortController();
}

export function modelOption(id, label, capabilities) {
  return { id, label, capabilities };
}
