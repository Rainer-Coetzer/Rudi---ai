import express from 'express';
import { Ollama } from 'ollama';
import {
  getOptimalParams,
  estimateVRAM_GB,
  detectOptimalModel,
  MODEL_TIERS
} from '../resourceManager.js';
import { listInstalledModels, MODEL_CONFIG } from '../modelConfig.js';
import { getClaudeStatus } from '../claudeProvider.js';

const router = express.Router();
const ollamaClient = new Ollama({ host: 'http://127.0.0.1:11434' });

// Cached state
let CACHED_VRAM_GB = 0;
let INSTALLED_MODELS = [];

/**
 * GET /api/health
 * Detailed health check of Ollama and system resources.
 */
router.get('/health', async (req, res) => {
  let ollamaOk = false;
  try {
    const list = await ollamaClient.list();
    INSTALLED_MODELS = list.models.map(m => m.name);
    ollamaOk = true;
  } catch {}

  CACHED_VRAM_GB = await estimateVRAM_GB();
  const claude = await getClaudeStatus();

  res.json({
    status: 'online',
    ollama: ollamaOk ? 'ready' : 'unavailable',
    voice: true, // Edge TTS service is active
    claude: claude.available,      // Claude Code CLI signed in with a Claude subscription
    claudeReason: claude.reason,   // short hint for the UI when not, else null
    vram_gb: CACHED_VRAM_GB,
    installed_models: INSTALLED_MODELS,
    timestamp: Date.now()
  });
});

/**
 * GET /api/resources
 * Optimized parameters for inference based on current hardware.
 */
router.get('/resources', async (req, res) => {
  const vram = await estimateVRAM_GB();
  const params = getOptimalParams(0, vram);
  res.json({ ...params, vram_gb: vram });
});

/**
 * GET /api/models
 * List installed Ollama models and current tier mapping.
 */
router.get('/models', async (req, res) => {
  try {
    const list = await ollamaClient.list();
    res.json({
      models: list.models.map(m => ({ name: m.name, size: m.size })),
      tiers: MODEL_TIERS.map(t => ({ label: t.label, model: t.model, minVRAM: t.minVRAM_GB })),
    });
  } catch (err) {
    res.status(503).json({ error: 'Ollama unreachable' });
  }
});

export default router;
