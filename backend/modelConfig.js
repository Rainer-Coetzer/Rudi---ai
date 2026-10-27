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
