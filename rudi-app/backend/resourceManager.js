import os from 'os';
import { execSync } from 'child_process';

/**
 * Rudi Resource Manager v5
 *
 * Features:
 * - Real-time VRAM detection via nvidia-smi (primary) with heuristic fallback
 * - Hardware-tier model selection based on installed + available resources
 * - Dynamic GPU/CPU layer splitting that scales with actual hardware
 * - Exponential backoff retry levels
 * - Virtual Memory Bridge as final failover
 * - Comprehensive logging at every decision point
 */

// ─── Model Tier Configuration ─────────────────────────────────────────────────
// Listed best → worst. Rudi walks this list to find the highest tier installable.
export const MODEL_TIERS = [
  { minVRAM_GB: 16, minRAM_GB: 16, model: 'gemma4:latest', layers: 46, label: 'Full 27B' },
  { minVRAM_GB:  8, minRAM_GB: 10, model: 'gemma4:e4b',    layers: 46, label: 'E4B'      },
  { minVRAM_GB:  4, minRAM_GB:  6, model: 'gemma4:e2b',    layers: 26, label: 'E2B'      },
  { minVRAM_GB:  0, minRAM_GB:  4, model: 'gemma4:e2b',    layers: 12, label: 'Minimal'  },
];

const LAYER_MEM_MB = 210;  // Approx MB per gemma4 layer (calibrated for e4b)
const TOTAL_LAYERS = 46;

// ─── VRAM Detection ────────────────────────────────────────────────────────────

/**
 * Query VRAM from nvidia-smi (most accurate source on Windows with NVIDIA GPU).
 * Returns total VRAM in GB, or 0 if unavailable.
 */
const detectVRAM_nvidia_smi = () => {
  try {
    const output = execSync('nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits', {
      timeout: 3000,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = output.trim().split('\n');
    const values = lines.map(l => parseInt(l.trim(), 10)).filter(v => !isNaN(v));
    if (values.length > 0) {
      const totalMB = values.reduce((a, b) => a + b, 0); // Sum multi-GPU
      const gb = totalMB / 1024;
      console.log(`[RESOURCE] nvidia-smi VRAM: ${gb.toFixed(2)}GB (${totalMB}MB across ${values.length} GPU(s))`);
      return gb;
    }
  } catch {
    // nvidia-smi not available (AMD/Intel GPU, or no NVIDIA driver)
  }
  return 0;
};

/**
 * Query currently allocated VRAM from Ollama's runtime API.
 * Only returns > 0 when a model is actively loaded.
 */
const detectVRAM_ollama = async () => {
  try {
    const res = await fetch('http://127.0.0.1:11434/api/ps', { signal: AbortSignal.timeout(2000) });
    if (!res.ok) return 0;
    const data = await res.json();
    if (data.models && data.models.length > 0) {
      const totalVram = data.models.reduce((acc, m) => acc + (m.size_vram || 0), 0);
      const gb = totalVram / (1024 ** 3);
      console.log(`[RESOURCE] Ollama runtime VRAM in use: ${gb.toFixed(2)}GB`);
      return gb;
    }
  } catch {
    // Ollama not running or /api/ps unavailable
  }
  return 0;
};

/**
 * Returns total available VRAM in GB using all available detection methods.
 * Priority: nvidia-smi > Ollama runtime > RAM-based heuristic.
 */
export const estimateVRAM_GB = async () => {
  // 1. Try nvidia-smi (synchronous, most reliable)
  const nvidiaVRAM = detectVRAM_nvidia_smi();
  if (nvidiaVRAM > 0) return nvidiaVRAM;

  // 2. Try Ollama runtime (only shows allocated, not total)
  const ollamaVRAM = await detectVRAM_ollama();
  if (ollamaVRAM > 0) return ollamaVRAM;

  // 3. RAM heuristic (conservative: assume GPU has ~40% of free RAM headroom)
  const freeRAM_GB = os.freemem() / (1024 ** 3);
  const estimated = Math.min(freeRAM_GB * 0.4, 8);
  console.warn(`[RESOURCE] VRAM detection failed — using RAM heuristic: ${estimated.toFixed(2)}GB`);
  return estimated;
};

// ─── Startup Model Detection ───────────────────────────────────────────────────

/**
 * Detects the hardware tier and returns the recommended model at startup.
 * Queries Ollama for actually installed models, picks the best tier available.
 */
export const detectOptimalModel = async (ollamaClient, availableModelNames = []) => {
  const totalRAM_GB = os.totalmem() / (1024 ** 3);
  const freeRAM_GB  = os.freemem()  / (1024 ** 3);
  const vram_GB     = await estimateVRAM_GB();

  console.log(`[RESOURCE] ── Hardware Detection ──────────────────────────────`);
  console.log(`[RESOURCE] Total RAM : ${totalRAM_GB.toFixed(1)}GB`);
  console.log(`[RESOURCE] Free RAM  : ${freeRAM_GB.toFixed(1)}GB`);
  console.log(`[RESOURCE] VRAM      : ${vram_GB.toFixed(1)}GB`);
  console.log(`[RESOURCE] Installed : ${availableModelNames.join(', ') || '(none)'}`);

  // Walk tiers from best to worst — pick highest tier that can run on this hardware
  for (const tier of MODEL_TIERS) {
    const modelInstalled = availableModelNames.includes(tier.model);
    const ramOk  = freeRAM_GB >= tier.minRAM_GB  * 0.7;  // 30% tolerance
    const vramOk = vram_GB    >= tier.minVRAM_GB * 0.6;  // 40% tolerance (shared VRAM)

    console.log(`[RESOURCE] Tier "${tier.label}": installed=${modelInstalled} ramOk=${ramOk} vramOk=${vramOk}`);

    if (modelInstalled && ramOk && vramOk) {
      console.log(`[RESOURCE] ✓ Selected tier: ${tier.label} → ${tier.model}`);
      return { model: tier.model, tier };
    }
  }

  // Final fallback: first installed model
  const fallback = availableModelNames[0] || 'gemma4:e2b';
  console.warn(`[RESOURCE] ✗ No ideal tier found. Falling back to: ${fallback}`);
  return { model: fallback, tier: MODEL_TIERS[MODEL_TIERS.length - 1] };
};

// ─── Per-Request Inference Parameters ─────────────────────────────────────────

/**
 * Returns optimal Ollama inference params based on available RAM + VRAM and retry pressure.
 *
 * GPU layer split philosophy:
 *   - Each layer needs ~210MB VRAM
 *   - We leave 1.5GB VRAM headroom for Ollama overhead
 *   - If VRAM can handle all layers → full offload (fastest)
 *   - If RAM < 3GB free → CPU-only mode (safety bridge)
 *
 * @param {number} retryAttempt - 0: normal, 1: pressure, 2: failsafe
 * @param {number} vramGB - Estimated available VRAM in GB (passed from caller cache)
 */
export const getOptimalParams = (retryAttempt = 0, vramGB = 0) => {
  const freeMem    = os.freemem();
  const totalMem   = os.totalmem();
  const freeGB     = freeMem  / (1024 ** 3);
  const totalGB    = totalMem / (1024 ** 3);
  const usedPct    = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

  console.log(`[RESOURCE] ── Param Calculation ──────────────────────────────`);
  console.log(`[RESOURCE] Free RAM : ${freeGB.toFixed(2)}GB / ${totalGB.toFixed(2)}GB (${usedPct}% used)`);
  console.log(`[RESOURCE] VRAM     : ${vramGB.toFixed(2)}GB available | Retry level: ${retryAttempt}`);

  let num_gpu, num_ctx, temperature;

  if (retryAttempt === 0) {
    // ── Normal attempt ──

    if (freeGB < 2.5) {
      // Critical RAM — full CPU, no GPU offload (prevents daemon crash)
      num_gpu = 0; num_ctx = 256;
      console.warn(`[RESOURCE] ⚠ Critical RAM (${freeGB.toFixed(2)}GB). CPU-only mode.`);

    } else {
      // For Normal attempts, we DO NOT send num_gpu.
      // Ollama natively detects VRAM, CUDA/Metal capabilities, and dynamically offloads
      // exactly the right amount of layers automatically. Hardcoding this restricts performance.

      // Context window based on free RAM
      if (freeGB > 8)      { num_ctx = 4096; }
      else if (freeGB > 5) { num_ctx = 2048; }
      else if (freeGB > 3) { num_ctx = 1024; }
      else                 { num_ctx = 512;  }

      console.log(`[RESOURCE] GPU mode: AUTO_DETECT (Ollama native offload)`);
      console.log(`[RESOURCE] Context window: ${num_ctx} tokens`);
    }
    temperature = 0.7;

  } else if (retryAttempt === 1) {
    // ── Memory pressure retry — CPU-only, reduced context ──
    num_ctx = freeGB > 3 ? 512 : 256;
    temperature = 0.6;
    console.log(`[RESOURCE] Retry 1: CPU-only fallback, ctx=${num_ctx}`);
    return { num_ctx, num_gpu: 0, temperature, top_p: 0.9, repeat_penalty: 1.1 };

  } else {
    // ── Final failover: Virtual Memory Bridge — pure CPU, minimal context ──
    num_ctx = 256; temperature = 0.5;
    console.log(`[RESOURCE] Failover: CPU-only bridge (num_gpu=0, ctx=${num_ctx})`);
    return { num_ctx, num_gpu: 0, temperature, top_p: 0.9, repeat_penalty: 1.1 };
  }

  const params = { num_ctx, temperature, top_p: 0.9, repeat_penalty: 1.1 };
  console.log(`[RESOURCE] Params → `, JSON.stringify(params));
  return params;
};
