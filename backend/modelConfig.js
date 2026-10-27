/**
 * Rudi Model Configuration v3
 *
 * Role-based model lineup — each role targets a smaller, faster local model.
 * Override any role with environment variables:
 *   RUDI_MODEL                   — general / voice chat  (default: llama3.2:1b)
 *   RUDI_CODING_MODEL            — code generation        (default: qwen2.5-coder:1.5b)
 *   RUDI_REASONING_MODEL         — quick analysis         (default: qwen3:0.6b)
 *   RUDI_REASONING_HEAVY_MODEL   — deep reasoning         (default: deepseek-r1:1.5b)
 *   RUDI_VISION_MODEL            — image analysis         (default: moondream:latest)
 *
 * Models are stored in D:\Rudi\models (set via OLLAMA_MODELS in electron/main.ts).
 */

export const MODEL_CONFIG = {
  general:        process.env.RUDI_MODEL                 || 'llama3.2:1b',
  coding:         process.env.RUDI_CODING_MODEL          || 'qwen2.5-coder:1.5b',
  reasoning:      process.env.RUDI_REASONING_MODEL       || 'qwen3:0.6b',
  reasoningHeavy: process.env.RUDI_REASONING_HEAVY_MODEL || 'deepseek-r1:1.5b',
  vision:         process.env.RUDI_VISION_MODEL          || 'moondream:latest',
  // Back-compat aliases used by legacy code paths
  primary:  process.env.RUDI_MODEL || 'llama3.2:1b',
  fallback: process.env.RUDI_MODEL || 'llama3.2:1b',
};

/**
 * Validates that a model is available in Ollama.
 * Returns the resolved name if found, null if not.
 */
export async function resolveModel(ollamaClient, modelName) {
  try {
    const list = await ollamaClient.list();
    const found = list.models.find((m) => m.name === modelName);
    return found ? found.name : null;
  } catch {
    return null;
  }
}

/**
 * Model families known to support Ollama's native tool calling. Used only when
 * the installed Ollama is too old to report capabilities from /api/show.
 * Of the defaults above, llama3.2, qwen2.5-coder and qwen3 support tools;
 * deepseek-r1:1.5b and moondream do not and use the text protocol.
 */
export const TOOL_CAPABLE_FAMILIES = [
  'llama3.1', 'llama3.2', 'llama3.3', 'llama4',
  'qwen2.5', 'qwen2.5-coder', 'qwen3', 'qwen3-coder',
  'mistral', 'mistral-nemo', 'mistral-small', 'mixtral', 'devstral',
  'command-r', 'command-r-plus', 'firefunction-v2', 'hermes3',
  'granite3.1-dense', 'granite3.2', 'granite3.3', 'phi4-mini', 'smollm2', 'gpt-oss',
];

const toolSupportCache = new Map();

/**
 * Whether a local model accepts the `tools` parameter. Asks Ollama first
 * (`capabilities` includes "tools"), then falls back to TOOL_CAPABLE_FAMILIES.
 * Set RUDI_DISABLE_NATIVE_TOOLS=1 to force the text protocol for every model.
 */
export async function supportsTools(ollamaClient, modelName) {
  if (process.env.RUDI_DISABLE_NATIVE_TOOLS === '1') return false;
  if (toolSupportCache.has(modelName)) return toolSupportCache.get(modelName);

  let supported;
  try {
    const info = await ollamaClient.show({ model: modelName });
    if (Array.isArray(info?.capabilities)) supported = info.capabilities.includes('tools');
  } catch {
    // Older Ollama or model not pulled yet — fall through to the name check.
  }
  if (supported === undefined) {
    const family = modelName.split(':')[0].split('/').pop();
    supported = TOOL_CAPABLE_FAMILIES.includes(family);
  }

  toolSupportCache.set(modelName, supported);
  return supported;
}

/** Remember that a model has no tool support, e.g. after Ollama rejected `tools` for it. */
export function markNoToolSupport(modelName) {
  toolSupportCache.set(modelName, false);
}

/**
 * Lists all installed models in Ollama.
 */
export async function listInstalledModels(ollamaClient) {
  try {
    const list = await ollamaClient.list();
    return list.models.map(m => m.name);
  } catch {
    return [];
  }
}
