/**
 * Rudi Model Configuration v2
 * 
 * Models are selected automatically based on available hardware.
 * Override with environment variables if needed:
 *   RUDI_MODEL         — force a specific primary model
 *   RUDI_FALLBACK_MODEL — force a specific fallback model  
 *   RUDI_VISION_MODEL  — vision model for image analysis
 * 
 * Available tiers (auto-selected by resourceManager):
 *   gemma4:latest  — Full 27B  — requires 16GB+ VRAM / 16GB+ RAM
 *   gemma4:e4b     — E4B 4bit  — requires 8GB+  VRAM / 10GB+ RAM
 *   gemma4:e2b     — E2B 2bit  — requires 4GB+  VRAM / 6GB+  RAM
 */

export const MODEL_CONFIG = {
  // These are defaults; the server overrides them on startup via autoSelectModel()
  // e2b is used for simple/conversational tasks. e4b escalates automatically for complex work.
  primary:  process.env.RUDI_MODEL          || 'gemma4:e2b',
  fallback: process.env.RUDI_FALLBACK_MODEL || 'gemma4:e2b',
  vision:   process.env.RUDI_VISION_MODEL   || 'moondream:latest',
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
